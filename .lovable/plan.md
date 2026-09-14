# Make the 700-recipient campaign send safely in one go

## What I checked

I walked the send path end to end: the Send button in Communications, the campaign sender, and the Resend helpers.

Today, pressing Send does everything inside a single request that must stay open until the last recipient is done:

```text
Send  →  one request  →  for each of the 700 recipients, one at a time:
                            create/refresh their personal activation link
                            push them to Resend as a contact
                            write the history row
                            wait 130ms (rate limit)
                         then tidy the contact list
                         then create the broadcast
```

At roughly 0.6–1 second per recipient that is **7 to 12 minutes of one continuous request**. It will be cut off long before it finishes — the browser gives up, and the server has a hard time limit too. When it is cut off, part of the list is in Resend, the history row is stuck on "running", and **no broadcast is ever created**, so nobody gets the email. Pressing Send again starts from scratch.

Two more problems that only appear at this size:

- **The tidy-up step only reads the first page of the contact list.** With 700 contacts it will see a fraction of them, so leftovers from earlier sends can stay in the list and receive the campaign.
- **No progress and no resume.** You can't tell how far it got, and nothing picks up where it stopped.

Nothing is wrong with the email itself, the activation links, or Resend — the mechanics have simply never been run at this volume.

## What I'll change

### 1. Three short steps instead of one long one

Send becomes a sequence the screen drives, each step small enough to always finish:

1. **Prepare** — creates the campaign, makes sure the Resend fields and shared "General" list exist, and generates all 700 personal activation links in a handful of bulk database operations (seconds, not minutes). Recipients are saved as "pending".
2. **Upload contacts** — repeats, handling about 75 recipients each time, pacing safely under Resend's rate limit. Roughly 3–4 minutes total, with a live count on screen.
3. **Send** — trims the shared list to exactly your chosen recipients, then creates the broadcast.

### 2. Resume instead of restart

If a step fails or you close the tab, the campaign stays on screen with a **Resume** button that continues from the first recipient not yet uploaded. Nothing is duplicated and nobody is emailed twice — the broadcast only goes out at the final step.

### 3. Fix the contact-list tidy-up

Read the whole list, not just the first page, so no one left over from a previous campaign can receive this one. If the list can't be fully read, the send stops before the broadcast is created — as it does now.

### 4. Progress you can watch

A progress bar with "312 of 700 prepared", the number skipped (no email, unsubscribed, previously bounced) and any failures listed by name, so you can see it working rather than staring at a spinner.

## What you should do in the morning

1. Open the campaign and run **Dry run** — confirms the recipient count, the wording and the images, sends nothing.
2. Send a **test** to yourself and check the activation button lands on the right page.
3. Press **Send** and leave the tab open for the few minutes the contact upload takes. If it stops, press **Resume**.

Optional, and worth it: press **Prepare** tonight. The activation links get generated and stored, so in the morning only the upload and the broadcast remain.

## Technical notes

- `resend-broadcast-send/index.ts` gains a `phase` parameter (`prepare` | `sync` | `finalise`) replacing the single monolithic pass. `prepare` writes `platform_email_campaign_recipients` rows with `status: 'pending'` and bulk-upserts `platform_branch_activation_pages` (one select of existing rows by target id + one bulk insert + one bulk update, replacing 700 round trips). `sync` claims the next `batch_size` pending rows for the campaign, pushes contacts, and flips them to `sent`/`failed`. `finalise` runs the trim and `createBroadcast`, then sets the campaign to `sent`. Each phase returns `{ campaign_id, remaining, totals }`.
- `_shared/resend.ts`: `listSegmentContacts` gains cursor/limit pagination looping until exhausted.
- `AdminCommunications.tsx`: `send()` becomes a driver loop over the phases with progress state, a cancel control, and a Resume action bound to a `running` campaign with pending recipients.
- Dry run, single-recipient test, and the non-Resend `send-branch-marketing-campaign` path are unchanged.
