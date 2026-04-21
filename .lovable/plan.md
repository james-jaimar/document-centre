

## Fix: Documents Tab inputs reset on every keystroke

### Root cause

In `useTenantSettingsMap`, the `settingsMap` object is created inline on every render:
```ts
const map: Record<string, unknown> = {};
// ...rebuilt every render
return { ...query, settingsMap: map };
```

The `DocumentsTab` useEffect depends on `settingsMap`:
```ts
useEffect(() => { /* set all state from settingsMap */ }, [isLoading, settingsMap]);
```

Since `settingsMap` is a new object reference every render, the effect fires after every keystroke, immediately resetting all inputs back to the database values.

### Fix

**File: `src/hooks/useTenantSettings.ts`** -- Wrap the `settingsMap` computation in `useMemo` so it only changes when `query.data` changes:

```ts
import { useMemo } from "react";

export function useTenantSettingsMap(category: string) {
  const query = useTenantSettings(category);
  const settingsMap = useMemo(() => {
    const map: Record<string, unknown> = {};
    if (query.data) {
      for (const s of query.data) {
        map[s.setting_key] = s.setting_value;
      }
    }
    return map;
  }, [query.data]);
  return { ...query, settingsMap };
}
```

### Result
Inputs will accept and retain typed values. The useEffect only resets state when actual data from the database changes (initial load or after save), not on every render.

### Files changed

| File | Change |
|------|--------|
| `src/hooks/useTenantSettings.ts` | Memoize `settingsMap` with `useMemo` |

