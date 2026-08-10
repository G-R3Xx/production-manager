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

  const signatoryName = text(formData.get("signatoryName"));
  const signatureDataUrl = text(formData.get("signatureDataUrl"));
  const confirmed = String(formData.get("confirmed") ?? "") === "on";

  if (!signatoryName) {
    redirect(`/public/artwork-approvals/${token}?error=Please%20enter%20your%20name%20to%20approve`);
  }

  if (!signatureDataUrl) {
    redirect(`/public/artwork-approvals/${token}?error=Please%20provide%20a%20signature%20to%20approve`);
  }

  if (!confirmed) {
    redirect(`/public/artwork-approvals/${token}?error=Please%20confirm%20you%20have%20checked%20the%20proof`);
  }

  try {
    await respondToArtworkApprovalByToken(token, "approved", text(formData.get("notes")), signatoryName, signatureDataUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/public/artwork-approvals/${token}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/public/artwork-approvals/${token}?message=Artwork%20approved`);
}

export async function requestArtworkChangesAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) redirect("/");

  const notes = text(formData.get("notes"));
  if (!notes) {
    redirect(`/public/artwork-approvals/${token}?error=Please%20describe%20the%20changes%20needed`);
  }

  try {
    await respondToArtworkApprovalByToken(token, "changes_requested", notes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/public/artwork-approvals/${token}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/public/artwork-approvals/${token}?message=Changes%20requested`);
}
