/**
 * A badge's picture painted as the hero of it: the thing itself in its own
 * colours — a flame is orange, a book's pages are white, a gift is wrapped
 * in violet — glazed: each part lit smoothly from the upper left into its
 * shade, a gloss across the top of the whole, and a fine edge of the plate's
 * darkest tone round it, so it reads on the badge's plate, over the page
 * where it rises out of the plate, and on the dark theme and the light one
 * alike.
 *
 * The parts are the icons' own (icons.ts): the main body, its shaded face, a
 * named accent, snow, cut lines, stroked lines, highlights. Here the main
 * body and its face take the badge's own two swatches instead of the tier's
 * metal — the tier is told by the plate's band, the number and the light,
 * never by recolouring the picture.
 */
import type { Part } from './icons.js';
import { ACCENT, STONE } from './palette.js';
import type { PlateName } from './palette.js';
import type { Drawing } from './svg.js';
import { linearBox, mix, n, n2 } from './svg.js';

/** A colour lit from above: its light top, its body, its shaded foot. */
export type Swatch = readonly [string, string, string];

export const SWATCH = {
  paper: ['#ffffff', '#f6f3ff', '#d9d1f5'],
  cream: ['#fffaf0', '#fff0d6', '#efcf9f'],
  sky: ['#bfe6ff', '#4aa8ff', '#2367d9'],
  aqua: ['#e0fffc', '#62efe4', '#13b2c2'],
  violet: ['#e3cbff', '#a46bff', '#6f35dc'],
  green: ['#d4ff9f', '#5bd96d', '#239c4b'],
  rose: ['#ffc0cb', '#ff4f72', '#d11f49'],
  pink: ['#ffe2ee', '#ff96c2', '#ea5f99'],
  gold: ['#fff6bf', '#ffcc33', '#e48a0c'],
  orange: ['#ffd9a3', '#ff9a3c', '#e2581a'],
  wood: ['#f6c48e', '#cc7d40', '#8e4a1c'],
  steel: ['#ffffff', '#c6d2e4', '#8494b0'],
  ink: ['#7d93e6', '#3a4fae', '#1d2a70'],
  sand: ['#ffe6bd', '#eab679', '#b97c3c'],
  moon: ['#fffde6', '#ffeb8f', '#f0c64a'],
  ice: ['#ffffff', '#e2f5ff', '#9fd6ff'],
  mountain: ['#d6e2ff', '#7d97f2', '#4459c2'],
  brass: ['#ffeab0', '#e8b54e', '#a8701c'],
} as const satisfies Record<string, Swatch>;
export type SwatchName = keyof typeof SWATCH;

/**
 * How a badge's picture is coloured: its main body (`f`), its shaded face
 * (`a`), and the plate it stands on — for a found secret, which has no plate,
 * the colour of the light it is held up in.
 */
export interface HeroColours {
  f: SwatchName;
  a: SwatchName;
  plate: PlateName;
}

export const HERO: Readonly<Record<string, HeroColours>> = {
  ders: { f: 'paper', a: 'sky', plate: 'violet' },
  'peyven-min': { f: 'paper', a: 'paper', plate: 'blue' },
  bekemasi: { f: 'aqua', a: 'sky', plate: 'indigo' },
  dubare: { f: 'green', a: 'green', plate: 'indigo' },
  cirokbej: { f: 'paper', a: 'gold', plate: 'violet' },
  rewi: { f: 'orange', a: 'orange', plate: 'teal' },
  ferheng: { f: 'gold', a: 'rose', plate: 'gold' },
  zengil: { f: 'gold', a: 'brass', plate: 'pink' },
  penus: { f: 'gold', a: 'orange', plate: 'sky' },
  agir: { f: 'orange', a: 'orange', plate: 'red' },
  hefte: { f: 'paper', a: 'rose', plate: 'sky' },
  roj: { f: 'gold', a: 'orange', plate: 'pink' },
  pela: { f: 'aqua', a: 'sky', plate: 'blue' },
  vegera: { f: 'ink', a: 'ink', plate: 'sky' },
  cay: { f: 'paper', a: 'rose', plate: 'teal' },
  'gula-hefte': { f: 'gold', a: 'orange', plate: 'indigo' },
  peyvzan: { f: 'paper', a: 'paper', plate: 'violet' },
  helbestvan: { f: 'wood', a: 'wood', plate: 'teal' },
  bilez: { f: 'paper', a: 'violet', plate: 'orange' },
  rastnivis: { f: 'paper', a: 'paper', plate: 'blue' },
  guhdar: { f: 'paper', a: 'violet', plate: 'pink' },
  hemereng: { f: 'paper', a: 'paper', plate: 'indigo' },
  dilpak: { f: 'gold', a: 'gold', plate: 'pink' },
  mamik: { f: 'sky', a: 'ink', plate: 'gold' },
  bilbil: { f: 'sand', a: 'wood', plate: 'green' },
  'rank-dest': { f: 'paper', a: 'paper', plate: 'teal' },
  'rank-gir': { f: 'paper', a: 'paper', plate: 'violet' },
  'rank-zozan': { f: 'paper', a: 'paper', plate: 'indigo' },
  'rank-ciya': { f: 'paper', a: 'paper', plate: 'gold' },
  'rank-lutke': { f: 'paper', a: 'paper', plate: 'teal' },
  'rank-sterk': { f: 'paper', a: 'paper', plate: 'violet' },
  hilkiser: { f: 'mountain', a: 'ink', plate: 'orange' },
  cihgirti: { f: 'rose', a: 'paper', plate: 'sky' },
  heval: { f: 'rose', a: 'pink', plate: 'violet' },
  diyari: { f: 'violet', a: 'violet', plate: 'gold' },
  mevandar: { f: 'brass', a: 'brass', plate: 'indigo' },
  name: { f: 'pink', a: 'rose', plate: 'blue' },
  newroz: { f: 'orange', a: 'wood', plate: 'violet' },
  'roja-ziman': { f: 'gold', a: 'ink', plate: 'teal' },
  'zimane-dayike': { f: 'paper', a: 'paper', plate: 'pink' },
  sersal: { f: 'gold', a: 'orange', plate: 'violet' },
  yelda: { f: 'rose', a: 'wood', plate: 'gold' },
  bihar: { f: 'pink', a: 'pink', plate: 'green' },
  havin: { f: 'gold', a: 'orange', plate: 'sky' },
  payiz: { f: 'orange', a: 'orange', plate: 'teal' },
  zivistan: { f: 'ice', a: 'ice', plate: 'blue' },
  mehane: { f: 'moon', a: 'gold', plate: 'indigo' },
  'tire-rast': { f: 'steel', a: 'steel', plate: 'sky' },
  'ji-nu-ve': { f: 'green', a: 'wood', plate: 'green' },
  'kewe-ciye': { f: 'sand', a: 'wood', plate: 'orange' },
  'deste-zerin': { f: 'gold', a: 'brass', plate: 'gold' },
  'mevane-agir': { f: 'paper', a: 'brass', plate: 'red' },
  'kaniya-zanine': { f: 'paper', a: 'cream', plate: 'teal' },
  'pisika-wane': { f: 'paper', a: 'cream', plate: 'pink' },
  perperok: { f: 'sky', a: 'violet', plate: 'violet' },
};

/** The secret's "?" and anything without its own colours: plain white. */
export const PLAIN: HeroColours = { f: 'paper', a: 'paper', plate: 'night' };

export interface HeroPaint {
  dr: Drawing;
  colours: HeroColours;
  /** the outline round the whole picture and between its parts */
  edge: string;
  /** how wide the outline is, in the icon's own units */
  outline: number;
  small: boolean;
  locked: boolean;
  /** how far below the picture its shadow falls on the plate, in the icon's own units; 0 for none */
  shadow?: number;
  /** the gloss across its top; off for a picture Hevalo holds, which is small beside him */
  gloss?: boolean;
}

/**
 * A swatch as a fill lit from the upper left, over each part's own box: a
 * bright top turning smoothly through the body into its shade, the way light
 * rolls over a glazed, rounded thing.
 */
function lit(dr: Drawing, cache: Map<string, string>, name: string, [top, body, shade]: readonly [string, string, string]): string {
  let id = cache.get(name);
  if (!id) {
    id = dr.id('h');
    dr.def(
      linearBox(
        id,
        [
          [0, mix(top, '#ffffff', 0.25)],
          [0.42, body],
          [1, shade],
        ],
        0.2,
        0,
        0.8,
        1,
      ),
    );
    cache.set(name, id);
  }
  return `url(#${id})`;
}

const raised = (part: Part): boolean => part.k === 'f' || part.k === 'a' || part.k === 'w' || part.k === 'c' || part.k === 'l';

/**
 * The picture's parts painted as the hero: the whole outlined once in `edge`
 * (the sticker's edge), each part cut from the next by a thin line of it, lit
 * from above in its own colours, with a gloss across the top. Locked, it is
 * the same outline in quiet grey.
 */
export function paintHero(parts: readonly Part[], p: HeroPaint): string {
  const { dr, colours, edge, outline, small, locked } = p;
  const shown = parts.filter((part) => !(small && 'fine' in part && part.fine));
  const tf = (part: Part): string => (part.tf ? ` transform="${part.tf}"` : '');
  const gap = small ? 1.5 : 0.8;

  // the silhouette, drawn once wide under everything: the sticker's edge
  const silhouette = shown
    .filter(raised)
    .map((part) =>
      part.k === 'l'
        ? `<path d="${part.d}" fill="none" stroke-width="${n2((part.w ?? 3) + outline * 2)}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`
        : `<path d="${part.d}" stroke-width="${n2(outline * 2)}" stroke-linejoin="round"${tf(part)}/>`,
    )
    .join('');

  if (locked) {
    const g = STONE.light;
    const body = shown
      .filter(raised)
      .map((part) =>
        part.k === 'l'
          ? `<path d="${part.d}" fill="none" stroke="${g}" stroke-width="${n2(part.w ?? 3)}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`
          : `<path d="${part.d}" fill="${g}"${tf(part)}/>`,
      )
      .join('');
    return `<g fill="${STONE.dark}" stroke="${STONE.dark}" opacity="0.6">${silhouette}</g><g opacity="0.9">${body}</g>`;
  }

  const cache = new Map<string, string>();
  const f = SWATCH[colours.f];
  const a = SWATCH[colours.a];
  const fillOf = (part: Part): string => {
    switch (part.k) {
      case 'f':
        return lit(dr, cache, 'f', f);
      case 'a':
        return lit(dr, cache, 'a', [a[1], a[1], a[2]]);
      case 'w':
        return lit(dr, cache, 'w', SWATCH.paper);
      case 'c': {
        const [top, foot] = ACCENT[part.c];
        return lit(dr, cache, `c-${part.c}`, [top, mix(top, foot, 0.6), foot]);
      }
      default:
        return 'none';
    }
  };

  const body = shown
    .map((part) => {
      switch (part.k) {
        case 'f':
        case 'a':
        case 'w':
        case 'c':
          // each part edged by a thin line of the outline, which is what cuts it from the next
          return `<path d="${part.d}" fill="${fillOf(part)}" stroke="${edge}" stroke-width="${n2(gap)}" stroke-linejoin="round"${tf(part)}/>`;
        case 'k':
          return `<path d="${part.d}" fill="${edge}"${tf(part)}/>`;
        case 'd':
          return `<path d="${part.d}" fill="none" stroke="${edge}" stroke-opacity="0.75" stroke-width="${n2((part.w ?? 1.6) * (small ? 1.3 : 1))}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`;
        case 'l': {
          const w = part.w ?? 3;
          const colour = part.c ? ACCENT[part.c][1] : f[1];
          return (
            `<path d="${part.d}" fill="none" stroke="${edge}" stroke-width="${n2(w + gap)}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>` +
            `<path d="${part.d}" fill="none" stroke="${colour}" stroke-width="${n2(w)}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`
          );
        }
        case 'h':
          return `<path d="${part.d}" fill="#ffffff" fill-opacity="${n2(part.o ?? 0.5)}"${tf(part)}/>`;
      }
      return '';
    })
    .join('');

  // a gloss over the top of the whole picture, kept to its silhouette
  let shine = '';
  if (!small && p.gloss !== false) {
    const clip = dr.id('c');
    const shapes = shown
      .filter((part) => part.k !== 'l' && raised(part))
      .map((part) => `<path d="${part.d}"${tf(part)}/>`)
      .join('');
    dr.def(`<clipPath id="${clip}">${shapes}</clipPath>`);
    const g = dr.id('g');
    dr.def(linearBox(g, [[0, '#ffffff', 0.75], [0.55, '#ffffff', 0.2], [1, '#ffffff', 0]]));
    shine = `<g clip-path="url(#${clip})"><ellipse cx="${n(-4)}" cy="${n(-15)}" rx="${n(26)}" ry="${n(13)}" fill="url(#${g})" transform="rotate(-12)"/></g>`;
  }
  const drop = p.shadow ? `<g fill="${edge}" stroke="${edge}" opacity="0.28" transform="translate(0 ${n2(p.shadow)})">${silhouette}</g>` : '';
  return `${drop}<g fill="${edge}" stroke="${edge}">${silhouette}</g>${body}${shine}`;
}
