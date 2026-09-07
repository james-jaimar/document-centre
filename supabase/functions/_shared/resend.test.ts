import {
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  describeResendVerificationFailure,
  normalizeResendApiKey,
  ResendApiError,
  validateResendApiKey,
} from "./resend.ts";

Deno.test("normalizes harmless surrounding whitespace", () => {
  assertEquals(normalizeResendApiKey("  re_abcdefghijklmnopqrstuvwxyz  \n"), "re_abcdefghijklmnopqrstuvwxyz");
});

Deno.test("rejects incomplete or malformed Resend keys", () => {
  assertMatch(validateResendApiKey("not-a-key") ?? "", /beginning with re_/);
  assertMatch(validateResendApiKey("re_has spaces") ?? "", /beginning with re_/);
  assertEquals(validateResendApiKey("re_abcdefghijklmnopqrstuvwxyz"), null);
});

Deno.test("maps invalid-key JSON without leaking the raw response", () => {
  const message = describeResendVerificationFailure(
    new ResendApiError(400, JSON.stringify({ statusCode: 400, message: "API key is invalid", name: "validation_error" })),
  );
  assertMatch(message, /invalid or has been revoked/);
  assertEquals(message.includes("statusCode"), false);
});

Deno.test("explains restricted-key permissions", () => {
  const message = describeResendVerificationFailure(
    new ResendApiError(403, JSON.stringify({ message: "Restricted API key does not have permission" })),
  );
  assertMatch(message, /Full access API key/);
});