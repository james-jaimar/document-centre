## Fix: Logo aspect ratio in order emails

The Postnet logo is squashed because the `<img>` tag forces both `width="180"` and `height="48"` as HTML attributes, which overrides the natural aspect ratio in most email clients.

### Change

In `supabase/functions/send-order-email/index.ts`, update the logo `<img>` tag:

- **Remove** the fixed HTML `width` and `height` attributes (and the inline `height:48px`)
- **Keep** only CSS bounds: `max-width:180px; max-height:48px; width:auto; height:auto`
- Keep `display:block; border:0; outline:none; text-decoration:none` for Outlook safety

Result: the logo scales proportionally within a 180×48 box — wide logos (like Postnet) cap at 180px wide and stay shorter than 48px tall; tall logos cap at 48px tall.

### Verify

- Redeploy `send-order-email`
- Trigger a fresh test order; confirm the logo in the inbox renders at natural proportions, not stretched to fill 180×48.

No other changes — proforma attachment, copy, and layout stay as-is.