/**
 * The shop's frames: a ring to wear round a profile picture, painted as the
 * icons are (still.mjs, brush.mjs) and of the same Kurdish things — a wreath
 * of tulips, of wheat, a band of kilim, the sun's rays, the night sky, the
 * fire of Newroz — so that an icon and a frame bought in the same shop look
 * as if one hand made them.
 *
 * Every frame is a square with nothing in its middle. The face shows through
 * a round opening two thirds of the square across, the share a season frame
 * leaves (shared SEASON_FRAME_INNER), so that both kinds are laid round a
 * face the same way and at the same size. Nothing is painted inside the
 * opening: an ornament may lean out of the ring as far as the square's edge,
 * never in over the face.
 *
 * A frame is seen at about a hundred pixels on a profile and at forty in a
 * list, so each is one clear ring of one clear colour first, and its detail
 * is for the shop tile.
 */
import { crescent, softly, strokes, within } from './brush.mjs';
import { blade, linear, radial, spline } from './icons.mjs';
import { n, pt } from './kit.mjs';
import { Still } from './still.mjs';

const C = 256;
/** The opening's radius: a third of the square. */
export const FRAME_OPENING = 512 / 3;
const RI = 171;

/** The point `r` out from the middle at `deg` (0 to the right, 90 down). */
const P = (deg, r) => [C + Math.cos((deg * Math.PI) / 180) * r, C + Math.sin((deg * Math.PI) / 180) * r];

/** A ring from `ro` in to `ri`, its middle a hole. */
const ring = (ro, ri = RI) =>
  `M${C - ro} ${C} A${ro} ${ro} 0 1 0 ${C + ro} ${C} A${ro} ${ro} 0 1 0 ${C - ro} ${C} Z M${C - ri} ${C} A${ri} ${ri} 0 1 1 ${C + ri} ${C} A${ri} ${ri} 0 1 1 ${C - ri} ${C} Z`;

/** A circle's line at `r`, for a stroke. */
const round = (r) => `M${C - r} ${C} A${r} ${r} 0 1 0 ${C + r} ${C} A${r} ${r} 0 1 0 ${C - r} ${C} Z`;

/** A shape given in the ring's own terms — points as [degrees, radius] — as an outline. */
const polar = (points) => `M${points.map(([a, r]) => pt(P(a, r))).join(' L')} Z`;

/** A star of `points` points at (x, y), `r` to its tips and `inner` of that to its waist. */
function star([x, y], r, points = 4, inner = 0.38, turn = -90) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const a = ((turn + (i * 180) / points) * Math.PI) / 180;
    const rr = i % 2 ? r * inner : r;
    out.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  return `M${out.map(pt).join(' L')} Z`;
}

/** The way a ring's surface runs at (x, y): round it. */
const tangent = (x, y) => (Math.atan2(y - C, x - C) * 180) / Math.PI + 90;

const BOX = [0, 0, 512, 512];
const INK = '#2a1712';

export const FRAMES = [
  {
    key: 'lale',
    ku: 'Xeleka Laleyan',
    en: 'Tulip wreath',
    // a wreath of red tulips: a green vine round the face, leaves lying along it the way it turns, and tulips
    // standing out from it all the way round, a little open, their red deepest at the foot
    still(rnd) {
      const s = new Still(rnd);
      const vine = ring(191, 175);
      s.paint((cv) => {
        // the leaves first, under the vine: each from the vine out and on round it
        let leaves = '';
        for (let i = 0; i < 24; i++) {
          const a = i * 15 + 4;
          const d = blade(P(a, 186), P(a + 13, 222 + (i % 2) * 8), 22, { at: 0.45, point: 0.7, bend: 0.08 });
          leaves += `<path d="${d}" fill="${linear(cv, [[0, '#33592c'], [1, i % 2 ? '#6c9a4c' : '#55843e']], ...P(a, 186), ...P(a + 13, 226))}" stroke="${INK}" stroke-width="2" stroke-opacity="0.75" stroke-linejoin="round"/>`;
          leaves += `<path d="M${pt(P(a + 1, 190))} L${pt(P(a + 11, 218 + (i % 2) * 6))}" stroke="#2c4c26" stroke-width="1.6" stroke-opacity="0.6" stroke-linecap="round"/>`;
        }
        cv.add(leaves);
        cv.add(`<path d="${vine}" fill="${linear(cv, [[0, '#6f9d4d'], [0.5, '#4a7a38'], [1, '#2f5429']], 90, 90, 420, 420)}" stroke="${INK}" stroke-width="2.6"/>`);
        crescent(cv, vine, [5, 6], { colour: '#a9cf7c', opacity: 0.6, soft: 4 });
        strokes(cv, rnd, vine, BOX, { count: 500, colours: ['#2f5429', '#86b25c', '#5b8a42'], flow: tangent, length: 14, width: 2, opacity: [0.08, 0.22] });
      });
      // the tulips: one at the top, three together at the foot, the rest between
      s.paint((cv) => {
        const tulip = (a, size = 1) => {
          const [foot, tip] = [188, 188 + 56 * size];
          const petal = (da, dr, w, colours) => {
            const d = blade(P(a + da * 0.4, foot + 2), P(a + da, tip - dr), w * size, { at: 0.5, point: 0.55, bend: da * 0.012 });
            return `<path d="${d}" fill="${linear(cv, colours.map((c, i) => [i / (colours.length - 1), c]), ...P(a, foot), ...P(a, tip))}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`;
          };
          // (the two behind, their tips showing; the two at the sides; the one in front)
          cv.add(petal(-9, 4, 26, ['#7a1210', '#b81e1a', '#d8382e']) + petal(9, 4, 26, ['#7a1210', '#b81e1a', '#d8382e']));
          cv.add(petal(-5, 8, 30, ['#8e1612', '#d42a22', '#ef5a48']) + petal(5, 8, 30, ['#8e1612', '#d42a22', '#ef5a48']));
          cv.add(petal(0, 2, 30, ['#9a1a14', '#e0352a', '#f6705c']));
          cv.add(`<path d="M${pt(P(a - 1.2, foot + 14))} L${pt(P(a - 0.6, tip - 16))}" stroke="#ffb0a0" stroke-width="2.4" stroke-opacity="0.6" stroke-linecap="round"/>`);
        };
        for (const a of [-90, -45, -135, 0, 180, 45, 135]) tulip(a);
        tulip(72, 0.9);
        tulip(108, 0.9);
        tulip(90, 1.08);
      });
      return s.done({ finish: { paint: 1.2, grain: 0.012, contrast: 0.08, saturation: 1, ink: true } });
    },
  },
  {
    key: 'genim',
    ku: 'Xeleka Genim',
    en: 'Wheat wreath',
    // two ears of ripe wheat bent round the face from the foot to meet at the top, grain upon grain, each with its
    // long awn, and tied where they cross with a red ribbon
    still(rnd) {
      const s = new Still(rnd);
      s.paint((cv) => {
        const stem = (from, to) => {
          const points = [];
          const step = from < to ? 4 : -4;
          for (let a = from; step > 0 ? a <= to : a >= to; a += step) points.push(P(a, 187));
          return spline(points, false);
        };
        // (the right ear runs up from the foot by the right, the left one by the left)
        const ears = [
          { from: 78, to: -82, turn: -1 },
          { from: 102, to: 262, turn: 1 },
        ];
        for (const ear of ears) {
          cv.add(`<path d="${stem(ear.from, ear.to)}" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`);
          cv.add(`<path d="${stem(ear.from, ear.to)}" fill="none" stroke="#b9862e" stroke-width="5" stroke-linecap="round"/>`);
        }
        // the grains: in pairs up each ear, one outside the stem and one inside it, their tips on up the ear
        for (const ear of ears) {
          const count = 17;
          for (let i = 0; i < count; i++) {
            const a = ear.from + ((ear.to - ear.from) * (i + 0.6)) / count;
            const along = ear.turn * 9.5;
            for (const side of [1, -1]) {
              const base = P(a, 187 + side * 3);
              const tip = P(a + along, side > 0 ? 220 : 173);
              // (the awn first, a fine line on beyond the grain)
              const awn = P(a + along * 2.1, side > 0 ? 240 + rnd() * 8 : 172);
              if (side > 0) cv.add(`<path d="M${pt(tip)} L${pt(awn)}" stroke="#c99a3a" stroke-width="1.8" stroke-linecap="round" stroke-opacity="0.9"/>`);
              const d = blade(base, tip, side > 0 ? 17 : 12, { at: 0.5, point: 0.5 });
              cv.add(`<path d="${d}" fill="${linear(cv, [[0, '#a8741f'], [0.5, '#e3b248'], [1, '#f7dc86']], ...base, ...tip)}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`);
              cv.add(`<path d="M${pt(base)} L${pt(tip)}" stroke="#8a5c16" stroke-width="1.2" stroke-opacity="0.55"/>`);
            }
          }
        }
      });
      // the ribbon: a bow at the foot, its two ends hanging
      s.paint((cv) => {
        const red = (x0, x1) => linear(cv, [[0, '#d9483a'], [0.5, '#b82a22'], [1, '#7e1612']], x0, 430, x1, 480);
        const loop = (side) => `M256 446 C${256 + side * 26} ${420} ${256 + side * 64} ${422} ${256 + side * 58} ${446} C${256 + side * 62} ${470} ${256 + side * 28} ${468} 256 452 Z`;
        const end = (side) => `M256 452 Q${256 + side * 18} ${474} ${256 + side * 34} ${504} L${256 + side * 20} ${498} L${256 + side * 12} ${510} Q${256 + side * 8} ${478} 250 456 Z`;
        for (const side of [-1, 1]) cv.add(`<path d="${end(side)}" fill="${red(200, 312)}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`);
        for (const side of [-1, 1]) {
          cv.add(`<path d="${loop(side)}" fill="${red(256, 256 + side * 60)}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`);
          cv.add(`<path d="M${256 + side * 16} 440 Q${256 + side * 40} 430 ${256 + side * 52} 442" fill="none" stroke="#f08a78" stroke-width="3" stroke-opacity="0.7" stroke-linecap="round"/>`);
        }
        cv.add(`<rect x="246" y="438" width="20" height="20" rx="6" fill="#c4352a" stroke="${INK}" stroke-width="2.6"/>`);
      });
      return s.done({ finish: { paint: 1, grain: 0.012, contrast: 0.08, saturation: 1, ink: true } });
    },
  },
  {
    key: 'kilim',
    ku: 'Xeleka Kilîmê',
    en: 'Kilim band',
    // a band of kilim sewn into a ring: deep red, a row of stepped diamonds round it in indigo and gold, small
    // green and cream teeth along both selvedges, and its fringe standing out all round
    still(rnd) {
      const s = new Still(rnd);
      const band = ring(207, RI);
      s.paint((cv) => {
        // the fringe, under the band
        let fringe = '';
        for (let a = 0; a < 360; a += 3) fringe += `<path d="M${pt(P(a, 204))} L${pt(P(a + (rnd() - 0.5) * 2.4, 221 + rnd() * 5))}" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/>`;
        for (let a = 0; a < 360; a += 3) fringe += `<path d="M${pt(P(a, 204))} L${pt(P(a + (rnd() - 0.5) * 2.4, 220 + rnd() * 5))}" stroke="${a % 9 === 0 ? '#e6cf9c' : '#f3e6c6'}" stroke-width="2.6" stroke-linecap="round"/>`;
        cv.add(fringe);
        cv.add(`<path d="${band}" fill="${linear(cv, [[0, '#a92a22'], [0.5, '#8a1c18'], [1, '#6c1412']], 80, 80, 430, 430)}" stroke="${INK}" stroke-width="2.6"/>`);
        // the selvedges: a cream line and an indigo one, inside and out
        for (const [r, colour, w] of [[201.5, '#f1e2c2', 3.4], [176.5, '#f1e2c2', 3.4], [196.5, '#26346e', 2.6], [181.5, '#26346e', 2.6]]) cv.add(`<path d="${round(r)}" fill="none" stroke="${colour}" stroke-width="${w}"/>`);
        // the diamonds, stepped as a weave steps them, and between each pair two teeth
        const count = 16;
        for (let i = 0; i < count; i++) {
          const a = (i * 360) / count;
          const colour = i % 2 ? '#e0a52e' : '#26346e';
          const steps = [[0, 7.6], [1.5, 7.6], [1.5, 5], [3, 5], [3, 2.4], [4.6, 2.4], [4.6, -2.4], [3, -2.4], [3, -5], [1.5, -5], [1.5, -7.6], [-1.5, -7.6], [-1.5, -5], [-3, -5], [-3, -2.4], [-4.6, -2.4], [-4.6, 2.4], [-3, 2.4], [-3, 5], [-1.5, 5], [-1.5, 7.6]];
          cv.add(`<path d="${polar(steps.map(([da, dr]) => [a + da, 189 + dr]))}" fill="${colour}"/>`);
          cv.add(`<path d="${polar([[a, 193], [a + 1.6, 189], [a, 185], [a - 1.6, 189]])}" fill="${i % 2 ? '#8a1c18' : '#f1e2c2'}"/>`);
          const b = a + 180 / count;
          cv.add(`<path d="${polar([[b - 2.6, 195], [b + 2.6, 195], [b, 190.5]])}" fill="#2f6b4f"/>`);
          cv.add(`<path d="${polar([[b - 2.6, 183], [b + 2.6, 183], [b, 187.5]])}" fill="#f1e2c2"/>`);
        }
        // the wool: its threads running round, and the light on the roll of the band
        strokes(cv, rnd, band, BOX, { count: 1600, colours: ['#5a100e', '#c2443a', '#f1e2c2', '#26346e'], flow: tangent, length: 9, width: 1.6, opacity: [0.05, 0.16] });
        crescent(cv, band, [6, 8], { colour: '#ffd9c0', opacity: 0.22, soft: 6 });
        crescent(cv, band, [-6, -8], { colour: '#2a0806', opacity: 0.3, soft: 6 });
      });
      return s.done({ finish: { paint: 1, grain: 0.014, contrast: 0.08, saturation: 1, ink: true } });
    },
  },
  {
    key: 'roj',
    ku: 'Xeleka Rojê',
    en: 'Sun rays',
    // the sun of the flag as a ring: a band of gold round the face and its twenty-one rays standing out from it,
    // a shorter ray between each two, warm light round all of it
    still(rnd) {
      const s = new Still(rnd);
      const band = ring(199, RI);
      // (its light is a ring too: a glow laid as a disc would lie over the face)
      const gold = (cv) => radial(cv, [[0.66, '#fff6c2'], [0.8, '#f7cf4a'], [1, '#d98f1a']], C, C, 252);
      s.paint((cv) => {
        cv.add(`<path d="${ring(254)}" fill="${radial(cv, [[0.7, '#ffd24a', 0.5], [1, '#ffb020', 0]], C, C, 254)}"/>`);
      });
      s.paint((cv) => {
        const ray = (a, half, outer) => polar([[a - half, 194], [a, outer], [a + half, 194]]);
        let rays = '';
        for (let i = 0; i < 21; i++) {
          const a = -90 + (i * 360) / 21;
          rays += `<path d="${ray(a + 180 / 21, 3.4, 224)}" fill="${gold(cv)}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`;
        }
        for (let i = 0; i < 21; i++) {
          const a = -90 + (i * 360) / 21;
          rays += `<path d="${ray(a, 5.2, 250)}" fill="${gold(cv)}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`;
          rays += `<path d="M${pt(P(a - 1.6, 200))} L${pt(P(a - 0.4, 240))}" stroke="#fffbe0" stroke-width="2" stroke-opacity="0.8" stroke-linecap="round"/>`;
        }
        cv.add(rays);
        // the band: gold, rounded — light along its upper left, deep along its lower right, a bright lip at the face
        cv.add(`<path d="${band}" fill="${linear(cv, [[0, '#fff3ad'], [0.45, '#f4c23a'], [1, '#c2801a']], 90, 90, 420, 420)}" stroke="${INK}" stroke-width="2.6"/>`);
        crescent(cv, band, [7, 9], { colour: '#fffbe0', opacity: 0.75, soft: 5 });
        crescent(cv, band, [-7, -9], { colour: '#8a4c0a', opacity: 0.45, soft: 6 });
        cv.add(`<path d="${round(176)}" fill="none" stroke="#fff6c2" stroke-width="2.4" stroke-opacity="0.9"/>`);
        // (beads of gold round its middle)
        let beads = '';
        for (let a = 0; a < 360; a += 360 / 42) beads += `<circle cx="${n(P(a, 187)[0])}" cy="${n(P(a, 187)[1])}" r="2.6" fill="#fff3ad" stroke="#a8680e" stroke-width="1"/>`;
        cv.add(beads);
        strokes(cv, rnd, band, BOX, { count: 500, colours: ['#fffbe0', '#e0a02a', '#b8741a'], flow: tangent, length: 12, width: 1.8, opacity: [0.05, 0.18] });
      });
      return s.done({ finish: { paint: 1, grain: 0.01, contrast: 0.08, saturation: 1.02, ink: true } });
    },
  },
  {
    key: 'sev',
    ku: 'Xeleka Şevê',
    en: 'Night sky',
    // the night sky as a ring: deep blue, edged in gold, sown with stars, the new moon riding on it at the upper
    // right and a few stars loose beside it, a little light round all of it
    still(rnd) {
      const s = new Still(rnd);
      const band = ring(205, RI);
      s.paint((cv) => {
        cv.add(`<path d="${ring(250)}" fill="${radial(cv, [[0.72, '#6f8cff', 0.42], [1, '#5a6cf0', 0]], C, C, 250)}"/>`);
      });
      s.paint((cv) => {
        cv.add(`<path d="${band}" fill="${linear(cv, [[0, '#33449e'], [0.5, '#1c2460'], [1, '#101440']], 90, 90, 420, 420)}" stroke="${INK}" stroke-width="2.6"/>`);
        // (the paler wash of the Milky Way across it, and the deep of the sky under it)
        cv.add(`<g clip-path="${within(cv, band)}"><ellipse cx="150" cy="150" rx="150" ry="60" transform="rotate(-38 150 150)" fill="#8aa0ff" fill-opacity="0.32" filter="${softly(cv, 16)}"/><ellipse cx="380" cy="400" rx="130" ry="70" fill="#070a26" fill-opacity="0.5" filter="${softly(cv, 18)}"/></g>`);
        for (const r of [201.5, 174.5]) cv.add(`<path d="${round(r)}" fill="none" stroke="#e8c66a" stroke-width="3"/>`);
        // the stars sown on it: small ones everywhere, a few larger with four points
        let stars = '';
        for (let i = 0; i < 46; i++) {
          const at = P(rnd() * 360, 180 + rnd() * 16);
          stars += `<circle cx="${n(at[0])}" cy="${n(at[1])}" r="${n(0.9 + rnd() * 1.3)}" fill="#fff8dc" fill-opacity="${n(0.6 + rnd() * 0.4)}"/>`;
        }
        for (const a of [200, 236, 262, 300, 14, 52, 96, 128, 164]) stars += `<path d="${star(P(a, 188), 7.5)}" fill="#ffe9a0"/>`;
        cv.add(stars);
      });
      // the moon, and the loose stars
      s.paint((cv) => {
        const [mx, my] = P(-48, 214);
        cv.add(`<circle cx="${n(mx)}" cy="${n(my)}" r="46" fill="${radial(cv, [[0.5, '#ffe9a0', 0.45], [1, '#ffe9a0', 0]], mx, my, 46)}"/>`);
        const moon = `M${n(mx - 6)} ${n(my - 34)} A34 34 0 1 1 ${n(mx - 30)} ${n(my + 16)} A27 27 0 1 0 ${n(mx - 6)} ${n(my - 34)} Z`;
        cv.add(`<path d="${moon}" fill="${linear(cv, [[0, '#fff6cf'], [1, '#f0c95a']], mx - 30, my - 30, mx + 30, my + 30)}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`);
        crescent(cv, moon, [3, 4], { colour: '#fffdf0', opacity: 0.7, soft: 3 });
        for (const [a, r, size] of [[-78, 232, 11], [-18, 236, 9], [152, 232, 10], [118, 224, 7], [208, 234, 8]]) cv.add(`<path d="${star(P(a, r), size)}" fill="#ffe9a0" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`);
      });
      return s.done({ finish: { paint: 1, grain: 0.012, contrast: 0.08, saturation: 1, ink: true } });
    },
  },
  {
    key: 'newroz',
    ku: 'Xeleka Newrozê',
    en: 'Newroz fire',
    // the fire of Newroz in a ring: flames standing all round the face and leaning the one way, as a fire turns —
    // red outside, orange within, yellow at the root — over a ring of embers, the light of it round everything
    still(rnd) {
      const s = new Still(rnd);
      s.paint((cv) => {
        cv.add(`<path d="${ring(254)}" fill="${radial(cv, [[0.68, '#ff9a2a', 0.55], [1, '#ff5a1a', 0]], C, C, 254)}"/>`);
      });
      s.paint((cv) => {
        // three rows of tongues, the tall red ones behind, each leaning on round the ring
        const row = (count, shift, height, width, colours, line) => {
          let out = '';
          for (let i = 0; i < count; i++) {
            const a = (i * 360) / count + shift;
            const tall = height * (0.82 + rnd() * 0.36);
            const d = blade(P(a, 180), P(a + 7 + rnd() * 4, 180 + tall), width, { at: 0.34, point: 0.92, bend: 0.14 });
            out += `<path d="${d}" fill="${linear(cv, colours.map((c, k) => [k / (colours.length - 1), c]), ...P(a, 180), ...P(a + 8, 180 + tall))}"${line ? ` stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"` : ''}/>`;
          }
          cv.add(out);
        };
        row(26, 0, 60, 46, ['#f2681c', '#d8301a', '#a81812'], true);
        row(26, 7, 44, 34, ['#ffc23a', '#f7861c', '#e8501a'], false);
        row(26, 3, 26, 22, ['#fff3a8', '#ffd84a', '#ffab2a'], false);
      });
      s.paint((cv) => {
        // the embers the fire stands on: a dark ring, glowing along the edge the flames leave it by
        const embers = ring(186, RI);
        cv.add(`<path d="${embers}" fill="${linear(cv, [[0, '#7a1e10'], [0.5, '#4a100a'], [1, '#2c0806']], 90, 90, 420, 420)}" stroke="${INK}" stroke-width="2.6"/>`);
        cv.add(`<path d="${round(184)}" fill="none" stroke="#ffb23a" stroke-width="3.4" stroke-opacity="0.9" filter="${softly(cv, 1.2)}"/>`);
        cv.add(`<path d="${round(175)}" fill="none" stroke="#f0641e" stroke-width="2" stroke-opacity="0.7"/>`);
        let sparks = '';
        for (let i = 0; i < 40; i++) {
          const at = P(rnd() * 360, 175 + rnd() * 9);
          sparks += `<circle cx="${n(at[0])}" cy="${n(at[1])}" r="${n(0.8 + rnd() * 1.4)}" fill="#ffd86a" fill-opacity="${n(0.5 + rnd() * 0.5)}"/>`;
        }
        cv.add(sparks);
      });
      return s.done({ finish: { paint: 1, grain: 0.01, contrast: 0.1, saturation: 1.04, ink: true } });
    },
  },
];
