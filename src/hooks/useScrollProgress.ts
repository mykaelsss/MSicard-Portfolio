import { useEffect, useRef } from "react";

export interface ScrollState {
  /** 0 at the top of the document, 1 at the bottom. */
  p: number;
  /** Absolute scroll offset in pixels. */
  y: number;
  /** Viewport height. */
  vh: number;
  /** Maximum scrollable distance in pixels. */
  max: number;
}

/**
 * Scroll state delivered through a ref rather than state, so the atmosphere
 * canvas and the HUD readouts can sample it every frame without triggering a
 * React render. Document height is cached and only remeasured on resize.
 */
export function useScrollProgress() {
  const state = useRef<ScrollState>({ p: 0, y: 0, vh: 0, max: 0 });

  useEffect(() => {
    const measure = () => {
      state.current.vh = window.innerHeight;
      state.current.max = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
    };

    const read = () => {
      const y = window.scrollY;
      state.current.y = y;
      state.current.p =
        state.current.max > 0 ? Math.min(1, Math.max(0, y / state.current.max)) : 0;
    };

    measure();
    read();

    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", () => {
      measure();
      read();
    });

    /* Content and font loading change document height after first paint. */
    const observer = new ResizeObserver(() => {
      measure();
      read();
    });
    observer.observe(document.documentElement);

    return () => {
      window.removeEventListener("scroll", read);
      observer.disconnect();
    };
  }, []);

  return state;
}
