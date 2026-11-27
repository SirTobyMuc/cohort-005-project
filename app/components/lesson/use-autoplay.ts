import { useCallback, useEffect, useState } from "react";

const AUTOPLAY_KEY = "cadence-autoplay";

export function useAutoplay() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(AUTOPLAY_KEY) === "true");
    } catch {
      // Storage can be blocked (private browsing, strict cookie settings);
      // autoplay then stays off rather than breaking the lesson page.
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AUTOPLAY_KEY, String(next));
      } catch {
        // Blocked storage: the toggle still works, it just isn't remembered.
      }
      return next;
    });
  }, []);

  return [enabled, toggle] as const;
}
