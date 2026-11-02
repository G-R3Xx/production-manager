export const STAFF_CERTIFICATE_BUCKET = "staff-certificates";
export const MAX_CERTIFICATE_FILE_SIZE = 15 * 1024 * 1024;
export const STAFF_CERTIFICATE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const STAFF_CERTIFICATE_CATEGORIES = [
  { value: "licence", label: "Licence / ticket" },
  { value: "training", label: "Training course" },
  { value: "qualification", label: "Qualification" },
  { value: "induction", label: "Induction" },
  { value: "other", label: "Other" }
] as const;

export function certificateDaysRemaining(expiryDate: string | null, today: string): number | null {
  if (!expiryDate) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.test(expiryDate) || !date.test(today)) return null;
  return Math.round((Date.parse(`${expiryDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

export function certificateExpiryState(expiryDate: string | null, reminderDays: number, today: string): "expired" | "due" | "valid" | "none" {
  const days = certificateDaysRemaining(expiryDate, today);
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days === 0 || (reminderDays > 0 && days <= reminderDays)) return "due";
  return "valid";
}

export function australianLocalDate(): string {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
