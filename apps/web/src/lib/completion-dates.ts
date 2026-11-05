/** Date-only helpers for the Main Calendar. UTC prevents local timezone/day drift. */
export function parseCompletionDate(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid completion date.");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Enter a valid completion date.");
  }
  return value;
}
export function completionDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
export function completionMonthShift(focus: string, amount: number): string {
  const [year, month] = focus.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1, 12));
  return completionDateKey(date);
}
export function completionMonthGrid(focus: string): string[] {
  const [year, month] = focus.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  return Array.from({length:42}, (_,i) => {const day = new Date(first);day.setUTCDate(day.getUTCDate() + i);return completionDateKey(day);});
}
