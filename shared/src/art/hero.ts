/**
 * A badge's picture painted as the hero of it: the thing itself in its own
 * colours — a flame is orange, a book's pages are white, a gift is wrapped
 * in violet — big, glossy and outlined like a sticker, so it reads on the
 * badge's pale plate, over the page where it rises out of the plate, and on
 * the dark theme and the light one alike.
 *
 * The parts are the icons' own (icons.ts): the main body, its shaded face, a
 * named accent, snow, cut lines, stroked lines, highlights. Here the main
 * body and its face take the badge's own two swatches instead of the tier's
 * metal — the tier is told by the plate's band, the number and the light,
 * never by recolouring the picture.
 */
import type { Part } from './icons.js';
import { ACCENT, STONE } from './palette.js';
import type { Drawing } from './svg.js';
import { linearBox, n, n2 } from './svg.js';

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

/** The two swatches a badge's picture is painted in: its main body (`f`) and its shaded face (`a`). */
export interface HeroColours {
  f: SwatchName;
  a: SwatchName;
}

export const HERO: Readonly<Record<string, HeroColours>> = {
  ders: { f: 'paper', a: 'sky' },
  'peyven-min': { f: 'paper', a: 'paper' },
  bekemasi: { f: 'aqua', a: 'sky' },
  dubare: { f: 'green', a: 'green' },
  cirokbej: { f: 'paper', a: 'gold' },
  rewi: { f: 'orange', a: 'orange' },
  ferheng: { f: 'gold', a: 'rose' },
  agir: { f: 'orange', a: 'orange' },
  hefte: { f: 'paper', a: 'rose' },
  roj: { f: 'gold', a: 'orange' },
  pela: { f: 'aqua', a: 'sky' },
  vegera: { f: 'ink', a: 'ink' },
  peyvzan: { f: 'paper', a: 'paper' },
  helbestvan: { f: 'wood', a: 'wood' },
  bilez: { f: 'paper', a: 'violet' },
  rastnivis: { f: 'paper', a: 'paper' },
  guhdar: { f: 'paper', a: 'violet' },
  hemereng: { f: 'paper', a: 'paper' },
  dilpak: { f: 'gold', a: 'gold' },
  hilkiser: { f: 'mountain', a: 'ink' },
  cihgirti: { f: 'rose', a: 'paper' },
  heval: { f: 'rose', a: 'pink' },
  diyari: { f: 'violet', a: 'violet' },
  mevandar: { f: 'brass', a: 'brass' },
  newroz: { f: 'orange', a: 'wood' },
  'roja-ziman': { f: 'gold', a: 'ink' },
  'zimane-dayike': { f: 'paper', a: 'paper' },
  bihar: { f: 'pink', a: 'pink' },
  havin: { f: 'gold', a: 'orange' },
  payiz: { f: 'orange', a: 'orange' },
  zivistan: { f: 'ice', a: 'ice' },
  mehane: { f: 'moon', a: 'gold' },
  'tire-rast': { f: 'steel', a: 'steel' },
  'ji-nu-ve': { f: 'green', a: 'wood' },
  'kewe-ciye': { f: 'sand', a: 'wood' },
  'deste-zerin': { f: 'gold', a: 'brass' },
  'mevane-agir': { f: 'paper', a: 'brass' },
  'kaniya-zanine': { f: 'paper', a: 'cream' },
};

/** The secret's "?" and anything without its own colours: plain white. */
export const PLAIN: HeroColours = { f: 'paper', a: 'paper' };

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
}

/** A swatch as a fill lit from above, over each part's own box. */
function lit(dr: Drawing, cache: Map<string, string>, name: string, stops: readonly string[]): string {
  let id = cache.get(name);
  if (!id) {
    id = dr.id('h');
    dr.def(
      linearBox(
        id,
        stops.map((c, i) => [stops.length === 2 ? i : [0, 0.5, 1][i] ?? 1, c] as const),
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
  const gap = small ? 2.2 : 1.5;

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
        return lit(dr, cache, `f`, f);
      case 'a':
        return lit(dr, cache, `a`, [a[1], a[2]]);
      case 'w':
        return lit(dr, cache, 'w', SWATCH.paper);
      case 'c':
        return lit(dr, cache, `c-${part.c}`, ACCENT[part.c]);
      default:
        return 'none';
    }
  };
  const cut = (part: Part): string => `<path d="${part.d}" fill="none" stroke="${edge}" stroke-width="${n2(gap)}" stroke-linejoin="round"${tf(part)}/>`;

  const body = shown
    .map((part) => {
      switch (part.k) {
        case 'f':
        case 'a':
        case 'w':
        case 'c':
          return cut(part) + `<path d="${part.d}" fill="${fillOf(part)}"${tf(part)}/>`;
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
  if (!small) {
    const clip = dr.id('c');
    const shapes = shown
      .filter((part) => part.k !== 'l' && raised(part))
      .map((part) => `<path d="${part.d}"${tf(part)}/>`)
      .join('');
    dr.def(`<clipPath id="${clip}">${shapes}</clipPath>`);
    const g = dr.id('g');
    dr.def(linearBox(g, [[0, '#ffffff', 0.5], [1, '#ffffff', 0]]));
    shine = `<g clip-path="url(#${clip})"><ellipse cx="${n(-4)}" cy="${n(-15)}" rx="${n(26)}" ry="${n(13)}" fill="url(#${g})" transform="rotate(-12)"/></g>`;
  }
  const drop = p.shadow ? `<g fill="${edge}" stroke="${edge}" opacity="0.28" transform="translate(0 ${n2(p.shadow)})">${silhouette}</g>` : '';
  return `${drop}<g fill="${edge}" stroke="${edge}">${silhouette}</g>${body}${shine}`;
}
