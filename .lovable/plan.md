
## ✅ Ring binders reworked onto wire-bound flip-book model

Completed. Ring binders now use the unified `FlipBook` path with:
- Real binder artwork (`ring_binder_white_closed.png` / `ring_binder_white_open.png`) as background
- Wider centre gutter for O-ring hardware
- Conditional cover: only shows front cover state when a real `front_cover` / `pvc_cover_front` section exists
- Same spread-based navigation (`step = 2`) as wire-bound products
- `showCover` prop driven dynamically based on `pageRoles[0]`
