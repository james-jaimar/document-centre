# Statement ageing shows R9 485,20 when nothing is owed

## What's actually happening

Confirmed from the database function that produces these figures.

The "Balance owing" figure is correct — it adds up everything on the account, so the cancelled orders and their matching credit notes cancel out to R0,00.

The ageing strip underneath (Current / 30 / 60 / 90+) and the Overdue figure are calculated differently: they add up **order charges only** and ignore credit notes and payments entirely. So the three cancelled orders still sit in "Current" at R9 485,20 even though they have been fully credited.

This is not specific to this customer — every account with any payment or credit note shows an inflated ageing strip.

## The fix

Make the ageing strip and Overdue figure work off what is actually still owed:

- Apply payments, credit notes and opening balances against the outstanding charges, oldest charge first.
- A charge that has been fully credited or paid drops out of the ageing entirely.
- A partly paid charge shows only the remaining amount, in the bucket matching its due date.
- Any credit left over after all charges are covered reduces the "Current" bucket, so a customer in credit shows a negative figure there rather than a phantom balance.
- Overdue becomes the total of the remaining amounts whose due date has passed.

Result for this customer: all four buckets and Overdue read R0,00, matching the R0,00 balance and the R20 000,00 available credit.

No change to the statement rows, the balance, the credit limit, or how orders and credit notes are recorded.

## Technical notes

- Rewrite `public.resolve_account_balance` (migration, same signature and JSON shape) to do FIFO allocation: order `charge` rows by `entry_date`/`created_at`, consume the absolute value of all non-charge rows against them, then bucket the residual amounts by `due_date` against `CURRENT_DATE`. Any unconsumed credit is subtracted from `bucket_current`.
- `balance` stays a plain `SUM(amount)`.
- No frontend change — `useAccountBalance` and `AccountLedgerPanel` already read these keys.
