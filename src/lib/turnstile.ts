/**
 * Cloudflare Turnstile, loaded on demand.
 *
 * The script is third-party and weighs on every page load, so it is not in
 * index.html: nothing fetches it until the contact form is actually mounted
 * and on screen. Explicit render mode is used rather than the automatic
 * `cf-turnstile` class scan, because React owns when that element exists and
 * an auto-scan that runs before the mount finds nothing.
 */

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export interface TurnstileOptions {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  action?: string;
  callback: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
}

export interface TurnstileApi {
  render: (el: HTMLElement, options: TurnstileOptions) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/*
 * Cloudflare's test key. Always issues a token and always passes, so `npm run
 * dev` works with no account and no configuration. Production overrides it
 * with VITE_TURNSTILE_SITE_KEY at build time - and because the Worker fails
 * closed without its own secret, shipping with this key still cannot leave a
 * deployed form unguarded.
 */
const TEST_SITE_KEY = "1x00000000000000000000AA";

export const TURNSTILE_SITE_KEY: string =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || TEST_SITE_KEY;

/** One load for the page, however many callers ask. */
let pending: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (pending) return pending;

  pending = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SRC}"]`,
    );
    const script = existing ?? document.createElement("script");

    const settle = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile loaded without an api"));
    };

    script.addEventListener("load", settle, { once: true });
    script.addEventListener(
      "error",
      () => {
        /* Let a later attempt retry rather than caching the failure forever:
           the usual cause is a blocker or a dropped connection, and both can
           be gone by the time the reader tries again. */
        pending = null;
        reject(new Error("turnstile failed to load"));
      },
      { once: true },
    );

    if (!existing) {
      script.src = SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return pending;
}
