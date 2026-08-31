# Watermark cap, cleaner weight line, finishing-option polish

## 1. Watermark opacity capped at 5% or 10%

Today the image placeholder shows a free slider from 5% to 100%, so a customer can print a "watermark" at full strength.

Change: for a placeholder flagged as the watermark box, replace the slider with two buttons — **5%** and **10%** — defaulting to 10%. No other value is selectable, and the stored spec value is clamped to 0.10 max on load, so anything saved earlier at a higher value comes back as 10%.

Non-watermark image boxes and text boxes keep the existing slider unchanged.

## 2. Delivery weight line

Drop the provenance suffix from the customer's checkout summary. It reads simply:

```text
Billable weight: 4.00kg • courier
```

The `weightSource` value stays on the quote object (it is still useful in admin/debugging), just not rendered to the customer.

## 3. Finishing option selector

**a. The indent.** The cause is not yet confirmed — the trigger's own styling has no left padding beyond the standard 12px, so it needs to be checked live before it is changed. First step is to open the A2 deskpad editor in a browser, inspect the computed box of the trigger's value span, and fix whatever is actually adding the offset (most likely candidate is the selected item's content being cloned into the trigger, but that will be verified, not assumed).

**b. Make it stand out.** The finishing option becomes the visually primary control in the order summary: a titled block with a tinted surface and a primary-coloured border around the select, the label promoted from tiny grey text to a proper heading, and, when more than one option is available (the trade case), a short hint under it — "2 options available". Colours come from existing design tokens, so it themes correctly.

## Technical notes

- `src/components/artwork/PlaceholderPanel.tsx`: watermark branch renders a 5% / 10% toggle group instead of the `Slider`; clamp on read (`Math.min(v.opacity ?? 0.1, 0.1)`).
- `src/pages/dashboard/TemplatedArtworkBuilder.tsx`: clamp watermark opacity when hydrating saved values and when writing the spec, so the cap holds server-side too; also the styling for the finishing-option block.
- `src/pages/dashboard/Checkout.tsx` (~line 897): remove the `weightSource` ternary from the `extras` node.
- `src/pages/dashboard/UploadedArtworkBuilder.tsx` gets the same finishing-option treatment so both builders match.
- Presentation only — pricing, weight resolution and PDF assembly are untouched.
