/// <reference lib="dom" />
/**
 * Liquid glass in a browser, for the website and the phone app's web build: each shape's face (its tint, clear on the
 * outer rim and deep where the words are, with the line of light on its edge) in every browser, and the SVG filter
 * that bends the page behind it at the rim, splitting red from blue a touch as real glass does (Chromium, the one
 * engine that draws an SVG filter as a backdrop). The optics are glass.ts's `glassField`. Nothing is blurred.
 */
import { GLASS, bendImage, glassField, shineImage, veilImage, type GlassShape } from './glass.js';

/** The tint's colour by day and by night: white, and the page's ink taken almost to black. */
const TINT = { light: [255, 255, 255], dark: [30, 27, 46] } as const;

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

export interface Lens {
  /** The filter's id, where the browser can bend a backdrop. */
  filter: string | null;
  /** The face by day and by night, as images the size of the shape. */
  light: string | null;
  dark: string | null;
}

/** One lens per shape and pixel density, shared by every element of that shape and dropped when the last one goes. */
const lenses = new Map<string, { lens: Lens; uses: number; node: SVGFilterElement | null }>();
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

/** Layers drawn one over another into one picture, as a data URL. */
function picture(layers: Uint8ClampedArray<ArrayBuffer>[], width: number, height: number): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const lg = layer.getContext('2d');
  if (!lg) return null;
  for (const data of layers) {
    lg.putImageData(new ImageData(data, width, height), 0, 0);
    g.drawImage(layer, 0, 0);
  }
  return canvas.toDataURL('image/png');
}

function svgNode<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Keeps one colour channel of a displaced copy, so three copies bent by slightly different amounts add back up. */
const CHANNEL = {
  r: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  g: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  b: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
};

function bendFilter(id: string, href: string, { width, height }: GlassShape, reach: number): SVGFilterElement {
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
  node.append(svgNode('feImage', { href, x: 0, y: 0, width, height, preserveAspectRatio: 'none', result: 'map' }));
  const scale = 2 * reach;
  const spread = { r: 1 + GLASS.dispersion, g: 1, b: 1 - GLASS.dispersion };
  for (const c of ['r', 'g', 'b'] as const) {
    node.append(
      svgNode('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: (scale * spread[c]).toFixed(2), xChannelSelector: 'R', yChannelSelector: 'G', result: `bent-${c}` }),
      svgNode('feColorMatrix', { in: `bent-${c}`, type: 'matrix', values: CHANNEL[c], result: `only-${c}` }),
    );
  }
  node.append(
    svgNode('feBlend', { in: 'only-r', in2: 'only-g', mode: 'screen', result: 'rg' }),
    svgNode('feBlend', { in: 'rg', in2: 'only-b', mode: 'screen' }),
  );
  return node;
}

/** The lens for a shape, made on first use. */
export function takeLens(shape: GlassShape, dpr: number, bend: boolean): Lens {
  const key = `${shape.width}x${shape.height}r${shape.radius}@${dpr}${bend ? '+bend' : ''}`;
  const have = lenses.get(key);
  if (have) {
    have.uses++;
    return have.lens;
  }
  const field = glassField(shape, dpr);
  const shine = shineImage(field);
  const light = picture([veilImage(field, TINT.light), shine], field.width, field.height);
  const dark = picture([veilImage(field, TINT.dark), shine], field.width, field.height);
  let filter: string | null = null;
  let node: SVGFilterElement | null = null;
  const map = bend ? picture([bendImage(field)], field.width, field.height) : null;
  if (map) {
    filter = `hevalo-lens-${++made}`;
    node = bendFilter(filter, map, shape, field.reach);
    holder().appendChild(node);
  }
  const lens = { filter, light, dark };
  lenses.set(key, { lens, uses: 1, node });
  return lens;
}

/** Lets go of a lens taken with `takeLens`; the last one out removes its filter. */
export function dropLens(lens: Lens): void {
  for (const [key, l] of lenses) {
    if (l.lens !== lens) continue;
    if (--l.uses <= 0) {
      l.node?.remove();
      lenses.delete(key);
    }
    return;
  }
}
