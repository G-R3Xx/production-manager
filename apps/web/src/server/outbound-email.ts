import "server-only";

import { randomUUID } from "node:crypto";
import tls from "node:tls";

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
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: OutboundEmailAttachment[];
  tags?: OutboundEmailTag[];
  idempotencyKey?: string;
};

type SmtpResponse = { code: number; text: string };

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465;
const SMTP_TIMEOUT_MS = 30_000;

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function cleanEmail(value: string): string {
  return value.trim().replace(/^mailto:/i, "").split("?")[0]?.replace(/[<>]/g, "").trim() ?? "";
}

function base64Lines(value: Uint8Array | string): string {
  const encoded = typeof value === "string"
    ? Buffer.from(value, "utf8").toString("base64")
    : Buffer.from(value).toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function encodedHeader(value: string): string {
  const safe = cleanHeader(value);
  return /^[\x20-\x7E]*$/.test(safe) ? safe : `=?UTF-8?B?${Buffer.from(safe, "utf8").toString("base64")}?=`;
}

function dotStuff(message: string): string {
  return message.replace(/(^|\r\n)\./g, "$1..");
}

function buildMimeMessage(input: SendOutboundEmailInput, fromEmail: string, messageId: string): string {
  const mixedBoundary = `pm-mixed-${randomUUID()}`;
  const htmlBoundary = `pm-html-${randomUUID()}`;
  const headers = [
    `From: "${cleanHeader(input.fromName).replace(/"/g, "'")}" <${fromEmail}>`,
    `To: ${cleanEmail(input.to)}`,
    `Subject: ${encodedHeader(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}>`,
    "MIME-Version: 1.0",
    ...(input.replyTo?.trim() ? [`Reply-To: ${cleanEmail(input.replyTo)}`] : []),
    ...(input.tags ?? []).map((tag) => `X-PM-${cleanHeader(tag.name).replace(/[^A-Za-z0-9-]/g, "-")}: ${cleanHeader(tag.value)}`),
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`
  ];

  const parts = [
    headers.join("\r\n"),
    "",
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${htmlBoundary}"`,
    "",
    `--${htmlBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(input.html),
    `--${htmlBoundary}--`
  ];

  for (const attachment of input.attachments ?? []) {
    const fileName = cleanHeader(attachment.fileName).replace(/"/g, "'") || "attachment.pdf";
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: application/pdf; name="${fileName}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${fileName}"`,
      "",
      base64Lines(attachment.content)
    );
  }

  parts.push(`--${mixedBoundary}--`, "");
  return parts.join("\r\n");
}

class SmtpReader {
  private buffer = "";
  private current: string[] = [];
  private responses: SmtpResponse[] = [];
  private waiters: Array<{ resolve: (value: SmtpResponse) => void; reject: (error: Error) => void }> = [];
  private terminalError: Error | null = null;

  constructor(socket: tls.TLSSocket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.onData(chunk));
    socket.on("error", (error: Error) => this.fail(error instanceof Error ? error : new Error(String(error))));
    socket.on("timeout", () => this.fail(new Error(`Gmail SMTP timed out after ${SMTP_TIMEOUT_MS / 1000} seconds.`)));
    socket.on("close", () => {
      if (this.waiters.length) this.fail(new Error("Gmail SMTP connection closed unexpectedly."));
    });
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    while (true) {
      const index = this.buffer.indexOf("\r\n");
      if (index < 0) break;
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 2);
      this.current.push(line);
      const match = /^(\d{3})([ -])/.exec(line);
      if (match?.[2] === " ") {
        const response = { code: Number(match[1]), text: this.current.join("\n") };
        this.current = [];
        const waiter = this.waiters.shift();
        if (waiter) waiter.resolve(response);
        else this.responses.push(response);
      }
    }
  }

  private fail(error: Error) {
    if (this.terminalError) return;
    this.terminalError = error;
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  next(): Promise<SmtpResponse> {
    if (this.responses.length) return Promise.resolve(this.responses.shift()!);
    if (this.terminalError) return Promise.reject(this.terminalError);
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }
}

function expect(response: SmtpResponse, allowed: number[], step: string) {
  if (!allowed.includes(response.code)) {
    throw new Error(`Gmail SMTP ${step} failed (${response.code}): ${response.text}`);
  }
}

async function smtpCommand(socket: tls.TLSSocket, reader: SmtpReader, command: string, allowed: number[], step: string) {
  socket.write(`${command}\r\n`);
  const response = await reader.next();
  expect(response, allowed, step);
  return response;
}

export function outboundEmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
}

export async function sendOutboundEmail(input: SendOutboundEmailInput): Promise<{ messageId: string | null }> {
  const user = cleanEmail(process.env.GMAIL_USER ?? "");
  const appPassword = (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, "");
  const recipient = cleanEmail(input.to);
  if (!user || !appPassword) {
    throw new Error("Automated email is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to the Production Manager deployment.");
  }
  if (!recipient || !recipient.includes("@")) throw new Error("Automated email failed: recipient email is invalid.");

  const domain = user.split("@")[1] || "tenderedge.com.au";
  const messageId = `${cleanHeader(input.idempotencyKey || `pm-${randomUUID()}`).replace(/[^A-Za-z0-9._-]/g, "-")}@${domain}`;
  const mime = buildMimeMessage(input, user, messageId);

  const socket = tls.connect({ host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST, rejectUnauthorized: true });
  socket.setTimeout(SMTP_TIMEOUT_MS);
  const reader = new SmtpReader(socket);

  try {
    await new Promise<void>((resolve, reject) => {
      if (socket.authorized) return resolve();
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
    });

    expect(await reader.next(), [220], "greeting");
    await smtpCommand(socket, reader, `EHLO ${domain}`, [250], "EHLO");
    await smtpCommand(socket, reader, "AUTH LOGIN", [334], "authentication start");
    await smtpCommand(socket, reader, Buffer.from(user, "utf8").toString("base64"), [334], "username");
    await smtpCommand(socket, reader, Buffer.from(appPassword, "utf8").toString("base64"), [235], "password");
    await smtpCommand(socket, reader, `MAIL FROM:<${user}>`, [250], "MAIL FROM");
    await smtpCommand(socket, reader, `RCPT TO:<${recipient}>`, [250, 251], "RCPT TO");
    await smtpCommand(socket, reader, "DATA", [354], "DATA");
    socket.write(`${dotStuff(mime)}\r\n.\r\n`);
    expect(await reader.next(), [250], "message send");
    try { await smtpCommand(socket, reader, "QUIT", [221], "QUIT"); } catch { /* email was already accepted */ }
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`Automated email failed: ${String(error)}`);
  } finally {
    socket.end();
    socket.destroy();
  }

  return { messageId: `<${messageId}>` };
}
