/**
 * Frames for the dark hours (see frames.mjs): hands of stone reaching for one
 * another round the face, a black ring grown over with thorns, thorns of
 * bright metal, a ring plaited of thorn branches, a ring of smoke, and the
 * light that stands round the moon when it covers the sun.
 *
 * Black on a dark page is nothing, so each of these carries its own light: a
 * pale edge to every thorn, a line of red, the glint on metal.
 */
import { crescent, softly, within } from './brush.mjs';
import { strand } from './frames-garden.mjs';
import { sparkle } from './frames-light.mjs';
import { blade, linear, radial, spline, tube } from './icons.mjs';
import { n, pt } from './kit.mjs';
import { C, P, RI, ring, round } from './ring.mjs';
import { Still } from './still.mjs';

const rad = (deg) => (deg * Math.PI) / 180;
const off = ([x, y], deg, len) => [x + Math.cos(rad(deg)) * len, y + Math.sin(rad(deg)) * len];

export const DARK = [
  {
    key: 'dest',
    ku: 'Xeleka Destan',
    en: 'Reaching hands',
    // a ring of arms: eight hands of grey stone, in pairs, each pair reaching for the other and not quite
    // touching — at the top, at the foot and at either side — their arms the ring itself, wound through with
    // threads of dark red
    still(rnd) {
      const s = new Still(rnd);
      const R = 196;
      const ink = '#1c2030';
      // a hand is drawn flat — `u` along it from the wrist, `v` across it — and then laid along the ring from
      // `a0`, reaching the way `dir` says, so that it bends as the ring does
      const lay = (a0, dir) => ([u, v]) => P(a0 + dir * (u / R) * (180 / Math.PI), R + v);
      const hand = (a0, dir) => {
        const on = lay(a0, dir);
        const run = (points) => spline(points.map(on));
        const limb = (points, w0, w1) => tube(points.map(on), w0, w1, 12);
        // (a finger: from its knuckle, a little spread, bending at its middle joint)
        const finger = (v0, len, wide, spread) => {
          const mid = [36 + len * 0.55 * Math.cos(rad(spread)), v0 + len * 0.55 * Math.sin(rad(spread))];
          const tip = [mid[0] + len * 0.5 * Math.cos(rad(spread * 2.2)), mid[1] + len * 0.5 * Math.sin(rad(spread * 2.2))];
          return { d: limb([[30, v0], mid, tip], wide, wide * 0.42), mid: on(mid), knuckle: on([36, v0]) };
        };
        const arm = [];
        for (let u = -72; u <= 2; u += 9.25) arm.push([u, -11 - (u / -72) * 2.5]);
        for (let u = 2; u >= -72; u -= 9.25) arm.push([u, 11 + (u / -72) * 3]);
        const fingers = [finger(-12.4, 30, 9.4, -7), finger(-4.2, 35, 9.8, -2), finger(4.2, 32, 9.4, 3), finger(12, 24, 8, 10)];
        return {
          arm: `M${arm.map(on).map(pt).join(' L')} Z`,
          palm: run([[0, -11], [12, -14.5], [26, -16.5], [37, -16.5], [41, -8], [42, 0], [41, 8], [37, 16.5], [26, 16], [12, 13.5], [0, 11]]),
          thumb: limb([[10, -12], [25, -27], [40, -35]], 11, 5),
          fingers,
          on,
        };
      };
      const hands = [];
      for (const m of [-90, 0, 90, 180]) {
        hands.push(hand(m - 24, 1));
        hands.push(hand(m + 24, -1));
      }
      s.paint((cv) => {
        // the threads, under everything: dark red, wandering round the ring and out of it
        const reds = ['#5a0e22', '#8a1830', '#b8243e', '#7a1428', '#c8304a'];
        let threads = '';
        for (let i = 0; i < 7; i++) threads += `<path d="${strand(194 + (i % 3) * 5, 9 + (i % 4) * 4, 4 + (i % 5), i * 57)}" fill="none" stroke="${reds[i % reds.length]}" stroke-width="${n(2.6 + (i % 3) * 1.2)}" stroke-linejoin="round"/>`;
        for (let i = 0; i < 26; i++) {
          const a = i * (360 / 26) + rnd() * 8;
          const from = P(a, 204 + rnd() * 8);
          threads += `<path d="M${pt(from)} Q${pt(P(a + 6, 226 + rnd() * 10))} ${pt(P(a + 12 + rnd() * 6, 214 + rnd() * 22))}" fill="none" stroke="${reds[i % reds.length]}" stroke-width="${n(1.8 + rnd() * 1.4)}" stroke-linecap="round"/>`;
        }
        cv.add(threads);
      });
      s.paint((cv) => {
        // the arms and the hands: a dark line round each whole hand, then its stone
        const parts = (h) => [h.arm, h.thumb, ...h.fingers.map((f) => f.d), h.palm];
        cv.add(hands.map((h) => parts(h).map((d) => `<path d="${d}" fill="${ink}" stroke="${ink}" stroke-width="4.6" stroke-linejoin="round"/>`).join('')).join(''));
        for (const h of hands) {
          cv.add(`<path d="${h.arm}" fill="#77829a"/>`);
          cv.add(`<path d="${h.thumb}" fill="#aab4c8"/>`);
          cv.add(h.fingers.map((f) => `<path d="${f.d}" fill="#b6bfd0"/>`).join(''));
          cv.add(`<path d="${h.palm}" fill="${linear(cv, [[0, '#8e99b0'], [1, '#b6bfd0']], ...h.on([0, 0]), ...h.on([42, 0]))}"/>`);
          // the back of the hand: its tendons, its knuckles, the joints of the fingers, and the wrap on the arm
          let marks = '';
          for (const f of h.fingers) {
            marks += `<path d="M${pt(h.on([8, 0]))} L${pt(f.knuckle)}" stroke="#6a7590" stroke-width="1.4" stroke-opacity="0.7"/>`;
            marks += `<circle cx="${n(f.knuckle[0])}" cy="${n(f.knuckle[1])}" r="2.6" fill="#d6dce8" fill-opacity="0.8"/>`;
            marks += `<circle cx="${n(f.mid[0])}" cy="${n(f.mid[1])}" r="1.8" fill="#6a7590" fill-opacity="0.8"/>`;
          }
          for (const u of [-14, -30, -46, -62]) marks += `<path d="M${pt(h.on([u, -12]))} L${pt(h.on([u + 9, 12]))}" stroke="#545e78" stroke-width="1.6" stroke-opacity="0.8"/>`;
          cv.add(`<g stroke-linecap="round">${marks}</g>`);
        }
      });
      s.paint((cv) => {
        // a few threads over the arms, where they are bound
        let over = '';
        for (const m of [-45, 45, 135, 225]) for (const k of [-5, 0, 5]) over += `<path d="M${pt(P(m + k - 3, 180))} Q${pt(P(m + k, 196))} ${pt(P(m + k + 3, 213))}" fill="none" stroke="#a81e38" stroke-width="3.2" stroke-linecap="round"/>`;
        cv.add(over);
      });
      return s.done({ finish: { paint: 0.6, grain: 0.012, contrast: 0.07, saturation: 1, ink: { colour: '#1c2030', width: 1.6 } } });
    },
  },
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
    // the sun with the moon in front of it: a thin black rim round the face, and the light breaking out past it
    // in flares, white at their roots and blue beyond, each with the colours a lens splits it into along its
    // edges; the dark of the sky about it, so that it is light on any page
    still(rnd) {
      const s = new Still(rnd);
      const flares = [];
      for (let i = 0; i < 19; i++) {
        const a = i * (360 / 19) + (rnd() - 0.5) * 12;
        flares.push([a, 26 + rnd() ** 1.6 * 62, 10 + rnd() * 12, (rnd() - 0.5) * 12]);
      }
      const draw = (colour, opacity, shift, grow, widen) => flares.map(([a, len, wide, skew]) => `<path d="${blade(P(a + shift, 176), P(a + shift + skew, 178 + len * grow), wide * widen, { at: 0.26, point: 0.92 })}" fill="${colour}" fill-opacity="${opacity}"/>`).join('');
      s.paint((cv) => cv.add(`<path d="${ring(246)}" fill="${radial(cv, [[0.7, '#05070f', 0.6], [0.84, '#070b1a', 0.38], [1, '#0a1026', 0]], C, C, 246)}"/>`));
      s.glow((cv) => cv.add(draw('#6a9cff', 1, 0, 1, 1)), { blur: 9, strength: 0.9, halo: 0.5 });
      s.paint((cv) => cv.add(draw('#ff8a3a', 0.45, 1.4, 0.96, 1) + draw('#4a7cff', 0.55, -1.4, 1, 1)), { blur: 5 });
      s.paint((cv) => cv.add(draw('#dce8ff', 0.95, 0, 0.94, 0.8)), { blur: 2.6 });
      s.paint((cv) => cv.add(draw('#ffffff', 1, 0, 0.7, 0.5)), { blur: 1.2 });
      s.paint((cv) => {
        const rim = ring(180, RI);
        cv.add(`<path d="${rim}" fill="#05060c"/>`);
        cv.add(`<path d="${round(179)}" fill="none" stroke="#bcd0ff" stroke-width="1.6" stroke-opacity="0.9" filter="${softly(cv, 0.6)}" clip-path="${within(cv, ring(184, RI))}"/>`);
      });
      return s.done({ finish: { paint: 0, grain: 0.012, contrast: 0.05, saturation: 1.04 } });
    },
  },
];
