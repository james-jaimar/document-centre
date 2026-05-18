import { useEffect, useState } from "react";

export type DeviceKind = "mobile" | "desktop";

/**
 * Phone-aware device detection. Unlike `useIsMobile` (pure 768px breakpoint),
 * this requires a coarse pointer or touch input AND a narrow viewport, so
 * tablets and small desktop windows don't accidentally trigger the mobile UI.
 */
function detect(): DeviceKind {
  if (typeof window === "undefined") return "desktop";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const touch = (navigator.maxTouchPoints ?? 0) > 0;
  const narrow = window.innerWidth < 900;
  return (coarse || touch) && narrow ? "mobile" : "desktop";
}

export function useDeviceKind(): DeviceKind {
  const [kind, setKind] = useState<DeviceKind>("desktop");
  useEffect(() => {
    const update = () => setKind(detect());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return kind;
}
