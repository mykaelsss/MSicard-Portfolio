# Agent instructions

## What this project is

`msicard.dev` is Mykael Sicard's personal portfolio: a single-page site whose job is to get a full-stack developer read seriously by a recruiter or a hiring engineer.
It is one HTML document with no router and no CMS, deployed as a Cloudflare Worker that serves a Vite-built React bundle.

The page is built as a climb.
Scroll position drives a procedural landscape on a 2D canvas: fog burns off, ridgelines fall away, and the sky moves from dusk to first light by the time the reader reaches the contact section at the bottom.
Over that sits a fixed HUD carrying coordinates, local time, an elevation readout and a labelled section rail.
Nothing on the page names the references it is built from; a visitor sees a confident professional site, and the vocabulary is there for whoever recognises it.

The sections run in a fixed order: Origin (hero), Approach, Field work (experience), Builds (projects), The kit (skills), Record (education and certifications), and Summit (the contact close).
`src/App.tsx` owns that list and hands it to the HUD rail.

Every word on the site comes from `content/content.json`, and none of it is hardcoded in components.
That file is both the build-time seed and the shape of the live document: the deployed Worker reads `content.json` and `resume.pdf` out of an R2 bucket on each request, so the resume and all copy can be replaced with `npm run publish:content` or `npm run publish:resume` without a build or a deploy.
If R2 is unreachable, the object is missing, or the uploaded JSON is malformed, the Worker falls back to the copy bundled at build time.
A bad upload cannot take the site down, which is why `src/lib/content.ts` normalizes what it reads instead of trusting it: the running code has to tolerate a document written against an older shape.

The site accepts exactly one piece of input from the public, the contact form in the Summit section, and `worker/contact.ts` is defended in layers because of it.
In order of cost: request shape, then a honeypot field and a minimum fill duration, then field validation, then a real Cloudflare Turnstile challenge verified server-side, then a per-IP rate cap.
Missing configuration switches the form off with a 503 rather than letting anything through, so the endpoint can never become an open relay.

Motion is a first-class concern rather than decoration.
A script in the `<head>` of `index.html` resolves the preference before first paint and writes `data-motion` on `<html>`, so a reader who asked for stillness never sees a frame of movement.
A choice stored under `msicard:motion` wins over the OS setting, which is what lets the in-page control override `prefers-reduced-motion` in both directions; that key is mirrored in `src/lib/motion.ts`.
Every component that animates reads the preference through `useMotionPref` and lists it in its effect dependencies, so a change tears the animations down and rebuilds them immediately.
Reduced motion turns off the Lenis smooth scroll, the canvas parallax and idle drift, the counters, the preloader sequence and every reveal transform.

The site has no test suite.
`npm run build` (which runs `tsc -b` first) and `npm run lint` are the gates, and visual changes are checked in a browser against `npm run dev`.

## Stack and layout

| Piece | Choice |
| --- | --- |
| Build | Vite 8, `@vitejs/plugin-react` |
| UI | React 19 with TypeScript, CSS Modules per component |
| Motion | GSAP with ScrollTrigger and SplitText, Lenis for smooth scroll |
| Host | Cloudflare Workers, static assets served from the `ASSETS` binding |
| Storage | Cloudflare R2 (`msicard-portfolio-content`) for live content and the resume |
| Anti-abuse | Cloudflare Turnstile plus a Workers `[[ratelimits]]` binding |
| Mail | Resend REST API |
| Lint | oxlint |

There is no CSS framework, no component library, no state manager and no data-fetching library.
Prefer solving a problem with what is already here over adding a dependency.

```
AGENTS.md                these instructions; CLAUDE.md is a symlink to it
README.md                the human-facing readme: running, publishing, deploying
index.html               the single document, including the pre-paint motion script
vite.config.ts           build config plus dev stubs for /api/content, /api/contact, /resume.pdf
wrangler.toml            Worker name, assets binding, R2 bucket, contact rate limit
.dev.vars.example        the secrets the contact endpoint expects locally
.env.production.example  the build variables a production build expects
.oxlintrc.json           lint rules
tsconfig*.json           split projects for app, node tooling and the Worker

content/
  content.json           the single source of truth for every word on the site

worker/
  index.ts               the router: /api/content, /api/contact, /resume.pdf, then assets
  contact.ts             the contact endpoint, defended in five layers

scripts/
  publish.mjs            validates and uploads content.json and resume.pdf to R2

public/
  resume.pdf             the build-time fallback resume
  favicon.svg

src/
  main.tsx               mount
  App.tsx                content load, motion setup, the section order
  components/            one .tsx plus one .module.css per section, plus Section, Hud,
                         Atmosphere (the canvas), Preloader, ContactForm
  hooks/                 useMotionPref, useScrollProgress, useMediaQuery
  lib/
    content.ts           typed schema, client loader, bundled fallback, normalizers
    motion.ts            Lenis wired into the GSAP ticker, reduced-motion handling
    reveal.ts            data-reveal scroll animations and SplitText line masks
    turnstile.ts         lazy loader for the Turnstile widget
    circuit.ts           the race-track border around the contact form, fitted to its box
  styles/
    tokens.css           The Register: the ink, stone and gilt palette, type scale and rhythm
    global.css           resets, base elements, utility classes
```

Section components are thin: they read their slice of `SiteContent`, render it, and leave layout to their own CSS module.
Anything shared between two of them belongs in `src/lib` or `src/styles`, not in a third component.
