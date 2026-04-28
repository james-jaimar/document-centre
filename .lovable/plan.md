## Fix invisible hero heading on /contact

The hero `<h1>` "Let's talk about your print business" is rendering in dark navy on a navy gradient because the heading inherits the marketing default text color (navy) and never gets an explicit white override — unlike the surrounding `<div>` and `<p>` which use `text-white` / `text-white/80`.

### Change

In `src/pages/Contact.tsx`, line 121, add `text-white` to the `<h1>` className so it matches the hero's white-on-navy treatment:

```tsx
<h1 className="font-extrabold tracking-tight text-white" ...>
  Let's talk about your print business
</h1>
```

That's the entire fix — single-line className change. No other pages affected.

---

By the way, for tiny visual tweaks like this you can use **Visual Edits** (the Edit button in the chat box) to recolor text directly without spending credits.