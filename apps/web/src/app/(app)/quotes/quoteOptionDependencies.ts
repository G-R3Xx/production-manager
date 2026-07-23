export type QuoteOptionCondition = {
  optionKey?: string | null;
  optionValues?: string[] | null;
} | null;

export type QuoteOptionChoiceLike = {
  id?: string | null;
  label?: string | null;
  value?: string | null;
  showWhen?: QuoteOptionCondition;
};

export type QuoteOptionFieldLike = {
  key: string;
  label?: string | null;
  options?: QuoteOptionChoiceLike[] | null;
};

function normalise(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function quoteChoiceValue(choice: QuoteOptionChoiceLike): string {
  return String(choice.value ?? choice.label ?? "").trim();
}

export function splitQuoteAnswerValues(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function conditionMatches(condition: QuoteOptionCondition | undefined, answers: Record<string, string>): boolean {
  const optionKey = String(condition?.optionKey ?? "").trim();
  if (!optionKey) return true;

  const selected = splitQuoteAnswerValues(answers[optionKey]);
  const required = Array.isArray(condition?.optionValues) ? condition?.optionValues ?? [] : [];
  if (required.length === 0) return selected.length > 0;

  return required.some((requiredValue) => selected.some((selectedValue) => normalise(selectedValue) === normalise(requiredValue)));
}

function expectedCopyCount(answers: Record<string, string>): number | null {
  const raw = normalise(answers.copy_set || answers.copies || answers.copy_count);
  if (!raw) return null;
  if (raw.includes("quadruplicate") || raw === "4" || raw.includes("4 part") || raw.includes("4-part")) return 4;
  if (raw.includes("triplicate") || raw === "3" || raw.includes("3 part") || raw.includes("3-part")) return 3;
  if (raw.includes("duplicate") || raw === "2" || raw.includes("2 part") || raw.includes("2-part")) return 2;
  return null;
}

function isCustomChoice(choice: QuoteOptionChoiceLike): boolean {
  const text = normalise(`${choice.label ?? ""} ${choice.value ?? ""}`);
  return text.includes("custom") || text.includes("other");
}

function colourCombinationCount(choice: QuoteOptionChoiceLike): number | null {
  const label = String(choice.label ?? "").trim();
  const slashParts = label.split(/\s*\/\s*/).map((item) => item.trim()).filter(Boolean);
  if (slashParts.length > 1) return slashParts.length;

  const colourNames = new Set(["white", "yellow", "pink", "green", "blue", "red", "black", "orange", "grey", "gray", "cream"]);
  const valueParts = normalise(choice.value)
    .split(/[^a-z]+/)
    .filter((item) => colourNames.has(item));
  return valueParts.length > 1 ? valueParts.length : null;
}

function isCopyColourField(field: QuoteOptionFieldLike): boolean {
  const key = normalise(field.key).replace(/\s+/g, "_");
  const label = normalise(field.label);
  return ["copy_colours", "copy_colors", "copy_colour", "copy_color"].includes(key) || label.includes("copy colour") || label.includes("copy color");
}

export function availableQuoteChoices(field: QuoteOptionFieldLike, answers: Record<string, string>): QuoteOptionChoiceLike[] {
  let choices = Array.isArray(field.options) ? field.options : [];

  choices = choices.filter((choice) => conditionMatches(choice.showWhen, answers));

  if (isCopyColourField(field)) {
    const copyCount = expectedCopyCount(answers);
    if (copyCount) {
      choices = choices.filter((choice) => {
        if (isCustomChoice(choice)) return true;
        const combinationCount = colourCombinationCount(choice);
        return combinationCount === null || combinationCount === copyCount;
      });
    }
  }

  return choices;
}
