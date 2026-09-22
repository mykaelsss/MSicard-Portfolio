/// <reference types="@cloudflare/workers-types" />

/**
 * The contact endpoint.
 *
 * A public POST route that sends mail is the one part of this site a stranger
 * can make do work, so it is defended in layers rather than by any single
 * check. In order of cost, cheapest first:
 *
 *   1. Shape     - method, origin, content type, body size.
 *   2. Traps     - a honeypot field and a minimum fill time. Free, and they
 *                  catch the scripted submitters that never render CSS.
 *   3. Content   - field validation, so malformed input never reaches step 4.
 *   4. Turnstile - a real challenge, verified with Cloudflare. This is the wall.
 *   5. Rate cap  - per IP, so even a solved challenge cannot be replayed into
 *                  a flood.
 *
 * Only after all five does anything leave the Worker.
 */

export interface ContactEnv {
  /** Turnstile secret key. Absent means the form is switched off, not open. */
  TURNSTILE_SECRET?: string;
  /** Resend API key. Same rule. */
  RESEND_API_KEY?: string;
  /** Where the mail lands. */
  CONTACT_TO?: string;
  /** Envelope sender. Must be on a domain verified with the mail provider. */
  CONTACT_FROM?: string;
  /** Optional; the handler works without it, with one layer fewer. */
  CONTACT_RATE_LIMIT?: RateLimit;
}

/*
 * Generous enough for a long note, small enough that nobody can post a book.
 * Checked against the declared length and again against the real one, because
 * Content-Length is a claim, not a fact.
 */
const MAX_BODY_BYTES = 16 * 1024;

const LIMITS = {
  name: { min: 1, max: 80 },
  email: { max: 254 },
  message: { min: 20, max: 4000 },
};

/*
 * How long a human takes to fill three fields, at the absolute floor. This is
 * an elapsed duration measured in the browser, never a wall-clock timestamp,
 * so a skewed client clock cannot trip it.
 */
const MIN_FILL_MS = 2500;

/** Deliberately loose. The real validation of an address is delivery. */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/*
 * Anything that could break out of a header line, or ride along invisibly in
 * the body. The subject is the one place reader-controlled text meets a mail
 * header; the provider takes JSON and escapes it, but defending the value
 * itself keeps that true if the transport is ever swapped.
 */
const CONTROL_CHARS = /[\r\n\t\p{Cc}\p{Cf}]/gu;

interface Payload {
  name: string;
  email: string;
  message: string;
  token: string;
  elapsed: number;
  /** The honeypot. Named to look worth filling in. */
  company: string;
}

type Field = "name" | "email" | "message" | "captcha";

function fail(status: number, error: string, field?: Field): Response {
  return Response.json({ ok: false, error, field }, { status });
}

/*
 * A bot is told the same thing a person is. Naming the trap it hit would be
 * free tuning advice for whoever wrote it.
 */
function pretendSuccess(): Response {
  return Response.json({ ok: true });
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function headerSafe(value: string): string {
  return value.replace(CONTROL_CHARS, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface TurnstileResult {
  success: boolean;
  "error-codes"?: string[];
}

async function verifyTurnstile(
  secret: string,
  token: string,
  ip: string | null,
): Promise<boolean> {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  /* Makes the token safe to re-verify if this call is ever retried: Turnstile
     tokens are single use, and a bare retry would read as a replay. */
  form.append("idempotency_key", crypto.randomUUID());

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: form },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as TurnstileResult;
    return data.success === true;
  } catch {
    /* Fail closed. An unreachable verifier is a reason to send nothing, not a
       reason to trust the submission. */
    return false;
  }
}

async function sendMail(
  env: ContactEnv,
  input: { name: string; email: string; message: string },
): Promise<boolean> {
  const to = env.CONTACT_TO;
  const from = env.CONTACT_FROM;
  if (!to || !from) return false;

  const safeName = headerSafe(input.name);
  const text = `From: ${safeName} <${input.email}>\n\n${input.message}`;
  const html =
    `<p><strong>${escapeHtml(safeName)}</strong> ` +
    `&lt;<a href="mailto:${encodeURIComponent(input.email)}">` +
    `${escapeHtml(input.email)}</a>&gt;</p>` +
    `<pre style="white-space:pre-wrap;font:inherit;margin:0">` +
    `${escapeHtml(input.message)}</pre>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: headerSafe(`Portfolio contact - ${safeName}`),
        text,
        html,
        /* So a reply goes to the sender rather than to the Worker's own
           from-address, which nobody reads. */
        reply_to: `${safeName} <${input.email}>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function handleContact(
  request: Request,
  env: ContactEnv,
  url: URL,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  /* Same-origin only. Browsers always send Origin on a cross-origin POST, so
     a mismatch is either a hostile page or a script, and neither one is a
     reader using the form. */
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return fail(403, "bad_origin");

  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return fail(415, "bad_content_type");
  }

  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_BODY_BYTES) return fail(413, "too_large");

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail(413, "too_large");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "bad_json");
  }
  if (typeof body !== "object" || body === null) return fail(400, "bad_json");

  const input = body as Partial<Payload>;

  /* The traps, before anything expensive. Both answer with a success a bot
     has no reason to question. */
  if (str(input.company) !== "") return pretendSuccess();
  if (typeof input.elapsed !== "number" || input.elapsed < MIN_FILL_MS) {
    return pretendSuccess();
  }

  const name = str(input.name);
  const email = str(input.email);
  const message = str(input.message);
  const token = str(input.token);

  if (name.length < LIMITS.name.min || name.length > LIMITS.name.max) {
    return fail(422, "bad_name", "name");
  }
  if (email.length > LIMITS.email.max || !EMAIL.test(email)) {
    return fail(422, "bad_email", "email");
  }
  if (
    message.length < LIMITS.message.min ||
    message.length > LIMITS.message.max
  ) {
    return fail(422, "bad_message", "message");
  }
  if (!token) return fail(422, "no_captcha", "captcha");

  /* Missing configuration switches the form off rather than waving traffic
     through. A dark form is a much better failure than an open relay. */
  if (!env.TURNSTILE_SECRET || !env.RESEND_API_KEY) {
    return fail(503, "not_configured");
  }

  const ip = request.headers.get("CF-Connecting-IP");

  if (!(await verifyTurnstile(env.TURNSTILE_SECRET, token, ip))) {
    return fail(403, "bad_captcha", "captcha");
  }

  /* Last, because a solved challenge is the expensive thing for a bot to earn
     and this is what stops one being spent over and over. */
  if (env.CONTACT_RATE_LIMIT && ip) {
    const { success } = await env.CONTACT_RATE_LIMIT.limit({ key: ip });
    if (!success) return fail(429, "rate_limited");
  }

  if (!(await sendMail(env, { name, email, message }))) {
    return fail(502, "send_failed");
  }

  return Response.json({ ok: true });
}
