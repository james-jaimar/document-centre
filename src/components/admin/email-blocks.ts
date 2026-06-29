// Email-safe layout block snippets for the marketing template editor.
// All snippets use inline styles and <table> layouts where Outlook needs them.
// Inserted as raw HTML via Tiptap's insertContent — Tiptap preserves the
// markup so the saved body_html contains exactly this HTML.

export interface EmailBlock {
  id: string;
  label: string;
  description: string;
  html: string;
}

export const EMAIL_BLOCKS: EmailBlock[] = [
  {
    id: "hero",
    label: "Hero image",
    description: "Full-width image, edge-to-edge",
    html: `<p><img src="https://placehold.co/600x300/0a2358/ffffff?text=Hero+image" alt="Hero" style="display:block;width:100%;max-width:600px;height:auto;border-radius:8px;" /></p>`,
  },
  {
    id: "image-caption",
    label: "Image + caption",
    description: "Image with grey caption underneath",
    html: `<p><img src="https://placehold.co/600x300/e6ecf3/0a2358?text=Image" alt="" style="display:block;width:100%;max-width:600px;height:auto;border-radius:8px;" /></p>
<p style="font-size:13px;color:#6b7280;text-align:center;margin-top:-8px;"><em>Caption text — replace me</em></p>`,
  },
  {
    id: "two-column",
    label: "Two-column (image + text)",
    description: "Image on left, text on right (Outlook-safe)",
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
  <tr>
    <td width="45%" valign="top" style="padding-right:16px;">
      <img src="https://placehold.co/260x200/0a2358/ffffff?text=Image" alt="" style="display:block;width:100%;max-width:260px;height:auto;border-radius:8px;" />
    </td>
    <td valign="top" style="font-size:15px;line-height:1.6;color:#374151;">
      <strong style="display:block;font-size:16px;color:#0a2358;margin-bottom:6px;">Headline</strong>
      Replace this with the body copy that sits next to your image.
    </td>
  </tr>
</table>`,
  },
  {
    id: "button",
    label: "Call-to-action button",
    description: "Branded button (use {{activation_link}} in href)",
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr><td>
    <a href="{{activation_link}}" style="display:inline-block;background:#2b6cb0;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:15px;font-family:Inter,Arial,sans-serif;">Activate your store</a>
  </td></tr>
</table>`,
  },
  {
    id: "divider",
    label: "Divider",
    description: "Thin horizontal rule",
    html: `<hr style="border:0;border-top:1px solid #e6ecf3;margin:24px 0;" />`,
  },
  {
    id: "spacer",
    label: "Spacer",
    description: "24 px vertical gap",
    html: `<div style="height:24px;line-height:24px;font-size:1px;">&nbsp;</div>`,
  },
];
