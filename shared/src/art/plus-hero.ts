/**
 * The picture at the top of the Hevalo+ page: Hevalo the deer on a hill under a warm night sky (an amber morning by day),
 * standing in a soft gold glow with a small gold crown above his antlers. Three layers, so the apps can move them apart
 * gently: the sky, the deer with his crown, and a few gold sparkles. Every layer is drawn on the same frame.
 */
import { characterArt, cropBody, headGroup } from '../characters/index.js';
import { Drawing, linearAt, n, prefixFor, radialAt, seeded } from './svg.js';

/** The hero's frame in drawing units: wide, as the page's top is. */
export const PLUS_HERO_VIEW = { w: 360, h: 240 } as const;

/** Where the deer stands and how tall he is drawn, in the hero's units. */
const DEER = { cx: 180, foot: 226, height: 176 } as const;

/** Where the crown floats, just over the antlers. */
const CROWN = { cx: 180, cy: 40, w: 34 } as const;

interface Scene {
  air: readonly [string, string, string];
  glow: readonly [string, number];
  stars: string | null;
  ridges: readonly [string, string];
  hill: string;
  hillLight: string;
}

/** By night a deep teal sky warming to umber at the hills; by day an amber morning over sandstone. */
const SCENES: Record<'light' | 'dark', Scene> = {
  dark: { air: ['#0b1a1e', '#1f2320', '#3b2b1b'], glow: ['#f0a845', 0.4], stars: '#fff1cf', ridges: ['#1d3436', '#162628'], hill: '#1f1a15', hillLight: '#2e261d' },
  light: { air: ['#f3e3c8', '#f8d9a8', '#ffeccb'], glow: ['#f5c04a', 0.5], stars: null, ridges: ['#e2c9a5', '#d3b58c'], hill: '#c9a477', hillLight: '#d6b588' },
};

/** The gold the crown and sparkles are painted in: a face, one shade step and one highlight. */
const GOLD = { face: '#f2b632', shade: '#c98a12', light: '#ffe08a', edge: '#8a5d0a' } as const;

const frame = (inner: string, title: string, id: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PLUS_HERO_VIEW.w} ${PLUS_HERO_VIEW.h}" preserveAspectRatio="xMidYMid slice"` +
  (title ? ` role="img" aria-labelledby="${id}t"><title id="${id}t">${title}</title>` : ' aria-hidden="true">') +
  `${inner}</svg>`;

/** The sky, its glow, the far ridges and the hill the deer stands on. */
export function plusHeroSky(opts: { dark?: boolean; idPrefix?: string } = {}): string {
  const scene = SCENES[opts.dark ? 'dark' : 'light'];
  const dr = new Drawing(prefixFor(opts.idPrefix, 'plus-sky', opts.dark));
  const { w, h } = PLUS_HERO_VIEW;
  const air = dr.id('a');
  dr.def(linearAt(air, [[0, scene.air[0]], [0.62, scene.air[1]], [1, scene.air[2]]], 0, 0, 0, h));
  dr.add(`<rect width="${w}" height="${h}" fill="url(#${air})"/>`);
  if (scene.stars) {
    const rand = seeded('plus-hero-stars');
    let dots = '';
    for (let i = 0; i < 34; i++) {
      const [x, y, r] = [rand() * w, 6 + rand() * 120, 0.5 + rand() * 0.9];
      dots += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${scene.stars}" opacity="${i % 3 === 0 ? '0.9' : '0.5'}"/>`;
    }
    dr.add(dots);
  }
  const glow = dr.id('g');
  dr.def(radialAt(glow, [[0, scene.glow[0], scene.glow[1]], [0.45, scene.glow[0], scene.glow[1] * 0.4], [1, scene.glow[0], 0]], DEER.cx, 120, 150));
  dr.add(`<rect width="${w}" height="${h}" fill="url(#${glow})"/>`);
  // Two far ridges, then the hill under his hooves, its crest catching the glow.
  dr.add(`<path d="M0 190L40 168L82 182L126 160L168 176L214 156L262 178L306 162L360 180V${h}H0Z" fill="${scene.ridges[0]}"/>`);
  dr.add(`<path d="M0 206C60 192 110 204 160 198C220 190 280 206 360 196V${h}H0Z" fill="${scene.ridges[1]}"/>`);
  dr.add(`<path d="M70 ${h}C96 222 140 214 180 214C220 214 264 222 290 ${h}Z" fill="${scene.hill}"/>`);
  dr.add(`<path d="M118 219C146 214 166 213 180 213C194 213 214 214 242 219C218 217 200 216 180 216C160 216 142 217 118 219Z" fill="${scene.hillLight}"/>`);
  const { defs, body } = dr.parts();
  return frame(defs + body, '', dr.prefix);
}

/** A flat crown: a band and three points, each point tipped with a round, one shade step and one highlight. */
function crown(cx: number, cy: number, w: number): string {
  const s = w / 34;
  const x = (v: number): string => n(cx + (v - 17) * s);
  const y = (v: number): string => n(cy + (v - 14) * s);
  const points = `M${x(2)} ${y(24)}L${x(1)} ${y(8)}L${x(10)} ${y(15)}L${x(17)} ${y(4)}L${x(24)} ${y(15)}L${x(33)} ${y(8)}L${x(32)} ${y(24)}Z`;
  const band = `M${x(2)} ${y(22)}H${x(32)}V${y(27)}Q${x(17)} ${y(29.5)} ${x(2)} ${y(27)}Z`;
  const tips = [
    [1, 8],
    [17, 4],
    [33, 8],
  ]
    .map(([px, py]) => `<circle cx="${x(px!)}" cy="${y(py!)}" r="${n(2.4 * s)}" fill="${GOLD.face}" stroke="${GOLD.edge}" stroke-width="${n(0.8 * s)}"/>`)
    .join('');
  return (
    `<path d="${points}" fill="${GOLD.face}" stroke="${GOLD.edge}" stroke-width="${n(0.9 * s)}" stroke-linejoin="round"/>` +
    `<path d="M${x(17)} ${y(6)}L${x(23)} ${y(16)}L${x(17)} ${y(22)}Z" fill="${GOLD.shade}" opacity="0.55"/>` +
    `<path d="${band}" fill="${GOLD.shade}" stroke="${GOLD.edge}" stroke-width="${n(0.9 * s)}" stroke-linejoin="round"/>` +
    `<path d="M${x(5)} ${y(23.6)}H${x(29)}" stroke="${GOLD.light}" stroke-width="${n(1.1 * s)}" stroke-linecap="round" opacity="0.8"/>` +
    tips +
    `<circle cx="${x(17)}" cy="${y(24.6)}" r="${n(1.6 * s)}" fill="#2f8f7c"/>`
  );
}

/** Hevalo standing on the hill, with the crown floating over his antlers. */
export function plusHeroFigure(opts: { idPrefix?: string } = {}): string {
  const art = characterArt('hevalo', opts.idPrefix ?? 'plus-hero');
  const box = art.viewBox;
  const scale = DEER.height / box.h;
  const left = DEER.cx - (box.w * scale) / 2;
  const top = DEER.foot - DEER.height;
  const deer =
    `<g transform="translate(${n(left)} ${n(top)}) scale(${Math.round(scale * 100000) / 100000})">` +
    `<g transform="translate(${n(-box.x)} ${n(-box.y)})">${cropBody(art, 'full')}${headGroup(art)}</g></g>`;
  return frame(deer + crown(CROWN.cx, CROWN.cy, CROWN.w), '', `${prefixFor(opts.idPrefix, 'plus-figure')}`);
}

/** A few four-pointed gold sparkles round the deer, which the apps may let twinkle. */
export function plusHeroSparkles(opts: { dark?: boolean } = {}): string {
  const spots: readonly (readonly [number, number, number])[] = [
    [118, 46, 7],
    [244, 58, 6],
    [96, 104, 4.5],
    [266, 112, 5],
    [146, 24, 3.5],
    [222, 26, 4],
  ];
  const fill = opts.dark ? '#ffd56a' : GOLD.face;
  const star = ([x, y, r]: readonly [number, number, number]): string =>
    `<path d="M${n(x)} ${n(y - r)}Q${n(x + r * 0.18)} ${n(y - r * 0.18)} ${n(x + r)} ${n(y)}Q${n(x + r * 0.18)} ${n(y + r * 0.18)} ${n(x)} ${n(y + r)}` +
    `Q${n(x - r * 0.18)} ${n(y + r * 0.18)} ${n(x - r)} ${n(y)}Q${n(x - r * 0.18)} ${n(y - r * 0.18)} ${n(x)} ${n(y - r)}Z" fill="${fill}"/>`;
  return frame(spots.map(star).join(''), '', 'plus-sparkles');
}
