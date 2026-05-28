"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { updateCompanySettingsByTenantId } from "@/server/company";

const companySchema = z.object({
  companyLegalName: z.string().max(200).optional().or(z.literal("")),
  tradingName: z.string().max(200).optional().or(z.literal("")),
  abn: z.string().max(50).optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  email: z.string().email("Please enter a valid email.").optional().or(z.literal("")),
  address: z.string().max(1000).optional().or(z.literal("")),
  defaultCurrency: z.string().length(3).default("AUD"),
  quoteTerms: z.string().optional().or(z.literal("")),
  proofTerms: z.string().optional().or(z.literal("")),
  jobTerms: z.string().optional().or(z.literal(""))
});

function nullable(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function saveCompanySettingsAction(formData: FormData): Promise<void> {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap?error=Create%20or%20select%20a%20tenant%20first");
  }

  const parsed = companySchema.safeParse({
    companyLegalName: String(formData.get("companyLegalName") || ""),
    tradingName: String(formData.get("tradingName") || ""),
    abn: String(formData.get("abn") || ""),
    phone: String(formData.get("phone") || ""),
    email: String(formData.get("email") || ""),
    address: String(formData.get("address") || ""),
    defaultCurrency: String(formData.get("defaultCurrency") || "AUD").toUpperCase(),
    quoteTerms: String(formData.get("quoteTerms") || ""),
    proofTerms: String(formData.get("proofTerms") || ""),
    jobTerms: String(formData.get("jobTerms") || "")
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check the company settings fields.";
    redirect(`/company?error=${encodeURIComponent(message)}`);
  }

  await updateCompanySettingsByTenantId(activeTenant.tenantId, {
    companyLegalName: nullable(parsed.data.companyLegalName),
    tradingName: nullable(parsed.data.tradingName),
    abn: nullable(parsed.data.abn),
    phone: nullable(parsed.data.phone),
    email: nullable(parsed.data.email),
    address: nullable(parsed.data.address),
    defaultCurrency: parsed.data.defaultCurrency,
    quoteTerms: nullable(parsed.data.quoteTerms),
    proofTerms: nullable(parsed.data.proofTerms),
    jobTerms: nullable(parsed.data.jobTerms)
  });

  redirect("/company?message=Company%20settings%20saved");
}
