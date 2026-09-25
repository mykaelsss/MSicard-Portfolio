# msicard.dev

Personal portfolio for Mykael Sicard.
Vite + React on Cloudflare Workers, with the resume and all site copy served live from R2.

## The idea

The page is a climb.
Scroll position drives a procedural landscape: fog burns off, ridgelines fall away, and the sky moves from dusk to first light by the time you reach the contact section.
Over that sits a fixed HUD - coordinates, local time, elevation, a labelled section rail - and the resume's before/after numbers are presented as telemetry deltas rather than prose.

Nothing on the page names the references it is built from.
A visitor sees a confident, professional site; the vocabulary is there for anyone who recognises it.

## Running it

```bash
npm install
npm run dev
```

`npm run dev` serves `/api/content` from `content/content.json` and `/resume.pdf` from `public/resume.pdf`, so local development behaves exactly like production.

## Updating the site without a redeploy

This is the whole point of the R2 setup.
The deployed Worker reads two objects out of the `msicard-portfolio-content` bucket on every request:

| Object | Drives |
| --- | --- |
| `content.json` | Every word on the site: summary, roles, metrics, projects, skills, education, certifications, contact copy |
| `resume.pdf` | The "Read the resume" and "Download PDF" links |

To publish a new resume:

```bash
npm run publish:resume -- ~/Downloads/NewResume.pdf
```

To publish edited site content, change `content/content.json`, then:

```bash
npm run publish:content
```

Both at once:

```bash
npm run publish:all -- ~/Downloads/NewResume.pdf
```

Changes are live within about a minute.
No build, no deploy, no downtime.

`publish:content` validates the JSON before it uploads, so a typo fails in the terminal rather than on the live site.

### Safety net

If R2 is unreachable, the object is missing, or the JSON is malformed, the Worker serves the copy of `content.json` that was bundled at build time and falls through to the `public/resume.pdf` shipped with the deploy.
The site cannot be broken by a bad upload.

## Deploying

Deploys are automatic: Cloudflare Workers Builds is connected to this repository and builds and deploys on every push to `main`.
Nothing needs to be run by hand, and `npm run deploy` exists only as a manual override for when the build pipeline is not an option.

That has one consequence worth holding on to.
A deploy builds from a clean checkout on Cloudflare's builder, so it sees no `.env` file of any kind: every one of them is gitignored.
Anything the build needs has to be a build variable set in the dashboard.
Today that means exactly one thing, `VITE_TURNSTILE_SITE_KEY` - see [Configuration](#configuration).

First-time setup, which does run locally:

```bash
npx wrangler login
npm run r2:init          # create the bucket
npm run publish:all -- /path/to/resume.pdf
npx wrangler secret put TURNSTILE_SECRET   # and the other three, see Configuration
```

Then connect the repository under **Workers & Pages > msicard-portfolio > Settings > Build**, set `VITE_TURNSTILE_SITE_KEY` as a build variable there, and point `msicard.dev` at the Worker.

## Contact form

The summit section carries a form that posts to `/api/contact`, alongside the plain `mailto:` link, which stays as the fallback whenever the form cannot deliver.
It starts collapsed behind a single button and animates its height open, and Turnstile is not loaded until it is: a reader who never opens the form never fetches the third-party script.

The border is a made-up racing circuit rather than a box - a hairpin at one end, a chicane on the top straight, curbing on the corners a car would run wide at, and the start/finish line on the bottom straight.
`src/lib/circuit.ts` generates the path from the measured pixel size instead of scaling one fixed drawing, because the box changes height when the form opens and stretching a drawing would turn every corner into an oval.
It reads as road rather than as a rounded border because of the layering: one path, stroked five times - curbing underneath and widest, then a pale edge, then dark tarmac laid over the middle of that edge so a boundary line is left showing down each side, then the broken centre line and the start/finish tick.

Sending mail is the only thing on this site a stranger can make the Worker do, so `worker/contact.ts` defends it in layers, cheapest check first:

1. **Shape** - POST only, same-origin `Origin`, JSON content type, 16 KB body cap.
2. **Traps** - a honeypot field and a minimum fill time of 2.5 seconds. Both answer with a normal-looking success, because naming the trap that caught a bot is free tuning advice for whoever wrote it.
3. **Content** - field validation, so nothing malformed reaches the paid steps.
4. **Turnstile** - the real wall, verified server-side against Cloudflare. A token that does not verify never reaches the mail step.
5. **Rate cap** - 3 per minute per IP, last, because a solved challenge is the expensive thing for a bot to earn and this is what stops one being spent repeatedly.

The client mirrors the field rules so a typo is caught before a round trip, but nothing is trusted for having passed them.
The Turnstile token is single use, so the widget is reset after every failure and torn down after a success.

### Configuration

Four secrets, none of which belong in `wrangler.toml`:

```bash
npx wrangler secret put TURNSTILE_SECRET   # Cloudflare dashboard > Turnstile
npx wrangler secret put RESEND_API_KEY     # resend.com > API Keys
npx wrangler secret put CONTACT_TO         # inbox the mail lands in
npx wrangler secret put CONTACT_FROM       # e.g. Portfolio <contact@msicard.dev>
```

`CONTACT_FROM` has to be on a domain verified with Resend, or every send is rejected.

The widget's public site key is the fifth piece of configuration, and it behaves unlike the other four.
It is not a secret and it is not read at runtime: Vite inlines `VITE_TURNSTILE_SITE_KEY` into the bundle at build time, and a Turnstile site key is rendered into the page anyway, where anyone can read it.
So it is configuration rather than a credential, and it is a **build** variable rather than a secret:

**Workers & Pages > msicard-portfolio > Settings > Build > Variables**, as `VITE_TURNSTILE_SITE_KEY`.

Note that this is a different screen from the four secrets above, which live under **Settings > Variables and Secrets** and are read at runtime.
A build variable is available only while the bundle is being built; a secret is available only to the running Worker.
Putting either in the other's screen silently does nothing.

No `.env` file can carry this to a deploy.
All of them are gitignored, and a deploy builds from a clean checkout of a push, so it never sees one.
`.env.production` is for local production builds only; copy `.env.production.example` if you want `npm run build` or `npm run worker:dev` to use the real widget.
If both a file and a build variable exist, Vite overwrites the file with `process.env`, so the build variable is what ships.
`npm run build` prints which of the two it resolved, because on a deploy the value is not visible anywhere in this repository.

The secret key of the same widget is the half that must never be in a file at all.
It is a Worker secret, set the same way as the other three above.
The pair has to match - the server verifies the token against the secret belonging to the site key that issued it - so replacing the widget means changing both.
A mismatched pair fails as `bad_captcha`, which reaches the reader as "The check expired"; the Worker logs the real reason, `invalid-input-secret`, to Workers Logs.

Without the variable the build falls back to Cloudflare's test site key, which always issues a token.
That keeps a local run working with no account, and it cannot open a relay: the Worker fails closed, so if `TURNSTILE_SECRET` or `RESEND_API_KEY` is missing it answers `503 not_configured` rather than waving traffic through.

It must never reach production, though.
Cloudflare renders a "testing only, contact the site owner" banner on a test widget, and its tokens do not verify against a real secret, so a live form built without the key is both visibly wrong and unable to deliver.
Because the key is inlined, nothing at runtime can notice the substitution and no amount of defensive code in the Worker can catch it - the only place it can still be caught is the build.
`npm run build` therefore runs `scripts/check-build.mjs` first.
On a deploying build - anything with `WORKERS_CI` or `CI` set, which covers Cloudflare Workers Builds - a missing key or one of Cloudflare's five published test keys fails the build.
Locally it only warns, because running the real Worker against the test pair is exactly what `npm run worker:dev` is for.

Locally, `npm run dev` stubs the endpoint entirely and prints submissions to the terminal, so a local run can never put mail in a real inbox.
To exercise the real Worker instead, copy `.dev.vars.example` to `.dev.vars` and run `npm run worker:dev`.

## Motion

The page animates a good deal, and page motion makes some people physically ill.
Two things address that.

The first is a visible "Reduce motion" control in the bottom bar, so the choice does not depend on the reader knowing about the operating system setting.
It is a toggle button carrying `aria-pressed`, and the choice is stored under `msicard:motion` in `localStorage`.

The second is that the operating system's `prefers-reduced-motion` setting is honoured as the default, and continues to be followed until the reader overrides it with the control.

A script in the `<head>` of `index.html` resolves the preference and writes `data-motion` on `<html>` before first paint, so nobody who asked for stillness ever sees a frame of movement.
`prefersReducedMotion()` in `src/lib/motion.ts` reads that attribute, which is what lets the in-page control override the system setting in both directions.
Components that set up animation read the preference through the `useMotionPref` hook and list it in their effect dependencies, so a change tears their animations down and rebuilds them immediately rather than on the next load.

Reduced motion turns off the Lenis smooth scroll entirely, since a page that keeps travelling after the wheel stops is itself a trigger.
It also drops the canvas parallax and idle drift, the counters, and every reveal transform.

## Layout

```
content/content.json     the single source of truth for site copy
worker/index.ts          serves /api/content and /resume.pdf from R2
worker/contact.ts        /api/contact - validation, Turnstile, rate cap, send
scripts/publish.mjs      validates and uploads to R2
src/lib/content.ts       typed schema + client loader with bundled fallback
src/lib/motion.ts        Lenis smooth scroll wired into the GSAP ticker
src/lib/reveal.ts        data-reveal scroll animations, SplitText line masks
src/lib/turnstile.ts     lazy loader for the Turnstile widget
src/lib/circuit.ts       the race-track border, generated to fit its box
src/components/          Atmosphere (the canvas) plus one file per section
src/styles/tokens.css    The Register: the ink, stone and gilt palette, type scale and rhythm
```

## Notes

Motion respects `prefers-reduced-motion`: smooth scroll, the preloader sequence and every reveal are skipped, and the landscape stops responding to the pointer.

The atmosphere is a 2D canvas, not WebGL.
Ridgelines are generated with 1D midpoint displacement and cached at resize, so each frame only redraws paths.
