"use client";

export const APP_ACTIVITY_CHECK_EVENT = "production-manager:check-activity";
const DIRTY_FORM_ATTRIBUTE = "data-production-manager-unsaved";
let lastClaimedRefreshAt = 0;

function formCanContainUnsavedWork(form: HTMLFormElement | null): boolean {
  if (!form) return false;
  // Treat every form as potentially editable unless it is explicitly marked safe.
  // Server Action forms can present as GET/default forms in the browser during hydration,
  // so relying on form.method allowed quote edits to slip past the refresh guard.
  return form.dataset.autoRefreshSafe !== "true";
}

function formFromTarget(target: EventTarget | null): HTMLFormElement | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    if (target.disabled || target.dataset.autoRefreshSafe === "true") return null;
    return target.form;
  }
  return target.closest("form");
}

export function markAutoRefreshFormDirty(event: Event): void {
  const form = formFromTarget(event.target);
  if (formCanContainUnsavedWork(form)) form!.setAttribute(DIRTY_FORM_ATTRIBUTE, "true");
}

export function markAutoRefreshButtonInteraction(event: Event): void {
  if (!(event.target instanceof HTMLElement)) return;
  const button = event.target.closest("button");
  if (!(button instanceof HTMLButtonElement) || button.type !== "button") return;
  const form = button.form;
  if (formCanContainUnsavedWork(form)) form!.setAttribute(DIRTY_FORM_ATTRIBUTE, "true");
}

export function clearAutoRefreshFormDirty(event: Event): void {
  formFromTarget(event.target)?.removeAttribute(DIRTY_FORM_ATTRIBUTE);
}

export function clearAllAutoRefreshFormDirty(): void {
  document.querySelectorAll<HTMLFormElement>(`form[${DIRTY_FORM_ATTRIBUTE}]`)
    .forEach((form) => form.removeAttribute(DIRTY_FORM_ATTRIBUTE));
}

export function installAutoRefreshFormTracking(): () => void {
  document.addEventListener("input", markAutoRefreshFormDirty, true);
  document.addEventListener("change", markAutoRefreshFormDirty, true);
  document.addEventListener("click", markAutoRefreshButtonInteraction, true);
  document.addEventListener("reset", clearAutoRefreshFormDirty, true);
  return () => {
    document.removeEventListener("input", markAutoRefreshFormDirty, true);
    document.removeEventListener("change", markAutoRefreshFormDirty, true);
    document.removeEventListener("click", markAutoRefreshButtonInteraction, true);
    document.removeEventListener("reset", clearAutoRefreshFormDirty, true);
  };
}

export function pageHasUnsavedEdits(): boolean {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.isContentEditable) return true;

  // Some editors (especially the quote line builder) use React-controlled buttons and
  // hidden inputs. While one of those editors is open, do not refresh the page at all.
  // This protects the selections even before the first native input/change event fires.
  if (document.querySelector('details[data-production-manager-auto-refresh-protected="true"][open]')) return true;

  return Boolean(document.querySelector(`form[${DIRTY_FORM_ATTRIBUTE}="true"]`));
}

export function requestAppActivityCheck(): void {
  window.dispatchEvent(new Event(APP_ACTIVITY_CHECK_EVENT));
}

export function claimAppRefresh(): boolean {
  const now = Date.now();
  if (now - lastClaimedRefreshAt < 1_500) return false;
  lastClaimedRefreshAt = now;
  return true;
}
