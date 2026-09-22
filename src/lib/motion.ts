import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

/* ---------- motion preference ---------- */

export type MotionPref = "full" | "reduced";

/** Kept in sync with the bootstrap script in index.html. */
export const MOTION_STORAGE_KEY = "msicard:motion";

const listeners = new Set<(pref: MotionPref) => void>();

const systemQuery = (): MediaQueryList =>
  window.matchMedia("(prefers-reduced-motion: reduce)");

function storedPref(): MotionPref | null {
  try {
    const value = localStorage.getItem(MOTION_STORAGE_KEY);
    return value === "full" || value === "reduced" ? value : null;
  } catch {
    /* Storage can be unavailable in private mode; the OS setting still works. */
    return null;
  }
}

/** An explicit choice wins; otherwise the operating system decides. */
export function resolveMotionPref(): MotionPref {
  return storedPref() ?? (systemQuery().matches ? "reduced" : "full");
}

export function getMotionPref(): MotionPref {
  const applied = document.documentElement.dataset.motion;
  return applied === "reduced" || applied === "full" ? applied : resolveMotionPref();
}

/**
 * The single source of truth for every motion guard in the app. Reading the
 * applied attribute rather than the media query directly is what lets the
 * in-page control override the operating system in both directions.
 */
export const prefersReducedMotion = (): boolean =>
  typeof document !== "undefined" && getMotionPref() === "reduced";

export function setMotionPref(pref: MotionPref): void {
  try {
    localStorage.setItem(MOTION_STORAGE_KEY, pref);
  } catch {
    /* A session-only preference is still better than none. */
  }
  document.documentElement.dataset.motion = pref;

  if (pref === "reduced") destroySmoothScroll();
  else initSmoothScroll();

  for (const listener of listeners) listener(pref);
}

export function onMotionPrefChange(fn: (pref: MotionPref) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Follow the OS setting for as long as the reader has not overridden it. */
export function watchSystemMotionPref(): () => void {
  const query = systemQuery();
  const onChange = () => {
    if (storedPref()) return;
    const pref: MotionPref = query.matches ? "reduced" : "full";
    document.documentElement.dataset.motion = pref;
    if (pref === "reduced") destroySmoothScroll();
    else initSmoothScroll();
    for (const listener of listeners) listener(pref);
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/* ---------- smooth scroll ---------- */

let lenis: Lenis | null = null;
let tick: ((time: number) => void) | null = null;

/**
 * One Lenis instance drives the page. GSAP's ticker drives Lenis so scroll,
 * ScrollTrigger and every tween advance on the same frame, which is what keeps
 * pinned sections from drifting against the smooth-scrolled content.
 *
 * Smooth scroll is itself a motion-sickness trigger: the page keeps travelling
 * after the wheel stops, which is exactly the uncommanded movement that sets
 * off vestibular symptoms. It is off entirely in reduced mode.
 */

/*
 * How long the page keeps travelling after the wheel stops, in seconds, and
 * how long a jump between sections takes. Both are a trade: enough smoothing
 * to tie the scroll to the pinned sections, little enough that the page still
 * answers the wheel immediately.
 */
const SCROLL_GLIDE = 0.55;
const SECTION_JUMP = 0.8;

export function initSmoothScroll(): Lenis | null {
  if (prefersReducedMotion()) {
    destroySmoothScroll();
    return null;
  }
  if (lenis) return lenis;

  lenis = new Lenis({
    duration: SCROLL_GLIDE,
    /*
     * Expo-out, softened from 2^-10 to 2^-7. The steeper curve covers almost
     * all of the distance immediately and then creeps the last few pixels,
     * and that tail is what reads as lag even at a short duration.
     */
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -7 * t)),
    smoothWheel: true,
    touchMultiplier: 1.6,
  });

  lenis.on("scroll", ScrollTrigger.update);

  tick = (time: number) => lenis?.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  return lenis;
}

export function destroySmoothScroll(): void {
  if (tick) {
    gsap.ticker.remove(tick);
    tick = null;
  }
  lenis?.destroy();
  lenis = null;
  ScrollTrigger.refresh();
}

export function getLenis(): Lenis | null {
  return lenis;
}

/*
 * Where the reader was when the page was locked.
 *
 * `html.is-locked` clips the page rather than collapsing it, so the offset
 * survives the lock on its own and this is only the correction: an engine that
 * clamps a clipped root to the top anyway would otherwise drop the reader at
 * the hero when a dialog opened halfway down the page closes.
 */
let lockedAt = 0;

export function lockScroll(locked: boolean): void {
  if (locked) {
    lockedAt = window.scrollY;
    document.documentElement.classList.add("is-locked");
    /* Lenis writes its own offset to the window every frame, and a clipped
       root refuses the wheel but not a programmatic scroll, so it has to be
       stopped rather than merely fenced in. */
    lenis?.stop();
    return;
  }

  document.documentElement.classList.remove("is-locked");
  lenis?.start();

  if (lockedAt > 0 && window.scrollY !== lockedAt) {
    if (lenis) {
      /* Lenis clamps a scroll to the limit it measured last. If the page did
         lose its offset it lost its height with it, so the limit has to be
         re-taken before the correction, or the correction is clamped too. */
      lenis.resize();
      lenis.scrollTo(lockedAt, { immediate: true, force: true });
    } else {
      window.scrollTo(0, lockedAt);
    }
  }
  lockedAt = 0;
}

export function scrollToSection(id: string): void {
  const target = document.getElementById(id);
  if (!target) return;
  if (lenis) {
    lenis.scrollTo(target, { offset: 0, duration: SECTION_JUMP });
  } else {
    /* `auto` rather than `smooth`: a reader in reduced mode has asked not to
       be moved through the page. */
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }
}
