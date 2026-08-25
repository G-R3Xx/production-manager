"use server";

import { Buffer } from "node:buffer";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { defaultSignageSizePresets, defaultSmallSizePresets, updateCompanySettingsByTenantId } from "@/server/company";
import { saveTenantDomainAccessSettingsByTenantId } from "@/server/auth/domainJoin";

const companySchema = z.object({
  companyLegalName: z.string().max(200).optional().or(z.literal("")),
  tradingName: z.string().max(200).optional().or(z.literal("")),
  abn: z.string().max(50).optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  email: z.string().email("Please enter a valid email.").optional().or(z.literal("")),
  address: z.string().max(1000).optional().or(z.literal("")),
  companyLogoUrl: z.string().url("Company logo URL must be a valid URL.").max(1000).optional().or(z.literal("")),
  companyLogoStoragePath: z.string().max(1000).optional().or(z.literal("")),
  defaultCurrency: z.string().length(3).default("AUD"),
  globalMarkupMultiplier: z.string().optional().or(z.literal("")),
  accessEquipmentMarkupMultiplier: z.string().optional().or(z.literal("")),
  globalProfitMultiplier: z.string().optional().or(z.literal("")),
  quoteLabourRate: z.string().optional().or(z.literal("")),
  quoteInkRatePerSqm: z.string().optional().or(z.literal("")),
  quoteInkBillingIncrementSqm: z.string().optional().or(z.literal("")),
  quoteMonoRatePerSqm: z.string().optional().or(z.literal("")),
  myobPriceLevelFactorA: z.string().optional().or(z.literal("")),
  myobPriceLevelFactorB: z.string().optional().or(z.literal("")),
  myobPriceLevelFactorC: z.string().optional().or(z.literal("")),
  myobPriceLevelFactorD: z.string().optional().or(z.literal("")),
  myobPriceLevelFactorE: z.string().optional().or(z.literal("")),
  myobPriceLevelFactorF: z.string().optional().or(z.literal("")),
  quoteSignageSizePresetsText: z.string().optional().or(z.literal("")),
  quoteSmallSizePresetsText: z.string().optional().or(z.literal("")),
  quoteTerms: z.string().optional().or(z.literal("")),
  proofTerms: z.string().optional().or(z.literal("")),
  jobTerms: z.string().optional().or(z.literal("")),
  teamGoogleDomain: z.string().max(255).optional().or(z.literal("")),
  teamGoogleDefaultRole: z.enum(["staff", "sales", "installer", "accounts", "manager"]).default("staff"),
  teamGoogleAutoJoin: z.boolean().default(true)
});

function nullable(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}


async function uploadCompanyLogoIfPresent(tenantId: string, formData: FormData): Promise<{ companyLogoUrl?: string; companyLogoStoragePath?: string }> {
  const rawFile = formData.get("companyLogoFile");
  if (!rawFile || typeof rawFile !== "object" || !("size" in rawFile) || !("arrayBuffer" in rawFile)) return {};

  const file = rawFile as unknown as { name?: string; type?: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
  if (!file.size || file.size <= 0) return {};

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Company logo upload failed: please keep the logo under 5MB.");
  }

  const contentType = file.type || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    throw new Error("Company logo upload failed: please upload an image file.");
  }

  const safeName = String(file.name || "company-logo").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 120);
  const extension = safeName.includes(".") ? "" : ".png";
  const storagePath = `${tenantId}/branding/company-logo-${Date.now()}-${safeName}${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const supabase = getSupabaseServiceRoleClient();
  const bucket = "company-assets";

  await supabase.storage.createBucket(bucket, { public: true }).catch(() => undefined);
  const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Company logo upload failed: ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return { companyLogoUrl: data.publicUrl, companyLogoStoragePath: storagePath };
}

function normalNumber(value: string | undefined, fallback: string): string {
  const cleaned = String(value ?? "").replace(/[$x,]/gi, "").trim();
  if (!cleaned) return fallback;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount <= 0) return fallback;
  return String(amount);
}

function priceLevelFactorFromPercent(value: string | undefined): string {
  const cleaned = String(value ?? "").replace(/[%x,]/gi, "").trim();
  const percent = cleaned ? Number(cleaned) : 100;
  if (!Number.isFinite(percent) || percent < 0 || percent > 1000) return "1";
  return String(percent / 100);
}

function parseSizePresetLines(value: string | undefined, fallback: typeof defaultSignageSizePresets): typeof defaultSignageSizePresets {
  const lines = String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = lines
    .map((line) => {
      const pipeParts = line.split("|").map((part) => part.trim()).filter(Boolean);
      if (pipeParts.length >= 3) {
        const width = pipeParts[1]?.replace(/[^0-9.]/g, "") ?? "";
        const height = pipeParts[2]?.replace(/[^0-9.]/g, "") ?? "";
        const label = pipeParts[0] ?? `${width} × ${height} mm`;
        if (width && height) return { label, width, height };
      }

      const match = line.match(/(\d+(?:\.\d+)?)\s*(?:x|×|by|,)\s*(\d+(?:\.\d+)?)/i);
      if (!match) return null;

      const width = match[1] ?? "";
      const height = match[2] ?? "";
      const justDimensions = line.replace(/\s+/g, "").toLowerCase() === `${width}x${height}mm`.toLowerCase() || line.replace(/\s+/g, "") === `${width}×${height}`;
      const label = justDimensions ? `${width} × ${height} mm` : line;

      if (!width || !height) return null;
      return { label, width, height };
    })
    .filter((item): item is typeof fallback[number] => Boolean(item));

  return parsed.length > 0 ? parsed : fallback;
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
    companyLogoUrl: String(formData.get("companyLogoUrl") || ""),
    companyLogoStoragePath: String(formData.get("companyLogoStoragePath") || ""),
    defaultCurrency: String(formData.get("defaultCurrency") || "AUD").toUpperCase(),
    globalMarkupMultiplier: String(formData.get("globalMarkupMultiplier") || "1.5"),
    accessEquipmentMarkupMultiplier: String(formData.get("accessEquipmentMarkupMultiplier") || formData.get("globalMarkupMultiplier") || "1.5"),
    globalProfitMultiplier: String(formData.get("globalProfitMultiplier") || "1.2"),
    quoteLabourRate: String(formData.get("quoteLabourRate") || "66"),
    quoteInkRatePerSqm: String(formData.get("quoteInkRatePerSqm") || "10"),
    quoteInkBillingIncrementSqm: String(formData.get("quoteInkBillingIncrementSqm") ?? "0.5"),
    quoteMonoRatePerSqm: String(formData.get("quoteMonoRatePerSqm") || "4"),
    myobPriceLevelFactorA: String(formData.get("myobPriceLevelFactorA") || "100"),
    myobPriceLevelFactorB: String(formData.get("myobPriceLevelFactorB") || "100"),
    myobPriceLevelFactorC: String(formData.get("myobPriceLevelFactorC") || "100"),
    myobPriceLevelFactorD: String(formData.get("myobPriceLevelFactorD") || "100"),
    myobPriceLevelFactorE: String(formData.get("myobPriceLevelFactorE") || "100"),
    myobPriceLevelFactorF: String(formData.get("myobPriceLevelFactorF") || "100"),
    quoteSignageSizePresetsText: String(formData.get("quoteSignageSizePresetsText") || ""),
    quoteSmallSizePresetsText: String(formData.get("quoteSmallSizePresetsText") || ""),
    quoteTerms: String(formData.get("quoteTerms") || ""),
    proofTerms: String(formData.get("proofTerms") || ""),
    jobTerms: String(formData.get("jobTerms") || ""),
    teamGoogleDomain: String(formData.get("teamGoogleDomain") || ""),
    teamGoogleDefaultRole: String(formData.get("teamGoogleDefaultRole") || "staff"),
    teamGoogleAutoJoin: formData.get("teamGoogleAutoJoin") === "on"
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check the company settings fields.";
    redirect(`/company?error=${encodeURIComponent(message)}`);
  }

  let uploadedLogo: { companyLogoUrl?: string; companyLogoStoragePath?: string } = {};
  try {
    uploadedLogo = await uploadCompanyLogoIfPresent(activeTenant.tenantId, formData);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    redirect(`/company?error=${encodeURIComponent(message)}`);
  }

  const chosenLogoUrl = uploadedLogo.companyLogoUrl ?? nullable(parsed.data.companyLogoUrl);
  const chosenLogoStoragePath = uploadedLogo.companyLogoStoragePath ?? (chosenLogoUrl ? nullable(parsed.data.companyLogoStoragePath) : null);

  await updateCompanySettingsByTenantId(activeTenant.tenantId, {
    companyLegalName: nullable(parsed.data.companyLegalName),
    tradingName: nullable(parsed.data.tradingName),
    abn: nullable(parsed.data.abn),
    phone: nullable(parsed.data.phone),
    email: nullable(parsed.data.email),
    address: nullable(parsed.data.address),
    companyLogoUrl: chosenLogoUrl,
    companyLogoStoragePath: chosenLogoStoragePath,
    defaultCurrency: parsed.data.defaultCurrency,
    globalMarkupMultiplier: normalNumber(parsed.data.globalMarkupMultiplier, "1.5"),
    accessEquipmentMarkupMultiplier: normalNumber(parsed.data.accessEquipmentMarkupMultiplier, normalNumber(parsed.data.globalMarkupMultiplier, "1.5")),
    globalProfitMultiplier: normalNumber(parsed.data.globalProfitMultiplier, "1.2"),
    quoteLabourRate: normalNumber(parsed.data.quoteLabourRate, "66"),
    quoteInkRatePerSqm: normalNumber(parsed.data.quoteInkRatePerSqm, "10"),
    quoteInkBillingIncrementSqm: String(Math.max(0, Number(parsed.data.quoteInkBillingIncrementSqm || "0.5") || 0)),
    quoteMonoRatePerSqm: normalNumber(parsed.data.quoteMonoRatePerSqm, "4"),
    myobPriceLevelFactors: {
      "Level A": priceLevelFactorFromPercent(parsed.data.myobPriceLevelFactorA),
      "Level B": priceLevelFactorFromPercent(parsed.data.myobPriceLevelFactorB),
      "Level C": priceLevelFactorFromPercent(parsed.data.myobPriceLevelFactorC),
      "Level D": priceLevelFactorFromPercent(parsed.data.myobPriceLevelFactorD),
      "Level E": priceLevelFactorFromPercent(parsed.data.myobPriceLevelFactorE),
      "Level F": priceLevelFactorFromPercent(parsed.data.myobPriceLevelFactorF)
    },
    quoteSignageSizePresets: parseSizePresetLines(parsed.data.quoteSignageSizePresetsText, defaultSignageSizePresets),
    quoteSmallSizePresets: parseSizePresetLines(parsed.data.quoteSmallSizePresetsText, defaultSmallSizePresets),
    quoteTerms: nullable(parsed.data.quoteTerms),
    proofTerms: nullable(parsed.data.proofTerms),
    jobTerms: nullable(parsed.data.jobTerms)
  });

  try {
    await saveTenantDomainAccessSettingsByTenantId(activeTenant.tenantId, {
      emailDomain: parsed.data.teamGoogleDomain,
      defaultRole: parsed.data.teamGoogleDefaultRole,
      autoJoin: parsed.data.teamGoogleAutoJoin
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    redirect(`/company?error=${encodeURIComponent(message)}`);
  }

  redirect("/company?message=Company%20settings%20saved");
}
