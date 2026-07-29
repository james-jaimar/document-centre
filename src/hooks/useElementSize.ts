import { useEffect, useRef, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Measures a DOM element's size via ResizeObserver.
 * Returns a ref to attach to the element, plus the measured { width, height }.
 *
 * The hook waits for `enabled` to be true before attempting measurement,
 * which avoids the race condition where a dialog portal hasn't mounted yet.
 */
export function useElementSize<T extends HTMLElement = HTMLDivElement>(
  enabled: boolean = true,
): [React.RefObject<T>, ElementSize] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    if (!enabled) return;

    let rafId: number | null = null;
    let ro: ResizeObserver | null = null;
    let pending: ElementSize | null = null;

    const flush = () => {
      rafId = null;
      if (pending) {
        setSize((prev) =>
          prev.width === pending!.width && prev.height === pending!.height ? prev : pending!,
        );
        pending = null;
      }
    };
    const schedule = (next: ElementSize) => {
      pending = next;
      if (rafId == null) rafId = requestAnimationFrame(flush);
    };

    const measure = () => {
      const el = ref.current;
      if (!el) {
        rafId = requestAnimationFrame(measure);
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        schedule({ width: Math.round(rect.width), height: Math.round(rect.height) });
      }
      ro = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          schedule({ width: Math.round(width), height: Math.round(height) });
        }
      });
      ro.observe(el);
    };

    measure();

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      ro?.disconnect();
    };

  }, [enabled]);

  return [ref as React.RefObject<T>, size];
}
