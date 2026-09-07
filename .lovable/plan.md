# Fix Resend API-key connection errors

## Confirmed diagnosis

- The saved Impress Print Resend account does have a key stored securely.
- “Check connection” reaches Resend successfully; Resend returns `400 API key is invalid` from the domain-list request. There is no crash in the email settings function.
- The current edit flow replaces the stored key before validating it, and the screen does not explain that this integration needs a **Full access** Resend key for domains, contacts, segments and broadcasts—not a send-only key.

## Changes

1. **Validate before replacing**
   - When a new key is entered, check it against Resend before deleting or replacing the existing stored key.
   - Keep the previous working key if the new key is rejected.
   - Normalise harmless pasted whitespace and reject clearly malformed values with a useful message.

2. **Make the required Resend key clear**
   - Label the field as a **Full access API key** and explain where to create it in Resend.
   - Distinguish invalid/revoked keys from restricted send-only keys and unverified sender domains.
   - Avoid displaying Resend’s raw JSON error in the account card.

3. **Make save and connection checking consistent**
   - Saving a new key will verify it immediately and only mark the account ready/default when verification succeeds.
   - “Check connection” will test the currently saved key unless a replacement is actively entered in Edit mode.
   - Clear stale error text after a successful replacement.

4. **Verify the complete path**
   - Test rejected, restricted and valid key responses without exposing key values.
   - Confirm a valid saved key reports Connected, survives reopening the settings screen, and can queue a test email through the Resend account.

## Technical notes

- Update the Resend account form and `email-account-manage` only; no database schema change is required.
- Preserve encrypted Vault storage and tenant/branch permission checks.
- Add focused tests around key normalisation, permission/error mapping, and replacement safety, then inspect the function logs and rendered settings state.
