# Add a "Prepare" button to the campaign screen

Right now Send does everything itself: it prepares the list, adds the recipients in batches, then creates the broadcast. So in the morning, pressing Send alone would work. You asked for the option to do the slow part tonight, so this adds a separate Prepare step.

## What you get

- A **Prepare** button next to Send. Pressing it creates the campaign and generates all 700 personal activation links, then stops. Nothing is uploaded to Resend and nothing is emailed.
- When a prepared campaign is waiting, the screen shows "700 recipients prepared — ready to send" with a **Send prepared campaign** button. Pressing that runs only the remaining work: adding recipients in small batches, then the broadcast.
- **Send** on its own is unchanged — it still does the whole run end to end, so if you skip Prepare nothing is lost.
- Pause and Resume keep working at every stage.
- If you press Prepare twice, it continues the existing prepared campaign instead of making a second one.

## Suggested run

Tonight: pick your template and the 700 shops, press **Prepare**, wait for "prepared".
Morning: open the same screen, confirm it still says prepared, press **Send prepared campaign** and watch the progress bar.

## Technical notes

- `AdminCommunications.tsx`: extract the current `send()` body into `prepareCampaign()` returning `{ campaign_id, remaining, totals }`; `send()` calls it and then `runRemainingPhases()` as today. New `prepare()` calls only `prepareCampaign()` and parks the result in a `preparedCampaign` state `{ campaignId, remaining, totals }` rendered as a ready strip with a "Send prepared campaign" action bound to `runRemainingPhases(campaignId, remaining, skipped)`.
- On mount, look up the tenant's most recent `platform_email_campaigns` row with status `running` that still has pending recipients and hydrate `preparedCampaign` from it, so a prepared campaign survives closing the tab overnight.
- Prepare is hidden for dry run, test-only, and the non-Resend `send-branch-marketing-campaign` path.
- No edge-function changes — the `prepare` / `sync` / `finalise` phases already support this.
