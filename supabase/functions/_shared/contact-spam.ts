// Spam scoring + bot heuristics for the public contact form.
//
// Designed against the real bot traffic seen in `contact_submissions`:
// random-consonant names/subjects, a 10-digit number as the whole "message",
// fake "Xyzabc LLC" companies, and forged third-party email addresses.
//
// Scoring: >= 3 is treated as spam. Spam rows are still stored (status
// 'spam') so nothing is lost, but NO email is sent to the address typed in
// the form — that is what stops the bounce-back backscatter.

export interface SpamInput {
  name: string;
  email: string;
  company: string;
  phone: string;
  subject: string;
  message: string;
  honeypot: string;
  /** ms between form render and submit, as reported by the client. */
  elapsedMs: number | null;
}

export interface SpamVerdict {
  score: number;
  reasons: string[];
  isSpam: boolean;
}

export const SPAM_THRESHOLD = 3;

const VOWELS = /[aeiouAEIOU]/g;

/** Ratio of vowels to letters. Real words sit around 0.35–0.45. */
function vowelRatio(s: string): number {
  const letters = s.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 6) return 0.4;
  return (letters.match(VOWELS)?.length ?? 0) / letters.length;
}

/** Random-looking string: long, no spaces, poor vowel ratio, mixed case runs. */
function looksRandom(s: string): boolean {
  const t = s.trim();
  if (t.length < 8) return false;
  if (/\s/.test(t)) return false;
  const r = vowelRatio(t);
  if (r < 0.28 || r > 0.62) return true;
  // Alternating case with no separators is a strong generator signature.
  const caseFlips = (t.match(/(?:[a-z][A-Z]|[A-Z][a-z])/g) ?? []).length;
  return caseFlips >= Math.max(4, Math.floor(t.length / 4));
}

export function scoreSubmission(input: SpamInput): SpamVerdict {
  const reasons: string[] = [];
  let score = 0;

  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  // 1. Honeypot — humans never see this field.
  if (input.honeypot.trim()) add(10, "honeypot_filled");

  // 2. Timing trap — a real person cannot fill this form in under 3s.
  if (input.elapsedMs !== null && input.elapsedMs >= 0 && input.elapsedMs < 3000) {
    add(4, "submitted_too_fast");
  }

  const message = input.message.trim();

  // 3. Message is nothing but digits (the exact bot signature seen live).
  if (/^\d[\d\s.+-]*$/.test(message)) add(4, "message_digits_only");

  // 4. Message has no spaces at all — not a sentence.
  if (message.length >= 10 && !/\s/.test(message)) add(3, "message_no_spaces");

  // 5. Random-looking name / subject.
  if (looksRandom(input.name)) add(2, "name_looks_random");
  if (input.subject && looksRandom(input.subject)) add(2, "subject_looks_random");

  // 6. Generated company names: single random word + LLC/Inc/Ltd.
  if (/^[A-Za-z]{4,}\s+(LLC|Inc\.?|Ltd\.?|GmbH)$/i.test(input.company.trim())) {
    const first = input.company.trim().split(/\s+/)[0];
    if (vowelRatio(first) < 0.3 || vowelRatio(first) > 0.62) {
      add(2, "company_looks_generated");
    }
  }

  // 7. Gmail dot/plus obfuscation used to fake distinct senders.
  const local = input.email.split("@")[0] ?? "";
  const dots = (local.match(/\./g) ?? []).length;
  if (dots >= 3) add(2, "email_dot_obfuscated");

  // 8. Link spam in a short message.
  const links = (message.match(/https?:\/\/|www\./gi) ?? []).length;
  if (links >= 2) add(3, "multiple_links");
  else if (links === 1 && message.length < 120) add(2, "link_in_short_message");

  // 9. Common pharma / SEO spam vocabulary.
  if (/\b(viagra|cialis|casino|crypto\s*airdrop|seo\s*services|backlinks|loan\s*offer)\b/i.test(message)) {
    add(4, "spam_keywords");
  }

  // 10. No punctuation whatsoever in a long message.
  if (message.length > 40 && !/[.,!?]/.test(message)) add(1, "message_no_punctuation");

  return { score, reasons, isSpam: score >= SPAM_THRESHOLD };
}

/**
 * Verifies a Cloudflare Turnstile token. Returns `null` when Turnstile is not
 * configured (no secret set) so the form keeps working before setup, and a
 * boolean once it is.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp: string | null,
): Promise<boolean | null> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return null;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      console.error(`Turnstile verify HTTP ${res.status}: ${await res.text()}`);
      return false;
    }
    const json = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!json.success) {
      console.warn("Turnstile rejected:", JSON.stringify(json["error-codes"] ?? []));
    }
    return json.success === true;
  } catch (e) {
    console.error("Turnstile verify failed:", e);
    return false;
  }
}
