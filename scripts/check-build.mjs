#!/usr/bin/env node
/**
 * Build preflight for the Turnstile site key.
 *
 * `src/lib/turnstile.ts` falls back to Cloudflare's test site key so a local
 * run works with no account and no configuration. Vite inlines that fallback
 * into the bundle, so once a build has been made with the variable unset
 * nothing at runtime can tell: the live form renders Cloudflare's "testing
 * only, contact the site owner" banner and issues tokens that no real secret
 * will verify.
 *
 * Deploys run from a push to main, so the build that matters happens on
 * Cloudflare's builder rather than here. That is why this check lives inside
 * `npm run build` instead of a deploy script - the builder runs the build
 * command and never runs `npm run deploy` - and why it is hard only on a
 * deploying build: locally it warns, because building against the test pair is
 * what `npm run worker:dev` is for.
 */
import { loadEnv } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* Cloudflare's published dummy site keys - every one of them always issues a
   token, and none of them belongs on a deployed site.
   https://developers.cloudflare.com/turnstile/troubleshooting/testing/ */
const TEST_SITE_KEYS = new Set([
  "1x00000000000000000000AA",
  "1x00000000000000000000BB",
  "2x00000000000000000000AB",
  "2x00000000000000000000BB",
  "3x00000000000000000000FF",
]);

/* WORKERS_CI is set by Cloudflare Workers Builds; CI covers anything else that
   might come to build this. Either means the output is going to be served. */
const deploying = Boolean(process.env.WORKERS_CI || process.env.CI);

const FIX =
  "The key belongs in .env.production, which is committed for exactly this\n" +
  "    reason: a deploy builds from a push, so .env.local cannot carry it.\n" +
  "    Take the site key from the Cloudflare dashboard > Turnstile > widget.";

/* The same resolution order the build itself uses, so this inspects the value
   that would actually be inlined rather than a guess at it. */
const env = loadEnv("production", root, "VITE_");
const key = (env.VITE_TURNSTILE_SITE_KEY ?? "").trim();

let problem = null;
if (!key) {
  problem =
    "VITE_TURNSTILE_SITE_KEY is not set, so this build would ship Cloudflare's test Turnstile widget.";
} else if (TEST_SITE_KEYS.has(key)) {
  problem =
    `VITE_TURNSTILE_SITE_KEY is ${key}, one of Cloudflare's test keys. ` +
    "It always issues a token and shows a testing banner on the live form.";
}

if (!problem) {
  console.log(`  ok  Turnstile site key ${key.slice(0, 6)}... (not a test key)`);
} else if (deploying) {
  console.error(`\n  x  ${problem}\n    ${FIX}\n`);
  process.exit(1);
} else {
  console.warn(
    `\n  !  ${problem}\n` +
      `    Fine for a local run. Before this reaches production:\n    ${FIX}\n`,
  );
}
