## Change

Add a single-page "Add Selected File As" configuration for pull-up banners (mirroring how `posters` works — one option only).

### Edit `src/components/order/SectionActions.tsx`

1. Add a new action set:
   ```ts
   const PULL_UP_BANNER_ACTIONS: ActionDef[] = [
     { type: "front_cover", label: "Add as Banner", icon: Image },
   ];
   ```
2. In `getActions()`, route the pull-up-banner slugs to it:
   ```ts
   if (
     familySlug === "pull-up-banners" ||
     familySlug === "pullup-banners" ||
     familySlug === "pull-up-banner" ||
     familySlug === "pull_up_banners"
   ) return PULL_UP_BANNER_ACTIONS;
   ```

That's the entire fix — the screenshot's "Front Cover / Body Pages / Back Cover" trio comes from the default `BOUND_ACTIONS` fallback because no branch exists for the pull-up-banner slug yet.

No other files need changes.
