/**
 * A made-up racing circuit, drawn to fit any box.
 *
 * The shape is generated from the measured pixel size rather than scaled from
 * a fixed viewBox, because the box it wraps changes height when the form
 * opens. Stretching one drawing would turn every corner into an oval and the
 * chicane into a smear; recomputing means the corners stay circular and only
 * the straights get longer, which is what actually happens to a circuit when
 * you draw it at a different size.
 *
 * Clockwise from the left-hand hairpin: the top straight, a chicane, a tight
 * right, the back straight, a long sweeper, then the start/finish straight
 * along the bottom.
 *
 * What makes it read as road rather than as a rounded border is not the shape
 * but the layering: one path, stroked five times at five widths. Widest and
 * underneath is the curbing, then a pale edge, then dark tarmac laid over the
 * middle of that edge so a boundary line is left showing down each side, then
 * the broken centre line, then the start/finish tick.
 */

export interface TrackWidths {
  curb: number;
  edge: number;
  surface: number;
  centre: number;
  start: number;
}

export interface Circuit {
  /** The full lap. Stroked repeatedly to build the road up in layers. */
  outline: string;
  /** Hairpin, sweeper and chicane only, struck wider and dashed. */
  curbs: string;
  /** One tick across the bottom straight. */
  start: string;
  widths: TrackWidths;
}

const EMPTY: Circuit = {
  outline: "",
  curbs: "",
  start: "",
  widths: { curb: 0, edge: 0, surface: 0, centre: 0, start: 0 },
};

const clamp = (min: number, value: number, max: number) =>
  Math.max(min, Math.min(value, max));

/** Trim to a sane number of decimals; the full float is noise in the DOM. */
const n = (value: number) => Math.round(value * 100) / 100;

export function circuit(w: number, h: number): Circuit {
  const size = Math.min(w, h);
  const surface = clamp(7, size * 0.062, 11);
  const edge = surface + 2.4;
  const curb = surface * 1.85;
  /* Strokes are centred on the path, so the box has to be inset by at least
     half the widest of them or the curbing is clipped at the edges. */
  const pad = curb / 2 + 1;

  const L = pad;
  const T = pad;
  const R = w - pad;
  const B = h - pad;
  const W = R - L;
  const H = B - T;
  if (W <= 0 || H <= 0) return EMPTY;

  const s = Math.min(W, H);

  /*
   * The left end is a hairpin: two equal radii that close into a true
   * semicircle whenever the box is short enough. That single feature is what
   * stops the outline reading as a rounded rectangle, and it is symmetrical,
   * so the character has to come from the other end - a tight right off the
   * chicane, a long sweeper onto the main straight.
   */
  let hp = Math.min(H / 2, clamp(20, s * 0.46, 92));
  let tr = clamp(9, s * 0.13, 24);
  let br = clamp(14, s * 0.3, 62);
  let k = clamp(6, H * 0.085, 15); // half the chicane

  /* Shrink everything uniformly until each feature fits the run it sits on.
     Collapsed, this box is barely taller than one button, and a sweeper sized
     for the open form would swallow it whole. */
  const fit = Math.min(
    1,
    H / (2 * k + tr + br),
    W / (hp + 2 * k + tr),
    W / (hp + br),
  );
  if (fit < 1) {
    hp *= fit;
    tr *= fit;
    br *= fit;
    k *= fit;
  }

  /* Where the chicane breaks the top straight. Off-centre, because a circuit
     is not symmetrical. */
  const cx = L + hp + (W - hp - 2 * k - tr) * 0.46;

  const chicane =
    `Q ${n(cx + k)} ${n(T)} ${n(cx + k)} ${n(T + k)} ` +
    `Q ${n(cx + k)} ${n(T + 2 * k)} ${n(cx + 2 * k)} ${n(T + 2 * k)}`;

  const hairpinTop = `A ${n(hp)} ${n(hp)} 0 0 1 ${n(L + hp)} ${n(T)}`;
  const sweeper = `A ${n(br)} ${n(br)} 0 0 1 ${n(R - br)} ${n(B)}`;

  const outline = [
    `M ${n(L + hp)} ${n(T)}`,
    `L ${n(cx)} ${n(T)}`,
    chicane,
    `L ${n(R - tr)} ${n(T + 2 * k)}`,
    `A ${n(tr)} ${n(tr)} 0 0 1 ${n(R)} ${n(T + 2 * k + tr)}`,
    `L ${n(R)} ${n(B - br)}`,
    sweeper,
    `L ${n(L + hp)} ${n(B)}`,
    `A ${n(hp)} ${n(hp)} 0 0 1 ${n(L)} ${n(B - hp)}`,
    `L ${n(L)} ${n(T + hp)}`,
    hairpinTop,
    "Z",
  ].join(" ");

  /*
   * Curbing on the hairpin, the sweeper and the chicane - the three places a
   * car would actually run wide. Drawn under the tarmac and wider than it, so
   * the dashes show along both edges of the corner instead of on top of it.
   */
  const curbs = [
    `M ${n(L)} ${n(T + hp)} ${hairpinTop}`,
    `M ${n(L)} ${n(B - hp)} A ${n(hp)} ${n(hp)} 0 0 0 ${n(L + hp)} ${n(B)}`,
    `M ${n(R)} ${n(B - br)} ${sweeper}`,
    `M ${n(cx)} ${n(T)} ${chicane}`,
  ].join(" ");

  /* Start/finish, a third of the way along the bottom straight. */
  const sx = L + hp + (W - hp - br) * 0.34;
  const half = surface / 2;
  const start = `M ${n(sx)} ${n(B - half)} L ${n(sx)} ${n(B + half)}`;

  return {
    outline,
    curbs,
    start,
    widths: {
      curb: n(curb),
      edge: n(edge),
      surface: n(surface),
      centre: n(clamp(1, surface * 0.12, 1.4)),
      start: n(clamp(2, surface * 0.3, 3.2)),
    },
  };
}
