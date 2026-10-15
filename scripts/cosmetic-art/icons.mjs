/**
 * The shop's icons: small Kurdish things with a lot of character, drawn the way
 * Hevalo the deer is drawn — soft round volumes, no hard outline, a glossy
 * highlight, a darker rim where the shape turns away from the light, and where
 * there is a face, the mascot's big dark eyes with two sparkles in each.
 *
 * They sit on a profile picture at about 40 pixels, so each is one bold
 * silhouette first and detail second: the detail is for the shop tile.
 *
 * `Ask` is Hevalo itself — the mascot's own picture, read from
 * web/public/mascot-deer.png, so the deer on a profile is exactly the deer in
 * the app.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eightPointStar, n, pt, steppedDiamond, tint } from './kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The mascot's ink: its eyes, nose and mouth. */
const EYE = '#3a2216';
const BLUSH = '#ff7d8e';

/**
 * A soft volume: the shape filled with light falling from the upper left,
 * a shadowed rim on the lower right, a lit rim on the upper left, and a fine
 * edge of its own darker colour so it holds together small.
 */
export function blob(cv, d, { base, light = tint(base, 0.45), dark = tint(base, -0.35), shadow = 0.45, rim = 0.35, edge = 0.5, at = [0.36, 0.3], depth = 22 }) {
  const g = cv.id('vol');
  cv.def(`<radialGradient id="${g}" cx="${n(at[0])}" cy="${n(at[1])}" r="0.85"><stop offset="0" stop-color="${light}"/><stop offset="0.55" stop-color="${base}"/><stop offset="1" stop-color="${dark}"/></radialGradient>`);
  const clip = cv.id('vc');
  cv.def(`<clipPath id="${clip}"><path d="${d}"/></clipPath>`);
  const soft = cv.id('vb');
  cv.def(`<filter id="${soft}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${n(depth * 0.45)}"/></filter>`);
  const shade = cv.id('vm');
  cv.def(`<mask id="${shade}" maskUnits="userSpaceOnUse" x="0" y="0" width="${cv.w}" height="${cv.h}"><rect width="${cv.w}" height="${cv.h}" fill="#fff"/><path d="${d}" transform="translate(${n(-depth * 0.7)} ${n(-depth)})" fill="#000" filter="url(#${soft})"/></mask>`);
  const lit = cv.id('vm');
  cv.def(`<mask id="${lit}" maskUnits="userSpaceOnUse" x="0" y="0" width="${cv.w}" height="${cv.h}"><rect width="${cv.w}" height="${cv.h}" fill="#fff"/><path d="${d}" transform="translate(${n(depth * 0.5)} ${n(depth * 0.6)})" fill="#000" filter="url(#${soft})"/></mask>`);
  cv.add(
    `<path d="${d}" fill="url(#${g})"/>` +
      `<g clip-path="url(#${clip})"><rect width="${cv.w}" height="${cv.h}" fill="${tint(dark, -0.2)}" fill-opacity="${n(shadow)}" mask="url(#${shade})"/>` +
      `<rect width="${cv.w}" height="${cv.h}" fill="#ffffff" fill-opacity="${n(rim)}" mask="url(#${lit})"/></g>` +
      `<path d="${d}" fill="none" stroke="${tint(dark, -0.25)}" stroke-opacity="${n(edge)}" stroke-width="3"/>`,
  );
}

/** A glossy highlight: a soft white ellipse. */
export function gloss(cv, cx, cy, rx, ry, rot = -30, opacity = 0.75) {
  const id = cv.id('gl');
  cv.def(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n(Math.min(rx, ry) * 0.25)}"/></filter>`);
  cv.add(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})" fill="#ffffff" fill-opacity="${n(opacity)}" filter="url(#${id})"/>`);
}

/**
 * A face in the mascot's manner, centred on (cx, cy), `s` across: big dark
 * eyes with a large and a small sparkle, rosy cheeks, a small mouth.
 * `eyes` is 'open', 'happy' (closed arcs) or 'sleep'; `mouth` is 'smile',
 * 'open' or 'cat'.
 */
export function face(cv, cx, cy, s, { eyes = 'open', mouth = 'smile', blush = BLUSH, ink = EYE, spread = 0.42 } = {}) {
  const ex = s * spread * 0.5;
  const out = [];
  for (const side of [-1, 1]) {
    const x = cx + side * ex;
    if (eyes === 'open') {
      out.push(`<ellipse cx="${n(x)}" cy="${n(cy)}" rx="${n(s * 0.085)}" ry="${n(s * 0.105)}" fill="${ink}"/>`);
      out.push(`<circle cx="${n(x - s * 0.03)}" cy="${n(cy - s * 0.04)}" r="${n(s * 0.034)}" fill="#ffffff"/>`);
      out.push(`<circle cx="${n(x + s * 0.03)}" cy="${n(cy + s * 0.035)}" r="${n(s * 0.016)}" fill="#ffffff" fill-opacity="0.9"/>`);
    } else {
      const up = eyes === 'happy' ? -1 : 1;
      out.push(`<path d="M${pt([x - s * 0.075, cy])} Q${pt([x, cy + up * s * 0.085])} ${pt([x + s * 0.075, cy])}" fill="none" stroke="${ink}" stroke-width="${n(s * 0.034)}" stroke-linecap="round"/>`);
    }
    out.push(`<ellipse cx="${n(cx + side * ex * 1.55)}" cy="${n(cy + s * 0.13)}" rx="${n(s * 0.085)}" ry="${n(s * 0.05)}" fill="${blush}" fill-opacity="0.55"/>`);
  }
  const my = cy + s * 0.14;
  if (mouth === 'smile') {
    out.push(`<path d="M${pt([cx - s * 0.06, my])} Q${pt([cx, my + s * 0.07])} ${pt([cx + s * 0.06, my])}" fill="none" stroke="${ink}" stroke-width="${n(s * 0.03)}" stroke-linecap="round"/>`);
  } else if (mouth === 'open') {
    out.push(`<path d="M${pt([cx - s * 0.065, my - s * 0.01])} Q${pt([cx, my + s * 0.1])} ${pt([cx + s * 0.065, my - s * 0.01])} Z" fill="${ink}"/><ellipse cx="${n(cx)}" cy="${n(my + s * 0.04)}" rx="${n(s * 0.03)}" ry="${n(s * 0.018)}" fill="#ff8a9a"/>`);
  } else {
    out.push(`<path d="M${pt([cx - s * 0.07, my])} Q${pt([cx - s * 0.035, my + s * 0.05])} ${pt([cx, my])} Q${pt([cx + s * 0.035, my + s * 0.05])} ${pt([cx + s * 0.07, my])}" fill="none" stroke="${ink}" stroke-width="${n(s * 0.028)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  cv.add(out.join(''));
}

/** A thick soft stroke: a stem, a handle, a ribbon. */
function cord(cv, d, { colour, width, dark = tint(colour, -0.3), light = tint(colour, 0.35) }) {
  cv.add(
    `<path d="${d}" fill="none" stroke="${dark}" stroke-width="${n(width + 6)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.55"/>` +
      `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${d}" fill="none" stroke="${light}" stroke-width="${n(width * 0.3)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.6" transform="translate(-${n(width * 0.15)} -${n(width * 0.18)})"/>`,
  );
}

/** A four-point sparkle. */
const sparkle = (x, y, r) =>
  `M${pt([x, y - r])} C${pt([x + r * 0.12, y - r * 0.12])} ${pt([x + r * 0.12, y - r * 0.12])} ${pt([x + r, y])} C${pt([x + r * 0.12, y + r * 0.12])} ${pt([x + r * 0.12, y + r * 0.12])} ${pt([x, y + r])} C${pt([x - r * 0.12, y + r * 0.12])} ${pt([x - r * 0.12, y + r * 0.12])} ${pt([x - r, y])} C${pt([x - r * 0.12, y - r * 0.12])} ${pt([x - r * 0.12, y - r * 0.12])} ${pt([x, y - r])} Z`;

function leaf(cv, x, y, len, angle, { base = '#4cb860' } = {}) {
  const a = (angle * Math.PI) / 180;
  const tip = [x + Math.cos(a) * len, y + Math.sin(a) * len];
  const nx = -Math.sin(a) * len * 0.32;
  const ny = Math.cos(a) * len * 0.32;
  const d = `M${pt([x, y])} C${pt([x + (tip[0] - x) * 0.3 + nx, y + (tip[1] - y) * 0.3 + ny])} ${pt([x + (tip[0] - x) * 0.75 + nx * 0.6, y + (tip[1] - y) * 0.75 + ny * 0.6])} ${pt(tip)} C${pt([x + (tip[0] - x) * 0.75 - nx * 0.6, y + (tip[1] - y) * 0.75 - ny * 0.6])} ${pt([x + (tip[0] - x) * 0.3 - nx, y + (tip[1] - y) * 0.3 - ny])} ${pt([x, y])} Z`;
  blob(cv, d, { base, depth: 10, shadow: 0.35, rim: 0.25 });
  cv.add(`<path d="M${pt([x, y])} L${pt([x + (tip[0] - x) * 0.8, y + (tip[1] - y) * 0.8])}" stroke="${tint(base, -0.25)}" stroke-width="3" stroke-linecap="round" stroke-opacity="0.6"/>`);
}

function tulipIcon(cv, { base, light, dark, eyes = 'open', mouth = 'smile' }) {
  cord(cv, 'M256 360 C256 400 254 440 256 488', { colour: '#3faa55', width: 18 });
  leaf(cv, 250, 470, 170, -150, { base: '#46b45c' });
  leaf(cv, 262, 452, 130, -32, { base: '#3ea455' });
  // the back petal, then the cup with its three tips
  blob(cv, 'M256 70 C300 100 318 150 300 210 L212 210 C194 150 212 100 256 70 Z', { base: dark, light: base, depth: 14 });
  const cup = 'M136 132 C176 140 214 170 228 214 C238 186 246 160 256 140 C266 160 274 186 284 214 C298 170 336 140 376 132 C392 210 384 300 342 344 C318 370 290 380 256 380 C222 380 194 370 170 344 C128 300 120 210 136 132 Z';
  blob(cv, cup, { base, light, dark, depth: 26 });
  gloss(cv, 184, 210, 18, 44, 10, 0.55);
  face(cv, 256, 286, 214, { eyes, mouth });
}

export const ICONS = [
  {
    key: 'hinar',
    ku: 'Hinar',
    en: 'Pomegranate',
    draw(cv) {
      leaf(cv, 300, 120, 120, -40, { base: '#4cb860' });
      blob(cv, 'M256 120 C366 120 440 196 440 298 C440 398 360 470 256 470 C152 470 72 398 72 298 C72 196 146 120 256 120 Z', { base: '#e2364a', light: '#ff8f8f', dark: '#a0172f', depth: 34 });
      // the crown that makes it a pomegranate
      blob(cv, 'M204 150 L194 78 L230 108 L256 58 L282 108 L318 78 L308 150 C284 166 228 166 204 150 Z', { base: '#c42540', light: '#f06a7a', dark: '#82102a', depth: 12 });
      gloss(cv, 168, 222, 30, 52, 35, 0.6);
      cv.add(`<circle cx="148" cy="300" r="9" fill="#ffffff" fill-opacity="0.55"/>`);
      face(cv, 262, 312, 270);
    },
  },
  {
    key: 'roj',
    ku: 'Roj',
    en: 'Sun',
    // the Kurdish sun: twenty-one rays
    draw(cv) {
      const rays = [];
      for (let i = 0; i < 21; i++) {
        const a = (i / 21) * Math.PI * 2 - Math.PI / 2;
        const hw = 0.11;
        const r0 = 150;
        const r1 = 236;
        const tip = [256 + Math.cos(a) * r1, 256 + Math.sin(a) * r1];
        const l = [256 + Math.cos(a - hw) * r0, 256 + Math.sin(a - hw) * r0];
        const r = [256 + Math.cos(a + hw) * r0, 256 + Math.sin(a + hw) * r0];
        const c1 = [256 + Math.cos(a - hw * 0.4) * (r1 - 18), 256 + Math.sin(a - hw * 0.4) * (r1 - 18)];
        const c2 = [256 + Math.cos(a + hw * 0.4) * (r1 - 18), 256 + Math.sin(a + hw * 0.4) * (r1 - 18)];
        rays.push(`M${pt(l)} Q${pt(c1)} ${pt(tip)} Q${pt(c2)} ${pt(r)} Z`);
      }
      blob(cv, rays.join(' '), { base: '#ffb21e', light: '#ffe07a', dark: '#e07a0c', depth: 10, shadow: 0.3, rim: 0.2 });
      blob(cv, 'M256 96 A160 160 0 1 1 255.9 96 Z', { base: '#ffd23f', light: '#fff3b0', dark: '#f0a01a', depth: 30 });
      gloss(cv, 196, 176, 34, 22, -35, 0.7);
      face(cv, 256, 262, 250, { eyes: 'happy', mouth: 'open' });
    },
  },
  {
    key: 'ciya',
    ku: 'Çiya',
    en: 'Mountain',
    // Agirî and the little one, the big one smiling
    draw(cv) {
      blob(cv, 'M250 440 C300 350 340 250 380 210 Q400 190 420 210 C450 250 480 350 500 440 Z', { base: '#9aa9e0', light: '#cdd7f8', dark: '#6574b4', depth: 16 });
      blob(cv, 'M392 214 Q400 196 420 210 C428 222 434 232 440 244 C428 238 420 250 410 240 C402 250 394 240 384 246 C386 234 388 224 392 214 Z', { base: '#ffffff', light: '#ffffff', dark: '#d6dff5', depth: 6, edge: 0.2 });
      const big = 'M30 446 C90 330 160 180 226 112 Q256 82 286 112 C352 180 420 330 470 446 Z';
      blob(cv, big, { base: '#8494d8', light: '#c2cdf6', dark: '#56619f', depth: 30 });
      blob(cv, 'M196 146 Q226 108 256 92 Q286 108 316 146 C300 140 292 162 274 152 C262 168 250 150 236 164 C224 150 212 162 196 146 Z', { base: '#ffffff', light: '#ffffff', dark: '#d2dcf4', depth: 8, edge: 0.25 });
      blob(cv, 'M20 446 C90 410 170 404 256 420 C342 404 422 410 492 446 C492 470 470 486 440 486 L72 486 C42 486 20 470 20 446 Z', { base: '#5cc070', light: '#a6e89a', dark: '#2f8a4a', depth: 12 });
      gloss(cv, 190, 210, 18, 50, 28, 0.45);
      face(cv, 252, 316, 236);
    },
  },
  {
    key: 'lale',
    ku: 'Lale',
    en: 'Tulip',
    draw(cv) {
      tulipIcon(cv, { base: '#ef3b4a', light: '#ff9a9a', dark: '#a8162e' });
    },
  },
  {
    key: 'laleya-mor',
    ku: 'Laleya Mor',
    en: 'Purple tulip',
    draw(cv) {
      tulipIcon(cv, { base: '#9a5ae0', light: '#d8b4ff', dark: '#5e2c9e', eyes: 'happy', mouth: 'cat' });
    },
  },
  {
    key: 'ask',
    ku: 'Ask',
    en: 'Deer',
    // Hevalo itself
    draw(cv) {
      const png = fs.readFileSync(path.join(ROOT, 'web', 'public', 'mascot-deer.png')).toString('base64');
      cv.add(`<image href="data:image/png;base64,${png}" x="14" y="30" width="484" height="453.75"/>`);
    },
  },
  {
    key: 'sterk',
    ku: 'Stêrk',
    en: 'Eight-point star',
    // the kilim's star, as a glossy enamel jewel
    draw(cv) {
      blob(cv, eightPointStar(256, 256, 236), { base: '#ffbe2e', light: '#ffe68a', dark: '#d9850c', depth: 24 });
      blob(cv, eightPointStar(256, 256, 160), { base: '#e8323f', light: '#ff8a8a', dark: '#a3142a', depth: 18 });
      blob(cv, eightPointStar(256, 256, 96), { base: '#fff3dc', light: '#ffffff', dark: '#e6cfa8', depth: 12 });
      blob(cv, steppedDiamond(256, 256, 96, 96, 4), { base: '#2b5fb8', light: '#7fb0ff', dark: '#173c80', depth: 10 });
      gloss(cv, 176, 150, 40, 18, -40, 0.6);
      cv.add(`<path d="${sparkle(420, 92, 30)} ${sparkle(456, 160, 14)}" fill="#ffffff"/>`);
    },
  },
  {
    key: 'caydan',
    ku: 'Çaydan',
    en: 'Teapot',
    // a round teapot with a kilim band round its belly, and steam with a heart in it
    draw(cv) {
      cord(cv, 'M370 238 C452 222 470 340 378 366', { colour: '#2fa7b8', width: 30 });
      blob(cv, 'M150 330 C104 318 76 270 54 198 C50 186 66 178 76 186 C98 240 124 270 160 280 Z', { base: '#2fa7b8', light: '#8fe6ee', dark: '#1a6b80', depth: 10 });
      const body = 'M256 172 C350 172 396 226 396 300 C396 384 334 440 256 440 C178 440 116 384 116 300 C116 226 162 172 256 172 Z';
      blob(cv, body, { base: '#36b2c2', light: '#a2eef4', dark: '#1a6b80', depth: 32 });
      // the kilim band
      const band = cv.id('band');
      cv.def(`<clipPath id="${band}"><path d="${body}"/></clipPath>`);
      const motifs = [];
      for (let x = 112; x < 410; x += 34) {
        motifs.push(`<path d="${steppedDiamond(x, 248, 26, 26, 3)}" fill="#ffd23f"/><path d="${steppedDiamond(x, 248, 10, 10, 1)}" fill="#c42540"/>`);
        motifs.push(`<path d="M${x + 17} 236 l6 12 l-6 12 l-6 -12 Z" fill="#fff3dc"/>`);
      }
      cv.add(`<g clip-path="url(#${band})"><rect x="100" y="224" width="320" height="48" fill="#c42540"/><rect x="100" y="224" width="320" height="5" fill="#ffd23f"/><rect x="100" y="267" width="320" height="5" fill="#ffd23f"/>${motifs.join('')}<rect x="100" y="224" width="320" height="48" fill="#000000" fill-opacity="0.08"/></g>`);
      blob(cv, 'M184 178 C190 140 322 140 328 178 C300 190 212 190 184 178 Z', { base: '#2fa7b8', light: '#8fe6ee', dark: '#1a6b80', depth: 8 });
      blob(cv, 'M256 104 A26 26 0 1 1 255.9 104 Z', { base: '#ffd23f', light: '#fff3b0', dark: '#e0960c', depth: 8 });
      gloss(cv, 180, 306, 22, 44, 20, 0.5);
      face(cv, 262, 340, 190);
      cv.add(`<path d="M206 92 C188 72 222 58 202 34 M308 88 C292 70 322 56 306 36" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-opacity="0.85"/>`);
      cv.add(`<path d="M256 58 C246 40 222 48 230 66 C236 78 256 88 256 88 C256 88 276 78 282 66 C290 48 266 40 256 58 Z" fill="#ff6b81"/>`);
    },
  },
  {
    key: 'saz',
    ku: 'Saz',
    en: 'Saz',
    // a saz, its bowl inlaid, coloured tassels hanging from the neck
    draw(cv) {
      // drawn upright, then turned so the long neck fits the square
      const inner = new InnerCanvas(cv);
      inner.blob('M256 238 C334 242 368 314 360 386 C352 456 306 496 256 496 C206 496 160 456 152 386 C144 314 178 242 256 238 Z', { base: '#c47a38', light: '#f2b56a', dark: '#7a4218', depth: 22 });
      inner.blob('M256 270 C312 274 336 326 330 384 C324 438 292 466 256 466 C220 466 188 438 182 384 C176 326 200 274 256 270 Z', { base: '#e8b36e', light: '#ffe0a8', dark: '#b97a3a', depth: 12, edge: 0.3 });
      inner.add(`<path d="${eightPointStar(256, 380, 30)}" fill="#7a4218"/><path d="${eightPointStar(256, 380, 20)}" fill="#ffd23f"/><circle cx="256" cy="380" r="9" fill="#3a1e0c"/>`);
      inner.add(`<path d="M208 300 L304 300 M200 456 L312 456" stroke="#7a4218" stroke-width="4" stroke-dasharray="6 6"/>`);
      inner.blob('M242 30 L270 30 L272 250 L240 250 Z', { base: '#7a4218', light: '#b97a3a', dark: '#4a2410', depth: 6 });
      inner.blob('M232 0 L280 0 L278 46 L234 46 Z', { base: '#6a3814', light: '#a8692c', dark: '#3a1e0c', depth: 6 });
      inner.add(`<path d="M244 70 H268 M244 100 H268 M244 128 H268 M244 154 H268 M244 178 H268 M244 200 H268 M244 220 H268" stroke="#ffe0a8" stroke-width="3.5" stroke-opacity="0.8"/>`);
      inner.add(`<path d="M250 10 V452 M256 10 V452 M262 10 V452" stroke="#fff6e0" stroke-width="2"/>`);
      inner.add(`<circle cx="226" cy="12" r="7" fill="#ffd23f"/><circle cx="226" cy="34" r="7" fill="#ffd23f"/><circle cx="286" cy="12" r="7" fill="#ffd23f"/><circle cx="286" cy="34" r="7" fill="#ffd23f"/>`);
      cv.add(`<g transform="rotate(36 256 256) translate(0 8) scale(0.94) translate(16 8)">${inner.out.join('')}</g>`);
      // tassels hang straight down from the top of the neck, the way they are tied on a saz
      const a = (36 * Math.PI) / 180;
      const place = ([x, y]) => {
        const px = (x + 16) * 0.94;
        const py = (y + 8) * 0.94 + 8;
        return [256 + (px - 256) * Math.cos(a) - (py - 256) * Math.sin(a), 256 + (px - 256) * Math.sin(a) + (py - 256) * Math.cos(a)];
      };
      const [jx, jy] = place([256, 64]);
      const tassel = (dx, drop, colour) => {
        const x = jx + dx;
        const y = jy + drop;
        cv.add(`<path d="M${pt([jx, jy])} Q${pt([x, jy + drop * 0.3])} ${pt([x, y - 44])}" stroke="#4a2410" stroke-width="3.5" fill="none"/>`);
        blob(cv, `M${pt([x - 11, y - 44])} C${pt([x - 18, y - 20])} ${pt([x - 16, y])} ${pt([x, y + 8])} C${pt([x + 16, y])} ${pt([x + 18, y - 20])} ${pt([x + 11, y - 44])} Z`, { base: colour, depth: 8, shadow: 0.35, rim: 0.3 });
        cv.add(`<circle cx="${n(x)}" cy="${n(y - 44)}" r="11" fill="${tint(colour, -0.2)}"/>`);
      };
      tassel(-44, 118, '#e8323f');
      tassel(-12, 140, '#ffc21a');
      tassel(20, 112, '#2fa84f');
    },
  },
  {
    key: 'kevok',
    ku: 'Kevok',
    en: 'Dove',
    // a plump white dove with a sprig in its beak
    draw(cv) {
      blob(cv, 'M150 300 L52 250 C44 246 38 256 44 262 L104 330 L70 360 C64 366 70 376 78 372 L160 336 Z', { base: '#e6eef8', light: '#ffffff', dark: '#a9bad4', depth: 12 });
      const body = 'M120 318 C120 228 196 178 270 178 C300 178 318 160 334 132 C350 104 384 94 412 108 C442 124 452 160 440 192 C432 214 418 226 402 232 C430 290 410 370 340 410 C280 444 196 436 156 400 C132 378 120 350 120 318 Z';
      blob(cv, body, { base: '#f2f6fc', light: '#ffffff', dark: '#a9bad4', depth: 34 });
      blob(cv, 'M178 300 C190 238 260 214 330 232 C320 300 280 352 214 366 C192 352 174 332 178 300 Z', { base: '#dfe8f5', light: '#ffffff', dark: '#9fb2d0', depth: 14 });
      cv.add(`<path d="M214 290 C238 270 270 262 300 266 M206 318 C230 300 262 292 290 296" stroke="#9fb2d0" stroke-width="7" stroke-linecap="round" fill="none"/>`);
      blob(cv, 'M436 156 L486 170 C492 172 492 180 486 182 L438 190 Z', { base: '#ffb43a', light: '#ffe08a', dark: '#d9850c', depth: 6 });
      cord(cv, 'M470 184 C468 228 452 262 426 290', { colour: '#4a9a3a', width: 7 });
      leaf(cv, 462, 220, 60, 10, { base: '#5cc070' });
      leaf(cv, 452, 252, 56, 170, { base: '#4cb860' });
      leaf(cv, 438, 276, 50, 30, { base: '#5cc070' });
      cv.add(`<ellipse cx="398" cy="152" rx="16" ry="19" fill="${EYE}"/><circle cx="393" cy="145" r="6" fill="#ffffff"/><circle cx="403" cy="159" r="3" fill="#ffffff"/>`);
      cv.add(`<ellipse cx="380" cy="190" rx="18" ry="10" fill="${BLUSH}" fill-opacity="0.55"/>`);
      gloss(cv, 226, 226, 40, 18, -20, 0.6);
    },
  },
  {
    key: 'genim',
    ku: 'Genim',
    en: 'Wheat',
    // a sheaf of three ears, tied with a red ribbon
    draw(cv) {
      const ear = (angle) => {
        const inner = new InnerCanvas(cv);
        inner.cordRaw('M256 470 L256 150', '#d9a441', 12);
        for (let i = 0; i < 6; i++) {
          const y = 176 + i * 38;
          inner.blob(`M256 ${y + 10} C228 ${y + 2} 216 ${y - 24} 224 ${y - 46} C248 ${y - 38} 260 ${y - 16} 256 ${y + 10} Z`, { base: '#f2c04a', light: '#ffe8a0', dark: '#c98a1e', depth: 8, edge: 0.4 });
          inner.blob(`M256 ${y + 10} C284 ${y + 2} 296 ${y - 24} 288 ${y - 46} C264 ${y - 38} 252 ${y - 16} 256 ${y + 10} Z`, { base: '#f2c04a', light: '#ffe8a0', dark: '#c98a1e', depth: 8, edge: 0.4 });
          inner.add(`<path d="M228 ${y - 40} L206 ${y - 78} M284 ${y - 40} L306 ${y - 78}" stroke="#e8b04a" stroke-width="3" stroke-linecap="round"/>`);
        }
        inner.blob('M256 146 C238 124 238 92 256 66 C274 92 274 124 256 146 Z', { base: '#f2c04a', light: '#ffe8a0', dark: '#c98a1e', depth: 8 });
        inner.add(`<path d="M256 70 L256 28" stroke="#e8b04a" stroke-width="3" stroke-linecap="round"/>`);
        return `<g transform="rotate(${angle} 256 470)">${inner.out.join('')}</g>`;
      };
      cv.add(`<g transform="translate(0 -6) scale(0.94) translate(16 16)">${ear(-26)}${ear(26)}${ear(0)}</g>`);
      // the ribbon: two loops and two tails
      blob(cv, 'M256 392 C222 356 166 360 172 392 C178 424 232 414 256 400 Z M256 392 C290 356 346 360 340 392 C334 424 280 414 256 400 Z', { base: '#e8323f', light: '#ff8a8a', dark: '#a3142a', depth: 12 });
      blob(cv, 'M248 402 L214 466 L232 462 L240 482 L258 410 Z M264 402 L298 466 L280 462 L272 482 L254 410 Z', { base: '#d42a38', light: '#ff7a7a', dark: '#8c1024', depth: 8 });
      blob(cv, 'M256 378 A20 20 0 1 1 255.9 378 Z', { base: '#f0414e', light: '#ff9a9a', dark: '#a3142a', depth: 8 });
    },
  },
  {
    key: 'kilim',
    ku: 'Kilîm',
    en: 'Kilim diamond',
    // a little kilim, its fringes out, the hooked lozenge in the middle
    draw(cv) {
      const rug = 'M96 112 L416 112 C424 112 428 116 428 124 L428 388 C428 396 424 400 416 400 L96 400 C88 400 84 396 84 388 L84 124 C84 116 88 112 96 112 Z';
      const fringe = [];
      for (let x = 100; x <= 412; x += 16) fringe.push(`M${x} 112 L${x} 80 M${x} 400 L${x} 432`);
      cv.add(`<g transform="rotate(-8 256 256)"><path d="${fringe.join(' ')}" stroke="#f3e6c8" stroke-width="7" stroke-linecap="round"/></g>`);
      const inner = new InnerCanvas(cv);
      inner.blob(rug, { base: '#c42a38', light: '#f06a6a', dark: '#82102a', depth: 26 });
      inner.add(`<rect x="100" y="128" width="312" height="256" rx="4" fill="none" stroke="#f3e6c8" stroke-width="8"/><rect x="114" y="142" width="284" height="228" rx="2" fill="none" stroke="#2a1418" stroke-width="5"/>`);
      const border = [];
      for (let x = 122; x < 400; x += 22) border.push(`<path d="M${x} 128 l11 8 l11 -8 Z" fill="#ffc21a"/><path d="M${x} 384 l11 -8 l11 8 Z" fill="#ffc21a"/>`);
      inner.add(border.join(''));
      inner.add(`<path d="${steppedDiamond(256, 256, 210, 200, 8)}" fill="#2a1418"/><path d="${steppedDiamond(256, 256, 190, 180, 7)}" fill="#1f5aa8"/><path d="${steppedDiamond(256, 256, 130, 124, 5)}" fill="#f3e6c8"/><path d="${steppedDiamond(256, 256, 104, 98, 4)}" fill="#2f8a4a"/><path d="${eightPointStar(256, 256, 34)}" fill="#ffc21a"/><path d="${eightPointStar(256, 256, 14)}" fill="#c42a38"/>`);
      for (const [x, y] of [[150, 190], [362, 190], [150, 322], [362, 322]]) inner.add(`<path d="${steppedDiamond(x, y, 34, 34, 2)}" fill="#ffc21a"/><path d="${steppedDiamond(x, y, 12, 12, 1)}" fill="#2a1418"/>`);
      inner.gloss(170, 150, 60, 14, -8, 0.35);
      cv.add(`<g transform="rotate(-8 256 256)">${inner.out.join('')}</g>`);
    },
  },
  {
    key: 'pet',
    ku: 'Pêta Newrozê',
    en: 'Newroz flame',
    // the Newroz fire, very pleased to be lit
    draw(cv) {
      cord(cv, 'M136 452 L376 410', { colour: '#9a5a32', width: 30 });
      cord(cv, 'M376 452 L136 410', { colour: '#7a4220', width: 30 });
      const flame = 'M256 436 C158 436 112 368 128 290 C140 232 186 206 196 140 C230 172 240 210 238 244 C270 204 290 146 270 52 C354 112 404 206 398 306 C394 392 344 436 256 436 Z';
      blob(cv, flame, { base: '#ff6a2a', light: '#ffb35a', dark: '#d7263d', depth: 30, at: [0.45, 0.6] });
      blob(cv, 'M256 424 C196 424 168 380 178 332 C186 292 218 276 224 236 C250 262 256 292 250 316 C276 290 294 252 288 198 C332 238 352 292 346 342 C340 398 306 424 256 424 Z', { base: '#ffb23a', light: '#ffe48a', dark: '#ff7a2a', depth: 18, edge: 0 });
      gloss(cv, 190, 300, 14, 40, 15, 0.45);
      face(cv, 262, 352, 180);
      cv.add(`<path d="${sparkle(110, 150, 24)} ${sparkle(410, 120, 18)} ${sparkle(150, 70, 12)}" fill="#ffd23f"/>`);
    },
  },
  {
    key: 'heyv',
    ku: 'Heyv',
    en: 'Crescent moon',
    // the crescent asleep, a star beside it
    draw(cv) {
      const moon = 'M300 52 C190 70 100 160 100 272 C100 390 198 474 320 474 C376 474 424 454 458 420 C434 428 410 432 386 432 C300 432 242 352 242 254 C242 170 264 102 300 52 Z';
      blob(cv, moon, { base: '#ffcf3f', light: '#fff1a8', dark: '#e8920c', depth: 26, at: [0.3, 0.4] });
      gloss(cv, 150, 210, 16, 54, 10, 0.55);
      // asleep: a closed eye, a cheek, a small smile, on the inner curve
      cv.add(`<path d="M168 290 Q186 308 206 292" fill="none" stroke="${EYE}" stroke-width="10" stroke-linecap="round"/><ellipse cx="166" cy="334" rx="24" ry="13" fill="${BLUSH}" fill-opacity="0.55"/><path d="M206 352 Q222 366 238 352" fill="none" stroke="${EYE}" stroke-width="8" stroke-linecap="round"/>`);
      blob(cv, sparkle(390, 190, 64), { base: '#ffd84a', light: '#fff4b0', dark: '#e8a010', depth: 10, shadow: 0.3 });
      cv.add(`<path d="${sparkle(440, 300, 24)} ${sparkle(330, 112, 18)}" fill="#ffe27a"/>`);
    },
  },
];

/**
 * Draws into a list instead of onto the canvas, so a group of shapes can be
 * turned as one — the defs still go to the real canvas.
 */
class InnerCanvas {
  constructor(cv) {
    this.cv = cv;
    this.out = [];
    this.w = cv.w;
    this.h = cv.h;
  }
  id(p) {
    return this.cv.id(p);
  }
  def(m) {
    this.cv.def(m);
  }
  add(m) {
    this.out.push(m);
  }
  blob(d, o) {
    blob(this, d, o);
  }
  gloss(...a) {
    gloss(this, ...a);
  }
  cordRaw(d, colour, width) {
    cord(this, d, { colour, width });
  }
}
