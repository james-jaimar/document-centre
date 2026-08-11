# Website enquiries inbox in Platform admin

## Why you can't see them

The contact form saves every enquiry into the `contact_submissions` table, and the database already allows platform admins to read and update those rows — but no screen was ever built for them. There is no Enquiries page and no sidebar link, so the only place they show up today is the internal notification email.

Right now there are 3 enquiries marked "new" and 15 marked "spam".

## What to build

A new **Enquiries** page under Platform admin, linked in the platform sidebar (next to Sent Mail / Communications) with a badge showing the count of unread "new" enquiries.

The page shows:
- Filter tabs: New, Read, Replied, Spam, All (default New)
- A list of enquiries with name, email, company, subject, source, date, and a spam-score chip where relevant
- Search across name, email, company, subject and message
- Click a row to open a detail panel showing the full message, phone, IP address, user agent, spam score and reasons
- Actions: mark as read, mark as replied, mark as spam / not spam, and a "Reply by email" button that opens the visitor's address in the mail client with the subject pre-filled

No emails are sent from this screen and nothing is deleted — status changes only.

## Technical notes

- New page `src/pages/platform/PlatformEnquiries.tsx`, route `/platform/enquiries` in `App.tsx` behind the existing platform-admin guard, and an entry in the platform section of `AppSidebar.tsx`.
- New hook `src/hooks/useContactSubmissions.ts` using the Supabase client: list with filters, plus a status-update mutation. Existing RLS policies already restrict both to `platform_admin`, so no migration is needed.
- Unread badge derived from a lightweight count query on `status = 'new'`, following the pattern used by the existing new-orders badge.
