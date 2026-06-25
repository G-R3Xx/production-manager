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

  try {
    await respondToQuoteByToken(token, "accepted", text(formData.get("notes")));
  } catch (error) {
    console.error("Failed to accept public quote", error);
    redirect(`/public/quotes/${token}?message=${encodeURIComponent("We couldn’t save the acceptance. Please contact Tender Edge or try again.")}`);
  }

  let message = "Quote accepted. Artwork approval pack created.";
  try {
    await createArtworkApprovalForAcceptedQuoteToken(token);
  } catch (error) {
    console.error("Quote accepted, but automatic artwork approval creation failed", error);
    message = "Quote accepted. Artwork approval pack could not be created automatically, but Production Manager has saved the acceptance.";
  }

  redirect(`/public/quotes/${token}?message=${encodeURIComponent(message)}`);
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
