# Fix artwork template PDF upload RLS error

## Goal
Allow tenant/platform administrators to upload and replace a template base PDF without weakening tenant isolation.

## Implementation
1. Change the artwork-template mutation to distinguish creation from editing:
   - New templates use an insert with their required scope and tenant ownership.
   - Existing templates use an update by ID instead of an upsert.
2. Keep ownership fields immutable during ordinary edits so uploading a PDF, renaming, or publishing cannot accidentally create or move a template between tenants.
3. Ensure the live database has the intended authenticated/service-role table grants already declared in the schema migration; add a corrective migration only if the live grants are genuinely absent.
4. Verify the complete flow: create a template, upload/replace its PDF, save placeholders, rename it, and publish/unpublish it.

## Technical detail
The upload currently calls `upsert` with an existing ID but omits `tenant_id`. Row-level security evaluates the proposed insert row before conflict resolution; its default tenant scope plus null tenant ownership fails the tenant write policy. An explicit update avoids that invalid insert candidate while preserving the existing RLS rules.
