"use server";

import { redirect } from "next/navigation";
import { createArtworkApprovalForAcceptedQuoteToken, respondToQuoteByToken } from "@/server/quotes";

function text(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

export async function acceptQuoteAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) redirect("/");
  await respondToQuoteByToken(token, "accepted", text(formData.get("notes")));
  await createArtworkApprovalForAcceptedQuoteToken(token);
  redirect(`/public/quotes/${token}?message=Quote%20accepted.%20Artwork%20approval%20pack%20created.`);
}

export async function requestQuoteChangesAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) redirect("/");
  await respondToQuoteByToken(token, "changes_requested", text(formData.get("notes")));
  redirect(`/public/quotes/${token}?message=Changes%20requested`);
}

export async function declineQuoteAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) redirect("/");
  await respondToQuoteByToken(token, "declined", text(formData.get("notes")));
  redirect(`/public/quotes/${token}?message=Quote%20declined`);
}
