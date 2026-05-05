## Logo as "Back to site" link

**Current behaviour**: A small "Back to site" text link sits left of the logo. The logo itself links to the print centre home (`/t/:slug/print-centre`).

**New behaviour**:
1. Remove the "Back to site" text link entirely.
2. When `originUrl` is set, the logo becomes an `<a href={originUrl} target="_blank">` (opens origin site in a new tab, keeping the print centre tab open).
3. When `originUrl` is **not** set, the logo remains a React Router `<Link>` to the print centre home (current fallback behaviour).

### File changed

**`src/components/CustomerHeader.tsx`** (lines 131-156)

- Delete the "Back to site" `<a>` block (lines 133-143).
- Replace the `<Link to={tenantPath("print-centre")}>` logo wrapper with a conditional:
  - If `originUrl` exists → `<a href={originUrl} target="_blank" rel="noopener noreferrer">` wrapping the logo image/text.
  - Otherwise → keep the existing `<Link to={tenantPath("print-centre")}>`.

No other files are affected. The `ExternalLink` icon import can be removed since nothing else uses it.
