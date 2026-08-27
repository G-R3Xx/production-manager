"use server";

import { redirect } from "next/navigation";
import { respondToArtworkApprovalByToken, respondToArtworkApprovalPageByToken } from "@/server/quotes";

function text(value: FormDataEntryValue | string | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : null;
}


type PageDecision = {
  pageId: string;
  status: "approved" | "changes_requested";
  notes: string | null;
};

function pageDecisions(formData: FormData): PageDecision[] {
  const raw = String(formData.get("pageDecisionsJson") ?? "").trim();
  if (!raw) throw new Error("Please finish the proof page decisions before submitting the review.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("The page decisions could not be read. Please review the proofs again."); }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Please finish the proof page decisions before submitting the review.");
  return parsed.map((entry) => {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const pageId = String(item.pageId ?? "").trim();
    const status = String(item.status ?? "").trim();
    const notes = text(item.notes == null ? null : String(item.notes));
    if (!pageId || (status !== "approved" && status !== "changes_requested")) throw new Error("Every proof page needs an approval or change request before the review can be submitted.");
    if (status === "changes_requested" && !notes) throw new Error("Please describe the requested changes for every page marked for changes.");
    return { pageId, status, notes } as PageDecision;
  });
}

async function persistPageDecisions(token: string, decisions: PageDecision[]): Promise<{ allApproved: boolean; hasChanges: boolean }> {
  let allApproved = false;
  let hasChanges = false;
  for (const decision of decisions) {
    const result = await respondToArtworkApprovalPageByToken(token, decision.pageId, decision.status, decision.notes);
    allApproved = result.allPagesApproved;
    hasChanges = result.hasChanges;
  }
  return { allApproved, hasChanges };
}

export async function approveArtworkAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) redirect("/");

  const signatoryName = text(formData.get("signatoryName"));
  const signatureDataUrl = text(formData.get("signatureDataUrl"));
  const confirmed = String(formData.get("confirmed") ?? "") === "on";

  if (!signatoryName) {
    redirect(`/public/artwork-approvals/${token}?error=Please%20enter%20your%20name%20to%20approve#respond`);
  }

  if (!signatureDataUrl) {
    redirect(`/public/artwork-approvals/${token}?error=Please%20provide%20a%20signature%20to%20approve#respond`);
  }

  if (!confirmed) {
    redirect(`/public/artwork-approvals/${token}?error=Please%20confirm%20you%20have%20checked%20the%20proof#respond`);
  }

  try {
    const decisions = pageDecisions(formData);
    if (decisions.some((decision) => decision.status !== "approved")) throw new Error("Every proof page must be approved before final production sign-off.");
    const persisted = await persistPageDecisions(token, decisions);
    if (!persisted.allApproved || persisted.hasChanges) throw new Error("Every current proof page must be approved before final production sign-off.");
    await respondToArtworkApprovalByToken(token, "approved", text(formData.get("notes")), signatoryName, signatureDataUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/public/artwork-approvals/${token}?error=${encodeURIComponent(message)}#respond`);
  }
  redirect(`/public/artwork-approvals/${token}?message=Artwork%20approved`);
}

export async function submitArtworkReviewAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) redirect("/");
  try {
    const decisions = pageDecisions(formData);
    if (!decisions.some((decision) => decision.status === "changes_requested")) throw new Error("No change requests were selected.");
    await persistPageDecisions(token, decisions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/public/artwork-approvals/${token}?error=${encodeURIComponent(message)}#respond`);
  }
  redirect(`/public/artwork-approvals/${token}?message=${encodeURIComponent("Review submitted. Your approved pages and change requests have been sent to the artwork team.")}`);
}
