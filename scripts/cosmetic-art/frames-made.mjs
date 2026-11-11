/**
 * Frames that are made things (see frames.mjs): a band of dark wood inlaid
 * with a vine, a wreath of gilt leaves as a carver cuts them, the cross of a
 * sight, and a photograph on its white card, taped up.
 */
import { crescent } from './brush.mjs';
import { blade, linear, spline } from './icons.mjs';
import { n, pt } from './kit.mjs';
import { C, P, RI, ring, round } from './ring.mjs';
import { Still } from './still.mjs';

const rad = (deg) => (deg * Math.PI) / 180;
const off = ([x, y], deg, len) => [x + Math.cos(rad(deg)) * len, y + Math.sin(rad(deg)) * len];

export const MADE = [
  {
    key: 'neqs',
    ku: 'Xeleka Neqşê',
    en: 'Inlaid band',
    // a band of dark walnut with a vine let into it in pale wood, as the lid of an old box is inlaid: a stem
    // running round in waves, a curl of tendril off every crest of it and a small flower of eight petals in
    // every hollow, a double line of the pale wood along either edge
    still(rnd) {
      const s = new Still(rnd);
      const band = ring(211, RI);
      const pale = '#ecd6b2';
      s.paint((cv) => {
        cv.add(`<path d="${band}" fill="${linear(cv, [[0, '#4a3020'], [0.5, '#2c1b12'], [1, '#1c100a']], 90, 90, 420, 420)}"/>`);
        crescent(cv, band, [4, 5], { colour: '#7a5236', opacity: 0.45, soft: 4 });
        for (const [r, w] of [[208, 3], [202.5, 1.4], [174.5, 3], [180, 1.4]]) cv.add(`<path d="${round(r)}" fill="none" stroke="${pale}" stroke-width="${w}"/>`);
        // the stem, in sixteen waves, and what grows from it
        const waves = 16;
        const stem = [];
        for (let a = 0; a < 360; a += 2.5) stem.push(P(a, 191 + Math.sin(rad(a * waves)) * 6.5));
        cv.add(`<path d="${spline(stem)}" fill="none" stroke="${pale}" stroke-width="2.2"/>`);
        let grown = '';
        for (let i = 0; i < waves; i++) {
          const crest = (i + 0.25) * (360 / waves);
          const hollow = (i + 0.75) * (360 / waves);
          // a tendril off the crest, curling back over the stem
          const from = P(crest, 197.5);
          grown += `<path d="M${pt(from)} Q${pt(P(crest + 5, 203))} ${pt(P(crest + 8.5, 197))} Q${pt(P(crest + 9.5, 191))} ${pt(P(crest + 6.5, 192))}" fill="none" stroke="${pale}" stroke-width="1.7" stroke-linecap="round"/>`;
          grown += `<path d="${blade(P(crest - 2.5, 196), P(crest - 7, 201), 5, { at: 0.5, point: 0.7 })}" fill="${pale}"/>`;
          // the flower in the hollow, on the side of the stem toward the face
          const at = P(hollow, 186.5);
          for (let k = 0; k < 8; k++) grown += `<path d="${blade(off(at, k * 45 + hollow, 1.2), off(at, k * 45 + hollow, 6.6), 3.6, { at: 0.55, point: 0.5 })}" fill="${pale}"/>`;
          grown += `<circle cx="${n(at[0])}" cy="${n(at[1])}" r="1.5" fill="#2c1b12"/>`;
          grown += `<path d="${blade(P(hollow + 4, 194), P(hollow + 8.5, 199), 4.6, { at: 0.5, point: 0.7 })}" fill="${pale}"/>`;
        }
        cv.add(grown);
      });
      return s.done({ finish: { paint: 0.6, grain: 0.012, contrast: 0.06, saturation: 1, ink: { colour: '#b89a72', width: 1.4, opacity: 0.9 } } });
    },
  },
  {
    key: 'zerin',
    ku: 'Pelên Zêrîn',
    en: 'Golden leaves',
    // a wreath of gilt leaves as a carver cuts them for a mirror: a slim round stem, and off it long fronds with
    // hooked lobes, sweeping down either side from a crest at the top to where the stem is bound at the foot —
    // small ones high up, great ones below; old gold, bright along every rib
    still(rnd) {
      const s = new Still(rnd);
      const gold = (cv, from, to) => linear(cv, [[0, '#8a6a22'], [0.35, '#d9b656'], [0.7, '#f8ecb4'], [1, '#c79a3a']], ...from, ...to);
      const line = '#5a4010';
      // a frond off the stem at `a`, lying along the ring the way `hand` says and lifting away from it: a long leaf
      // bowed outward, and three lobes off its outer edge, each smaller than the last, all coming to hooked points
      const frond = (cv, a, hand, size, lift = 0.4) => {
        const at = P(a, 189);
        const tip = P(a + hand * size * 0.3, 189 + size * lift);
        const dir = (Math.atan2(tip[1] - at[1], tip[0] - at[0]) * 180) / Math.PI;
        let out = '';
        const lobe = (from, to, wide, bend) => {
          out += `<path d="${blade(from, to, wide, { at: 0.4, point: 0.75, bend })}" fill="${gold(cv, from, to)}" stroke="${line}" stroke-width="1.6" stroke-linejoin="round"/>`;
          out += `<path d="M${pt([from[0] + (to[0] - from[0]) * 0.15, from[1] + (to[1] - from[1]) * 0.15])} L${pt([from[0] + (to[0] - from[0]) * 0.8, from[1] + (to[1] - from[1]) * 0.8])}" stroke="#fff8d8" stroke-width="1.3" stroke-opacity="0.8" stroke-linecap="round"/>`;
        };
        for (const [k, len] of [[0.2, 0.46], [0.42, 0.38], [0.64, 0.28]]) {
          const from = [at[0] + (tip[0] - at[0]) * k, at[1] + (tip[1] - at[1]) * k];
          lobe(from, off(from, dir - hand * 52, size * len), size * 0.2, -hand * 0.22);
        }
        lobe(at, tip, size * 0.3, -hand * 0.14);
        cv.add(out);
      };
      s.paint((cv) => {
        const stem = ring(192, 183);
        cv.add(`<path d="${stem}" fill="${gold(cv, [90, 90], [420, 420])}" stroke="${line}" stroke-width="1.6"/>`);
        crescent(cv, stem, [3, 4], { colour: '#fff8d8', opacity: 0.8, soft: 2 });
        // down either side, from the top to the foot, small ones high up and great ones below: the lowest first,
        // so that each lies over the root of the one below it
        for (const hand of [1, -1]) {
          for (let i = 6; i >= 0; i--) {
            const t = i / 6;
            frond(cv, -90 + hand * (20 + t * 128), hand, 62 + t * 46, 0.36 + (i % 2) * 0.1);
          }
        }
        // the crest at the top: a leaf either way from the middle
        frond(cv, -84, -1, 58, 0.62);
        frond(cv, -96, 1, 58, 0.62);
        // where the stem is bound, at the foot
        const [bx, by] = P(90, 187.5);
        cv.add(`<rect x="${n(bx - 13)}" y="${n(by - 10)}" width="26" height="20" rx="5" fill="${gold(cv, [bx - 13, by - 10], [bx + 13, by + 10])}" stroke="${line}" stroke-width="1.6"/>`);
        cv.add(`<path d="M${n(bx - 5)} ${n(by - 9)} V${n(by + 9)} M${n(bx + 5)} ${n(by - 9)} V${n(by + 9)}" stroke="${line}" stroke-width="1.3" stroke-opacity="0.8"/>`);
      });
      return s.done({ finish: { paint: 0.8, grain: 0.01, contrast: 0.07, saturation: 1.03, ink: { colour: '#3a2a0a', width: 2.2 } } });
    },
  },
  {
    key: 'nisan',
    ku: 'Nîşangeh',
    en: 'Crosshair',
    // the cross of a sight, in red: a broad ring and a fine one inside it, a bar across each at the top, the foot
    // and either side, short enough to leave the face alone, and the fine ring marked off round its edge
    still(rnd) {
      const s = new Still(rnd);
      const red = '#ee2430';
      const draw = (cv) => {
        cv.add(`<path d="${ring(211, 201)}" fill="${red}"/><path d="${round(178)}" fill="none" stroke="${red}" stroke-width="3"/>`);
        let marks = '';
        for (let a = 0; a < 360; a += 10) if (a % 90) marks += `M${pt(P(a, 180))} L${pt(P(a, a % 30 ? 186 : 191))} `;
        cv.add(`<path d="${marks}" stroke="${red}" stroke-width="2.2" stroke-linecap="butt"/>`);
        for (const a of [0, 90, 180, 270]) {
          cv.add(`<path d="M${pt(P(a, 190))} L${pt(P(a, 250))}" stroke="${red}" stroke-width="10"/>`);
          cv.add(`<path d="M${pt(P(a, 152))} L${pt(P(a, 190))}" stroke="${red}" stroke-width="5"/>`);
        }
      };
      s.glow(draw, { blur: 7, strength: 0.6, halo: 0.4 });
      s.paint((cv) => {
        draw(cv);
        cv.add(`<path d="${round(206)}" fill="none" stroke="#ff8a8e" stroke-width="2" stroke-opacity="0.7"/>`);
      });
      return s.done({ finish: { paint: 0, grain: 0.006, contrast: 0.05, saturation: 1.04, ink: { colour: '#5a060c', width: 1.4, opacity: 0.9 } } });
    },
  },
  {
    key: 'wene',
    ku: 'Wêne',
    en: 'Instant photo',
    // a photograph of the kind that comes out of the camera on its own white card, the broad margin at the foot,
    // stuck up a little crooked with two strips of paper tape, another card behind it; the picture itself is the
    // wearer, in a round window in the dark of the print
    still(rnd) {
      const s = new Still(rnd);
      const card = 'M54 58 H458 V494 H54 Z';
      const window = 'M80 80 H432 V432 H80 Z';
      const hole = `M${C - RI} ${C} A${RI} ${RI} 0 1 0 ${C + RI} ${C} A${RI} ${RI} 0 1 0 ${C - RI} ${C} Z`;
      const tape = (x, y, turn) => {
        // a strip torn off the roll: straight along its sides, ragged at its ends
        let d = `M${x - 62} ${y - 17}`;
        for (let i = 0; i <= 6; i++) d += ` L${n(x + 62 - (i % 2) * 5)} ${n(y - 17 + (i * 34) / 6)}`;
        for (let i = 6; i >= 0; i--) d += ` L${n(x - 62 + (i % 2) * 5)} ${n(y - 17 + (i * 34) / 6)}`;
        return `<path d="${d} Z" transform="rotate(${turn} ${x} ${y})"`;
      };
      // the card behind, and on it the shadow of the one in front
      s.paint((cv) => cv.add(`<path d="${card} ${hole}" fill-rule="evenodd" transform="rotate(5 256 256) translate(6 2)" fill="#e9e7e2" stroke="#b9b6b0" stroke-width="1.4"/>`));
      s.shadow((cv) => cv.add(`<path d="${card}" transform="rotate(-3 256 256) translate(3 5)"/>`), { blur: 6, opacity: 0.4 });
      s.paint((cv) => {
        // the photograph: its card, and the print with its round window (cut clean through, for the face)
        cv.add('<g transform="rotate(-3 256 256)">');
        cv.add(`<path d="${card} ${hole}" fill-rule="evenodd" fill="${linear(cv, [[0, '#ffffff'], [1, '#f1efea']], 54, 58, 458, 494)}" stroke="#c4c1ba" stroke-width="1.4"/>`);
        cv.add(`<path d="${window} ${hole}" fill-rule="evenodd" fill="${linear(cv, [[0, '#2a2c34'], [1, '#101116']], 80, 80, 432, 432)}"/>`);
        cv.add(`<path d="${window}" fill="none" stroke="#d6d3cc" stroke-width="1.6"/>`);
        cv.add('</g>');
        cv.add(`<path d="${round(RI + 1.5)}" fill="none" stroke="#0a0a0e" stroke-width="3"/>`);
      });
      s.paint((cv) => {
        for (const [x, y, turn] of [[74, 84, -34], [436, 462, -34]]) {
          cv.add(`${tape(x, y, turn)} fill="#f4eeda" fill-opacity="0.92" stroke="#c9c1a4" stroke-width="1.2"/>`);
          cv.add(`<path d="M${x - 52} ${y - 6} H${x + 50} M${x - 48} ${y + 7} H${x + 54}" transform="rotate(${turn} ${x} ${y})" stroke="#ffffff" stroke-width="2" stroke-opacity="0.6"/>`);
        }
      });
      return s.done({ finish: { paint: 0, grain: 0.012, contrast: 0.04, saturation: 1, ink: { colour: '#8a8780', width: 1.2, opacity: 0.8 } } });
    },
  },
];
