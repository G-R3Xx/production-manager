export type StructuredAddress = {
  street: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
};

export const AUSTRALIAN_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function emptyStructuredAddress(defaultCountry = "Australia"): StructuredAddress {
  return { street: "", city: "", state: "", postcode: "", country: defaultCountry };
}

export function normaliseStructuredAddress(value: unknown, defaultCountry = "Australia"): StructuredAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyStructuredAddress(defaultCountry);
  const record = value as Record<string, unknown>;
  return {
    street: text(record.street ?? record.Street),
    city: text(record.city ?? record.City),
    state: text(record.state ?? record.State).toUpperCase(),
    postcode: text(record.postcode ?? record.postCode ?? record.PostCode),
    country: text(record.country ?? record.Country) || defaultCountry
  };
}

export function hasStructuredAddress(address: StructuredAddress): boolean {
  return Boolean(address.street || address.city || address.state || address.postcode || (address.country && address.country.toLowerCase() !== "australia"));
}

/**
 * Conservatively separates the common Australian multiline address forms already
 * stored by Production Manager. If the final locality/state/postcode cannot be
 * identified confidently, the original text is retained in Street so nothing is lost.
 */
export function parseLegacyAddress(value: unknown, defaultCountry = "Australia"): StructuredAddress {
  const original = text(value);
  if (!original) return emptyStructuredAddress(defaultCountry);

  const lines = original.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return emptyStructuredAddress(defaultCountry);

  let country = defaultCountry;
  if (/^australia$/i.test(lines[lines.length - 1] ?? "")) {
    country = "Australia";
    lines.pop();
  }
  if (!lines.length) return emptyStructuredAddress(country);

  const statePostcode = /^(AAT|ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\s+(\d{4})$/i;
  const cityStatePostcode = /^(.+?)\s+(AAT|ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\s+(\d{4})$/i;
  const last = lines[lines.length - 1] ?? "";
  const combined = last.match(cityStatePostcode);
  if (combined && combined[1]?.trim()) {
    const street = lines.slice(0, -1).join("\n").trim();
    if (street) {
      return { street, city: combined[1].trim(), state: combined[2].toUpperCase(), postcode: combined[3], country };
    }
  }

  const stateOnly = last.match(statePostcode);
  if (stateOnly && lines.length >= 3) {
    const city = lines[lines.length - 2]?.trim() ?? "";
    const street = lines.slice(0, -2).join("\n").trim();
    if (city && street) {
      return { street, city, state: stateOnly[1].toUpperCase(), postcode: stateOnly[2], country };
    }
  }

  // Keep uncertain legacy text intact rather than inventing locality components.
  return { street: original, city: "", state: "", postcode: "", country };
}

export function structuredAddressFromPayload(
  structuredValue: unknown,
  legacyValue: unknown,
  defaultCountry = "Australia"
): StructuredAddress {
  const structured = normaliseStructuredAddress(structuredValue, defaultCountry);
  return hasStructuredAddress(structured) ? structured : parseLegacyAddress(legacyValue, defaultCountry);
}

export function formatStructuredAddress(address: StructuredAddress, includeAustralia = false): string {
  const lines: string[] = [];
  if (address.street.trim()) lines.push(address.street.trim());
  if (address.city.trim()) lines.push(address.city.trim());
  const statePostcode = [address.state.trim(), address.postcode.trim()].filter(Boolean).join(" ");
  if (statePostcode) lines.push(statePostcode);
  const country = address.country.trim();
  if (country && (includeAustralia || country.toLowerCase() !== "australia")) lines.push(country);
  return lines.join("\n");
}

export function myobAddressFields(address: StructuredAddress): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (address.street.trim()) fields.Street = address.street.trim().slice(0, 255);
  if (address.city.trim()) fields.City = address.city.trim().slice(0, 255);
  if (address.state.trim()) fields.State = address.state.trim().toUpperCase().slice(0, 255);
  if (address.postcode.trim()) fields.PostCode = address.postcode.trim().slice(0, 11);
  const country = address.country.trim();
  // Preserve MYOB's permissive handling of legacy/partial Australian addresses: the
  // existing integration successfully sent Street-only records. Only add Australia
  // once a State is present; always send an explicitly non-Australian country.
  if (country && (country.toLowerCase() !== "australia" || address.state.trim())) fields.Country = country.slice(0, 255);
  return fields;
}

export function myobRecordToStructuredAddress(value: unknown, defaultCountry = "Australia"): StructuredAddress {
  return normaliseStructuredAddress(value, defaultCountry);
}

export function addressKey(address: StructuredAddress): string {
  return [address.street, address.city, address.state, address.postcode, address.country]
    .map((part) => part.trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

export function formatAustralianAbn(value: unknown): string {
  const raw = text(value);
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return "";
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
}

export function isValidAustralianAbn(value: unknown): boolean {
  const digits = text(value).replace(/\D/g, "");
  if (digits.length !== 11) return false;
  const numbers = digits.split("").map(Number);
  numbers[0] -= 1;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  return numbers.reduce((sum, number, index) => sum + number * weights[index], 0) % 89 === 0;
}
