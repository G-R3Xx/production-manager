"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { canManageStaff } from "@/server/users";
import { deleteStaffCertificate, saveStaffCertificate, staffMemberInTenant } from "@/server/staff-certificates";
import { STAFF_CERTIFICATE_CATEGORIES, STAFF_CERTIFICATE_MIME_TYPES } from "@/lib/staff-certificate";

const id = z.string().uuid();
const textField = (max: number) => z.string().trim().max(max);
const dateField = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Invalid date")]);
const schema = z.object({
  membershipId: id,
  certificateId: z.union([id, z.literal("")]),
  title: textField(200).min(1, "Enter the training or certificate name."),
  category: z.enum(STAFF_CERTIFICATE_CATEGORIES.map((option) => option.value) as ["licence", "training", "qualification", "induction", "other"]),
  issuingOrganisation: textField(200),
  certificateNumber: textField(150),
  issuedDate: dateField,
  expiryDate: dateField,
  reminderDays: z.coerce.number().int().min(0).max(365),
  notes: textField(3000),
  filePath: textField(500),
  fileName: textField(255),
  fileType: textField(80)
}).refine((data) => !data.expiryDate || !data.issuedDate || data.expiryDate >= data.issuedDate, { message: "Expiry date must be on or after issue date." });

async function getAdminWorkspace() {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant || tenant.membershipStatus !== "active" || !canManageStaff(tenant.tenantRole)) throw new Error("Only owners and managers can edit staff training.");
  return tenant;
}

export async function saveStaffCertificateAction(formData: FormData): Promise<void> {
  const tenant = await getAdminWorkspace();
  const result = schema.safeParse(Object.fromEntries([
    "membershipId", "certificateId", "title", "category", "issuingOrganisation", "certificateNumber",
    "issuedDate", "expiryDate", "reminderDays", "notes", "filePath", "fileName", "fileType"
  ].map((key) => [key, String(formData.get(key) ?? "")])));
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Please review the certificate fields.");
  const data = result.data;
  const staff = await staffMemberInTenant(tenant.tenantId, data.membershipId);
  if (!staff) throw new Error("Staff member not found in this workspace.");
  if (tenant.tenantRole !== "owner" && staff.tenantRole === "owner") throw new Error("Only owners can manage another owner’s certificates.");
  if (data.filePath && (!data.filePath.startsWith(`${tenant.tenantId}/${data.membershipId}/`) ||
    !STAFF_CERTIFICATE_MIME_TYPES.some((mime) => mime === data.fileType) || !data.fileName)) throw new Error("Invalid attached evidence.");
  await saveStaffCertificate(tenant.tenantId, data.membershipId, {
    certificateId: data.certificateId || undefined,
    title: data.title,
    category: data.category,
    issuingOrganisation: data.issuingOrganisation || null,
    certificateNumber: data.certificateNumber || null,
    issuedDate: data.issuedDate || null,
    expiryDate: data.expiryDate || null,
    reminderDays: data.reminderDays,
    notes: data.notes || null,
    filePath: data.filePath || null,
    fileName: data.fileName || null,
    fileType: data.fileType || null
  });
  revalidatePath(`/users/${data.membershipId}/certificates`);
  redirect(`/users/${data.membershipId}/certificates?message=Certificate%20saved`);
}

export async function deleteStaffCertificateAction(formData: FormData): Promise<void> {
  const tenant = await getAdminWorkspace();
  const membershipId = id.parse(String(formData.get("membershipId") ?? ""));
  const certificateId = id.parse(String(formData.get("certificateId") ?? ""));
  const staff = await staffMemberInTenant(tenant.tenantId, membershipId);
  if (!staff || (tenant.tenantRole !== "owner" && staff.tenantRole === "owner")) throw new Error("You cannot edit this staff member's certificates.");
  const deleted = await deleteStaffCertificate(tenant.tenantId, membershipId, certificateId);
  if (!deleted) throw new Error("Certificate not found.");
  revalidatePath(`/users/${membershipId}/certificates`);
  redirect(`/users/${membershipId}/certificates?message=Certificate%20deleted`);
}
