
The user got a default Supabase auth email instead of a branded one. The project already has the auth email infrastructure scaffolded (`supabase/functions/auth-email-hook/index.ts` and `_shared/email-templates/recovery.tsx` exist), but the auth email hook is clearly not active — Supabase is still sending its default templates.

Let me check the current state to confirm.
