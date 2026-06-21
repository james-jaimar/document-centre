Plan to fix the missing branch details on regenerated proformas/invoices:

1. Update invoice PDF branch identity rendering
   - Show VAT number in the header metadata and ensure it is populated from the selected branch.
   - Add company registration number to the “Invoice From” block when set.
   - Keep trading name, phone, email, and address pulling from the branch first, with tenant fallback only when branch fields are blank.

2. Fix branch EFT/banking fallback
   - The branch settings save banking details under `branches.banking_details`.
   - The invoice generator currently expects that object, but I will make the resolution stricter and explicit so `eft_enabled`, bank name, account name, account number, branch code, SWIFT, and payment instructions all come from the branch first.
   - The Banking Details section will appear whenever branch EFT is enabled and there is at least one usable bank/account field.

3. Include payment instructions
   - Add the branch `payment_instructions` text underneath the banking table when it has been set.
   - Keep it compact so it does not collide with the acceptance/signature area on proformas.

4. Make regenerated PDFs clearly use current data
   - Leave existing historical PDFs untouched.
   - Only newly generated/regenerated PDFs will include the latest branch identity and EFT details.

Technical scope:
- Change only `supabase/functions/generate-invoice-pdf/index.ts`.
- No database schema changes.
- No invoice number changes in this pass.