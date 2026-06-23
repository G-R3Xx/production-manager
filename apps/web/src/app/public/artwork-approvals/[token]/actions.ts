"use server";

import { redirect } from "next/navigation";
import { respondToArtworkApprovalByToken } from "@/server/quotes";

function text(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

export async function approveArtworkAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) redirect("/");
  await respondToArtworkApprovalByToken(token, "approved", text(formData.get("notes")));
  redirect(`/public/artwork-approvals/${token}?message=Artwork%20approved`);
}

export async function requestArtworkChangesAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) redirect("/");
  await respondToArtworkApprovalByToken(token, "changes_requested", text(formData.get("notes")));
  redirect(`/public/artwork-approvals/${token}?message=Changes%20requested`);
}
