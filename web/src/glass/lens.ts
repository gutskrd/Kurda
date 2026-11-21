/**
 * Liquid glass for the floating chrome: the map that bends what lies behind a rounded shape at its rim, as a slab of
 * thick glass with a rounded edge does, and the SVG filter that draws it as the shape's backdrop. Only Chromium draws
 * an SVG filter as a backdrop; elsewhere the shape keeps the same tint, frost and rim without the bend (glass.css).
 */

/** How far in from the edge the glass curves, in CSS pixels: past it the slab is flat and nothing bends. */
export const BEZEL = 14;
/** How thick the slab is at its flat middle, in CSS pixels; a thicker slab bends more. */
export const THICKNESS = 30;
/** Glass. */
const IOR = 1.5;
/** How much the middle is softened (a standard deviation in CSS pixels), so words behind never fight the bar's own. */
export const FROST = 5;

export interface LensShape {
  width: number;
  height: number;
  radius: number;
}

export interface LensMap {
  /** The map's size in device pixels. */
  width: number;
  height: number;
  /** RGBA, red the sideways shift and green the vertical one, 128 for none. */
  data: Uint8ClampedArray<ArrayBuffer>;
  /** The largest shift in CSS pixels, both ways: the filter's `scale`. */
  scale: number;
}

/**
 * The displacement map for a rounded rectangle. Each point within the bezel looks inward by how far a ray through
 * glass of that slope bends (Snell's law, on a squircle profile that meets the edge upright), so the rim gathers what
 * lies nearer the middle and the flat inside shows the page as it is.
 */
export function lensMap({ width, height, radius }: LensShape, dpr = 1): LensMap {
  const W = Math.max(1, Math.round(width * dpr));
  const H = Math.max(1, Math.round(height * dpr));
  const r = Math.min(radius, width / 2, height / 2);
  const bezel = Math.min(BEZEL, width / 2, height / 2);
  const dx = new Float32Array(W * H);
  const dy = new Float32Array(W * H);
  let most = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = (x + 0.5) / dpr - width / 2;
      const py = (y + 0.5) / dpr - height / 2;
      // Distance in from the rounded edge, and the edge's outward direction there.
      const qx = Math.abs(px) - (width / 2 - r);
      const qy = Math.abs(py) - (height / 2 - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const corner = Math.hypot(ox, oy);
      const inside = r - corner - Math.min(Math.max(qx, qy), 0);
      if (inside <= 0 || inside >= bezel) continue;
      let nx: number;
      let ny: number;
      if (qx > 0 && qy > 0) [nx, ny] = [ox / corner, oy / corner];
      else if (qx > qy) [nx, ny] = [1, 0];
      else [nx, ny] = [0, 1];
      nx *= px < 0 ? -1 : 1;
      ny *= py < 0 ? -1 : 1;
      const t = inside / bezel;
      const s = 1 - t;
      const z4 = 1 - s ** 4;
      const slope = z4 > 1e-6 ? s ** 3 / z4 ** 0.75 : 1e6;
      const tilt = Math.atan((slope * THICKNESS) / bezel);
      const bend = tilt - Math.asin(Math.sin(tilt) / IOR);
      // Thicker glass carries a bent ray further; the shift fades to nothing where the slab turns flat.
      const shift = ((z4 ** 0.25) * THICKNESS + 2) * Math.tan(bend) * Math.sqrt(s);
      const i = y * W + x;
      dx[i] = -nx * shift;
      dy[i] = -ny * shift;
      if (shift > most) most = shift;
    }
  }
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = most ? Math.round(255 * (0.5 + (dx[i] ?? 0) / (2 * most))) : 128;
    data[i * 4 + 1] = most ? Math.round(255 * (0.5 + (dy[i] ?? 0) / (2 * most))) : 128;
    data[i * 4 + 2] = 128;
    data[i * 4 + 3] = 255;
  }
  return { width: W, height: H, data, scale: 2 * most };
}

/**
 * Whether this browser draws an SVG filter behind an element. Chromium does; the others parse `url()` in
 * `backdrop-filter` without drawing it, so they are told apart by engine rather than by `CSS.supports`.
 */
export function lensSupported(): boolean {
  if (typeof navigator === 'undefined' || typeof CSS === 'undefined') return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  return Boolean(brands?.some((b) => b.brand === 'Chromium')) && CSS.supports('backdrop-filter', 'url(#lens)');
}

const SVG = 'http://www.w3.org/2000/svg';

/** One filter per shape and pixel density, shared by every element of that shape and dropped when the last one goes. */
const filters = new Map<string, { id: string; uses: number; node: SVGFilterElement }>();
let defs: SVGDefsElement | null = null;
let made = 0;

function holder(): SVGDefsElement {
  if (defs?.isConnected) return defs;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  defs = document.createElementNS(SVG, 'defs');
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

function mapUrl(map: LensMap): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.height;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.putImageData(new ImageData(map.data, map.width, map.height), 0, 0);
  return canvas.toDataURL('image/png');
}

function svgNode<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** The filter for a shape, made on first use: frost, then the bend. Returns its id, or null if it cannot be drawn. */
export function takeLens(shape: LensShape, dpr: number): string | null {
  const key = `${shape.width}x${shape.height}r${shape.radius}@${dpr}`;
  const have = filters.get(key);
  if (have) {
    have.uses++;
    return have.id;
  }
  const map = lensMap(shape, dpr);
  const href = mapUrl(map);
  if (!href) return null;
  const id = `hevalo-lens-${++made}`;
  const { width, height } = shape;
  const node = svgNode('filter', {
    id,
    x: 0,
    y: 0,
    width,
    height,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    'color-interpolation-filters': 'sRGB',
  });
  node.append(
    svgNode('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: FROST, edgeMode: 'duplicate', result: 'frost' }),
    svgNode('feImage', { href, x: 0, y: 0, width, height, preserveAspectRatio: 'none', result: 'map' }),
    svgNode('feDisplacementMap', { in: 'frost', in2: 'map', scale: map.scale.toFixed(2), xChannelSelector: 'R', yChannelSelector: 'G' }),
  );
  holder().appendChild(node);
  filters.set(key, { id, uses: 1, node });
  return id;
}

/** Lets go of a filter taken with `takeLens`; the last one out removes it. */
export function dropLens(id: string): void {
  for (const [key, f] of filters) {
    if (f.id !== id) continue;
    if (--f.uses <= 0) {
      f.node.remove();
      filters.delete(key);
    }
    return;
  }
}
