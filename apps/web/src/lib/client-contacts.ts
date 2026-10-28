/** Contact people are held separately from MYOB's company-level customer fields. */
export type ClientContact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  isPrimary: boolean;
};

type ContactOwner = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  // Existing customer payload types have different known keys and may have no
  // explicit `contacts` member. Accept their JSON payload, then narrow at read time.
  payloadJson?: unknown;
};

const contactIdPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Legacy MYOB contacts are usable immediately, without requiring a data migration. */
export function clientContactsForCustomer(client: ContactOwner | null | undefined): ClientContact[] {
  if (!client) return [];
  const payload = client.payloadJson;
  const saved = payload && typeof payload === "object" && !Array.isArray(payload)
    && "contacts" in payload ? payload.contacts : undefined;
  if (Array.isArray(saved)) {
    return saved.flatMap((raw): ClientContact[] => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
      const value = raw as Record<string, unknown>;
      const id = typeof value.id === "string" ? value.id : "";
      const name = typeof value.name === "string" ? value.name.trim() : "";
      if (!contactIdPattern.test(id) || !name) return [];
      return [{
        id,
        name,
        email: typeof value.email === "string" ? value.email.trim() : "",
        phone: typeof value.phone === "string" ? value.phone.trim() : "",
        isPrimary: value.isPrimary === true
      }];
    });
  }
  const name = [client.firstName, client.lastName].filter(Boolean).join(" ").trim();
  const email = (client.email ?? "").trim();
  const phone = (client.phone ?? "").trim();
  return name || email || phone ? [{ id: "legacy-primary", name: name || "General contact", email, phone, isPrimary: true }] : [];
}

/** Validates staff-supplied contact rows before saving to the company's JSONB payload. */
export function validateClientContacts(raw: unknown): ClientContact[] {
  if (!Array.isArray(raw) || raw.length > 100) throw new Error("A client can have up to 100 contacts.");
  const seen = new Set<string>();
  const contacts: ClientContact[] = raw.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid contact details.");
    const row = value as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const email = typeof row.email === "string" ? row.email.trim() : "";
    const phone = typeof row.phone === "string" ? row.phone.trim() : "";
    if (!contactIdPattern.test(id) || seen.has(id)) throw new Error("Duplicate or invalid contact ID.");
    if (!name || name.length > 200) throw new Error("Each contact needs a name (maximum 200 characters).");
    if (email.length > 254 || (email && !emailPattern.test(email))) throw new Error(`Check the email address for ${name}.`);
    if (phone.length > 80) throw new Error(`The phone number is too long for ${name}.`);
    seen.add(id);
    return { id, name, email, phone, isPrimary: row.isPrimary === true };
  });
  if (contacts.length) {
    const defaultIndex = contacts.findIndex((contact) => contact.isPrimary);
    contacts.forEach((contact, index) => { contact.isPrimary = index === (defaultIndex >= 0 ? defaultIndex : 0); });
  }
  return contacts;
}

/** Used by the enquiry action to reject contacts belonging to a different company. */
export function selectedClientContact(client: ContactOwner | null | undefined, id: string | null | undefined): ClientContact | null {
  return clientContactsForCustomer(client).find((contact) => contact.id === id) ?? null;
}
