/**
 * Frames made of light and of metal (see frames.mjs): a ring of stars, the
 * northern lights turned low, a clock's numerals, a ring of signs that glow,
 * and a frame of black carved scrollwork.
 *
 * What shines here has to be seen on a white page as well as a dark one, so
 * nothing is white light alone: each has a colour of its own and, where it is
 * written or cut, something dark to be written on.
 */
import { crescent, within } from './brush.mjs';
import { blade, linear, radial, spline } from './icons.mjs';
import { n, pt } from './kit.mjs';
import { C, P, RI, ring, round } from './ring.mjs';
import { Still } from './still.mjs';

const rad = (deg) => (deg * Math.PI) / 180;
const off = ([x, y], deg, len) => [x + Math.cos(rad(deg)) * len, y + Math.sin(rad(deg)) * len];

/** A star of four points at `at`, `long` to its points along `turn` and `short` to the two across it, its sides drawn in toward the middle. */
export function sparkle(at, turn, long, short) {
  const tips = [off(at, turn, long), off(at, turn + 90, short), off(at, turn + 180, long), off(at, turn + 270, short)];
  const waist = (i) => off(at, turn + 45 + i * 90, Math.min(long, short) * 0.2);
  return `M${pt(tips[0])} Q${pt(waist(0))} ${pt(tips[1])} Q${pt(waist(1))} ${pt(tips[2])} Q${pt(waist(2))} ${pt(tips[3])} Q${pt(waist(3))} ${pt(tips[0])} Z`;
}

/**
 * A Roman numeral as strokes, standing on (0, 0) and `h` tall, centred across: stems for I, two strokes meeting
 * at the foot for V, two crossing for X, and a bar across the head and the foot of the whole numeral, as a
 * clock's are cut. Returns its thick strokes and its thin ones.
 */
function numeral(text, h) {
  const widths = { I: h * 0.2, V: h * 0.62, X: h * 0.62 };
  const gap = h * 0.14;
  const total = [...text].reduce((sum, ch) => sum + widths[ch], 0) + gap * (text.length - 1);
  let x = -total / 2;
  let thick = '';
  let thin = '';
  for (const ch of text) {
    const w = widths[ch];
    if (ch === 'I') thick += `M${n(x + w / 2)} 0 V${n(-h)} `;
    if (ch === 'V') {
      thick += `M${n(x)} ${n(-h)} L${n(x + w / 2)} 0 `;
      thin += `M${n(x + w)} ${n(-h)} L${n(x + w / 2)} 0 `;
    }
    if (ch === 'X') {
      thick += `M${n(x)} ${n(-h)} L${n(x + w)} 0 `;
      thin += `M${n(x + w)} ${n(-h)} L${n(x)} 0 `;
    }
    x += w + gap;
  }
  const bar = h * 0.16;
  thin += `M${n(-total / 2 - bar)} 0 H${n(total / 2 + bar)} M${n(-total / 2 - bar)} ${n(-h)} H${n(total / 2 + bar)}`;
  return { thick, thin };
}

export const LIGHTS = [
  {
    key: 'sterkan',
    ku: 'Xeleka Stêrkan',
    en: 'Ring of stars',
    // a ring of stars: a fine hoop of gold round the face and stars of four points standing out from it all the
    // way round, a long one and then two short, each pointing away from the middle, gold with a white heart, and
    // their light round them
    still(rnd) {
      const s = new Still(rnd);
      const stars = [];
      for (let i = 0; i < 12; i++) {
        const a = -90 + i * 30;
        stars.push([P(a, 220), a, 30, 9.5]);
        stars.push([P(a + 11, 203), a + 11, 17, 6]);
        stars.push([P(a + 19, 203), a + 19, 17, 6]);
      }
      s.glow((cv) => cv.add(stars.map(([at, turn, long, short]) => `<path d="${sparkle(at, turn, long, short)}" fill="#ffc83a"/>`).join('')), { blur: 7, strength: 0.9, halo: 0.5 });
      s.paint((cv) => {
        cv.add(`<path d="${ring(178, RI)}" fill="${linear(cv, [[0, '#fff3ad'], [0.5, '#f0c044'], [1, '#c2861a']], 90, 90, 420, 420)}" stroke="#7a4e0e" stroke-width="1.4"/>`);
        for (const [at, turn, long, short] of stars) {
          const d = sparkle(at, turn, long, short);
          cv.add(`<path d="${d}" fill="${radial(cv, [[0, '#fffdf0'], [0.35, '#ffe890'], [1, '#f0b02a']], ...at, long)}" stroke="#8a560e" stroke-width="1.3" stroke-linejoin="round"/>`);
        }
        // (a grain of light between the stars)
        for (let i = 0; i < 12; i++) cv.add(`<circle cx="${n(P(i * 30 - 75, 196)[0])}" cy="${n(P(i * 30 - 75, 196)[1])}" r="2.6" fill="#fff3ad" stroke="#8a560e" stroke-width="0.9"/>`);
      });
      return s.done({ finish: { paint: 0, grain: 0.006, contrast: 0.05, saturation: 1.03 } });
    },
  },
  {
    key: 'ronahiya-bakur',
    ku: 'Xeleka Ronahiya Bakur',
    en: 'Northern lights',
    // the northern lights round the face, turned low: curtains of soft light standing out from the ring, green
    // where they rise and going through blue to violet as they thin away, here and there a breath of rose at
    // the foot, none of them with an edge; a little of the night behind them, and a fine pale hoop
    still(rnd) {
      const s = new Still(rnd);
      // a curtain: where it stands, how tall and how broad, how bright, and its colours from foot to top. The
      // colours go round the ring in slow turns, so that neighbours are alike and the whole is not a rainbow
      const curtains = [];
      const [turnA, turnB] = [rnd() * 360, rnd() * 360];
      const foot = ['#46e6a6', '#3ad6b8', '#62f0b0', '#34c8c8'];
      const body = ['#3aa8e0', '#4a84f0', '#36c0d0'];
      const top = ['#7a5cf0', '#9a6af6', '#5a6cf0'];
      for (let i = 0; i < 58; i++) {
        const a = i * (360 / 58) + (rnd() - 0.5) * 5;
        const swell = 0.5 + 0.5 * Math.sin(((a + turnA) * Math.PI) / 90);
        const cool = 0.5 + 0.5 * Math.sin(((a + turnB) * Math.PI) / 180);
        const rose = rnd() < 0.14;
        curtains.push({
          a,
          lean: (rnd() - 0.5) * 7,
          tall: 30 + swell * 30 + rnd() * 16,
          wide: 11 + rnd() * 13,
          bright: 0.4 + swell * 0.3 + rnd() * 0.16,
          colours: [rose ? '#f07ab8' : foot[Math.floor(rnd() * foot.length)], cool > 0.55 ? body[1] : body[Math.floor(rnd() * body.length)], cool > 0.5 ? top[Math.floor(rnd() * 2)] : top[2]],
        });
      }
      const draw = (cv, grow, widen, strength) =>
        curtains
          .map(({ a, lean, tall, wide, bright, colours }) => {
            const from = P(a, 175);
            const to = P(a + lean, 177 + tall * grow);
            return `<path d="${blade(from, to, wide * widen, { at: 0.3, point: 0.55 })}" fill="${linear(cv, [[0, colours[0], bright * strength], [0.45, colours[1], bright * strength * 0.8], [1, colours[2], 0]], ...from, ...to)}"/>`;
          })
          .join('');
      // the night behind them, thin, so that they are light on a white page too
      s.paint((cv) => cv.add(`<path d="${ring(244)}" fill="${radial(cv, [[0.7, '#0a1634', 0.36], [0.86, '#0c1a3c', 0.2], [1, '#0c1a3c', 0]], C, C, 244)}"/>`));
      s.glow((cv) => cv.add(draw(cv, 1, 1.2, 1)), { blur: 12, strength: 0.5, halo: 0.5 });
      s.paint((cv) => cv.add(draw(cv, 1, 1, 1)), { blur: 6 });
      s.paint((cv) => cv.add(draw(cv, 0.7, 0.5, 0.8)), { blur: 3.2 });
      // where a curtain is brightest, a third of the way up it: a few of them, pale green or pale blue
      s.paint((cv) => {
        let lights = '';
        for (const { a, lean, tall, wide, bright } of curtains) {
          if (bright < 0.72) continue;
          const [x, y] = P(a + lean * 0.35, 177 + tall * 0.34);
          lights += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(tall * 0.2)}" ry="${n(wide * 0.26)}" transform="rotate(${n(a)} ${n(x)} ${n(y)})" fill="${rnd() < 0.6 ? '#a4ffd8' : '#9ad8ff'}" fill-opacity="0.5"/>`;
        }
        cv.add(lights);
      }, { blur: 3 });
      s.paint((cv) => {
        cv.add(`<path d="${round(175.5)}" fill="none" stroke="#baffe2" stroke-width="2.4" stroke-opacity="0.55"/>`);
      }, { blur: 0.8 });
      return s.done({ finish: { paint: 0, grain: 0.012, contrast: 0.03, saturation: 0.96 } });
    },
  },
  {
    key: 'dem',
    ku: 'Xeleka Demê',
    en: 'Clock face',
    // a clock's face with the middle of it for the wearer: a broad dark band, edged in silver, and the twelve
    // hours cut on it in the numerals clocks have, each standing with its head to the outside, a small mark
    // for every five minutes between them
    still(rnd) {
      const s = new Still(rnd);
      const band = ring(216, RI);
      const HOURS = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
      s.paint((cv) => {
        cv.add(`<path d="${band}" fill="${linear(cv, [[0, '#3a3e4c'], [0.5, '#1c1e28'], [1, '#0e0f16']], 90, 90, 420, 420)}"/>`);
        crescent(cv, band, [5, 6], { colour: '#6a7088', opacity: 0.5, soft: 5 });
        for (const [r, w] of [[213, 3.4], [174, 3]]) cv.add(`<path d="${round(r)}" fill="none" stroke="${linear(cv, [[0, '#ffffff'], [0.5, '#aab0c0'], [1, '#e2e6ee']], 90, 90, 420, 420)}" stroke-width="${w}"/>`);
        cv.add(`<path d="${round(207.5)}" fill="none" stroke="#8a90a4" stroke-width="1.2" stroke-opacity="0.8"/>`);
        // the minutes between the hours
        let ticks = '';
        for (let i = 0; i < 60; i++) if (i % 5) ticks += `M${pt(P(i * 6 - 90, 202))} L${pt(P(i * 6 - 90, 206))} `;
        cv.add(`<path d="${ticks}" stroke="#aab0c0" stroke-width="1.6" stroke-linecap="round"/>`);
        // the hours: silver, each turned to stand with its head outward
        const silver = linear(cv, [[0, '#ffffff'], [0.5, '#c2c8d6'], [1, '#f2f4f8']], 90, 90, 420, 420);
        HOURS.forEach((text, i) => {
          const a = i * 30 - 90;
          const [x, y] = P(a, 182);
          const { thick, thin } = numeral(text, 21);
          cv.add(`<g transform="translate(${n(x)} ${n(y)}) rotate(${a + 90})" fill="none" stroke="${silver}" stroke-linecap="square"><path d="${thick}" stroke-width="3.6"/><path d="${thin}" stroke-width="1.7"/></g>`);
        });
      });
      return s.done({ finish: { paint: 0, grain: 0.01, contrast: 0.06, saturation: 1, ink: { colour: '#c2c8d6', width: 1.2, opacity: 0.9 } } });
    },
  },
  {
    key: 'efsun',
    ku: 'Xeleka Efsûnê',
    en: 'Enchanted ring',
    // a ring of signs that give light: a dark band, as deep water is dark, and round it marks nobody can read —
    // strokes, hooks, dots, as they are cut in the old stones — each of them alight, pale green, and the light of
    // them lying on the band
    still(rnd) {
      const s = new Still(rnd);
      const band = ring(212, RI);
      // a sign: two or three marks in a small square, of a few kinds, turned as a hand turns them
      const sign = (at, turn, size) => {
        let d = '';
        const local = (u, v) => pt(off(off(at, turn, v * size), turn + 90, u * size));
        const marks = 2 + Math.floor(rnd() * 2);
        for (let k = 0; k < marks; k++) {
          const kind = Math.floor(rnd() * 4);
          const [u, v] = [rnd() * 1.2 - 0.6, rnd() * 1.6 - 0.8];
          if (kind === 0) d += `M${local(u, v - 0.5)} L${local(u + (rnd() - 0.5) * 0.5, v + 0.5)} `;
          else if (kind === 1) d += `M${local(u - 0.4, v)} Q${local(u, v - 0.7)} ${local(u + 0.4, v + 0.1)} `;
          else if (kind === 2) d += `M${local(u - 0.3, v - 0.3)} L${local(u + 0.3, v)} L${local(u - 0.2, v + 0.4)} `;
          else d += `M${local(u, v)} l0.01 0 `;
        }
        return d;
      };
      let signs = '';
      for (let i = 0; i < 24; i++) signs += sign(P(i * 15 + rnd() * 3, 192 + (rnd() - 0.5) * 4), i * 15 + 90 + (rnd() - 0.5) * 24, 11.5);
      s.paint((cv) => {
        cv.add(`<path d="${band}" fill="${radial(cv, [[0.68, '#0c2a30'], [0.82, '#0a1a26'], [1, '#060c16']], C, C, 212)}"/>`);
        for (const r of [209, 175]) cv.add(`<path d="${round(r)}" fill="none" stroke="#3fa890" stroke-width="2" stroke-opacity="0.8"/>`);
      });
      s.glow((cv) => cv.add(`<path d="${signs}" fill="none" stroke="#5af0c4" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`), { blur: 6, strength: 1.4, halo: 0.7 });
      s.paint((cv) => cv.add(`<path d="${signs}" fill="none" stroke="#f0fff8" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`));
      return s.done({ finish: { paint: 0, grain: 0.01, contrast: 0.06, saturation: 1.04, ink: { colour: '#2a7a6a', width: 1.2, opacity: 0.8 } } });
    },
  },
  {
    key: 'res',
    ku: 'Xeleka Reş',
    en: 'Black scrollwork',
    // a frame as an old mirror has, carved and lacquered black: a round moulding with a row of beads inside it,
    // and round the outside scrolls that turn in on themselves, a leafed crest at the head and at the foot and a
    // boss at either side, the light catching the edge of every curl
    still(rnd) {
      const s = new Still(rnd);
      const black = (cv) => linear(cv, [[0, '#3a3c48'], [0.45, '#14151c'], [1, '#050508']], 90, 90, 420, 420);
      const shine = '#8a90a8';
      // a scroll: from `at`, a curl that winds in on itself `turns` times, `r` across at first, turning the way `hand` says
      const scroll = (at, start, r, hand, turns = 1.35) => {
        const points = [];
        for (let i = 0; i <= 26; i++) {
          const t = i / 26;
          points.push(off(at, start + hand * t * turns * 360, r * (1 - t * 0.86)));
        }
        return spline(points, false);
      };
      const curls = [];
      for (const a of [-90, 90]) {
        // the crest: a pair of scrolls back to back and three leaves between them
        for (const hand of [-1, 1]) curls.push([scroll(P(a + hand * 15, 224), a + hand * 80, 25, hand), 11]);
        for (const hand of [-1, 1]) curls.push([scroll(P(a + hand * 35, 216), a - hand * 60, 17, -hand), 9]);
      }
      for (const a of [0, 180]) for (const hand of [-1, 1]) curls.push([scroll(P(a + hand * 17, 220), a + hand * 100, 19, hand), 10]);
      for (const a of [-45, 45, 135, 225]) for (const hand of [-1, 1]) curls.push([scroll(P(a + hand * 11, 218), a + hand * 110, 17, hand, 1.2), 9]);
      s.paint((cv) => {
        // the scrolls, each a rope of black with the light along it
        cv.add(curls.map(([d, w]) => `<path d="${d}" fill="none" stroke="#0a0a10" stroke-width="${w}" stroke-linecap="round"/>`).join(''));
        cv.add(curls.map(([d, w]) => `<path d="${d}" fill="none" stroke="${shine}" stroke-width="${n(w * 0.22)}" stroke-linecap="round" stroke-opacity="0.8" transform="translate(-1.2 -1.4)"/>`).join(''));
        // the leaves of the crests, and the bosses at the sides
        for (const a of [-90, 90]) {
          for (const [da, len, wide] of [[0, 48, 24], [-10, 34, 18], [10, 34, 18]]) {
            const d = blade(P(a + da, 204), P(a + da * 1.5, 204 + len), wide, { at: 0.45, point: 0.75 });
            cv.add(`<path d="${d}" fill="${black(cv)}" stroke="#0a0a10" stroke-width="1.6"/>`);
            cv.add(`<path d="M${pt(P(a + da, 210))} L${pt(P(a + da * 1.5, 198 + len))}" stroke="${shine}" stroke-width="1.6" stroke-opacity="0.8" stroke-linecap="round"/>`);
          }
        }
        for (const a of [0, 180]) {
          const at = P(a, 214);
          cv.add(`<circle cx="${n(at[0])}" cy="${n(at[1])}" r="13" fill="${radial(cv, [[0, '#5a5e70'], [0.5, '#1c1d26'], [1, '#050508']], at[0] - 4, at[1] - 5, 15)}" stroke="#0a0a10" stroke-width="1.6"/>`);
        }
      });
      s.paint((cv) => {
        // the moulding round the face, and its beads
        const moulding = ring(203, RI);
        cv.add(`<path d="${moulding}" fill="${black(cv)}"/>`);
        crescent(cv, moulding, [5, 6], { colour: shine, opacity: 0.55, soft: 4 });
        crescent(cv, moulding, [-5, -6], { colour: '#000000', opacity: 0.6, soft: 5 });
        for (const [r, w, o] of [[199, 2.2, 0.7], [189, 1.4, 0.55]]) cv.add(`<path d="${round(r)}" fill="none" stroke="${shine}" stroke-width="${w}" stroke-opacity="${o}"/>`);
        let beads = '';
        for (let i = 0; i < 60; i++) {
          const [x, y] = P(i * 6, 178.5);
          beads += `<circle cx="${n(x)}" cy="${n(y)}" r="3.6" fill="${radial(cv, [[0, '#7a8098'], [0.6, '#1c1d26'], [1, '#050508']], x - 1.2, y - 1.4, 4.2)}"/>`;
        }
        cv.add(`<g clip-path="${within(cv, moulding)}">${beads}</g>`);
      });
      return s.done({ finish: { paint: 0.6, grain: 0.01, contrast: 0.06, saturation: 1, ink: { colour: '#6a7088', width: 1.3, opacity: 0.85 } } });
    },
  },
];
