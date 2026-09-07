# Give tenants the same email template editor as the platform

## What I checked

Both screens read the same template records, but they are two separate editors. The tenant one (Impress Print → Communications → Templates) is a cut-down version.

Present on the platform screen, missing on the tenant screen:

- Full-height three-pane layout (list / editor / live preview)
- Live preview of the finished email, with the subject line rendered
- Raw HTML toggle for hand-editing the code of a message
- Insert-token buttons that drop personalisation into the message or the plain-text version at the cursor
- Sticky toolbar with Save always visible
- Name and Subject side by side; a description field
- Duplicate / rename / delete row actions on each template in the list

Also on the tenant screen: the Message editor stays editable on shared read-only templates (Name, Subject and plain-text are correctly locked, the rich editor is not), so it looks editable but the Save button is hidden.

## What I will build

Turn the platform template editor into one shared component used by both screens, driven by a small set of options:

- **Shared parts**: three-pane layout, live preview, Raw HTML toggle, token buttons, sticky Save, name/subject/description fields, list with row actions.
- **Platform mode**: all templates, all kinds (activation and marketing), system badge.
- **Tenant mode**: only marketing templates; the tenant's own ones are fully editable, the shared platform ones are read-only with a Duplicate button; new templates are always created against the active tenant with the tenant-scoped slug the current code already generates.

Read-only handling gets fixed properly: in read-only mode every field including the message body and the Raw HTML view is locked, and the preview still renders so a tenant can see what they are duplicating.

Token list stays context-appropriate — tenants see the marketing tokens (contact name, business name, tenant name, personal link, unsubscribe).

## Technical notes

- New `src/components/admin/email/TemplateEditor.tsx` extracted from `PlatformCommunications.tsx` lines 543-770, with props `{ scope: "platform" | "tenant", tenantId?, kindFilter?, tokens, readOnlyFor(t) }`.
- `PlatformCommunications.tsx` `TemplatesTab` and `AdminCommunications.tsx` `TemplatesTab` both become thin wrappers around it. `NewTemplateButton` / `TemplateRowActions` move alongside it and gain a tenant-aware create path (sets `tenant_id`, `kind: "marketing"`).
- No schema or policy change: `platform_email_templates` already carries `tenant_id`, and the tenant read/write policies already allow own-tenant writes and shared-template reads.
- Verify in the Impress Print tenant: duplicate a shared template, edit it in rich text and in Raw HTML, insert tokens, watch the live preview update, save, reload, then delete.
