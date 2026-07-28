"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createProcess, listProcessesForTenant, setProcessActive, updateProcess } from "@/server/productionResources";

const starterProcesses = [
  { name: "Direct print", processType: "print" },
  { name: "Roll print", processType: "print" },
  { name: "Laminate", processType: "laminate" },
  { name: "Trim / cut", processType: "cut" },
  { name: "Mount / apply", processType: "mount" },
  { name: "Finishing", processType: "finish" },
  { name: "Pack", processType: "pack" },
  { name: "Install", processType: "install" }
];

const s = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const input = (form: FormData, tenantId: string) => ({
  tenantId,
  name: s(form, "name"),
  department: s(form, "department") || "general",
  processType: s(form, "processType") || "other",
  labourOperationId: s(form, "labourOperationId") || null
});

export async function createProcessAction(form: FormData) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");

  const value = input(form, tenant.tenantId);
  if (!value.name) redirect("/processes?error=Enter%20a%20name%20for%20the%20production%20step");

  await createProcess(value);
  redirect(`/processes?message=${encodeURIComponent(`${value.name} added`)}`);
}

export async function createStarterProcessesAction() {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");

  const existing = await listProcessesForTenant(tenant.tenantId);
  const existingNames = new Set(existing.map((row) => row.name.trim().toLocaleLowerCase("en-AU")));
  let created = 0;

  for (const process of starterProcesses) {
    if (existingNames.has(process.name.toLocaleLowerCase("en-AU"))) continue;
    await createProcess({
      tenantId: tenant.tenantId,
      name: process.name,
      department: "signage",
      processType: process.processType,
      labourOperationId: null
    });
    created += 1;
  }

  const message = created
    ? `${created} recommended production step${created === 1 ? "" : "s"} added`
    : "Recommended production steps already exist";
  redirect(`/processes?message=${encodeURIComponent(message)}`);
}

export async function updateProcessAction(form: FormData) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");

  const value = input(form, tenant.tenantId);
  const id = s(form, "id");
  if (!id || !value.name) redirect("/processes?error=Enter%20a%20name%20for%20the%20production%20step");

  await updateProcess({ ...value, id });
  redirect(`/processes?message=${encodeURIComponent(`${value.name} updated`)}`);
}

export async function setProcessActiveAction(form: FormData) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");

  await setProcessActive(tenant.tenantId, s(form, "id"), s(form, "active") === "true");
  redirect("/processes");
}
