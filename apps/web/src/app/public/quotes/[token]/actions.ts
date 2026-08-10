"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createArtworkApprovalForAcceptedQuoteToken, respondToQuoteByToken, respondToQuoteLineByToken, type QuoteLineClientResponse } from "@/server/quotes";

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


export async function respondToQuoteLineAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  const lineId = String(formData.get("lineId") ?? "").trim();
  const response = String(formData.get("response") ?? "").trim() as QuoteLineClientResponse;
  if (!token || !lineId) redirect("/");
  if (!(["approved", "changes_requested", "cancelled"] as const).includes(response as "approved" | "changes_requested" | "cancelled")) {
    redirect(`/public/quotes/${token}?message=${encodeURIComponent("That line response was not recognised.")}`);
  }

  const notes = text(formData.get("notes"));
  if (response === "changes_requested" && !notes) {
    redirect(`/public/quotes/${token}?message=${encodeURIComponent("Please add a short note describing the requested change.")}`);
  }

  let successMessage = "Line response saved.";
  try {
    const result = await respondToQuoteLineByToken(token, lineId, response, notes);
    if (result.quoteStatus === "accepted") {
      try {
        await createArtworkApprovalForAcceptedQuoteToken(token);
      } catch (error) {
        console.error("Line responses accepted the quote, but artwork approval creation failed", error);
      }
    }
    successMessage = response === "approved"
      ? (result.quoteStatus === "accepted" ? "Line approved. Quote acceptance is complete." : "Line approved.")
      : response === "cancelled"
        ? (result.quoteStatus === "declined" ? "Line cancelled. All quote lines are now cancelled." : "Line cancelled.")
        : "Changes requested for this line.";
  } catch (error) {
    console.error("Failed to save public quote line response", error);
    const message = error instanceof Error && /finalised/i.test(error.message)
      ? "This quote has already been finalised."
      : "We couldn’t save that line response. Please try again or contact Tender Edge.";
    redirect(`/public/quotes/${token}?message=${encodeURIComponent(message)}`);
  }

  redirect(`/public/quotes/${token}?message=${encodeURIComponent(successMessage)}`);
}


export type FastQuoteLineResponseResult = {
  ok: boolean;
  lineStatus?: QuoteLineClientResponse;
  quoteStatus?: string;
  notes?: string | null;
  subtotal?: number;
  gst?: number;
  total?: number;
  message: string;
};

export async function respondToQuoteLineFastAction(input: {
  token: string;
  lineId: string;
  response: QuoteLineClientResponse;
  notes?: string | null;
}): Promise<FastQuoteLineResponseResult> {
  const token = String(input.token ?? "").trim();
  const lineId = String(input.lineId ?? "").trim();
  const response = input.response;
  const notes = String(input.notes ?? "").trim() || null;

  if (!token || !lineId || !( ["approved", "changes_requested", "cancelled"] as const).includes(response)) {
    return { ok: false, message: "That line response was not recognised." };
  }
  if (response === "changes_requested" && !notes) {
    return { ok: false, message: "Please add a short note describing the requested change." };
  }

  try {
    const result = await respondToQuoteLineByToken(token, lineId, response, notes, { deferNotification: true });
    if (result.quoteStatus === "accepted") {
      after(async () => {
        try {
          await createArtworkApprovalForAcceptedQuoteToken(token);
        } catch (error) {
          console.error("Line responses accepted the quote, but artwork approval creation failed", error);
        }
      });
    }
    const message = response === "approved"
      ? (result.quoteStatus === "accepted" ? "Approved — quote complete." : "Approved")
      : response === "cancelled"
        ? (result.quoteStatus === "declined" ? "Cancelled — all quote lines are now cancelled." : "Cancelled")
        : "Changes requested";
    return { ok: true, ...result, notes, message };
  } catch (error) {
    console.error("Failed to save public quote line response", error);
    return {
      ok: false,
      message: error instanceof Error && /finalised/i.test(error.message)
        ? "This quote has already been finalised."
        : "We couldn’t save that response. Please try again."
    };
  }
}
