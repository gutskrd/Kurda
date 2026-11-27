/**
 * The optics of Hevalo's liquid glass, shared by the website's lens (web/src/glass) and the phone's preview on the web,
 * and mirrored line for line by the phone's Android shader (mobile/modules/hevalo-glass). A floating shape is a slab of
 * glass whose edge rounds over like a squircle: a ray looking through the rim is bent inward by Snell's law, so the rim
 * gathers what lies nearer the middle, and the flat middle shows the page as it is. Light from above catches the rim.
 * Nothing is blurred: words on the glass stay readable because its tint deepens from a clear rim to a veiled middle.
 */

/** The constants every renderer uses, so the glass looks the same everywhere. */
export const GLASS = {
  /** How far in from the edge the glass curves, in points; a small shape curves all the way to its middle. */
  bezel: 22,
  /** How thick the slab is in the middle, in points; thicker glass bends further. */
  thickness: 24,
  /** Glass. */
  ior: 1.5,
  /** How much further red is bent than green, and blue less, so the rim splits light a little as real glass does. */
  dispersion: 0.07,
  /** Where the light comes from: above and a little to the left. */
  light: [-0.37, -0.93] as const,
  /**
   * How much of the tint lies on the clear rim and on the middle where the words are, and how far into the bezel it
   * deepens: only the outer rim, where the bend is strongest, stays clear.
   */
  veil: { rim: 0.12, middle: 0.88, reach: 0.45 },
} as const;

export interface GlassShape {
  width: number;
  height: number;
  radius: number;
}

export interface GlassField {
  /** Size in device pixels. */
  width: number;
  height: number;
  /** Per pixel, where to look instead, in points: x then y, pointing inward at the rim and zero in the middle. */
  bend: Float32Array;
  /** Per pixel, how much light the rim catches, 0 to 1. */
  shine: Float32Array;
  /** Per pixel, how deep the tint is, 0 to 1, and 0 outside the shape. */
  veil: Float32Array;
  /** The longest bend, in points. */
  reach: number;
}

/** How far in from the rounded edge a point lies (negative outside), and the edge's outward direction there. */
export function roundedEdge(x: number, y: number, { width, height, radius }: GlassShape): { inside: number; nx: number; ny: number } {
  const r = Math.min(radius, width / 2, height / 2);
  const px = x - width / 2;
  const py = y - height / 2;
  const qx = Math.abs(px) - (width / 2 - r);
  const qy = Math.abs(py) - (height / 2 - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const corner = Math.hypot(ox, oy);
  const inside = r - corner - Math.min(Math.max(qx, qy), 0);
  let nx: number;
  let ny: number;
  if (qx > 0 && qy > 0) [nx, ny] = [ox / corner, oy / corner];
  else if (qx > qy) [nx, ny] = [1, 0];
  else [nx, ny] = [0, 1];
  return { inside, nx: px < 0 ? -nx : nx, ny: py < 0 ? -ny : ny };
}

/** The bend at a depth `t` into the bezel (0 at the edge, 1 where the glass turns flat), in points. */
export function bendAt(t: number, bezel: number, thickness: number = GLASS.thickness): number {
  if (t <= 0 || t >= 1) return 0;
  const s = 1 - t;
  const lift = 1 - s ** 4;
  // The squircle's slope; it stands upright at the edge, where the ray meets the glass side on.
  const slope = lift > 1e-6 ? s ** 3 / lift ** 0.75 : 1e6;
  const tilt = Math.atan((slope * thickness) / bezel);
  const turn = tilt - Math.asin(Math.sin(tilt) / GLASS.ior);
  return (lift ** 0.25 * thickness + 2) * Math.tan(turn) * Math.sqrt(s);
}

/** How much light a point catches: a fine bright line on the rim, strongest where the edge faces the light. */
export function shineAt(inside: number, nx: number, ny: number, bezel: number): number {
  const facing = nx * GLASS.light[0] + ny * GLASS.light[1];
  const rim = Math.max(0, 1 - Math.abs(inside - 0.6) / 0.9);
  const lit = 0.9 * Math.max(facing, 0) ** 1.2 + 0.4 * Math.max(-facing, 0) ** 1.2 + 0.12;
  const sheen = 0.16 * (1 - Math.min(inside / bezel, 1)) ** 3 * Math.max(facing, 0);
  return Math.min(1, rim * lit + sheen);
}

/** How deep the tint is at a depth `t` into the bezel: clear at the rim, where the page bends, deepening to the middle. */
export function veilAt(t: number): number {
  const k = Math.min(Math.max(t / GLASS.veil.reach, 0), 1);
  const ease = k * k * (3 - 2 * k);
  return GLASS.veil.rim + (GLASS.veil.middle - GLASS.veil.rim) * ease;
}

/** The bezel for a shape: the standard width, or the whole way in for a shape too small to have a flat middle. */
export function bezelFor({ width, height }: Pick<GlassShape, 'width' | 'height'>): number {
  return Math.min(GLASS.bezel, Math.min(width, height) / 2);
}

/**
 * Bend and light for every device pixel of a shape. A thinner slab with a narrower rim (`optics`, in points) suits a
 * small lens whose middle must stay clear.
 */
export function glassField(shape: GlassShape, dpr = 1, optics?: { bezel: number; thickness: number }): GlassField {
  const W = Math.max(1, Math.round(shape.width * dpr));
  const H = Math.max(1, Math.round(shape.height * dpr));
  const bezel = optics ? Math.min(optics.bezel, bezelFor(shape)) : bezelFor(shape);
  const thickness = optics?.thickness ?? GLASS.thickness;
  const bend = new Float32Array(W * H * 2);
  const shine = new Float32Array(W * H);
  const veil = new Float32Array(W * H);
  let reach = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const { inside, nx, ny } = roundedEdge((x + 0.5) / dpr, (y + 0.5) / dpr, shape);
      if (inside <= 0) continue;
      const i = y * W + x;
      shine[i] = shineAt(inside, nx, ny, bezel);
      // A pixel the edge only partly covers takes that part of the tint, so the edge stays smooth.
      veil[i] = veilAt(inside / bezel) * Math.min(inside * dpr, 1);
      const b = bendAt(inside / bezel, bezel, thickness);
      bend[i * 2] = -nx * b;
      bend[i * 2 + 1] = -ny * b;
      if (b > reach) reach = b;
    }
  }
  return { width: W, height: H, bend, shine, veil, reach };
}

/** The bend as an opaque image for an SVG displacement map: red is sideways, green is down, 128 is none. */
export function bendImage(field: GlassField): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(field.width * field.height * 4);
  const span = field.reach || 1;
  for (let i = 0; i < field.width * field.height; i++) {
    out[i * 4] = Math.round(255 * (0.5 + (field.bend[i * 2] ?? 0) / (2 * span)));
    out[i * 4 + 1] = Math.round(255 * (0.5 + (field.bend[i * 2 + 1] ?? 0) / (2 * span)));
    out[i * 4 + 2] = 128;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** The tint in one colour (0–255 each), at the veil's depth. */
export function veilImage(field: GlassField, [r, g, b]: readonly [number, number, number]): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(field.width * field.height * 4);
  for (let i = 0; i < field.width * field.height; i++) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = Math.round(255 * (field.veil[i] ?? 0));
  }
  return out;
}

/** The light on the rim as white over transparent. */
export function shineImage(field: GlassField): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(field.width * field.height * 4);
  for (let i = 0; i < field.width * field.height; i++) {
    out[i * 4] = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = Math.round(255 * (field.shine[i] ?? 0));
  }
  return out;
}
