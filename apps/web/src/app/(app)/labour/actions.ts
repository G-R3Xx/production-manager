"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createLabour, setLabourActive, updateLabour } from "@/server/productionResources";

const stringValue = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

function numericValue(formData: FormData, key: string, fallback = 0): number {
  const parsed = Number(stringValue(formData, key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function storedCalculationValue(formData: FormData, basis: string): string {
  const enteredMinutes = Math.max(0, numericValue(formData, "timeMinutes"));
  if (stringValue(formData, "timeMinutes") !== "") {
    // The costing engine stores fixed time as minutes and scalable time as hours per unit.
    // The UI intentionally hides this conversion and always asks the user for minutes.
    return basis === "fixed_minutes"
      ? String(enteredMinutes)
      : String(Math.round((enteredMinutes / 60) * 10000) / 10000);
  }

  // Backwards compatibility for any older form posting calculationValue directly.
  return String(Math.max(0, numericValue(formData, "calculationValue")));
}

function labourInput(formData: FormData, tenantId: string) {
  const calculationBasis = stringValue(formData, "calculationBasis") || "fixed_minutes";
  return {
    tenantId,
    name: stringValue(formData, "name"),
    department: stringValue(formData, "department") || "general",
    hourlyRate: String(Math.max(0, numericValue(formData, "hourlyRate"))),
    calculationBasis,
    calculationValue: storedCalculationValue(formData, calculationBasis),
    minimumMinutes: String(Math.max(0, numericValue(formData, "minimumMinutes")))
  };
}

export async function createLabourAction(formData: FormData) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");

  const values = labourInput(formData, tenant.tenantId);
  if (!values.name) redirect("/labour?error=Operation%20name%20is%20required");
  if (Number(values.hourlyRate) <= 0) redirect("/labour?error=Enter%20an%20hourly%20rate%20greater%20than%20zero");

  await createLabour(values);
  redirect("/labour?message=Labour%20operation%20created");
}

export async function updateLabourAction(formData: FormData) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");

  const values = labourInput(formData, tenant.tenantId);
  const id = stringValue(formData, "id");
  if (!id || !values.name) redirect("/labour?error=Operation%20name%20is%20required");
  if (Number(values.hourlyRate) <= 0) redirect("/labour?error=Enter%20an%20hourly%20rate%20greater%20than%20zero");

  await updateLabour({ ...values, id });
  redirect("/labour?message=Labour%20operation%20updated");
}

export async function setLabourActiveAction(formData: FormData) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");

  await setLabourActive(
    tenant.tenantId,
    stringValue(formData, "id"),
    stringValue(formData, "active") === "true"
  );
  redirect("/labour");
}
