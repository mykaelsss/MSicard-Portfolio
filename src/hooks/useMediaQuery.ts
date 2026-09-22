import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query.
 *
 * Used where a breakpoint has to change what is rendered rather than how it
 * looks - hiding an element with `display: none` leaves it in the accessibility
 * tree and, in the case of an open <dialog>, leaves the page inert and locked
 * behind something nobody can see.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
