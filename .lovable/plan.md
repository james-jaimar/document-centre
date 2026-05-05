
## Add Google Login to Checkout Auth

Add the existing `SocialAuthButtons` component to `CheckoutAuth.tsx` so customers can use Google to sign in or create an account during checkout.

### Changes

**`src/components/checkout/CheckoutAuth.tsx`**

1. Import `SocialAuthButtons` from `@/components/auth/SocialAuthButtons`.
2. Add the Google button above the register/login forms with an "or" divider between them:
   - Place `<SocialAuthButtons tenantSlug={slug} />` after the tab bar and before the form.
   - Add a visual separator ("or continue with email") between the social button and the form fields.
3. This works for both tabs (register and login) since Google OAuth handles both cases.

The `SocialAuthButtons` component already handles the OAuth flow, redirect callback, and tenant slug propagation -- no backend changes needed.
