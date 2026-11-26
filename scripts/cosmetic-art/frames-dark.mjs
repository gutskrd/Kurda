/**
 * Frames for the dark hours (see frames.mjs): a black ring grown over with
 * thorns, thorns of bright metal, a ring plaited of thorn branches, a ring of
 * smoke, and the sun's corona round the moon when it covers the sun.
 *
 * Black on a dark page is nothing, so each of these carries its own light: a
 * pale edge to every thorn, a line of red, the glint on metal.
 */
import { crescent, within } from './brush.mjs';
import { strand } from './frames-garden.mjs';
import { sparkle } from './frames-light.mjs';
import { blade, linear, radial, spline, tube } from './icons.mjs';
import { n, pt } from './kit.mjs';
import { C, P, RI, polar, ring, round } from './ring.mjs';
import { Still } from './still.mjs';

const rad = (deg) => (deg * Math.PI) / 180;
const off = ([x, y], deg, len) => [x + Math.cos(rad(deg)) * len, y + Math.sin(rad(deg)) * len];

export const DARK = [
  {
    key: 'tari',
    ku: 'Xeleka Tarî',
    en: 'Black thorns',
    // a ring of black iron, cut with a fine line of chevrons, and at the upper right and the lower left grown
    // over with thorns: hooked black spikes sweeping the one way, and a vein of red light among them
    still(rnd) {
      const s = new Still(rnd);
      const iron = (cv) => linear(cv, [[0, '#4e5262'], [0.45, '#1a1c24'], [1, '#07080c']], 90, 90, 420, 420);
      const band = ring(198, RI);
      const clusters = [-45, 135];
      const spikes = [];
      for (const c of clusters) {
        for (let i = 0; i < 11; i++) {
          const a = c - 30 + i * 6 + rnd() * 2;
          const len = 22 + (1 - Math.abs(i - 5) / 5) * 34 + rnd() * 10;
          spikes.push([blade(P(a, 190), P(a + 10 + rnd() * 5, 196 + len), 17 + rnd() * 5, { at: 0.2, point: 1, bend: 0.22 }), a, len]);
        }
        for (let i = 0; i < 4; i++) {
          const a = c - 20 + i * 13;
          spikes.push([blade(P(a, 178), P(a + 6, 158 - (i % 2) * 5), 9, { at: 0.2, point: 1, bend: 0.2 }), a, -16]);
        }
      }
      s.paint((cv) => {
        for (const [d] of spikes) cv.add(`<path d="${d}" fill="${iron(cv)}" stroke="#8a90a8" stroke-width="1.1" stroke-opacity="0.75" stroke-linejoin="round"/>`);
        cv.add(`<path d="${band}" fill="${iron(cv)}"/>`);
        crescent(cv, band, [5, 6], { colour: '#8a90a8', opacity: 0.5, soft: 4 });
        // the line of chevrons cut round it
        let cut = '';
        for (let a = 0; a < 360; a += 6) cut += `M${pt(P(a, 180))} L${pt(P(a + 3, 190))} L${pt(P(a + 6, 180))} `;
        cv.add(`<path d="${cut}" fill="none" stroke="#6a7088" stroke-width="1.2" stroke-opacity="0.75" stroke-linejoin="round"/>`);
        for (const r of [195, 174]) cv.add(`<path d="${round(r)}" fill="none" stroke="#9aa0b8" stroke-width="1.6" stroke-opacity="0.8"/>`);
      });
      // the red among the thorns: a vein along the ring, branching up into them
      const veins = [];
      for (const c of clusters) {
        const main = [];
        for (let i = 0; i <= 10; i++) main.push(P(c - 30 + i * 6, 187 + Math.sin(i * 1.9) * 4));
        veins.push(spline(main, false));
        for (let i = 1; i < 10; i += 2) veins.push(`M${pt(P(c - 30 + i * 6, 187))} Q${pt(P(c - 28 + i * 6, 204))} ${pt(P(c - 24 + i * 6, 214 + (i % 4) * 4))}`);
      }
      s.glow((cv) => cv.add(veins.map((d) => `<path d="${d}" fill="none" stroke="#ff2030" stroke-width="4" stroke-linecap="round"/>`).join('')), { blur: 4, strength: 0.9, halo: 0.5 });
      s.paint((cv) => cv.add(veins.map((d) => `<path d="${d}" fill="none" stroke="#e01a2c" stroke-width="1.8" stroke-linecap="round"/>`).join('')));
      return s.done({ finish: { paint: 0.5, grain: 0.012, contrast: 0.07, saturation: 1.02, ink: { colour: '#6a7088', width: 1.2, opacity: 0.85 } } });
    },
  },
  {
    key: 'ziv',
    ku: 'Stiriyên Zîvîn',
    en: 'Silver thorns',
    // thorns of bright metal, as if poured: a ring of flowing silver, a long thorn and a shorter one sweeping off
    // it at every turn, a small one pointing in, and a four-pointed stud at the top, the foot and either side,
    // every piece of it with the room's light and dark lying along it as they do on polished steel
    still(rnd) {
      const s = new Still(rnd);
      const chrome = (cv, from, to) => linear(cv, [[0, '#f8fbff'], [0.28, '#9aa6b8'], [0.5, '#262c38'], [0.68, '#c8d2e0'], [1, '#5a6474']], ...from, ...to);
      const line = '#12151c';
      const piece = (cv, d, from, to) => cv.add(`<path d="${d}" fill="${chrome(cv, from, to)}" stroke="${line}" stroke-width="1.5" stroke-linejoin="round"/>`);
      // a thorn from `base` to `tip`, the bands of the metal running down its length: so the colours go across it
      const thorn = (cv, base, tip, wide, bend) => {
        const len = Math.hypot(tip[0] - base[0], tip[1] - base[1]);
        const across = [(-(tip[1] - base[1]) / len) * wide * 0.62, ((tip[0] - base[0]) / len) * wide * 0.62];
        const at = [base[0] + (tip[0] - base[0]) * 0.3, base[1] + (tip[1] - base[1]) * 0.3];
        piece(cv, blade(base, tip, wide, { at: 0.16, point: 1, bend }), [at[0] - across[0], at[1] - across[1]], [at[0] + across[0], at[1] + across[1]]);
      };
      s.paint((cv) => {
        // the thorns first, behind the ring they grow from
        for (let i = 0; i < 8; i++) {
          const a = i * 45 + 22.5;
          thorn(cv, P(a - 4, 188), P(a + 12, 250 - (i % 2) * 8), 19, 0.14);
          thorn(cv, P(a + 2, 188), P(a - 18, 230), 15, -0.16);
          thorn(cv, P(a + 8, 184), P(a + 13, 157), 10, 0.12);
        }
        // the ring: lengths of silver flowing into one another round the face
        const hoop = ring(195, 181);
        cv.add(`<path d="${hoop}" fill="${radial(cv, [[0.905, '#5a6474'], [0.93, '#f8fbff'], [0.955, '#262c38'], [0.975, '#c8d2e0'], [1, '#5a6474']], C, C, 195)}" stroke="${line}" stroke-width="1.5"/>`);
        for (let i = 0; i < 8; i++) {
          const a = i * 45;
          const run = [P(a - 16, 190), P(a + 20, 187)];
          piece(cv, blade(...run, 15, { at: 0.5, point: 0.8, bend: -0.08 }), P(a, 198), P(a, 180));
        }
        // the studs at the four points
        for (const a of [-90, 0, 90, 180]) {
          const at = P(a, 188);
          piece(cv, sparkle(at, a, 27, 11), off(at, a + 135, 16), off(at, a - 45, 16));
          cv.add(`<circle cx="${n(at[0])}" cy="${n(at[1])}" r="3" fill="#f8fbff" stroke="${line}" stroke-width="1"/>`);
        }
      });
      return s.done({ finish: { paint: 0.4, grain: 0.008, contrast: 0.08, saturation: 1, ink: { colour: '#12151c', width: 1.8 } } });
    },
  },
  {
    key: 'stiri',
    ku: 'Xeleka Stiriyan',
    en: 'Ring of thorns',
    // a ring plaited of thorn branches, as a hedge is laid: three dark stems wound round one another, and thorns
    // standing out of them every way, long and fine, their points pale
    still(rnd) {
      const s = new Still(rnd);
      s.paint((cv) => {
        // the thorns behind the stems: most pointing out and a little along, a few pointing in
        let thorns = '';
        for (let i = 0; i < 70; i++) {
          const a = i * (360 / 70) + rnd() * 4;
          const inward = i % 9 === 4;
          const base = P(a, inward ? 182 : 188 + rnd() * 6);
          const len = inward ? 9 + rnd() * 7 : 16 + rnd() * 32;
          const tip = off(base, a + (inward ? 180 : 0) + (rnd() - 0.5) * 80, len);
          thorns += `<path d="${blade(base, tip, 5.4, { at: 0.14, point: 1 })}" fill="${linear(cv, [[0, '#2a2018'], [0.6, '#5a4a3a'], [1, '#c8b494']], ...base, ...tip)}" stroke="#140e0a" stroke-width="0.9" stroke-linejoin="round"/>`;
        }
        cv.add(thorns);
        // the stems, wound together: a dark line, the bark, and the light along the top of each
        for (const [d, bark, w] of [[strand(188, 6, 3, 0), '#3a2c22', 8.5], [strand(190, 7, 4, 120), '#2e221a', 7.5], [strand(186, 5, 5, 240), '#463628', 6.5]]) {
          cv.add(`<path d="${d}" fill="none" stroke="#0e0a08" stroke-width="${w + 3}" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${bark}" stroke-width="${w}" stroke-linejoin="round"/>`);
          cv.add(`<path d="${d}" fill="none" stroke="#9a8468" stroke-width="1.5" stroke-opacity="0.75" stroke-linejoin="round" transform="translate(-1.6 -1.8)"/>`);
        }
        // a few thorns over the stems too
        let front = '';
        for (let i = 0; i < 22; i++) {
          const a = i * (360 / 22) + 7 + rnd() * 5;
          const base = P(a, 187 + rnd() * 4);
          const tip = off(base, a + (rnd() - 0.5) * 70, 14 + rnd() * 20);
          front += `<path d="${blade(base, tip, 5, { at: 0.14, point: 1 })}" fill="${linear(cv, [[0, '#3a2c22'], [1, '#d6c4a4']], ...base, ...tip)}" stroke="#140e0a" stroke-width="0.9" stroke-linejoin="round"/>`;
        }
        cv.add(front);
      });
      return s.done({ finish: { paint: 0.6, grain: 0.012, contrast: 0.07, saturation: 1, ink: { colour: '#8a7458', width: 1.1, opacity: 0.7 } } });
    },
  },
  {
    key: 'dukel',
    ku: 'Xeleka Dûkelê',
    en: 'Smoke ring',
    // a ring of smoke, as it hangs in still air: grey, thick along the inside where it turns on itself and
    // thinning outward in folds, a wisp or two pulling away from it
    still(rnd) {
      const s = new Still(rnd);
      // smoke is uneven: lengths of it, each part of the way round, some dense and some hardly there
      const arc = (r, from, span) => {
        const points = [];
        for (let t = 0; t <= 1.0001; t += 0.1) points.push(P(from + span * t, r + Math.sin(t * Math.PI * 2 + from) * 4));
        return spline(points, false);
      };
      const puffs = [];
      for (let i = 0; i < 46; i++) puffs.push([arc(178 + rnd() ** 1.4 * 30, rnd() * 360, 24 + rnd() * 70), 6 + rnd() * 18, 0.1 + rnd() * 0.3]);
      // (a wisp pulling away: thick where it leaves the ring and thinning to nothing as it curls)
      const wisps = [];
      for (const a of [-150, -40, 30, 110, 200]) {
        const lift = 16 + rnd() * 10;
        wisps.push(tube([P(a, 196), P(a + 12, 204 + lift), P(a + 26, 214 + lift), P(a + 36 + rnd() * 8, 208 + lift * 1.6), P(a + 30, 196 + lift * 2)], 14, 1.5, 16));
      }
      // its body, darker, so that it is smoke on a white page too; then the pale of it, and the bright folds
      s.paint((cv) => {
        cv.add(puffs.map(([d, w]) => `<path d="${d}" fill="none" stroke="#3e4658" stroke-width="${n(w + 8)}" stroke-opacity="0.13" stroke-linecap="round"/>`).join(''));
        cv.add(wisps.map((d) => `<path d="${d}" fill="#3e4658" fill-opacity="0.3"/>`).join(''));
      }, { blur: 6 });
      s.paint((cv) => {
        cv.add(puffs.map(([d, w, o]) => `<path d="${d}" fill="none" stroke="#f2f5fa" stroke-width="${n(w)}" stroke-opacity="${n(o)}" stroke-linecap="round"/>`).join(''));
        cv.add(wisps.map((d) => `<path d="${d}" fill="#f2f5fa" fill-opacity="0.55"/>`).join(''));
      }, { blur: 4 });
      s.paint((cv) => {
        cv.add(puffs.slice(0, 14).map(([d, w, o]) => `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="${n(Math.max(1.6, w * 0.2))}" stroke-opacity="${n(o + 0.25)}" stroke-linecap="round"/>`).join(''));
        cv.add(`<path d="${strand(177, 2.6, 5, 40)}" fill="none" stroke="#ffffff" stroke-width="3.4" stroke-opacity="0.8" stroke-linejoin="round"/>`);
      }, { blur: 1.4 });
      return s.done({ finish: { paint: 0, grain: 0.01, contrast: 0.04, saturation: 1 } });
    },
  },
  {
    key: 'rojgirtin',
    ku: 'Rojgirtin',
    en: 'Eclipse',
    // the moment the moon covers the sun, the face being the moon: round it the sun's corona, a wavy band of light, gold
    // at its edge, pale gold within and pearl next to the moon; out of it the streamers reach as thin washes of light,
    // longest to either side, with fine short plumes at the poles; a thin white rim hugs the moon's edge, and low on the
    // left the last of the sun breaks through as a diamond ring, a bead of light with smaller beads trailing it
    still(rnd) {
      const s = new Still(rnd);
      const RIM = RI + 3;
      const phase = [rnd() * 6, rnd() * 6, rnd() * 6];
      // the band swells toward the sun's equator and ripples gently all the way round
      const wave = (a) => {
        const t = rad(a);
        return 5 * Math.cos(t) ** 2 + 3 * Math.sin(5 * t + phase[0]) + 2 * Math.sin(9 * t + phase[1]) + 1.4 * Math.sin(15 * t + phase[2]);
      };
      const band = (depth, swell) => {
        const edge = [];
        for (let a = 0; a < 360; a += 2) edge.push([a, RIM + depth + wave(a) * swell]);
        return `${polar(edge)} M${C - RIM + 2} ${C} A${RIM - 2} ${RIM - 2} 0 1 1 ${C + RIM - 2} ${C} A${RIM - 2} ${RIM - 2} 0 1 1 ${C - RIM + 2} ${C} Z`;
      };
      // [angle, length, width, bend]: helmet streamers, each a rounded dome standing on the band and drawn out into one
      // long fine ray, longest along the sun's equator; fine plumes at the poles
      const streamers = [
        [-6, 78, 44, -0.08], [19, 54, 38, 0.1], [62, 26, 30, 0.06], [-58, 24, 30, -0.06],
        [166, 66, 42, -0.1], [194, 86, 48, 0.08], [230, 34, 32, 0.1], [-120, 36, 32, -0.08],
      ].map(([a, len, wide, bend]) => [a + (rnd() - 0.5) * 2, len + rnd() * 4, wide, bend]);
      const dome = ([a, len, wide], grow = 1, widen = 1) =>
        blade(P(a, RIM - 2), P(a, RIM + (22 + len * 0.24) * grow), wide * 1.2 * widen, { at: 0.4, point: 0.45 });
      const tail = ([a, len, wide, bend], grow = 1, widen = 1) =>
        blade(P(a, RIM + 12), P(a + bend * 14, RIM + 12 + len * grow), Math.max(6, wide * 0.22) * widen, { at: 0.12, point: 1, bend });
      const plumes = [];
      for (const pole of [-90, 90]) {
        for (let i = -3; i <= 3; i++) plumes.push([pole + i * 6 + (rnd() - 0.5) * 2, 16 + (3 - Math.abs(i)) * 4 + rnd() * 5, 18, i * 0.08]);
      }
      const corona = (grow, widen) => [...streamers.map((st) => dome(st, grow, widen)), ...streamers.map((st) => tail(st, grow, widen)), ...plumes.map((pl) => tail(pl, grow, widen))];
      // low on the left, where an icon worn on the face's shoulder never covers it, whichever way the page reads
      const ringAt = 128;
      const bead = P(ringAt, RIM - 1);

      // the streamers are light rather than things: soft-edged, with no line round them, gold at their edge and near
      // white within, so they glow on a dark page and still show their gold on a pale one
      s.paint((cv) => cv.add(corona(1, 1).map((d) => `<path d="${d}" fill="#e8bd62"/>`).join('')), { blur: 2 });
      s.paint((cv) => cv.add(corona(0.8, 0.6).map((d) => `<path d="${d}" fill="#fcefc8"/>`).join('')), { blur: 1.6 });
      // the band, solid and drawn round, so the frame is one clear ring at any size: its gold edge, the pale gold body,
      // the pearl within, and the dark line of the moon's own edge
      s.paint((cv) => {
        cv.add(`<path d="${band(13, 1)}" fill="#d29e45" fill-rule="evenodd"/>`);
        cv.add(`<path d="${band(9.5, 0.75)}" fill="#f5dc96" fill-rule="evenodd"/>`);
        cv.add(`<path d="${band(5, 0.3)}" fill="#fff4d8" fill-rule="evenodd"/>`);
        cv.add(`<path d="${band(13, 1)}" fill="none" stroke="#2a1712" stroke-width="1.8" stroke-opacity="0.75"/>`);
      }, { blur: 0.6 });
      // the one highlight: the white rim on the moon's edge
      s.paint((cv) => {
        cv.add(`<path d="${ring(RIM + 2, RI)}" fill="#ffffff"/>`);
        cv.add(`<path d="${round(RI)}" fill="none" stroke="#2a1712" stroke-width="2" stroke-opacity="0.8"/>`);
      }, { blur: 0.4 });
      // the diamond ring: the last bead of the sun with its points of light, edged in gold so it shows on a pale page,
      // and the small beads trailing it along the rim
      s.paint((cv) => {
        cv.add(`<circle cx="${n(bead[0])}" cy="${n(bead[1])}" r="20" fill="#e8bd62"/>`);
        cv.add(`<path d="${sparkle(bead, ringAt + 45, 64, 40)}" fill="#e8bd62" stroke="#2a1712" stroke-width="1.4" stroke-opacity="0.5" stroke-linejoin="round"/>`);
        cv.add(`<circle cx="${n(bead[0])}" cy="${n(bead[1])}" r="16" fill="#fff8e6"/>`);
        cv.add(`<path d="${sparkle(bead, ringAt + 45, 56, 32)}" fill="#fffdf5"/>`);
        cv.add(`<path d="${sparkle(bead, ringAt, 28, 20)}" fill="#fffdf5"/>`);
        cv.add(`<circle cx="${n(bead[0])}" cy="${n(bead[1])}" r="9" fill="#ffffff"/>`);
        for (const [a, r] of [[ringAt + 15, 4.6], [ringAt + 23, 3.6], [ringAt + 30, 2.8], [ringAt + 36, 2.1]]) {
          const [x, y] = P(a, RIM + 2.5);
          cv.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r + 1.4)}" fill="#d29e45"/><circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="#ffffff"/>`);
        }
      }, { blur: 0.4 });
      return s.done({ finish: { paint: 0.3, grain: 0.008, contrast: 0.04, saturation: 1 } });
    },
  },
];
