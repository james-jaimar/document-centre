import { useEffect } from "react";

/**
 * Prefixes the browser tab title with `(N) ` whenever there are unread items,
 * and restores the original title on unmount or when the count drops to 0.
 */
export function useDocumentTitleUnread(count: number) {
  useEffect(() => {
    const original = document.title;
    const stripped = original.replace(/^\(\d+\)\s+/, "");
    if (count > 0) {
      document.title = `(${count > 99 ? "99+" : count}) ${stripped}`;
    } else {
      document.title = stripped;
    }
    return () => {
      document.title = stripped;
    };
  }, [count]);
}
