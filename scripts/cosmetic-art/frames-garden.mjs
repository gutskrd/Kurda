/**
 * Frames that are grown rather than made (see frames.mjs): wreaths of the
 * flowers that come up in a Kurdish spring — daisies on a vine, wild roses,
 * violets, the narcissus of Newroz — and a ring of gold with the almond in
 * blossom on it.
 *
 * A wreath is a vine round the opening, leaves off it, and flowers set on it
 * where the frame says. Each flower is painted petal by petal, from the back
 * ones forward, and faces out of the ring.
 */
import { crescent } from './brush.mjs';
import { blade, linear, radial, spline } from './icons.mjs';
import { n, pt } from './kit.mjs';
import { C, INK, P, ring, round } from './ring.mjs';
import { Still } from './still.mjs';

const rad = (deg) => (deg * Math.PI) / 180;
const off = ([x, y], deg, len) => [x + Math.cos(rad(deg)) * len, y + Math.sin(rad(deg)) * len];

/**
 * Petals round `at`: `count` of them, `len` long and `wide` across, the first along `turn`; `paint(i, base, tip)`
 * gives each its colour. `from` is how far out from the middle they start, `line` the line round each.
 */
function petals(at, count, len, wide, turn, paint, { from = 0.1, shape = { at: 0.55, point: 0.4 }, line = 1.6, ink = INK } = {}) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = turn + (i * 360) / count;
    const base = off(at, a, len * from);
    const tip = off(at, a, len);
    out += `<path d="${blade(base, tip, wide, shape)}" fill="${paint(i, base, tip)}" stroke="${ink}" stroke-width="${line}" stroke-opacity="0.7" stroke-linejoin="round"/>`;
  }
  return out;
}

/** A daisy: a ring of narrow rays round a yellow eye. */
function daisy(cv, at, r, turn, { ray = ['#e6e0d0', '#ffffff'], eye = ['#ffe070', '#e8961a'] } = {}) {
  cv.add(petals(at, 13, r, r * 0.36, turn, (i, base, tip) => linear(cv, [[0, ray[0]], [0.5, ray[1]]], ...base, ...tip), { from: 0.2, shape: { at: 0.6, point: 0.15 }, line: 1.3 }));
  cv.add(`<circle cx="${n(at[0])}" cy="${n(at[1])}" r="${n(r * 0.3)}" fill="${radial(cv, [[0, eye[0]], [1, eye[1]]], at[0] - r * 0.08, at[1] - r * 0.08, r * 0.34)}" stroke="${INK}" stroke-width="1.3" stroke-opacity="0.7"/>`);
}

/** A narcissus: six broad pointed petals and the small cup in the middle of them. */
function narcissus(cv, at, r, turn, { petal = ['#e9e2c8', '#fffdf2'], cup = ['#ffc23a', '#ee7f16'] } = {}) {
  const paint = (i, base, tip) => linear(cv, [[0, petal[0]], [0.6, petal[1]]], ...base, ...tip);
  cv.add(petals(at, 3, r, r * 0.72, turn + 60, paint, { shape: { at: 0.5, point: 0.6 } }));
  cv.add(petals(at, 3, r, r * 0.72, turn, paint, { shape: { at: 0.5, point: 0.6 } }));
  cv.add(`<circle cx="${n(at[0])}" cy="${n(at[1])}" r="${n(r * 0.36)}" fill="${cup[1]}" stroke="${INK}" stroke-width="1.4" stroke-opacity="0.75"/>`);
  cv.add(`<circle cx="${n(at[0])}" cy="${n(at[1])}" r="${n(r * 0.22)}" fill="${cup[0]}"/><circle cx="${n(at[0])}" cy="${n(at[1])}" r="${n(r * 0.08)}" fill="#8a4a0e"/>`);
}

/** An open blossom of five round petals — a wild rose, the almond's flower — with its stamens. */
function blossom(cv, at, r, turn, { petal, heart, dots = '#f2c84a' }) {
  cv.add(petals(at, 5, r, r * 0.92, turn, () => radial(cv, [[0, petal[0]], [0.55, petal[1]], [1, petal[2] ?? petal[1]]], ...at, r, ...at), { from: 0.04, shape: { at: 0.62, point: 0.02 }, line: 1.5 }));
  cv.add(`<circle cx="${n(at[0])}" cy="${n(at[1])}" r="${n(r * 0.2)}" fill="${heart}"/>`);
  let stamens = '';
  for (let i = 0; i < 9; i++) {
    const [x, y] = off(at, turn + i * 40 + 12, r * (0.26 + (i % 3) * 0.06));
    stamens += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(Math.max(1.2, r * 0.05))}" fill="${dots}"/>`;
  }
  cv.add(stamens);
}

/** A rose, full: round petals in three rings, each smaller and deeper in colour than the one outside it. */
function rose(cv, at, r, turn, [outer, mid, deep, heart]) {
  const round5 = { at: 0.6, point: 0.02 };
  cv.add(petals(at, 5, r, r * 0.95, turn, () => outer, { from: 0.02, shape: round5 }));
  cv.add(petals(at, 5, r * 0.74, r * 0.74, turn + 36, () => mid, { from: 0.02, shape: round5, line: 1.3 }));
  cv.add(petals(at, 4, r * 0.48, r * 0.5, turn + 12, () => deep, { from: 0.02, shape: round5, line: 1.2 }));
  cv.add(`<circle cx="${n(at[0])}" cy="${n(at[1])}" r="${n(r * 0.16)}" fill="${heart}"/>`);
  cv.add(`<path d="M${pt(off(at, turn + 200, r * 0.2))} Q${pt(off(at, turn + 290, r * 0.26))} ${pt(off(at, turn + 20, r * 0.16))}" fill="none" stroke="${INK}" stroke-width="1.2" stroke-opacity="0.55" stroke-linecap="round"/>`);
}

/** A flower of many pointed petals, opened flat, as a violet-blue one of the high pastures: two rings of them. */
function starflower(cv, at, r, turn, [dark, mid, light, heart]) {
  const pointed = { at: 0.45, point: 0.85 };
  cv.add(petals(at, 7, r, r * 0.5, turn, (i, base, tip) => linear(cv, [[0, dark], [1, mid]], ...base, ...tip), { shape: pointed, line: 1.4, ink: '#120c2c' }));
  cv.add(petals(at, 6, r * 0.66, r * 0.42, turn + 25, (i, base, tip) => linear(cv, [[0, mid], [1, light]], ...base, ...tip), { shape: pointed, line: 1.2, ink: '#120c2c' }));
  cv.add(`<circle cx="${n(at[0])}" cy="${n(at[1])}" r="${n(r * 0.14)}" fill="${heart}"/>`);
}

/** A bud on its stalk, closed: from `at` out along `turn`. */
function bud(cv, at, len, turn, [foot, body, tip], sepal = '#5b8a42') {
  const end = off(at, turn, len);
  cv.add(`<path d="${blade(at, end, len * 0.56, { at: 0.42, point: 0.5 })}" fill="${linear(cv, [[0, foot], [0.5, body], [1, tip]], ...at, ...end)}" stroke="${INK}" stroke-width="1.5" stroke-opacity="0.7" stroke-linejoin="round"/>`);
  for (const side of [-1, 1]) cv.add(`<path d="${blade(at, off(at, turn + side * 24, len * 0.5), len * 0.2, { at: 0.4, point: 0.8 })}" fill="${sepal}" stroke="${INK}" stroke-width="1.1" stroke-opacity="0.6"/>`);
}

/** A leaf from `at` along `turn`: two greens down its length, a midrib. */
function leaf(cv, at, len, turn, [dark, light], { wide = 0.42, bend = 0.1, line = INK } = {}) {
  const tip = off(at, turn, len);
  cv.add(`<path d="${blade(at, tip, len * wide, { at: 0.45, point: 0.7, bend })}" fill="${linear(cv, [[0, dark], [1, light]], ...at, ...tip)}" stroke="${line}" stroke-width="1.5" stroke-opacity="0.65" stroke-linejoin="round"/>`);
  cv.add(`<path d="M${pt(off(at, turn, len * 0.1))} L${pt(off(at, turn, len * 0.8))}" stroke="${dark}" stroke-width="1.2" stroke-opacity="0.7" stroke-linecap="round"/>`);
}

/** A strand of vine round the opening at `r`, wandering `sway` in and out `turns` times, as a line to stroke. */
export function strand(r, sway, turns, phase) {
  const points = [];
  for (let a = 0; a < 360; a += 5) points.push(P(a, r + Math.sin(rad(a * turns + phase)) * sway));
  return spline(points);
}

/** Strands laid one over another, each a dark line with its colour down the middle of it. */
function vine(cv, strands, edge = '#2f4a22') {
  for (const [d, colour, width] of strands) {
    cv.add(`<path d="${d}" fill="none" stroke="${edge}" stroke-width="${width + 3}" stroke-linejoin="round"/>`);
    cv.add(`<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linejoin="round"/>`);
  }
}

export const GARDEN = [
  {
    key: 'bihar',
    ku: 'Xeleka Biharê',
    en: 'Spring vine',
    // a wreath as a child plaits one in spring: three thin green stems wound round each other, a leaf here and
    // there, daisies along one side, a bunch of white blossom and daisies low on the left, a tulip in bud
    // hanging its head at the upper right
    still(rnd) {
      const s = new Still(rnd);
      const greens = ['#4c7a36', '#8ab85c'];
      s.paint((cv) => {
        vine(cv, [
          [strand(187, 7, 3, 20), '#6f9d4d', 4.2],
          [strand(189, 8, 4, 200), '#8ab85c', 3.6],
          [strand(186, 6, 5, 90), '#5b8a42', 3.2],
        ]);
        for (const [a, r, turn, len] of [[-20, 192, 60, 26], [28, 190, 140, 24], [64, 194, 120, 26], [250, 190, -70, 24], [300, 194, 20, 24], [205, 196, 250, 22], [96, 196, 160, 24], [150, 204, 200, 30], [122, 206, 150, 30], [136, 214, 100, 28]]) leaf(cv, P(a, r), len, turn, greens);
      });
      s.paint((cv) => {
        // the tulip in bud at the upper right, hanging from its stalk, and a closed bud at the top
        cv.add(`<path d="M${pt(P(-62, 190))} Q${pt(P(-50, 214))} ${pt(P(-44, 196))}" fill="none" stroke="#5b8a42" stroke-width="3.2" stroke-linecap="round"/>`);
        bud(cv, P(-44, 198), 34, 78, ['#f6c9b6', '#f4a58e', '#e8846c']);
        bud(cv, P(-98, 196), 26, -120, ['#f3ecd2', '#fff9e6', '#f0e2b4']);
        // daisies down the left side, one at the right, one at the foot
        for (const [a, r, size] of [[196, 198, 21], [176, 196, 17], [222, 200, 16], [14, 196, 16], [96, 198, 15], [160, 220, 15]]) daisy(cv, P(a, r), size, a * 3);
        // the bunch low on the left: a white blossom, full, with two smaller ones by it
        blossom(cv, P(140, 204), 32, 20, { petal: ['#f6e7c6', '#fffdf4', '#f4efe0'], heart: '#e8b84a' });
        blossom(cv, P(118, 208), 19, 50, { petal: ['#f6dfae', '#fff4d2', '#f6e6b8'], heart: '#e8a43a' });
        daisy(cv, P(104, 214), 14, 10);
      });
      return s.done({ finish: { paint: 0.8, grain: 0.008, contrast: 0.05, saturation: 1.02, ink: { colour: '#2c3a22', width: 2.2 } } });
    },
  },
  {
    key: 'gul',
    ku: 'Xeleka Gulan',
    en: 'Rose wreath',
    // a wreath of wild roses: a green briar twisted round the face, its leaves small and pointed, and pink roses
    // all the way round it, open ones and ones still in bud turn and turn about
    still(rnd) {
      const s = new Still(rnd);
      const greens = ['#2f5a2a', '#6aa04a'];
      const pinks = ['#f7c6da', '#f29cc0', '#e06a9e', '#c2447c'];
      s.paint((cv) => {
        vine(cv, [
          [strand(188, 5, 6, 0), '#4f8a3c', 7],
          [strand(188, 5, 6, 180), '#6aa04a', 6],
        ], '#24401f');
        for (let i = 0; i < 22; i++) {
          const a = i * (360 / 22) + 6;
          leaf(cv, P(a, i % 2 ? 196 : 180), 22, a + (i % 2 ? 40 : 150), greens, { wide: 0.46 });
        }
      });
      s.paint((cv) => {
        for (let i = 0; i < 12; i++) {
          const a = -90 + i * 30;
          if (i % 2) {
            // a bud, lying along the briar
            bud(cv, P(a - 4, 196), 30, a + 70, ['#c2447c', '#e06a9e', '#f7c6da'], '#3f7a34');
            bud(cv, P(a + 6, 202), 24, a + 20, ['#c2447c', '#e88ab4', '#f7c6da'], '#3f7a34');
          } else {
            rose(cv, P(a, 200), 29, a + 20, pinks);
          }
        }
      });
      return s.done({ finish: { paint: 0.8, grain: 0.008, contrast: 0.06, saturation: 1.03, ink: { colour: '#2a1a22', width: 2.6 } } });
    },
  },
  {
    key: 'binefs',
    ku: 'Xeleka Binefşan',
    en: 'Violet wreath',
    // a wreath for the night: two thin dark hoops, crossing, and on them violet flowers with pointed petals in
    // bunches of two and three, a great bunch at the lower right, their leaves so dark they are nearly black
    still(rnd) {
      const s = new Still(rnd);
      const leaves = ['#1c1638', '#4c4290'];
      const violets = ['#2a1f66', '#5a48b8', '#8a78e0', '#f0d86a'];
      s.paint((cv) => {
        for (const [dx, dy, r] of [[-3, 2, 188], [4, -2, 191]]) cv.add(`<circle cx="${C + dx}" cy="${C + dy}" r="${r}" fill="none" stroke="#6a62a0" stroke-width="6.6"/><circle cx="${C + dx}" cy="${C + dy}" r="${r}" fill="none" stroke="#141026" stroke-width="4.6"/>`);
        for (let i = 0; i < 26; i++) {
          const a = i * (360 / 26);
          const out = i % 2 === 0;
          leaf(cv, P(a, out ? 194 : 184), 30 + (i % 3) * 5, a + (out ? 34 : 152), leaves, { wide: 0.4, bend: 0.14, line: '#6a62a0' });
        }
      });
      s.paint((cv) => {
        // bunches round the ring, and the great one at the lower right
        for (const [a, size] of [[-96, 22], [-78, 17], [-40, 22], [-22, 18], [2, 21], [150, 20], [168, 24], [196, 21], [226, 22], [244, 17], [112, 20], [96, 16]]) starflower(cv, P(a, 200), size, a * 2, violets);
        for (const [a, r, size] of [[58, 214, 20], [34, 206, 22], [70, 196, 21], [48, 198, 30]]) starflower(cv, P(a, r), size, a, violets);
      });
      return s.done({ finish: { paint: 0.8, grain: 0.01, contrast: 0.06, saturation: 1.04, ink: { colour: '#0e0a20', width: 2.4 } } });
    },
  },
  {
    key: 'nergiz',
    ku: 'Xeleka Nêrgizan',
    en: 'Narcissus wreath',
    // a wreath of yellow flowers, so full that nothing of what it is bound on shows: the narcissus that is picked
    // for Newroz, yellow daisies with dark eyes, and round yellow roses between them
    still(rnd) {
      const s = new Still(rnd);
      const yellows = ['#f6b21c', '#ffd23a', '#ffe36a', '#d98a12'];
      s.paint((cv) => {
        // a few leaves showing from under them
        for (let i = 0; i < 18; i++) leaf(cv, P(i * 20 + 8, 196), 50, i * 20 + (i % 2 ? 50 : 140), ['#3f6e2c', '#7aa84a'], { wide: 0.4 });
      });
      s.paint((cv) => {
        // the back row, then the ones that lie on them
        for (let i = 0; i < 10; i++) {
          const a = i * 36 + 18;
          rose(cv, P(a, 207), 34, a, ['#ffdc56', '#ffc82e', '#f6a81c', '#d98a12']);
        }
        for (let i = 0; i < 10; i++) {
          const a = i * 36;
          const at = P(a, 208 + (i % 3) * 3);
          if (i % 3 === 0) narcissus(cv, at, 40, a + 30, { petal: ['#f6b21c', '#ffe36a'], cup: ['#ffb02a', '#e8741a'] });
          else if (i % 3 === 1) daisy(cv, at, 38, a, { ray: ['#f2a81a', '#ffd84a'], eye: ['#7a4a16', '#3a2410'] });
          else narcissus(cv, at, 38, a, { petal: ['#f1e6b8', '#fffbe8'], cup: ['#ffc83a', '#ee8a16'] });
        }
        // (small ones tucked into the gaps, at the inside and at the outside)
        for (let i = 0; i < 10; i++) daisy(cv, P(i * 36 + 18, 182 + (i % 2) * 52), 14, i * 31, { ray: yellows.slice(0, 2), eye: ['#f08a1a', '#c2600e'] });
      });
      return s.done({ finish: { paint: 0.8, grain: 0.008, contrast: 0.06, saturation: 1.04, ink: { colour: '#3a2408', width: 2.6 } } });
    },
  },
  {
    key: 'behiv',
    ku: 'Xeleka Behîvê',
    en: 'Almond blossom',
    // a ring of pale gold with the almond in blossom on it, the first tree to flower: a slim band and a finer line
    // inside it, the band broken at the right by two square knots, as a kilim's border turns a corner, and a
    // branch laid up the left side with its white flowers and pink buds, a few petals let go
    still(rnd) {
      const s = new Still(rnd);
      const gold = (cv) => linear(cv, [[0, '#f6e6bc'], [0.5, '#dcc08a'], [1, '#b8955a']], 90, 90, 420, 420);
      const line = '#7a5a2a';
      s.paint((cv) => {
        const band = ring(198, 186);
        cv.add(`<path d="${band}" fill="${gold(cv)}" stroke="${line}" stroke-width="1.8"/>`);
        crescent(cv, band, [4, 5], { colour: '#fff8e0', opacity: 0.8, soft: 3 });
        cv.add(`<path d="${round(177)}" fill="none" stroke="${line}" stroke-width="4.4"/><path d="${round(177)}" fill="none" stroke="#ecd6a4" stroke-width="2.4"/>`);
        // the knots: a square of band turned in on itself, at the upper right and the lower right
        const knot = (a) => {
          const [x, y] = P(a, 206);
          const k = (dx, dy) => `${n(x + dx)} ${n(y + dy)}`;
          const d = `M${k(-26, -22)} H${n(x + 22)} V${n(y + 22)} H${n(x - 14)} V${n(y - 8)} H${n(x + 8)} V${n(y + 8)}`;
          cv.add(`<path d="${d}" fill="none" stroke="${line}" stroke-width="10.6" stroke-linejoin="miter"/><path d="${d}" fill="none" stroke="#e6cf9c" stroke-width="7"/><path d="${d}" fill="none" stroke="#fff8e0" stroke-width="2" stroke-opacity="0.7" transform="translate(-1.5 -1.5)"/>`);
        };
        knot(-38);
        knot(38);
        // a second, finer arc outside the band along the top
        cv.add(`<path d="M${pt(P(-150, 212))} A212 212 0 0 1 ${pt(P(-64, 212))}" fill="none" stroke="${line}" stroke-width="5.4" stroke-linecap="round"/><path d="M${pt(P(-150, 212))} A212 212 0 0 1 ${pt(P(-64, 212))}" fill="none" stroke="#e6cf9c" stroke-width="3" stroke-linecap="round"/>`);
      });
      s.paint((cv) => {
        // the branch up the left side, and its twigs
        const twig = (points, width) => `<path d="${spline(points, false)}" fill="none" stroke="#3a2418" stroke-width="${width + 2.4}" stroke-linecap="round"/><path d="${spline(points, false)}" fill="none" stroke="#7a5236" stroke-width="${width}" stroke-linecap="round"/>`;
        cv.add(twig([P(100, 206), P(128, 204), P(156, 198), P(186, 196), P(212, 200), P(236, 206)], 5));
        cv.add(twig([P(150, 200), P(146, 222), P(136, 238)], 3.4) + twig([P(206, 198), P(214, 218), P(226, 232)], 3.2) + twig([P(118, 204), P(108, 224)], 3));
        const white = { petal: ['#f9d6de', '#fffafa', '#fdeef0'], heart: '#e8869c', dots: '#f6d86a' };
        for (const [a, r, len, turn] of [[236, 212, 22, 250], [226, 236, 18, 200], [108, 228, 18, 100], [170, 214, 16, 170], [92, 210, 18, 60]]) bud(cv, P(a, r), len, turn, ['#e88aa2', '#f6b8c6', '#fde4ea'], '#8a5a3e');
        for (const [a, r, len, turn] of [[190, 206, 26, 230], [128, 214, 24, 80], [222, 204, 22, 290]]) leaf(cv, P(a, r), len, turn, ['#5b8a42', '#a8cf7c'], { wide: 0.4 });
        blossom(cv, P(142, 222), 34, 12, white);
        blossom(cv, P(164, 204), 25, 50, white);
        blossom(cv, P(200, 208), 28, 30, white);
        blossom(cv, P(118, 208), 21, 0, white);
        blossom(cv, P(60, 208), 17, 20, white);
        // petals let go, turning as they fall
        for (const [a, r, turn] of [[-96, 204, 20], [-20, 226, 110], [20, 232, 70], [-128, 228, 150], [82, 232, 40]]) {
          const at = P(a, r);
          cv.add(`<path d="${blade(at, off(at, turn, 20), 11, { at: 0.55, point: 0.3, bend: 0.2 })}" fill="${linear(cv, [[0, '#f6b8c6'], [1, '#fff4f6']], ...at, ...off(at, turn, 20))}" stroke="#b8687e" stroke-width="1.1" stroke-opacity="0.6"/>`);
        }
      });
      return s.done({ finish: { paint: 0.8, grain: 0.008, contrast: 0.05, saturation: 1.02, ink: { colour: '#3a2a1a', width: 2.2 } } });
    },
  },
];
