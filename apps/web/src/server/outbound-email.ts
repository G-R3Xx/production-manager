import "server-only";

import { randomUUID } from "node:crypto";

export type OutboundEmailAttachment = {
  fileName: string;
  content: Uint8Array;
};

export type OutboundEmailTag = {
  name: string;
  value: string;
};

export type SendOutboundEmailInput = {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: OutboundEmailAttachment[];
  tags?: OutboundEmailTag[];
  idempotencyKey?: string;
};

export function outboundEmailConfigured(fromEmail: string | null | undefined): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && fromEmail?.trim());
}

export async function sendOutboundEmail(input: SendOutboundEmailInput): Promise<{ messageId: string | null }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = input.fromEmail.trim();
  if (!apiKey || !fromEmail) {
    throw new Error("Automated email is not configured. Add RESEND_API_KEY and a verified sender email to the Production Manager deployment.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey?.trim() || `pm-email-${randomUUID()}`
      },
      body: JSON.stringify({
        from: `${input.fromName} <${fromEmail}>`,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.replyTo?.trim() ? { reply_to: input.replyTo.trim() } : {}),
        ...(input.attachments?.length ? {
          attachments: input.attachments.map((attachment) => ({
            filename: attachment.fileName,
            content: Buffer.from(attachment.content).toString("base64")
          }))
        } : {}),
        ...(input.tags?.length ? { tags: input.tags } : {})
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Automated email timed out after 30 seconds.");
    }
    throw new Error(`Automated email failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = responseText ? JSON.parse(responseText) as Record<string, unknown> : {}; } catch { payload = {}; }
  if (!response.ok) {
    const providerMessage = typeof payload.message === "string" ? payload.message : responseText || `${response.status} ${response.statusText}`;
    throw new Error(`Automated email failed (${response.status}): ${providerMessage}`);
  }

  return { messageId: typeof payload.id === "string" ? payload.id : null };
}
