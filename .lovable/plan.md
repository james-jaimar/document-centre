
The user bought document-centre.com and wants the app rebranded from "Document Centre" (which is mostly already the name based on index.html title) to consistently reflect this. Let me check what currently uses the name to scope the work.

Looking at what I know:
- index.html title is already "Document Centre"
- Various references in code/templates likely say "Lovable Generated Project", "Document Centre", or other variants
- Email templates use `siteName` prop — driven by what's passed in

I need to search for: "Lovable Generated Project", "Document Centre", "document-centre", "Document Center" variants, hardcoded brand names in components, the meta tags, README, etc.

Let me keep the plan tight — this is a find/replace + canonical-name decision exercise.

Key decision: user wrote "Document Center" (US) in chat but bought "document-centre.com" (UK/SA). Project memory says SA English is preferred. So canonical = **"Document Centre"** with domain **document-centre.com**. Confirm with user.

Scope of changes:
1. index.html — meta description, og:description (currently "Lovable Generated Project")
2. README.md
3. Any hardcoded brand strings in components (sidebars, auth page, landing)
4. Email templates default siteName / siteUrl
5. Any reference to old project name in audit logs / seed data
6. Tenant-default branding fallback in useTenantBranding (portal_name default is empty — fine, but the platform-level brand needs setting)

I should NOT touch tenant-level branding (each tenant sets their own portal_name via tenant_settings). This rebrand is for the **platform shell** — the SaaS product itself, not individual storefronts.

Plan should be brief.
