## Good news — this already works

The marketing campaign flow you're looking at already does exactly what you described. When you select branches and hit **Send** (or **Dry run**) in **Platform → Communications → Marketing**:

1. For every selected branch, the backend checks `platform_branch_activation_pages` for that branch.
2. If a row exists → it reuses the existing slug.
3. If not → it mints a new opaque slug, creates the row, and stores it.
4. It then substitutes `{{activation_link}}` in your template with `https://<tenant-domain>/activate/<slug>` — unique per branch.
5. Sends through the in-app email tool (your own Communications infra), one email per branch, with per-recipient tracking + the unsubscribe footer.

So if you put `{{activation_link}}` in the marketing template body and select all 500 branches, every recipient gets their own per-branch link, auto-created on the fly. No CSV / external merge needed.

The only token you need in the template is `{{activation_link}}`. Other available tokens: `{{branch_name}}`, `{{contact_name}}`, `{{tenant_name}}`.

## What I'd like to add (small UX polish)

To make this obvious in the UI so you don't have to take my word for it:

### 1. Inline hint on the template editor
Under the body field when editing a **marketing** template, show a one-line callout:

> Use `{{activation_link}}` anywhere in the body — each recipient gets a unique per-branch activation URL, auto-created at send time.

Plus a "Insert {{activation_link}}" button next to the existing token chips.

### 2. Pre-send confirmation banner
On the **Send campaign** screen, after selecting branches, show:

> Sending to 500 branches. 487 already have activation pages; 13 new pages will be created and linked automatically.

(Computed by counting existing rows in `platform_branch_activation_pages` for the selected branch_ids.)

### 3. Validation
If the selected marketing template's body does **not** contain `{{activation_link}}`, show a warning before send:

> This template doesn't include `{{activation_link}}`. Recipients won't get an activation URL. Send anyway?

### 4. Drop the CSV export confusion
Remove the "Download CSV" button I added earlier — it was solving a problem you don't have, since the in-app sender already handles per-recipient substitution. Keeps the UI clean.

## What I won't change
- The backend (`send-branch-marketing-campaign`) — already correct.
- The token name — staying as `{{activation_link}}` (matches what's already wired).
- The activation page itself (`/activate/:slug`) — already public, already bypasses the demo gate on custom domains.

## After this ships
1. Open your marketing template, make sure `{{activation_link}}` is in the body where you want the CTA.
2. Pick tenant **PostNet**, select all branches.
3. Hit **Send**. Each branch gets its own unique link, minted on demand.
