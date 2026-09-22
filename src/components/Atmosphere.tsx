import { useEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "../lib/motion";
import { useMotionPref } from "../hooks/useMotionPref";
import type { ScrollState } from "../hooks/useScrollProgress";
import styles from "./Atmosphere.module.css";

/* ---------- deterministic terrain ---------- */

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smoothstep = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 1D midpoint displacement, used here only as a low-amplitude roughening pass
 * over the flanks. Terrain built from this alone reads as static rather than
 * as mountains: the shape has to come from the summits.
 */
function ridgeline(seed: number, iterations: number, roughness: number): number[] {
  const rng = mulberry32(seed);
  let points = [rng(), rng()];
  let displacement = 1;

  for (let i = 0; i < iterations; i++) {
    const next: number[] = [];
    for (let j = 0; j < points.length - 1; j++) {
      next.push(points[j]);
      next.push((points[j] + points[j + 1]) / 2 + (rng() * 2 - 1) * displacement);
    }
    next.push(points[points.length - 1]);
    points = next;
    displacement *= roughness;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  return points.map((p) => (p - min) / span);
}

/** Low rolling ground, so the floor between summits is never a dead flat line. */
const rolling = (x: number, phase: number) =>
  clamp01(0.5 + 0.33 * Math.sin(x * 4.3 + phase) + 0.17 * Math.sin(x * 9.1 + phase * 1.7));

/** One summit: an apex with a flank falling away to either side. */
interface Summit {
  x: number;
  /** Apex height, 1 being the tallest peak the range is allowed. */
  h: number;
  /** Half-widths, in the same units as x. Asymmetric, as real ridges are. */
  wl: number;
  wr: number;
}

interface LayerSpec {
  /** Vertical position of the range's floor, as a fraction of canvas height. */
  crest: number;
  /** Height of the tallest summit above that floor, as a fraction of height. */
  amp: number;
  /** Sharp apexes and straight flanks, or rounded shoulders. */
  form: "peaks" | "hills";
  /** How many summits carry the range. Few and large, not many and small. */
  count: number;
  /** Flank run per unit of apex height. Low is steep, high is broad. */
  spread: number;
  /** Floor on apex height, so no summit in the range is merely a bump. */
  low: number;
  /** Where the range's dominant summit sits, or null for no dominant one. */
  hero: number | null;
  /** Subsidiary summits hung off the flanks of the main ones. What turns a
      clean triangle into a ridge with shoulders and false tops. */
  spurs: number;
  /** Amplitude of the roughening pass over the flanks. */
  rough: number;
  /** Amplitude of the rolling floor. */
  ground: number;
  /** Atmospheric haze. Distant ranges wash toward the sky and lose contrast. */
  fog: number;
  /** Downward drift as the climb progresses. Nearer ranges fall away faster. */
  parallax: number;
  /** How far down its own relief this range holds snow, relative to the
      climb's snow load. Rounded ranges take very little: a white dome reads
      as frosting rather than as a snowfield. */
  snowCap: number;
  /** Conifers along the ridge: how many, and how tall as a fraction of height. */
  trees: number;
  treeSize: number;
  seed: number;
}

interface Layer extends LayerSpec {
  xs: Float32Array;
  hs: Float32Array;
  /** The roughening field, kept so the snowline can wander with the rock. */
  jag: Float32Array;
  /** Conifers, each pinned to the ridge height under it. */
  firs: { x: number; h: number; size: number }[];
}

/**
 * The silhouette at one horizontal position: the tallest thing there, whether
 * that is a summit flank or the rolling floor.
 */
function heightAt(spec: LayerSpec, peaks: Summit[], x: number): number {
  let h = spec.ground * rolling(x, spec.seed % 6.283);
  for (let i = 0; i < peaks.length; i++) {
    const pk = peaks[i];
    const d = x - pk.x;
    const w = d < 0 ? pk.wl : pk.wr;
    const a = Math.abs(d);
    if (a >= w) continue;
    const t = 1 - a / w;
    /* Linear to the apex gives a sharp summit and a straight flank; the
       smoothstep gives the rounded shoulder of an older, lower range. */
    const v = pk.h * (spec.form === "hills" ? smoothstep(t) : t);
    if (v > h) h = v;
  }
  return h;
}

/**
 * A range, built from a handful of placed summits rather than from noise, so
 * it reads as mountains: long clean flanks meeting at a few real apexes, with
 * one of them dominating. The vertex list carries every apex and every foot
 * explicitly, which is what keeps the tips sharp and the flanks straight at a
 * sample count low enough to redraw six ranges every frame.
 */
function buildLayer(spec: LayerSpec): Layer {
  const rng = mulberry32(spec.seed);

  const peaks: Summit[] = [];
  for (let i = 0; i < spec.count; i++) {
    /* One summit per slot, jittered inside it: neither a grid nor a clump. */
    const slot = (i + 0.5) / spec.count;
    const h = spec.low + (1 - spec.low) * Math.pow(rng(), 0.75) * 0.92;
    peaks.push({
      x: slot + (rng() * 2 - 1) * (0.5 / spec.count),
      h,
      wl: h * spec.spread * (0.72 + rng() * 0.62),
      wr: h * spec.spread * (0.72 + rng() * 0.62),
    });
  }

  if (spec.hero !== null) {
    let best = 0;
    for (let i = 1; i < peaks.length; i++) {
      if (Math.abs(peaks[i].x - spec.hero) < Math.abs(peaks[best].x - spec.hero)) best = i;
    }
    const pk = peaks[best];
    const grow = pk.h > 0 ? 1 / pk.h : 1;
    pk.h = 1;
    pk.wl *= grow * 0.9;
    pk.wr *= grow * 1.1;
  }

  /* Spurs hang off the flanks of summits already placed: a lower top a
     little way down the ridge, which is where a range gets its broken
     skyline. They only show where they out-top the flank they sit on. */
  const main = peaks.length;
  for (let i = 0; i < spec.spurs; i++) {
    const host = peaks[Math.floor(rng() * main) % main];
    const side = rng() < 0.5 ? -1 : 1;
    const arm = side < 0 ? host.wl : host.wr;
    const h = host.h * (0.4 + rng() * 0.42);
    /* Wide enough at their own height never to read as a splinter: a spur is
       a shoulder of the same rock, not a spike stuck into it. */
    peaks.push({
      x: host.x + side * arm * (0.22 + rng() * 0.8),
      h,
      wl: h * spec.spread * (0.36 + rng() * 0.42),
      wr: h * spec.spread * (0.36 + rng() * 0.42),
    });
  }

  const xs: number[] = [];
  const STEPS = 320;
  for (let i = 0; i <= STEPS; i++) xs.push(-0.08 + (i / STEPS) * 1.16);
  for (const pk of peaks) xs.push(pk.x, pk.x - pk.wl, pk.x + pk.wr);
  xs.sort((a, b) => a - b);

  const noise = ridgeline(spec.seed ^ 0x9e37, 8, 0.62);
  const last = noise.length - 1;
  const hs = new Float32Array(xs.length);
  const jag = new Float32Array(xs.length);
  for (let i = 0; i < xs.length; i++) {
    const u = clamp01((xs[i] + 0.08) / 1.16);
    /* Three passes over the same field at different strides: the coarse one
       breaks a flank into bands of rock, the finer ones chew at their edges. */
    const coarse = noise[Math.round(u * last)] - 0.5;
    const mid = noise[Math.round(u * last * 3) % (last + 1)] - 0.5;
    const fine = noise[Math.round(u * last * 9) % (last + 1)] - 0.5;
    const h = heightAt(spec, peaks, xs[i]);
    /* Weighted by the square root of the height, so the displacement is felt
       all the way down a flank and still dies out at its foot. Multiplying by
       the height itself, as a scale on the apex would, leaves the long lower
       slopes glassy - which is exactly what stops a range reading as rock. */
    jag[i] = coarse * 0.62 + mid * 0.5 + fine * 0.3;
    hs[i] = clamp01(h + jag[i] * spec.rough * Math.sqrt(clamp01(h)));
  }

  /* Conifers come in stands with open ground between them. Scattered evenly
     they read as a pattern; clumped they read as a treeline. */
  const firRng = mulberry32(spec.seed + 7717);
  const firs: Layer["firs"] = [];
  if (spec.trees > 0) {
    const stands = Math.max(3, Math.round(spec.trees / 6));
    const perStand = Math.ceil(spec.trees / stands);
    for (let c = 0; c < stands; c++) {
      const cx = -0.05 + firRng() * 1.1;
      const spread = 0.02 + firRng() * 0.07;
      for (let k = 0; k < perStand; k++) {
        const x = cx + (firRng() * 2 - 1) * spread;
        firs.push({
          x,
          h: heightAt(spec, peaks, x),
          size: spec.treeSize * (0.5 + Math.pow(firRng(), 0.8) * 0.85),
        });
      }
    }
  }

  return { ...spec, xs: new Float32Array(xs), hs, jag, firs };
}

/*
 * Six ranges, far to near. The dominant summit belongs to the third: it stands
 * in front of the hazed distance and beside where the sun comes up, so the
 * sunrise breaks against the one peak the eye has been reading as the subject.
 */
const LAYER_SPEC: LayerSpec[] = [
  { crest: 0.74, amp: 0.17, form: "peaks", count: 4, spread: 0.26, low: 0.58, hero: 0.28, spurs: 11, rough: 0.2, ground: 0.12, fog: 0.86, parallax: 0.04, snowCap: 1.0, trees: 0, treeSize: 0, seed: 1721 },
  { crest: 0.80, amp: 0.14, form: "hills", count: 5, spread: 0.24, low: 0.46, hero: null, spurs: 6, rough: 0.12, ground: 0.18, fog: 0.70, parallax: 0.08, snowCap: 0.42, trees: 0, treeSize: 0, seed: 9043 },
  { crest: 0.88, amp: 0.38, form: "peaks", count: 5, spread: 0.21, low: 0.34, hero: 0.66, spurs: 16, rough: 0.22, ground: 0.09, fog: 0.52, parallax: 0.15, snowCap: 0.78, trees: 0, treeSize: 0, seed: 3312 },
  { crest: 0.94, amp: 0.19, form: "peaks", count: 6, spread: 0.17, low: 0.40, hero: null, spurs: 15, rough: 0.3, ground: 0.15, fog: 0.36, parallax: 0.25, snowCap: 0.9, trees: 22, treeSize: 0.013, seed: 5587 },
  { crest: 1.02, amp: 0.23, form: "peaks", count: 6, spread: 0.19, low: 0.36, hero: 0.42, spurs: 17, rough: 0.28, ground: 0.15, fog: 0.20, parallax: 0.40, snowCap: 0.66, trees: 34, treeSize: 0.024, seed: 2264 },
  { crest: 1.16, amp: 0.24, form: "hills", count: 5, spread: 0.30, low: 0.44, hero: null, spurs: 9, rough: 0.16, ground: 0.2, fog: 0.05, parallax: 0.60, snowCap: 0.2, trees: 42, treeSize: 0.052, seed: 8891 },
];

const FLAKE_COUNT = 520;
const STAR_COUNT = 190;

type RGB = [number, number, number];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
const rgb = (c: RGB, alpha = 1) =>
  `rgba(${c[0].toFixed(0)}, ${c[1].toFixed(0)}, ${c[2].toFixed(0)}, ${alpha})`;

/*
 * Dusk at the trailhead, first light at the summit. The night is a cold
 * blue-slate rather than black, and the sunrise arrives as brass rather than
 * fire, so the sky and the gilt on the page are the same light.
 */
const SKY_DUSK: { stop: number; color: RGB }[] = [
  { stop: 0, color: [7, 11, 22] },
  { stop: 0.45, color: [15, 21, 38] },
  { stop: 0.78, color: [29, 38, 62] },
  { stop: 1, color: [46, 57, 84] },
];
const SKY_DAWN: { stop: number; color: RGB }[] = [
  { stop: 0, color: [13, 18, 34] },
  { stop: 0.45, color: [44, 42, 62] },
  { stop: 0.78, color: [116, 90, 60] },
  { stop: 1, color: [178, 140, 78] },
];
/* What the sky flattens to once the weather has closed in: no gradient worth
   the name, only cold graphite getting slightly paler toward the ground. */
const SKY_STORM: { stop: number; color: RGB }[] = [
  { stop: 0, color: [20, 25, 36] },
  { stop: 0.45, color: [32, 39, 52] },
  { stop: 0.78, color: [52, 61, 76] },
  { stop: 1, color: [74, 84, 100] },
];

const INK: RGB = [7, 10, 18];
const GILT: RGB = [200, 164, 78];
/* Bone rather than white, so the moon belongs to the same register as the
   gilt and never reads as a hole punched in the sky. */
const MOON: RGB = [228, 232, 240];
/* Snow, likewise: a cold bone that takes the gilt at dawn as alpenglow. */
const SNOW: RGB = [216, 225, 238];

/*
 * Aerial perspective. Distance is carried by washing the rock toward these
 * rather than toward the sky itself: a slate-violet at night, a dusty mauve
 * once the light is up, cold graphite while the weather is in. Without the
 * separation this buys, six ranges read as one dark mass.
 */
const HAZE_NIGHT: RGB = [48, 60, 92];
const HAZE_DAWN: RGB = [124, 108, 112];
const HAZE_STORM: RGB = [98, 108, 126];

const MAX_SCRIM = 0.93;

/**
 * The cloud deck's upper edge, as a periodic function of horizontal position
 * so the deck can drift forever without a seam. Three irregular harmonics:
 * lumpy enough to read as weather, smooth enough never to read as terrain.
 */
const cloudAt = (u: number) => {
  const a = Math.PI * 2 * u;
  return clamp01(
    0.5 + 0.27 * Math.sin(a * 2 + 0.7) + 0.15 * Math.sin(a * 5 + 2.1) + 0.08 * Math.sin(a * 9 + 4.3),
  );
};

/**
 * How much ink covers the vista. Measured in viewport heights from each end of
 * the document rather than as a fraction of total scroll, so the trailhead and
 * summit reveals stay the same length however long the content gets.
 *
 * Fully open at the trailhead, closed behind the written content, open again
 * for the summit.
 */
function scrimFor(y: number, max: number, vh: number): number {
  if (vh <= 0) return MAX_SCRIM;

  /* Closing: from half a viewport of scroll to one full viewport. */
  const closing = smoothstep((y - vh * 0.45) / (vh * 0.55));

  /* Opening: over the last one and a half viewports of the document. */
  const remaining = max - y;
  const opening = 1 - smoothstep((vh * 1.5 - remaining) / (vh * 1.0));

  return MAX_SCRIM * Math.min(closing, opening);
}

interface Props {
  scroll: RefObject<ScrollState>;
}

export default function Atmosphere({ scroll }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /* In the dependency list below, so the snowfall, the idle drift and the
     pointer parallax are torn down the moment the reader asks for stillness. */
  const motion = useMotionPref();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    const layers = LAYER_SPEC.map(buildLayer);

    const starRng = mulberry32(4242);
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: starRng(),
      y: starRng() * 0.62,
      r: starRng() * 1.1 + 0.25,
      phase: starRng() * Math.PI * 2,
      speed: 0.4 + starRng() * 0.9,
    }));

    /*
     * Snowfall. Position is derived from the clock rather than integrated, so
     * a flake costs one sine and two multiplies a frame and carries no state
     * to drift out of sync. The sharp flakes are drawn in three depth bands,
     * one batched path each: three fills for the whole snowfield.
     */
    const flakeRng = mulberry32(5150);
    const flakes = Array.from({ length: FLAKE_COUNT }, () => ({
      x: flakeRng(),
      y: flakeRng(),
      depth: flakeRng(),
      sway: flakeRng() * Math.PI * 2,
      swaySpeed: 0.45 + flakeRng() * 0.85,
    }));
    /* Maria, placed once. Enough surface for the disc to read as a body
       rather than a sticker, well short of a texture study. */
    const craterRng = mulberry32(1908);
    const craters = Array.from({ length: 7 }, () => {
      const angle = craterRng() * Math.PI * 2;
      const dist = Math.sqrt(craterRng()) * 0.7;
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        r: 0.07 + craterRng() * 0.12,
        depth: 0.05 + craterRng() * 0.09,
      };
    });

    /* Film grain, rendered once and tiled. Keeps the gradients from banding
       and gives the flat fills a printed texture. */
    const grainTile = document.createElement("canvas");
    grainTile.width = grainTile.height = 128;
    const gctx = grainTile.getContext("2d");
    let grainPattern: CanvasPattern | null = null;
    if (gctx) {
      const image = gctx.createImageData(128, 128);
      const grng = mulberry32(77);
      for (let i = 0; i < image.data.length; i += 4) {
        const v = grng() * 255;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
        image.data[i + 3] = 255;
      }
      gctx.putImageData(image, 0, 0);
      grainPattern = ctx.createPattern(grainTile, "repeat");
    }

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    /* Pointer parallax, eased toward the target so it never snaps. */
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointer = (e: PointerEvent) => {
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("resize", resize);

    const skyAt = (t: number, dawn: number, overcast: number): RGB => {
      let i = 0;
      while (i < SKY_DUSK.length - 2 && t > SKY_DUSK[i + 1].stop) i++;
      const span = SKY_DUSK[i + 1].stop - SKY_DUSK[i].stop || 1;
      const local = (t - SKY_DUSK[i].stop) / span;
      const clear = mix(
        mix(SKY_DUSK[i].color, SKY_DUSK[i + 1].color, local),
        mix(SKY_DAWN[i].color, SKY_DAWN[i + 1].color, local),
        dawn,
      );
      return mix(clear, mix(SKY_STORM[i].color, SKY_STORM[i + 1].color, local), overcast);
    };

    let raf = 0;
    let time = 0;

    /**
     * A soft-topped bank of cloud drifting across the page. Filled with a
     * downward fade, so it hangs in the air instead of sitting on a line.
     */
    const deck = (topY: number, ampY: number, alpha: number, shift: number, color: RGB) => {
      if (alpha <= 0.002) return;
      const steps = 96;
      ctx.beginPath();
      ctx.moveTo(-40, topY + ampY * 3);
      for (let j = 0; j <= steps; j++) {
        const u = j / steps;
        ctx.lineTo(-40 + u * (width + 80), topY - cloudAt(u + shift) * ampY);
      }
      ctx.lineTo(width + 40, topY + ampY * 3);
      ctx.closePath();
      const fade = ctx.createLinearGradient(0, topY - ampY, 0, topY + ampY * 2.4);
      fade.addColorStop(0, rgb(color, alpha));
      fade.addColorStop(0.45, rgb(color, alpha * 0.72));
      fade.addColorStop(1, rgb(color, 0));
      ctx.fillStyle = fade;
      ctx.fill();
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      /* Reduced motion keeps the landscape responsive to scroll but stops the
         idle animation, so nothing moves unless the reader moves it. */
      if (!reduced) time += 1 / 60;

      const { p, y, max, vh } = scroll.current;
      /* Dawn arrives across the upper half of the climb. */
      const dawn = clamp01((p - 0.35) / 0.55);

      /*
       * The weather. Snow the whole way, as it should be: light at the
       * trailhead, driving through the middle of the climb, then thinning to a
       * drift once the route tops out above the deck into first light. The
       * cover on the peaks only ever deepens, since gaining altitude is not
       * the same as the sky clearing.
       */
      const storm = smoothstep((p - 0.10) / 0.22) * (1 - smoothstep((p - 0.60) / 0.28));
      const snowfall = 0.52 + 0.48 * storm;
      const snowLoad = smoothstep((p - 0.14) / 0.42);
      const above = smoothstep((p - 0.76) / 0.24);
      const overcast = storm * 0.72;

      pointer.x += (pointer.tx - pointer.x) * 0.045;
      pointer.y += (pointer.ty - pointer.y) * 0.045;

      /* Sky */
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      for (let s = 0; s <= 8; s++) {
        const t = s / 8;
        sky.addColorStop(t, rgb(skyAt(t, dawn, overcast)));
      }
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      const horizonHaze = skyAt(0.82, dawn, overcast);
      const terrainHaze = mix(mix(HAZE_NIGHT, HAZE_DAWN, dawn), HAZE_STORM, overcast);
      /* Cloud reads a shade paler than the sky it hangs in, never white. */
      const cloudTint = mix(horizonHaze, [214, 220, 232], 0.34);

      /* Stars and the moon, both put out by cloud before the dawn gets them. */
      const clearSky = 1 - storm;
      const starAlpha = Math.pow(1 - dawn, 1.6) * clearSky;
      if (starAlpha > 0.01) {
        for (const star of stars) {
          const twinkle = 0.55 + 0.45 * Math.sin(time * star.speed + star.phase);
          ctx.globalAlpha = starAlpha * twinkle * 0.85;
          ctx.fillStyle = "#dbe2ef";
          ctx.beginPath();
          ctx.arc(
            star.x * width + pointer.x * 6,
            star.y * height + p * height * 0.08,
            star.r,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      /* The moon holding the trailhead. It sinks and pales as the weather
         closes and the ember takes over, so the lights are never both claiming
         the sky. Full, and so lit from dead ahead: no terminator, only the limb
         darkening that keeps a fully lit sphere from reading as a flat disc. */
      const moonAlpha = Math.pow(1 - dawn, 1.3) * clearSky;
      if (moonAlpha > 0.01) {
        const moonR = Math.max(18, Math.min(width, height) * 0.034);
        const moonX = width * 0.26 - pointer.x * 10;
        const moonY = height * 0.14 + p * height * 0.2;
        const night = skyAt(Math.min(1, moonY / height), dawn, overcast);
        const face = mix(MOON, night, 0.1);

        const halo = ctx.createRadialGradient(
          moonX,
          moonY,
          moonR * 0.6,
          moonX,
          moonY,
          moonR * 6,
        );
        halo.addColorStop(0, rgb(MOON, 0.12 * moonAlpha));
        halo.addColorStop(0.35, rgb(MOON, 0.042 * moonAlpha));
        halo.addColorStop(1, rgb(MOON, 0));
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.globalAlpha = moonAlpha;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.clip();

        /* Brightest just off centre, falling toward the limb. The whole face
           is lit, so this shading is the only thing carrying the curvature. */
        const disc = ctx.createRadialGradient(
          moonX - moonR * 0.12,
          moonY - moonR * 0.12,
          moonR * 0.08,
          moonX,
          moonY,
          moonR,
        );
        disc.addColorStop(0, rgb(mix(face, [255, 255, 255], 0.22)));
        disc.addColorStop(0.62, rgb(face));
        disc.addColorStop(1, rgb(mix(face, night, 0.42)));
        ctx.fillStyle = disc;
        ctx.fill();

        /* Soft-edged, so the maria read as shading on a surface rather than
           as discs stamped on it. */
        for (const crater of craters) {
          const cx = moonX + crater.x * moonR;
          const cy = moonY + crater.y * moonR;
          const cr = crater.r * moonR;
          const mare = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
          mare.addColorStop(0, rgb(mix(face, INK, 0.55), crater.depth * 1.25));
          mare.addColorStop(0.55, rgb(mix(face, INK, 0.55), crater.depth));
          mare.addColorStop(1, rgb(mix(face, INK, 0.55), 0));
          ctx.fillStyle = mare;
          ctx.beginPath();
          ctx.arc(cx, cy, cr, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();

        /* A hairline limb keeps the disc from dissolving into its own halo. */
        ctx.globalAlpha = moonAlpha * 0.32;
        ctx.strokeStyle = rgb(MOON, 0.45);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      /* The ember rising behind the ranges, smothered while the weather holds */
      const sunLight = 1 - storm * 0.78;
      const sunY = lerp(height * 0.95, height * 0.44, dawn);
      const sunX = width * 0.74 + pointer.x * 14;
      const glowR = Math.max(width, height) * lerp(0.35, 0.72, dawn);
      const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, glowR);
      glow.addColorStop(0, rgb(GILT, 0.46 * (0.18 + dawn * 0.82) * sunLight));
      glow.addColorStop(0.28, rgb(mix(GILT, [92, 68, 120], 0.5), 0.17 * (0.2 + dawn) * sunLight));
      glow.addColorStop(1, rgb(GILT, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      if (dawn > 0.25) {
        const core = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, width * 0.05);
        core.addColorStop(0, rgb([244, 220, 162], ((0.58 * (dawn - 0.25)) / 0.75) * sunLight));
        core.addColorStop(1, rgb([214, 174, 92], 0));
        ctx.fillStyle = core;
        ctx.fillRect(0, 0, width, height);
      }

      /* The high deck, behind the ranges: what swallows the far summits while
         the weather holds. */
      deck(
        height * 0.32 + p * height * 0.03,
        height * 0.085,
        0.44 * storm,
        time * 0.004,
        cloudTint,
      );

      /* Ranges, far to near */
      const snowDust = mix(SNOW, mix(terrainHaze, GILT, dawn * 0.55), 0.26);
      const paintRange = (i: number) => {
        const layer = layers[i];
        /* Haze burns off as the climb clears the cloud base, and thickens
           again for as long as the weather is in. */
        const fog = clamp01(layer.fog * (1 - p * 0.42) + storm * (1 - layer.fog) * 0.34);
        const body = mix(INK, terrainHaze, fog);

        const drop = p * height * layer.parallax;
        const shiftX = pointer.x * layer.parallax * -26;
        const base = layer.crest * height + drop;
        const relief = layer.amp * height;
        const count = layer.xs.length;

        const trace = (closed: boolean) => {
          ctx.beginPath();
          if (closed) ctx.moveTo(-60, height + 60);
          for (let j = 0; j < count; j++) {
            const px = layer.xs[j] * width + shiftX;
            const py = base - layer.hs[j] * relief;
            if (!closed && j === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          if (closed) {
            ctx.lineTo(width + 60, height + 60);
            ctx.closePath();
          }
        };

        trace(true);
        /* A gentle fall of light down the face, so a range is a body with a
           lit top rather than a flat cut-out. */
        const face = ctx.createLinearGradient(0, base - relief, 0, base + relief * 0.5);
        face.addColorStop(0, rgb(mix(body, terrainHaze, 0.16)));
        face.addColorStop(1, rgb(mix(body, INK, 0.3)));
        ctx.fillStyle = face;
        ctx.fill();

        /* Snowfields. A snowline rather than a painted cap: clipped to the
           rock and cut off at an altitude that wanders with the same field
           that roughened the flanks, so the snow runs down every couloir,
           stops short on every sunlit shoulder, and leaves the saddles bare. */
        const cover = lerp(0.24, 0.58, snowLoad) * layer.snowCap;
        if (cover > 0.02 && fog < 0.95) {
          const peakY = base - relief;
          const lineY = peakY + relief * cover;
          const wander = relief * cover * 0.45;
          ctx.save();
          trace(true);
          ctx.clip();
          ctx.beginPath();
          ctx.moveTo(-60, peakY - relief);
          ctx.lineTo(width + 60, peakY - relief);
          for (let j = count - 1; j >= 0; j--) {
            ctx.lineTo(layer.xs[j] * width + shiftX, lineY + layer.jag[j] * wander);
          }
          ctx.closePath();
          const tint = mix(snowDust, terrainHaze, fog * 0.85);
          /* Snow only returns the light falling on it. Under the moon it is a
             dim blue-grey; the sunrise is what makes a snowfield blaze, which
             is most of why the summit reads as a payoff. */
          const lit = (1 - fog * 0.72) * (0.42 + 0.58 * dawn);
          const cap = ctx.createLinearGradient(0, peakY, 0, lineY + wander);
          cap.addColorStop(0, rgb(tint, 0.9 * lit));
          cap.addColorStop(1, rgb(tint, 0.48 * lit));
          ctx.fillStyle = cap;
          ctx.fill();
          ctx.restore();
        }

        /* A thin lit rim on the sun-facing crest sells the light direction. */
        if (dawn > 0.08 && i >= 1) {
          ctx.globalAlpha = dawn * 0.5 * (1 - fog) * sunLight;
          ctx.strokeStyle = rgb(mix(GILT, [246, 232, 200], 0.35), 0.72);
          ctx.lineWidth = 1;
          trace(false);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        /* Conifers along the ridge, in one batched path. They are the darkest
           thing in the frame and the reason the scale reads as mountains and
           not as dunes. */
        if (layer.firs.length) {
          ctx.beginPath();
          for (const fir of layer.firs) {
            const px = fir.x * width + shiftX;
            const gy = base - fir.h * relief + 1;
            const th = fir.size * height;
            const w = th * 0.33;
            for (let k = 0; k < 3; k++) {
              ctx.moveTo(px, gy - th * (1 - 0.2 * k));
              ctx.lineTo(px + w * (0.45 + 0.275 * k), gy - th * (0.58 - 0.28 * k));
              ctx.lineTo(px - w * (0.45 + 0.275 * k), gy - th * (0.58 - 0.28 * k));
              ctx.closePath();
            }
            const trunk = Math.max(0.7, th * 0.03);
            ctx.moveTo(px - trunk, gy);
            ctx.lineTo(px + trunk, gy);
            ctx.lineTo(px + trunk, gy - th * 0.22);
            ctx.lineTo(px - trunk, gy - th * 0.22);
            ctx.closePath();
          }
          ctx.fillStyle = rgb(mix(INK, terrainHaze, fog * 0.5));
          ctx.fill();
        }

        /* Valley fog settling between the ranges */
        if (i < layers.length - 1 && fog > 0.04) {
          const band = ctx.createLinearGradient(0, base - height * 0.05, 0, base + height * 0.1);
          band.addColorStop(0, rgb(horizonHaze, 0));
          band.addColorStop(0.5, rgb(horizonHaze, 0.24 * fog));
          band.addColorStop(1, rgb(horizonHaze, 0));
          ctx.fillStyle = band;
          ctx.fillRect(0, base - height * 0.05, width, height * 0.15);
        }
      };

      /* The distance, then the weather in it, then the near ground. */
      const NEAR_FROM = layers.length - 2;
      for (let i = 0; i < NEAR_FROM; i++) paintRange(i);

      /* The low deck: cloud blowing through the valley while the weather
         holds, and the sea of it left underfoot once the climb is above the
         break. Behind the near ground, so the reader is standing above it. */
      deck(
        height * (0.7 - above * 0.06) + p * height * 0.06,
        height * 0.07,
        0.32 * storm + 0.2 * above,
        -time * 0.011,
        mix(cloudTint, mix(SNOW, GILT, dawn * 0.45), above * 0.5),
      );

      /*
       * Snow, falling out in the valley rather than against the lens: it is
       * laid over the distance but under the near ground, which crops it the
       * way a foreground ridge crops real weather. Three batched paths for the
       * whole snowfield, whatever the flake count.
       */
      if (!reduced) {
        /* Fewer flakes on a narrow screen, where the same count would read as
           a blizzard and cost the most. */
        const load = snowfall * Math.min(1, width / 1180);
        const active = Math.round(FLAKE_COUNT * load);
        const flakeTint = mix(SNOW, mix(horizonHaze, GILT, dawn * 0.4), 0.18);
        const gust = 0.5 + 0.5 * Math.sin(time * 0.11);

        for (let tier = 0; tier < 3; tier++) {
          ctx.beginPath();
          let drawn = false;
          for (let i = 0; i < active; i++) {
            const f = flakes[i];
            if (Math.min(2, Math.floor(f.depth * 3)) !== tier) continue;
            const fall = 0.045 + f.depth * 0.1 + storm * 0.05;
            const py = ((f.y + time * fall) % 1) * (height + 140) - 70;
            const swing =
              Math.sin(time * f.swaySpeed + f.sway) * (3 + f.depth * 9) * (0.6 + gust * 0.7);
            const px =
              ((f.x - time * 0.009 * (0.4 + f.depth) * (0.4 + gust) + 1) % 1) * (width + 140) -
              70 +
              swing +
              pointer.x * f.depth * 9;
            const r = 0.4 + f.depth * 1.05;
            ctx.moveTo(px + r, py);
            ctx.arc(px, py, r, 0, Math.PI * 2);
            drawn = true;
          }
          if (drawn) {
            ctx.fillStyle = rgb(flakeTint, (0.2 + tier * 0.11) * (0.6 + 0.4 * snowfall));
            ctx.fill();
          }
        }

      }

      for (let i = NEAR_FROM; i < layers.length; i++) paintRange(i);

      /* The weather itself, as a wash over everything in it */
      if (storm > 0.01) {
        const veil = ctx.createLinearGradient(0, 0, 0, height);
        veil.addColorStop(0, rgb(horizonHaze, 0.05 * storm));
        veil.addColorStop(0.5, rgb(horizonHaze, 0.22 * storm));
        veil.addColorStop(1, rgb(horizonHaze, 0.1 * storm));
        ctx.fillStyle = veil;
        ctx.fillRect(0, 0, width, height);
      }

      /* Scrim - hands the stage to the text, then gives it back */
      const scrim = scrimFor(y, max, vh || height);
      if (scrim > 0.001) {
        ctx.fillStyle = rgb(INK, scrim);
        ctx.fillRect(0, 0, width, height);
      }

      /* Grain */
      if (grainPattern) {
        ctx.globalAlpha = 0.035;
        ctx.globalCompositeOperation = "overlay";
        ctx.fillStyle = grainPattern;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }

      /* Vignette */
      const vignette = ctx.createRadialGradient(
        width / 2,
        height * 0.45,
        Math.min(width, height) * 0.3,
        width / 2,
        height * 0.5,
        Math.max(width, height) * 0.82,
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [scroll, motion]);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />;
}
