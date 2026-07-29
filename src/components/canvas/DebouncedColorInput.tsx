import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

interface Props {
  value: string;
  onChange: (hex: string) => void;
  /** Commit delay in ms. */
  delay?: number;
}

/**
 * Native colour input that keeps the swatch responsive locally and only
 * commits upstream on release (or after a short debounce), so dragging the
 * picker never re-runs the expensive preview pipeline mid-drag.
 */
export default function DebouncedColorInput({ value, onChange, delay = 250 }: Props) {
  const [local, setLocal] = useState(value);
  const timer = useRef<number | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setLocal(value);
  }, [value]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const commit = (hex: string) => {
    dirty.current = false;
    if (timer.current) window.clearTimeout(timer.current);
    onChange(hex);
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        type="color"
        value={local}
        // Live drag: update the swatch only — no upstream re-render.
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          dirty.current = true;
          setLocal(v);
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => commit(v), delay);
        }}
        // Release / dialog confirm: commit immediately.
        onChange={(e) => {
          const v = e.target.value;
          setLocal(v);
          commit(v);
        }}
        onBlur={() => commit(local)}
        className="h-8 w-14 p-1"
      />
      <span className="text-xs font-mono tabular-nums text-muted-foreground">
        {local.toUpperCase()}
      </span>
    </div>
  );
}

