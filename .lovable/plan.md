## Two bugs, one root area: `src/pages/dashboard/OrderBuild.tsx`

### Bug 1 — "Manage Tabs & Inserts" button disappears when tabs are turned off
The `insertEnabled` lookup picks the first option whose name contains `"insert"` OR `"divider"`:

```ts
options.find((o) => o.name.toLowerCase().includes("insert") || o.name.toLowerCase().includes("divider"))
```

The **Tab Dividers** option name also contains "divider", and it comes before **Inserts** in the list. So when Tab Dividers is set to "No Tab Dividers", `insertEnabled` reads the *tab* slug (`none`) and returns `false` — even though the real Inserts option is set to "Coloured Divider Sheet". The Manage button is gated on `(tabInfo || insertEnabled)`, so it vanishes.

**Fix:** make the insert lookup specific — match `name.includes("insert")` only, or exclude any option whose name contains "tab". Prefer an exact-ish match: first try `name.toLowerCase() === "inserts"`, then `includes("insert")`, never "divider" alone.

### Bug 2 — Preview still shows tabs after deselecting Tab Dividers
When the user switches Tab Dividers to "No Tab Dividers", `tabInfo` becomes `null` but the previously created `document_sections` rows of `section_type: "tab"` are never deleted, so the preview keeps rendering them. Same applies to Inserts → "None".

**Fix:** add an effect that, when `tabInfo` transitions to `null`, deletes all `section_type === "tab"` sections for this order item; and when `insertEnabled` transitions to `false`, deletes all `section_type === "insert"` sections. Reuse the existing `handleDeleteTab` / `handleDeleteInsert` callbacks so engine/cache stays consistent. Guard with a "previously had any" check to avoid wiping on first mount before data loads.

### Files
- `src/pages/dashboard/OrderBuild.tsx` — tighten `insertEnabled` option lookup; add cleanup effect that purges tab/insert sections when their respective option is set to none.

No changes to TabInsertDrawer, preview, or catalog data needed.