

# Plan: Fix forwardRef Console Warnings

## Problem
React warns "Function components cannot be given refs" for `DialogHeader`, `DialogFooter`, and `Badge`. These are plain function components that Radix UI's internal composition tries to attach refs to.

## Fix

### 1. `src/components/ui/dialog.tsx` — Wrap `DialogHeader` and `DialogFooter` with `React.forwardRef`

Current (lines 57-65):
```tsx
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (...)
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (...)
```

Change to:
```tsx
const DialogHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
  )
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
  )
);
DialogFooter.displayName = "DialogFooter";
```

### 2. `src/components/ui/badge.tsx` — Wrap `Badge` with `React.forwardRef`

Current:
```tsx
function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

Change to:
```tsx
const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  )
);
Badge.displayName = "Badge";
```

## Summary
Two UI component files changed. No logic or behavior changes — just adding `forwardRef` to suppress the React warnings.

