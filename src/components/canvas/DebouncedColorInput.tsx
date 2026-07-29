import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

interface Props {
  value: string;
  onChange: (hex: string) => void;
  /** Commit delay in ms. */
  delay?: number;
}

/**
 * Native colour input that commits only on release or after a debounce —
 * avoids the storm of change events during drag that was choking the preview.
 */
export default function DebouncedColorInput({ value, onChange, delay = 150 }: Props) {
  const [local, setLocal] = useState(value);
  const timer = useRef<number | null>(null);

  useEffect(() => setLocal(value), [value]);

  const commit = (hex: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onChange(hex), delay);
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        type="color"
        value={local}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setLocal(v);
          commit(v);
        }}
        onChange={(e) => {
          const v = e.target.value;
          setLocal(v);
          if (timer.current) window.clearTimeout(timer.current);
          onChange(v);
        }}
        className="h-8 w-14 p-1"
      />
      <span className="text-xs font-mono tabular-nums text-muted-foreground">
        {local.toUpperCase()}
      </span>
    </div>
  );
}
