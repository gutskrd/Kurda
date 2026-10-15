/**
 * The shop's icons: Kurdish things painted as they are — a pomegranate split
 * open, a glass of tea on its saucer, a seal of red wax with the eight-point
 * star pressed into it, a saz, a buck with his head up — each lit as a
 * photographer lights a thing against a black cloth, and cut out of the dark,
 * so that it lies over a profile picture with nothing round it but its own
 * light.
 *
 * They sit on a profile picture at about 40 pixels, so each is one clear
 * shape first, its colour second and its detail last: the detail is for the
 * shop tile. Each is a still life (still.mjs): surfaces given relief and lit,
 * shadows cast, light given off.
 */
import { deerShapes } from './figures.mjs';
import { eightPointStar, n, pt } from './kit.mjs';
import { Still } from './still.mjs';

// ─────────────────────────────────────────────────────────────── shapes

/** A smooth closed outline through points (a Catmull-Rom spline, as cubic Béziers); open when `closed` is false. */
function spline(points, closed = true) {
  const count = points.length;
  const at = (i) => (closed ? points[(i + count) % count] : points[Math.max(0, Math.min(count - 1, i))]);
  let d = `M${pt(points[0])}`;
  for (let i = 0; i < (closed ? count : count - 1); i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d += ` C${pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${pt(p2)}`;
  }
  return closed ? `${d} Z` : d;
}

/** Points round (cx, cy) at radius `r`, the radius wandering by `wobble` in a few slow waves, as a hand-made thing's does. */
function roundish([cx, cy], r, rnd, { wobble = 0.04, count = 40, squash = 1 } = {}) {
  const waves = [2, 3, 5, 7].map((k) => [k, rnd() * Math.PI * 2, (rnd() * 0.6 + 0.4) / k]);
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    let m = 1;
    for (const [k, ph, amp] of waves) m += Math.sin(a * k + ph) * amp * wobble * 2;
    out.push([cx + Math.cos(a) * r * m, cy + Math.sin(a) * r * m * squash]);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────── icons

/** Points packed over a shape, `gap` apart in staggered rows, each nudged a little: seeds in a fruit, grains in an ear. */
function packed(inside, [x0, y0, x1, y1], gap, rnd, jitter = 0.25) {
  const out = [];
  for (let y = y0, row = 0; y <= y1; y += gap * 0.86, row++) {
    for (let x = x0 + (row % 2 ? gap / 2 : 0); x <= x1; x += gap) {
      const p = [x + (rnd() - 0.5) * gap * jitter, y + (rnd() - 0.5) * gap * jitter];
      if (inside(p)) out.push(p);
    }
  }
  return out;
}

/** Whether a point lies inside a polygon. */
function within(poly, [x, y]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A radial gradient, `stops` [offset, colour, opacity?], centred (cx, cy) radius r, in the canvas's own units. */
function radial(cv, stops, cx, cy, r, fx = cx, fy = cy) {
  const id = cv.id('rg');
  cv.def(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fx="${n(fx)}" fy="${n(fy)}">${stops.map(([o, c, a = 1]) => `<stop offset="${n(o)}" stop-color="${c}"${a === 1 ? '' : ` stop-opacity="${n(a)}"`}/>`).join('')}</radialGradient>`);
  return `url(#${id})`;
}

/** A linear gradient from (x1, y1) to (x2, y2). */
function linear(cv, stops, x1, y1, x2, y2) {
  const id = cv.id('lg');
  cv.def(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">${stops.map(([o, c, a = 1]) => `<stop offset="${n(o)}" stop-color="${c}"${a === 1 ? '' : ` stop-opacity="${n(a)}"`}/>`).join('')}</linearGradient>`);
  return `url(#${id})`;
}

/**
 * A long rounded shape along a line from `base` to `tip` — a petal, a leaf,
 * a feather — `width` across at its widest, `at` of the way along, bent
 * sideways by `bend` (as a fraction of its length), its tip `point`ed (1) or
 * blunt (0).
 */
function blade(base, tip, width, { at = 0.55, bend = 0, point = 0.6, count = 14 } = {}) {
  const dx = tip[0] - base[0];
  const dy = tip[1] - base[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const left = [];
  const right = [];
  const k = Math.log(0.5) / Math.log(at);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const w = (width / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, k)), 0.75) * (1 - point * Math.pow(t, 6));
    const off = bend * len * Math.sin(Math.PI * t);
    const cx = base[0] + dx * t - uy * off;
    const cy = base[1] + dy * t + ux * off;
    left.push([cx - uy * w, cy + ux * w]);
    right.push([cx + uy * w, cy - ux * w]);
  }
  return spline([...left, ...right.reverse().slice(1, -1)]);
}

/** A point on a line, `t` of the way from a to b. */
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** `count` + 1 points along a smooth curve through `points` (Catmull-Rom). */
function along(points, count = 24) {
  const out = [];
  const m = points.length - 1;
  for (let k = 0; k <= count; k++) {
    const t = (k / count) * m;
    const i = Math.min(m - 1, Math.floor(t));
    const f = t - i;
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(m, i + 2)];
    out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * f + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * f * f + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * f * f * f)));
  }
  return out;
}

/** A tube along a smooth curve through `points`, `w0` thick at its start and `w1` at its end: a spout, a handle, a log. */
function tube(points, w0, w1 = w0, count = 24) {
  const line = along(points, count);
  const left = [];
  const right = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const w = (w0 + ((w1 - w0) * i) / (line.length - 1)) / 2;
    left.push([line[i][0] - ((b[1] - a[1]) / l) * w, line[i][1] + ((b[0] - a[0]) / l) * w]);
    right.push([line[i][0] + ((b[1] - a[1]) / l) * w, line[i][1] - ((b[0] - a[0]) / l) * w]);
  }
  return spline([...left, ...right.reverse()]);
}

/**
 * Fur: `count` short hairs over the box [x0, y0, x1, y1], clipped to the
 * outline `d`, each lying along `flow(x, y)` (degrees), in `colours`, as
 * faint strokes — painted into a coat's colours, or into its relief.
 */
function fur(cv, rnd, d, [x0, y0, x1, y1], flow, count, colours, { length = 7, width = 1, opacity = [0.12, 0.3] } = {}) {
  const clip = cv.id('fur');
  cv.def(`<clipPath id="${clip}"><path d="${d}"/></clipPath>`);
  let out = `<g clip-path="url(#${clip})" fill="none" stroke-linecap="round">`;
  for (let i = 0; i < count; i++) {
    const x = x0 + rnd() * (x1 - x0);
    const y = y0 + rnd() * (y1 - y0);
    const a = ((flow(x, y) + (rnd() - 0.5) * 16) * Math.PI) / 180;
    const l = length * (0.6 + rnd() * 0.8);
    const bend = (rnd() - 0.5) * l * 0.3;
    const e = [x + Math.cos(a) * l, y + Math.sin(a) * l];
    const m = [x + Math.cos(a) * l * 0.5 - Math.sin(a) * bend, y + Math.sin(a) * l * 0.5 + Math.cos(a) * bend];
    out += `<path d="M${pt([x, y])} Q${pt(m)} ${pt(e)}" stroke="${colours[Math.floor(rnd() * colours.length)]}" stroke-width="${n(width * (0.7 + rnd() * 0.6))}" stroke-opacity="${n(opacity[0] + rnd() * (opacity[1] - opacity[0]))}"/>`;
  }
  cv.add(`${out}</g>`);
}

/**
 * A tulip, its cup of six tepals in `colours` ([base, middle, tip, back]): the
 * three behind just showing their tips, the three in front closing round
 * them in an egg-shaped cup, satin, fine streaks running up them, the light
 * coming through their edges; a thick stem, and two broad leaves, grey-green
 * with the bloom on them, folded along the middle and arching away.
 */
function tulip(rnd, [base, middle, tip, back]) {
  const s = new Still(rnd);
  const satin = { gloss: 0.32, shine: 16, wrap: 0.5, sheen: 0.3 };
  const petal = (cv, b, t, w, o) => {
    const d = blade(b, t, w, o);
    cv.add(`<path d="${d}" fill="${linear(cv, [[0, base], [0.38, middle], [0.85, tip], [1, middle]], b[0], b[1], t[0], t[1])}"/>`);
    // (its edge thinner, so lighter, where the light comes through it)
    const clip = cv.id('tepal');
    cv.def(`<clipPath id="${clip}"><path d="${d}"/></clipPath>`);
    cv.add(`<path d="${d}" clip-path="url(#${clip})" fill="none" stroke="${tip}" stroke-width="7" stroke-opacity="0.35"/>`);
    return d;
  };
  // fine streaks of deeper colour, and a few paler, running up each tepal
  const streaks = (cv, b, t, count, spread) => {
    for (let i = 0; i < count; i++) {
      const f = (i / (count - 1) - 0.5) * spread * (0.9 + rnd() * 0.2);
      const m = lerp(b, t, 0.55);
      const pale = rnd() < 0.25;
      cv.add(`<path d="M${pt(lerp(b, t, 0.06))} Q${pt([m[0] + f, m[1]])} ${pt([t[0] + f * 0.35, t[1] + 14 + rnd() * 16])}" fill="none" stroke="${pale ? tip : base}" stroke-width="${n(0.8 + rnd() * 1.6)}" stroke-opacity="${n(0.1 + rnd() * 0.14)}"/>`);
    }
  };
  // a leaf: broad, folded along its midrib, its fine veins running the length of it
  const leaf = (b, t, w, bend) => {
    const d = blade(b, t, w, { at: 0.3, bend, point: 1 });
    const len = Math.hypot(t[0] - b[0], t[1] - b[1]);
    const rib = (off) => {
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const u = k / 12;
        const sway = bend * len * Math.sin(Math.PI * u);
        const half = (w / 2) * off * Math.pow(Math.sin(Math.PI * Math.pow(u, Math.log(0.5) / Math.log(0.3))), 0.75) * (1 - Math.pow(u, 6));
        const ux = (t[0] - b[0]) / len;
        const uy = (t[1] - b[1]) / len;
        pts.push([b[0] + (t[0] - b[0]) * u - uy * (sway + half), b[1] + (t[1] - b[1]) * u + ux * (sway + half)]);
      }
      return spline(pts, false);
    };
    const veins = (cv, colour, opacity) => cv.add(`<g fill="none" stroke="${colour}" stroke-width="1" stroke-opacity="${opacity}">${[-0.7, -0.45, -0.22, 0.22, 0.45, 0.7].map((o) => `<path d="${rib(o)}"/>`).join('')}</g>`);
    s.surface(
      (cv) => {
        cv.add(`<path d="${d}" fill="${linear(cv, [[0, '#24382c'], [0.45, '#46664f'], [1, '#7c9a88']], ...b, ...t)}"/>`);
        // (the bloom on it: a bluish grey, thickest away from the midrib)
        cv.add(`<path d="${d}" fill="#a8bcc0" fill-opacity="0.16"/>`);
        veins(cv, '#9ab4a4', 0.35);
        cv.add(`<path d="${rib(0)}" fill="none" stroke="#2a4232" stroke-width="2.5" stroke-opacity="0.6"/>`);
      },
      {
        inflate: { radius: 12, profile: 'soft', height: 0.5 },
        relief: [
          // folded: its two halves rising from the midrib
          { draw: (cv) => cv.add(`<path d="${d}" fill="#fff"/><path d="${rib(0)}" fill="none" stroke="#000" stroke-width="${n(w * 0.55)}" stroke-linecap="round"/>`), height: 9, blur: 9 },
          { draw: (cv) => veins(cv, '#fff', 0.6), height: 0.8, blur: 0.6 },
        ],
        material: { gloss: 0.3, shine: 20, wrap: 0.3, sheen: 0.35, hollows: 0.6 },
      },
    );
  };
  // (a leaf clasps the stem low down, rises along it and arches away; the second, lower, bends out the other way)
  leaf([268, 498], [412, 350], 58, 0.24);
  s.surface((cv) => cv.add(`<path d="M250 292 C254 360 260 430 260 508 L276 508 C276 430 270 360 266 292 Z" fill="${linear(cv, [[0, '#2e4c2c'], [0.45, '#5a8450'], [1, '#2a4628']], 250, 0, 276, 0)}"/>`), {
    inflate: { radius: 8, profile: 'round', height: 1 },
    mottle: { scale: 4, amount: 0.08, stretch: 8, angle: 90 },
    material: { gloss: 0.3, shine: 24, sheen: 0.35 },
  });
  leaf([254, 506], [112, 248], 70, -0.24);
  const behind = [[[246, 290], [214, 66], 100, { at: 0.6, bend: -0.03, point: 0.4 }], [[266, 290], [302, 58], 100, { at: 0.6, bend: 0.04, point: 0.4 }]];
  s.surface((cv) => {
    for (const [b, t, w, o] of behind) petal(cv, b, t, w, o);
    cv.add(`<g fill="${back}" fill-opacity="0.45">${behind.map(([b, t, w, o]) => `<path d="${blade(b, t, w, o)}"/>`).join('')}</g>`);
  }, { inflate: { radius: 30, profile: 'soft', height: 0.5 }, material: satin });
  const sides = [[[250, 304], [184, 90], 128, { at: 0.55, bend: -0.12, point: 0.4 }], [[262, 304], [330, 80], 130, { at: 0.55, bend: 0.13, point: 0.4 }]];
  s.surface((cv) => {
    for (const [b, t, w, o] of sides) {
      petal(cv, b, t, w, o);
      streaks(cv, b, t, 12, 80);
    }
  }, { inflate: { radius: 44, profile: 'soft', height: 0.75 }, bumps: { scale: 12, amount: 0.3, stretch: 6, angle: -80 }, material: satin });
  const front = [[256, 312], [250, 72], 150, { at: 0.5, bend: -0.03, point: 0.35 }];
  s.shadow((cv) => cv.add(`<path d="${blade(...front)}" fill="#000" transform="translate(10 8)"/>`), { blur: 12, opacity: 0.45 });
  s.surface((cv) => {
    petal(cv, ...front);
    streaks(cv, front[0], front[1], 18, 130);
  }, { inflate: { radius: 54, profile: 'soft', height: 0.8 }, bumps: { scale: 12, amount: 0.3, stretch: 6, angle: -90 }, material: satin });
  return s.done({ finish: { grain: 0.004, saturation: 0.95 } });
}

export const ICONS = [
  {
    key: 'hinar',
    ku: 'Hinar',
    en: 'Pomegranate',
    // a ripe pomegranate, its leathery skin a little angular, the crown of its calyx at the top, split open at the
    // front: the torn skin's pale pith round the hollow, and the seeds packed in it, ruby, wet and shining
    still(rnd) {
      const s = new Still(rnd);
      const C = [250, 296];
      const fruit = [];
      for (let i = 0; i < 52; i++) {
        const a = (i / 52) * Math.PI * 2;
        const m = 1 + 0.012 * Math.cos(a * 6 + 0.4) + 0.012 * Math.sin(a * 3 + 1);
        fruit.push([C[0] + Math.cos(a) * 178 * m, C[1] + Math.sin(a) * 166 * m]);
      }
      s.surface(
        (cv) => {
          const skin = spline(fruit);
          const clip = cv.id('skin');
          cv.def(`<clipPath id="${clip}"><path d="${skin}"/></clipPath>`);
          cv.add(`<path d="${skin}" fill="${radial(cv, [[0, '#c63e28'], [0.35, '#a8201e'], [0.75, '#80111a'], [1, '#520a10']], 196, 232, 250, 170, 200)}"/>`);
          // the blush toward the crown, and the skin's small pale freckles
          const blush = cv.id('bl');
          cv.def(`<filter id="${blush}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>`);
          cv.add(`<g clip-path="url(#${clip})"><ellipse cx="196" cy="176" rx="104" ry="64" fill="#d8763a" fill-opacity="0.42" filter="url(#${blush})"/>`);
          for (let i = 0; i < 70; i++) {
            const a = rnd() * Math.PI * 2;
            const r = Math.sqrt(rnd()) * 160;
            cv.add(`<circle cx="${n(C[0] + Math.cos(a) * r)}" cy="${n(C[1] + Math.sin(a) * r * 0.94)}" r="${n(1 + rnd() * 1.6)}" fill="#e8a060" fill-opacity="${n(0.25 + rnd() * 0.3)}"/>`);
          }
          cv.add('</g>');
        },
        { inflate: { radius: 165, profile: 'round', height: 0.85, soften: 2 }, bumps: { scale: 6, amount: 0.25 }, mottle: { scale: 22, amount: 0.12 }, material: { gloss: 0.32, shine: 22, wrap: 0.1, sheen: 0.4 } },
      );
      // the crown: a short tube flaring into pointed sepals
      const crown = 'M206 146 C204 128 200 116 192 104 C198 106 204 108 210 112 C212 100 214 92 216 82 C222 92 226 100 230 108 C236 98 242 92 250 86 C250 98 248 108 246 116 C254 112 262 110 270 110 C264 120 258 128 252 136 C252 142 252 148 250 154 C236 162 218 160 206 146 Z';
      s.surface((cv) => cv.add(`<path d="${crown}" fill="${linear(cv, [[0, '#7a1a18'], [0.6, '#a0281e'], [1, '#c04a2a']], 220, 84, 230, 158)}"/>`), {
        inflate: { radius: 16, profile: 'soft', height: 1 },
        bumps: { scale: 3, amount: 0.15 },
        material: { gloss: 0.25, shine: 20, sheen: 0.4 },
      });
      // the split: the hollow, its rim of pith, and the seeds
      const hole = roundish([312, 318], 104, rnd, { wobble: 0.12, count: 26, squash: 0.92 });
      const holeD = spline(hole);
      s.surface(
        (cv) => cv.add(`<path d="${holeD}" fill="#2a0408"/>`),
        { relief: { draw: (cv) => cv.add(`<path d="${holeD}" fill="${radial(cv, [[0, '#000'], [0.7, '#444'], [1, '#fff']], 312, 318, 110)}"/>`), height: 14, blur: 3 }, material: { gloss: 0.1, sheen: 0.1 } },
      );
      // (the torn edge of the skin: thin, ragged, the yellowish pith showing in it, and the pale membranes running in
      // between the seeds)
      const torn = roundish([312, 318], 99, rnd, { wobble: 0.14, count: 34, squash: 0.92 });
      s.surface(
        (cv) => {
          cv.add(`<path d="${holeD}" fill="none" stroke="#e6c79c" stroke-width="11" stroke-linejoin="round"/><path d="${spline(torn)}" fill="none" stroke="#d8b080" stroke-width="5" stroke-linejoin="round" stroke-opacity="0.8"/>`);
          for (let i = 0; i < 4; i++) {
            const a = -0.6 + i * 0.75 + rnd() * 0.3;
            cv.add(`<path d="M${pt([312 + Math.cos(a) * 96, 318 + Math.sin(a) * 88])} Q${pt([312 + Math.cos(a + 0.3) * 50, 318 + Math.sin(a + 0.3) * 46])} ${pt([312 + rnd() * 20 - 10, 318 + rnd() * 20 - 10])}" fill="none" stroke="#e8c898" stroke-width="5" stroke-opacity="0.85" stroke-linecap="round"/>`);
          }
        },
        { inflate: { radius: 5, profile: 'soft', height: 1 }, bumps: { scale: 2, amount: 0.3 }, material: { gloss: 0.2, shine: 14, wrap: 0.4, sheen: 0.2 } },
      );
      const inner = roundish([312, 318], 92, rnd, { wobble: 0.1, count: 26, squash: 0.92 });
      const seeds = packed((q) => within(inner, q), [200, 200, 420, 420], 21, rnd, 0.35);
      s.surface(
        (cv) => {
          for (const [x, y] of seeds) {
            // pressed against each other, each seed a little angular, its jewel colour deepest at its edge
            const r = 10.5 + rnd() * 2.2;
            const pts = roundish([x, y], r, rnd, { wobble: 0.16, count: 7, squash: 1.12 + rnd() * 0.14 });
            cv.add(`<path d="${spline(pts)}" fill="${radial(cv, [[0, '#c41e3c'], [0.55, '#8a0c22'], [1, '#4a0410']], x - r * 0.25, y - r * 0.3, r * 1.3)}"/>`);
          }
        },
        { inflate: { radius: 11, profile: 'round', height: 1 }, material: { gloss: 1.1, shine: 160, wrap: 0.6, sheen: 0.35, hollows: 0.5 } },
      );
      // the torn skin's shadow over the seeds below its upper edge
      s.shadow((cv) => cv.add(`<path d="${holeD}" fill="none" stroke="#000" stroke-width="26" transform="translate(9 11)"/>`), { blur: 6, opacity: 0.5 });
      return s.done({ finish: { grain: 0.004 } });
    },
  },
  {
    key: 'roj',
    ku: 'Roj',
    en: 'Sun',
    // the sun of the flag, as a thing of light: its twenty-one rays wavering like flames round a bright disc with a
    // spiral turning in it, white-hot at the heart, gold at the tips, glowing on whatever it lies over
    still(rnd) {
      const s = new Still(rnd);
      const C = [256, 256];
      const rays = [];
      for (let i = 0; i < 21; i++) {
        const a = (i / 21) * Math.PI * 2 - Math.PI / 2;
        const long = i % 2 === 0;
        const r0 = 104;
        const r1 = long ? 238 : 196;
        const w0 = long ? 24 : 18;
        const ph = rnd() * Math.PI * 2;
        const left = [];
        const right = [];
        for (let k = 0; k <= 10; k++) {
          const t = k / 10;
          const r = r0 + (r1 - r0) * t;
          // a flame's waver: more toward the tip
          const wob = Math.sin(t * Math.PI * 2.2 + ph) * 0.07 * t;
          const ang = a + wob;
          const w = (w0 / 2) * Math.pow(1 - t, 0.8) / r;
          left.push([C[0] + Math.cos(ang - w) * r, C[1] + Math.sin(ang - w) * r]);
          right.push([C[0] + Math.cos(ang + w) * r, C[1] + Math.sin(ang + w) * r]);
        }
        rays.push(spline([...left, ...right.reverse()]));
      }
      const spiral = [];
      for (let t = 0; t <= 1; t += 0.01) {
        const a = t * Math.PI * 2 * 3.4 - Math.PI / 2;
        const r = 7 + 80 * t;
        spiral.push([C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]);
      }
      const all = (cv, fill) => cv.add(`<g fill="${fill}">${rays.map((d) => `<path d="${d}"/>`).join('')}<circle cx="${C[0]}" cy="${C[1]}" r="112"/></g>`);
      s.glow((cv) => all(cv, '#ffae2a'), { blur: 22, strength: 0.75, halo: 0.9 });
      s.paint((cv) => all(cv, radial(cv, [[0, '#fffdf2'], [0.45, '#fff1b8'], [0.75, '#ffd760'], [1, '#f5a622']], C[0], C[1], 240)));
      s.paint((cv) => cv.add(`<circle cx="${C[0]}" cy="${C[1]}" r="104" fill="${radial(cv, [[0, '#fffffa'], [0.7, '#fff6d0'], [1, '#ffe48a']], C[0], C[1], 104)}"/>`));
      s.paint((cv) => cv.add(`<path d="${spline(spiral, false)}" fill="none" stroke="#e4961c" stroke-width="8" stroke-linecap="round" stroke-opacity="0.8"/>`), { blur: 0.8 });
      s.glow((cv) => cv.add(`<circle cx="${C[0]}" cy="${C[1]}" r="70" fill="#fff8e0"/>`), { blur: 14, strength: 0.5, halo: 0.4 });
      return s.done({ finish: { grain: 0.003, contrast: 0.05 } });
    },
  },
  {
    key: 'ciya',
    ku: 'Çiya',
    en: 'Mountain',
    // a high peak of the Zagros in late spring: its ridges of dark rock running down from the summit, snow lying
    // in the gullies between them and over the shoulders, the morning light on its western faces, and its foot
    // lost in cloud
    still(rnd) {
      const s = new Still(rnd);
      const ridge = [[18, 512], [30, 430], [66, 378], [102, 344], [138, 300], [160, 268], [186, 236], [206, 196], [226, 152], [244, 106], [262, 62], [278, 84], [298, 118], [322, 150], [346, 176], [366, 192], [384, 176], [404, 160], [424, 186], [446, 226], [470, 280], [490, 340], [500, 430], [494, 512]];
      // (broken, as rock breaks: each stretch of the crest split again and again, its middle pushed up or down)
      const broken = (a, b, depth, rough) => {
        if (depth === 0) return [a];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const off = (rnd() - 0.5) * len * rough;
        const m = [(a[0] + b[0]) / 2 + ((a[1] - b[1]) / len) * off, (a[1] + b[1]) / 2 + ((b[0] - a[0]) / len) * off];
        return [...broken(a, m, depth - 1, rough), ...broken(m, b, depth - 1, rough)];
      };
      const crest = [];
      for (let i = 0; i < ridge.length - 1; i++) crest.push(...(i === 0 || i === ridge.length - 2 ? [ridge[i]] : broken(ridge[i], ridge[i + 1], 4, 0.22)));
      crest.push(ridge[ridge.length - 1]);
      const outline = `M${crest.map(pt).join(' L')} Z`;
      // (the spurs: ridges running down from the crest, each a crest of its own between two gullies)
      const spurs = [
        [[262, 66], [250, 150], [236, 250], [214, 360]],
        [[244, 110], [214, 170], [180, 230], [130, 330]],
        [[226, 154], [198, 214], [160, 290], [96, 380]],
        [[278, 86], [290, 170], [300, 260], [312, 380]],
        [[298, 120], [328, 190], [350, 270], [370, 380]],
        [[404, 162], [400, 230], [392, 300], [380, 400]],
        [[404, 162], [432, 230], [456, 300], [470, 400]],
        [[186, 238], [160, 300], [130, 370]],
      ];
      s.surface(
        (cv) => cv.add(`<path d="${outline}" fill="${linear(cv, [[0, '#6a6460'], [0.45, '#57504a'], [0.7, '#4e4a3a'], [1, '#3e3c30']], 0, 60, 0, 512)}"/>`),
        {
          inflate: { radius: 300, profile: 'bevel', height: 0.6, soften: 14 },
          relief: { draw: (cv) => cv.add(`<g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">${spurs.map((sp) => `<path d="${spline(sp, false)}" stroke-width="${n(10 + rnd() * 6)}" stroke-opacity="${n(0.7 + rnd() * 0.3)}"/>`).join('')}</g>`), height: 34, blur: 14 },
          bumps: { scale: 30, amount: 10, stretch: 2, angle: 96, ridged: true, octaves: 6 },
          mottle: { scale: 18, amount: 0.22 },
          snow: { colour: '#dde2ea', line: 320, soft: 170, up: 1.2, steep: 0.5, crests: 1.6, wander: 0.45, scale: 12 },
          material: { gloss: 0.05, shine: 8, wrap: 0.1, sheen: 0.4, hollows: 0.9 },
          mask: (cv) => cv.add(`<rect width="512" height="512" fill="${linear(cv, [[0, '#fff'], [0.72, '#fff'], [0.9, '#000']], 0, 0, 0, 512)}"/>`),
        },
      );
      // the cloud round its foot, in wisps torn by the wind
      s.paint((cv) => {
        const torn = cv.id('wisp');
        cv.def(`<filter id="${torn}" x="-30%" y="-60%" width="160%" height="220%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.05" numOctaves="3" seed="${Math.floor(rnd() * 1000)}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="40" xChannelSelector="R" yChannelSelector="G"/></filter>`);
        cv.add(`<g filter="url(#${torn})" fill="#e2e8ef">`);
        for (let i = 0; i < 12; i++) {
          const x = 30 + rnd() * 450;
          const y = 352 + rnd() * 70;
          cv.add(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(36 + rnd() * 56)}" ry="${n(6 + rnd() * 9)}" fill-opacity="${n(0.1 + rnd() * 0.22)}"/>`);
        }
        cv.add('</g>');
      }, { blur: 5, mask: (cv) => cv.add(`<path d="${outline}" fill="#fff"/>`) });
      return s.done({
        light: { key: [[-0.75, -0.42, 0.5], [1, 0.95, 0.88], 1.05], fill: [[0.8, 0.1, 0.5], [0.5, 0.58, 0.76], 0.3], ambient: [0.17, 0.19, 0.24] },
        finish: { grain: 0.004, saturation: 0.9, contrast: 0.14 },
      });
    },
  },
  {
    key: 'lale',
    ku: 'Lale',
    en: 'Tulip',
    still: (rnd) => tulip(rnd, ['#5a0e12', '#ae1c26', '#d8423a', '#2a0406']),
  },
  {
    key: 'laleya-mor',
    ku: 'Laleya Mor',
    en: 'Purple tulip',
    still: (rnd) => tulip(rnd, ['#26103a', '#58247e', '#8c52b6', '#140420']),
  },
  {
    key: 'ask',
    ku: 'Ask',
    en: 'Deer',
    // a buck standing in the open with his head up, looking out: the deer of the backgrounds (figures.mjs), heavy
    // and deep through the chest, his neck thick, in his grey-brown autumn coat, white at the throat, round the eye
    // and the muzzle and under the belly; a black nose, a dark wet eye, and a rack of tall tines, pale at their
    // tips
    still(rnd) {
      const s = new Still(rnd);
      const d = deerShapes({ x: 325, y: 490, size: 272, facing: -1, pose: 'alert' });
      const F = d.frame;
      const Hd = d.head;
      const k = 2.72;
      const coat = { gloss: 0.06, shine: 8, wrap: 0.45, sheen: 0.8, hollows: 0.8 };
      const hairs = ['#24180e', '#3e2c1c', '#a88a66', '#cdb898'];
      // the way the hair lies: back along the body and down its flank, down the neck, back along the face
      const flow = (x, y) => {
        const [nx] = F([96, 0]);
        if (y < Hd([20, 0])[1] + 30 && x < Hd([0, 0])[0] + 20) return -10;
        return x < nx ? 70 : 12;
      };
      const deg = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      const face = deg(Hd([0, 0]), Hd([10, 0]));
      const soft = (cv, sd) => {
        const id = cv.id('soft');
        cv.def(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`);
        return `url(#${id})`;
      };
      const clipTo = (cv, path) => {
        const id = cv.id('clip');
        cv.def(`<clipPath id="${id}"><path d="${path}"/></clipPath>`);
        return `url(#${id})`;
      };
      const span = (a, b) => [Math.min(a[0], b[0]) - 10, Math.min(a[1], b[1]) - 10, Math.max(a[0], b[0]) + 10, Math.max(a[1], b[1]) + 10];
      const hooves = (cv, path) => cv.add(`<rect x="0" y="${n(F([0, -5])[1])}" width="512" height="40" fill="#1e160e" clip-path="${clipTo(cv, path)}"/>`);
      // a leg: the coat's colours down to tan, its hoof black; a near one laid over the body, its top faded into it
      // from `fade` (in the deer's frame) to `full`, so that the round of the haunch or the shoulder comes out of
      // the body as it does
      const leg = (path, top, shade, [fade, full] = [null, null]) =>
        s.surface(
          (cv) => {
            cv.add(`<path d="${path}" fill="${linear(cv, shade ? [[0, '#2e2216'], [0.35, '#4a3624'], [0.65, '#5e4630'], [1, '#6a5038']] : [[0, '#4e3824'], [0.32, '#7a5c3e'], [0.6, '#957756'], [1, '#a88a66']], 0, F([0, -108])[1], 0, F([0, 0])[1])}"/>`);
            fur(cv, rnd, path, [0, top, 512, 492], () => 90, 260, hairs, { length: 6, opacity: [0.06, 0.18] });
            hooves(cv, path);
          },
          {
            inflate: { radius: 9, profile: 'round', height: 0.8 },
            mottle: { scale: 3, amount: 0.08, stretch: 4, angle: 90 },
            material: coat,
            mask: fade === null ? null : (cv) => cv.add(`<rect width="512" height="512" fill="${linear(cv, [[0, '#000'], [1, '#fff']], 0, F([0, fade])[1], 0, F([0, full])[1])}"/>`),
          },
        );
      // an antler: bone, dark and rough at the base, pale and smooth at the tips
      const antler = (paths, shade) =>
        s.surface(
          (cv) => {
            const [bx, by] = Hd([7.5, -2.5]);
            const g = radial(cv, shade ? [[0, '#3e3024'], [0.3, '#6a5640'], [1, '#b8a888']] : [[0, '#4a3a2a'], [0.25, '#86704e'], [0.7, '#c8b48e'], [1, '#efe6d0']], bx, by, 130);
            cv.add(`<g fill="${g}">${paths.map((p) => `<path d="${p}"/>`).join('')}</g>`);
          },
          { inflate: { radius: 4, profile: 'round', height: 0.9 }, bumps: { scale: 1.6, amount: 0.5, stretch: 3 }, material: { gloss: 0.4, shine: 34, wrap: 0.1, sheen: 0.5, hollows: 0.6 } },
        );
      // the far side, in its own shade: the far legs, the far antler and ear behind the head
      leg(d.far.hind, F([0, -90])[1], true);
      leg(d.far.fore, F([0, -70])[1], true);
      antler(d.far.antler, true);
      s.surface((cv) => cv.add(`<path d="${d.far.ear}" fill="${linear(cv, [[0, '#3a2a1c'], [1, '#6a5038']], ...Hd([0, 0]), ...Hd([-6, -18]))}"/>`), { inflate: { radius: 5, profile: 'soft', height: 0.5 }, material: coat });
      // the body, the neck and the head: grey-brown, darker along the back, white under the belly, at the throat,
      // round the eye and the muzzle; the hair lying as it lies
      const box = [0, 40, 512, 492];
      s.surface(
        (cv) => {
          cv.add(`<path d="${d.body}" fill="${linear(cv, [[0, '#4e3824'], [0.35, '#6e5234'], [0.7, '#8e7050'], [1, '#a88c6a']], 0, F([0, -108])[1], 0, F([0, -44])[1])}"/>`);
          cv.add(`<path d="${d.tail}" fill="#5e4430"/>`);
          cv.add(`<g clip-path="${clipTo(cv, d.body)}" filter="${soft(cv, 6)}">`);
          // (the white of the belly, from the brisket back under the flank)
          cv.add(`<path d="M${pt(F([104, -42]))} C${pt(F([80, -44]))} ${pt(F([50, -55]))} ${pt(F([26, -62]))}" fill="none" stroke="#e8e0d2" stroke-width="${n(9 * k)}" stroke-opacity="0.85"/>`);
          // (the darker line of the back and the face)
          cv.add(`<path d="M${pt(F([14, -106]))} C${pt(F([50, -104]))} ${pt(F([90, -103]))} ${pt(F([104, -114]))}" fill="none" stroke="#2e2014" stroke-width="${n(7 * k)}" stroke-opacity="0.5"/>`);
          cv.add('</g>');
          const throat = Hd([10, 23]);
          const eye = Hd([12, 5.5]);
          cv.add(`<g clip-path="${clipTo(cv, d.body)}"><g filter="${soft(cv, 2.6)}">`);
          cv.add(`<ellipse cx="${n(throat[0])}" cy="${n(throat[1])}" rx="${n(7 * k)}" ry="${n(4.6 * k)}" transform="rotate(${n(face + 70)} ${n(throat[0])} ${n(throat[1])})" fill="#f2ece2"/>`);
          cv.add(`<ellipse cx="${n(eye[0])}" cy="${n(eye[1])}" rx="${n(5 * k)}" ry="${n(3.8 * k)}" transform="rotate(${n(face)} ${n(eye[0])} ${n(eye[1])})" fill="#d8ccb8" fill-opacity="0.35"/>`);
          // the pale band behind the nose, and the white of the chin
          cv.add(`<path d="M${pt(Hd([24.6, 4]))} L${pt(Hd([25.8, 12.6]))}" stroke="#e8e0d2" stroke-width="${n(2.4 * k)}" stroke-linecap="round" stroke-opacity="0.6"/>`);
          cv.add(`<path d="M${pt(Hd([20, 17]))} L${pt(Hd([28, 14.6]))}" stroke="#ece4d6" stroke-width="${n(2.4 * k)}" stroke-linecap="round" stroke-opacity="0.7"/>`);
          // the bridge of the nose, darker
          cv.add(`<path d="M${pt(Hd([8, -1]))} L${pt(Hd([27, 3.4]))}" stroke="#2a1c10" stroke-width="${n(3.4 * k)}" stroke-linecap="round" stroke-opacity="0.45"/>`);
          cv.add('</g></g>');
          fur(cv, rnd, d.body, box, flow, 2600, hairs, { length: 7, opacity: [0.06, 0.2] });
        },
        {
          inflate: { radius: 34, profile: 'soft', height: 0.7, soften: 2 },
          relief: [
            // the masses under the coat: the haunch, the ribs, the shoulder, the neck's muscle, the cheek
            {
              draw: (cv) => {
                cv.add(`<g filter="${soft(cv, 10)}" fill="#fff">`);
                const blob = (c, rx, ry, rot, o) => {
                  const [cx, cy] = F(c);
                  cv.add(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx * k)}" ry="${n(ry * k)}" transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})" fill-opacity="${o}"/>`);
                };
                blob([18, -80], 19, 21, 0, 1);
                blob([56, -78], 24, 15, 0, 0.55);
                blob([88, -74], 12, 21, -15, 0.9);
                blob([92, -56], 8, 10, 0, 0.6);
                blob([106, -104], 9, 20, 30, 0.6);
                cv.add('</g>');
                const [cx, cy] = Hd([10, 11]);
                cv.add(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(7 * k)}" ry="${n(5 * k)}" fill="#fff" fill-opacity="0.7" filter="${soft(cv, 4)}"/>`);
              },
              height: 16,
              blur: 2,
            },
            // the hollow of the eye, and the nostril
            {
              draw: (cv) => {
                for (const [c, rx, ry] of [[Hd([12, 5.5]), 4.6, 3.6], [Hd([31, 8]), 1.4, 1.1]]) cv.add(`<ellipse cx="${n(c[0])}" cy="${n(c[1])}" rx="${n(rx * k)}" ry="${n(ry * k)}" transform="rotate(${n(face)} ${n(c[0])} ${n(c[1])})" fill="#fff"/>`);
              },
              height: -4,
              blur: 2,
            },
            // the coat's hair, raised a little
            { draw: (cv) => fur(cv, rnd, d.body, box, flow, 1600, ['#fff'], { length: 8, width: 1.2, opacity: [0.3, 0.7] }), height: 0.9, blur: 0.4 },
          ],
          mottle: { scale: 5, amount: 0.08 },
          material: coat,
        },
      );
      // the near legs, lit, over the body: the haunch and the thigh, the shoulder and the forearm
      leg(d.near.hind, F([0, -96])[1], false, [-84, -64]);
      leg(d.near.fore, F([0, -70])[1], false, [-62, -47]);
      // the eye: dark, wet, a glint of the sky in it
      const eye = Hd([12, 5.5]);
      s.surface((cv) => cv.add(`<ellipse cx="${n(eye[0])}" cy="${n(eye[1])}" rx="${n(3.2 * k)}" ry="${n(2.4 * k)}" transform="rotate(${n(face - 8)} ${n(eye[0])} ${n(eye[1])})" fill="${radial(cv, [[0, '#2a1608'], [0.7, '#120904'], [1, '#050302']], eye[0], eye[1], 3.2 * k)}"/>`), {
        inflate: { radius: 2.4 * k, profile: 'round', height: 0.7 },
        material: { gloss: 1.6, shine: 220, sheen: 0.4, hollows: 0 },
      });
      s.paint((cv) => cv.add(`<ellipse cx="${n(eye[0] - 2.4)}" cy="${n(eye[1] - 2.4)}" rx="2.6" ry="1.7" fill="#fff" fill-opacity="0.85"/>`), { blur: 0.4 });
      // the nose, black and wet
      const nose = [Hd([26.6, 4.6]), Hd([31.4, 5.4]), Hd([33.8, 8.6]), Hd([33, 11.6]), Hd([29.6, 12.4]), Hd([26.8, 10])];
      s.surface((cv) => cv.add(`<path d="${spline(nose)}" fill="#141010"/>`), {
        inflate: { radius: 2.6 * k, profile: 'round', height: 0.8 },
        bumps: { scale: 1, amount: 0.4 },
        material: { gloss: 0.9, shine: 70, sheen: 0.3 },
      });
      // the near ear, its inside to us: pale, furred white, darker at its rim
      s.surface(
        (cv) => {
          cv.add(`<path d="${d.near.ear}" fill="${linear(cv, [[0, '#5a4430'], [0.4, '#9a8268'], [1, '#c8b49a']], ...Hd([0, 0]), ...Hd([-6, -18]))}"/>`);
          fur(cv, rnd, d.near.ear, span(Hd([4, 2]), Hd([-10, -24])), () => -60, 120, ['#f6eee2', '#fff', '#d8c8b4'], { length: 8, width: 0.9, opacity: [0.2, 0.5] });
          cv.add(`<path d="${d.near.ear}" clip-path="${clipTo(cv, d.near.ear)}" fill="none" stroke="#2a1c10" stroke-width="7" stroke-opacity="0.5"/>`);
        },
        { inflate: { radius: 6, profile: 'soft', height: 0.4 }, material: { ...coat, wrap: 0.6 } },
      );
      antler(d.near.antler, false);
      return s.done({ finish: { grain: 0.004, saturation: 0.95 } });
    },
  },
  {
    key: 'sterk',
    ku: 'Stêrk',
    en: 'Eight-point star',
    // a seal of dark red wax, the eight-point star pressed into it: the wax spread out round the stamp, pushed up in a
    // lip round it, glossy where the light catches it
    still(rnd) {
      const s = new Still(rnd);
      const C = [256, 260];
      const wax = spline(roundish(C, 200, rnd, { wobble: 0.05 }));
      s.surface((cv) => cv.add(`<path d="${wax}" fill="${radial(cv, [[0, '#7a1a1c'], [0.7, '#62121a'], [1, '#4a0c10']], 210, 200, 260)}"/>`), {
        inflate: { radius: 34, profile: 'soft', height: 0.5 },
        relief: {
          draw: (cv) => {
            cv.add(`<circle cx="${C[0]}" cy="${C[1]}" r="158" fill="none" stroke="#fff" stroke-width="30"/>`);
            cv.add(`<circle cx="${C[0]}" cy="${C[1]}" r="128" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="5"/>`);
            cv.add(`<path d="${eightPointStar(C[0], C[1], 96)}" fill="#fff" fill-opacity="0.55"/>`);
            cv.add(`<path d="${eightPointStar(C[0], C[1], 40)}" fill="#000" fill-opacity="0.35"/>`);
          },
          height: 16,
          blur: 2.2,
        },
        bumps: { scale: 3, amount: 0.08 },
        mottle: { scale: 50, amount: 0.04 },
        material: { gloss: 0.95, shine: 46, wrap: 0.3, sheen: 0.5, hollows: 0.9 },
      });
      return s.done({ finish: { contrast: 0.1, saturation: 1.02, grain: 0.004 } });
    },
  },
  {
    key: 'caydan',
    ku: 'Çaydan',
    en: 'Teapot',
    // the tea: a round teapot of white porcelain, roses painted round its belly and gold on its rims, and before it
    // a tulip glass of tea on its saucer, the tea dark red where it is deep and glowing amber where the light comes
    // through it
    still(rnd) {
      const s = new Still(rnd);
      const porcelain = { ambient: 0.8, diffuse: 1.1, gloss: 1.1, shine: 110, wrap: 0.1, sheen: 0.45, hollows: 0.7 };
      const white = (cv, x1, y1, x2, y2) => linear(cv, [[0, '#fbf9f4'], [0.55, '#e8e4dc'], [1, '#b8b4ae']], x1, y1, x2, y2);
      // (a studio's window, seen in the glaze: a soft bright pane bent round the curve)
      const pane = (cv, d, o = 0.75) => cv.add(`<path d="${d}" fill="#fff" fill-opacity="${n(o)}"/>`);
      // the handle and the spout, behind the body they come out of
      const handle = tube([[288, 186], [340, 172], [374, 206], [370, 262], [336, 300], [292, 306]], 20, 18);
      s.surface((cv) => cv.add(`<path d="${handle}" fill="${white(cv, 290, 170, 380, 310)}"/>`), { inflate: { radius: 10, profile: 'round', height: 1 }, material: porcelain });
      const spout = tube([[104, 296], [66, 282], [44, 244], [30, 204], [14, 170]], 46, 16);
      s.surface((cv) => {
        cv.add(`<path d="${spout}" fill="${white(cv, 16, 170, 104, 300)}"/>`);
        cv.add(`<ellipse cx="15" cy="169" rx="9" ry="5" transform="rotate(-30 15 169)" fill="#b88a30"/>`);
      }, { inflate: { radius: 16, profile: 'round', height: 1 }, material: porcelain });
      // the foot ring under the body
      s.surface((cv) => cv.add(`<path d="M134 338 C160 362 220 362 246 338 L242 358 C218 378 162 378 138 358 Z" fill="${white(cv, 134, 338, 246, 378)}"/><path d="M138 358 C162 378 218 378 242 358" fill="none" stroke="#b88a30" stroke-width="3"/>`), {
        inflate: { radius: 8, profile: 'soft', height: 0.6 },
        material: porcelain,
      });
      // the body, a little squat, roses round its belly
      const body = [190, 250];
      const rx = 128;
      const ry = 104;
      s.surface(
        (cv) => {
          const clip = cv.id('pot');
          cv.def(`<clipPath id="${clip}"><ellipse cx="${body[0]}" cy="${body[1]}" rx="${rx}" ry="${ry}"/></clipPath>`);
          cv.add(`<ellipse cx="${body[0]}" cy="${body[1]}" rx="${rx}" ry="${ry}" fill="${radial(cv, [[0, '#fdfbf6'], [0.55, '#ebe7df'], [1, '#a8a49e']], 140, 196, 200)}"/>`);
          cv.add(`<g clip-path="url(#${clip})">`);
          // (the band of roses follows the belly round, smaller where it turns away)
          for (let k = 0; k <= 8; k++) {
            const a = -1.2 + (k / 8) * 2.4;
            const x = body[0] + Math.sin(a) * (rx - 6);
            const y = body[1] + 18 + Math.cos(a) * 16;
            const sc = Math.cos(a) * 0.8 + 0.2;
            const r = 15 * sc + 3;
            for (const side of [-1, 1]) cv.add(`<ellipse cx="${n(x + side * r * 1.15)}" cy="${n(y + r * 0.35)}" rx="${n(r * 0.75 * sc + 1)}" ry="${n(r * 0.42)}" transform="rotate(${n(side * 30)} ${n(x + side * r * 1.15)} ${n(y + r * 0.35)})" fill="#3e6e40"/>`);
            cv.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${radial(cv, [[0, '#6a0a14'], [0.5, '#a81a26'], [1, '#cc4450']], x, y, r)}"/>`);
            cv.add(`<path d="M${pt([x - r * 0.5, y])} A${n(r * 0.5)} ${n(r * 0.45)} 0 1 1 ${pt([x + r * 0.2, y + r * 0.4])} M${pt([x - r * 0.75, y - r * 0.2])} A${n(r * 0.8)} ${n(r * 0.7)} 0 0 1 ${pt([x + r * 0.7, y - r * 0.3])}" fill="none" stroke="#4a060c" stroke-width="${n(1 + r * 0.06)}" stroke-opacity="0.7"/>`);
          }
          // gold lines above and below the band
          for (const dy of [-12, 50]) cv.add(`<path d="M${body[0] - rx} ${body[1] + dy - 8} Q${body[0]} ${body[1] + dy + 26} ${body[0] + rx} ${body[1] + dy - 8}" fill="none" stroke="#b88a30" stroke-width="3"/>`);
          cv.add('</g>');
          cv.add(`<ellipse cx="${body[0]}" cy="${body[1] - ry + 22}" rx="72" ry="17" fill="none" stroke="#b88a30" stroke-width="4"/>`);
        },
        { inflate: { radius: 110, profile: 'round', height: 0.8, soften: 2 }, material: porcelain },
      );
      s.paint((cv) => pane(cv, `M100 188 C112 166 134 152 160 146 C150 160 140 176 134 196 C124 218 120 240 120 262 C108 250 96 214 100 188 Z`), { blur: 3 });
      // the lid and its knob
      const lidY = body[1] - ry + 22;
      s.surface((cv) => {
        cv.add(`<path d="M${body[0] - 70} ${lidY} C${body[0] - 70} ${lidY - 44} ${body[0] + 70} ${lidY - 44} ${body[0] + 70} ${lidY} C${body[0] + 70} ${lidY + 14} ${body[0] - 70} ${lidY + 14} ${body[0] - 70} ${lidY} Z" fill="${white(cv, body[0] - 56, lidY - 44, body[0] + 64, lidY + 14)}"/>`);
        cv.add(`<path d="M${body[0] - 70} ${lidY} C${body[0] - 70} ${lidY + 14} ${body[0] + 70} ${lidY + 14} ${body[0] + 70} ${lidY}" fill="none" stroke="#b88a30" stroke-width="4"/>`);
        cv.add(`<ellipse cx="${body[0]}" cy="${lidY - 32}" rx="18" ry="9" fill="#e4e0d8"/><circle cx="${body[0]}" cy="${lidY - 46}" r="14" fill="${white(cv, body[0] - 12, lidY - 60, body[0] + 12, lidY - 32)}"/>`);
        cv.add(`<circle cx="${body[0]}" cy="${lidY - 46}" r="5" fill="#b88a30"/>`);
      }, { inflate: { radius: 22, profile: 'round', height: 0.6 }, material: porcelain });
      // the saucer: white, a band of red and a gold edge, and the glass's shadow on it
      const G = 366;
      s.surface((cv) => {
        cv.add(`<ellipse cx="${G}" cy="458" rx="124" ry="31" fill="${white(cv, G - 124, 430, G + 124, 490)}"/>`);
        cv.add(`<ellipse cx="${G}" cy="454" rx="122" ry="28" fill="none" stroke="#b88a30" stroke-width="2.5"/>`);
        cv.add(`<ellipse cx="${G}" cy="454" rx="104" ry="22" fill="none" stroke="#a01c26" stroke-width="7"/>`);
        for (let k = 0; k < 32; k++) {
          const a = (k / 32) * Math.PI * 2;
          cv.add(`<circle cx="${n(G + Math.cos(a) * 104)}" cy="${n(454 + Math.sin(a) * 22)}" r="1.6" fill="#f6e2b0"/>`);
        }
        cv.add(`<ellipse cx="${G}" cy="452" rx="62" ry="12" fill="#e2ded6"/>`);
      }, {
        inflate: { radius: 14, profile: 'soft', height: 0.35 },
        relief: { draw: (cv) => cv.add(`<ellipse cx="${G}" cy="458" rx="124" ry="31" fill="#fff"/><ellipse cx="${G}" cy="452" rx="64" ry="13" fill="#000"/>`), height: 3, blur: 3 },
        material: porcelain,
      });
      s.shadow((cv) => cv.add(`<ellipse cx="${G + 18}" cy="452" rx="52" ry="11" fill="#000"/>`), { blur: 5, opacity: 0.45 });
      // the glass: tulip-shaped, its waist pinched; the tea in it, dark where deep, amber at its edges, glowing at the
      // bottom where the light comes down through it
      const profile = [[226, 52], [244, 50], [272, 44], [306, 37], [334, 34], [364, 39], [398, 46], [422, 44], [446, 37]];
      const glass = (inset, top) => {
        const rows = profile.filter(([y]) => y >= top).map(([y, w]) => [y, w - inset]);
        if (rows[0][0] > top) rows.unshift([top, rows[0][1] + ((profile.find(([y]) => y < top)?.[1] ?? rows[0][1]) - rows[0][1]) * 0.4]);
        return spline([...rows.map(([y, w]) => [G - w, y]), ...rows.reverse().map(([y, w]) => [G + w, y])]);
      };
      const teaTop = 254;
      s.paint((cv) => {
        cv.add(`<path d="${glass(4, teaTop)}" fill="${linear(cv, [[0, '#d0601e'], [0.18, '#8a2008'], [0.5, '#4a0904'], [0.82, '#7a1806'], [1, '#c0501a']], G - 46, 0, G + 46, 0)}"/>`);
        cv.add(`<ellipse cx="${G - 4}" cy="418" rx="30" ry="20" fill="${radial(cv, [[0, '#f08a34', 0.8], [1, '#e06a24', 0]], G - 4, 418, 30)}"/>`);
        // the tea's surface, seen a little from above, catching the light
        cv.add(`<ellipse cx="${G}" cy="${teaTop}" rx="45" ry="7" fill="${linear(cv, [[0, '#a8461e'], [0.5, '#5a1006'], [1, '#8a3012']], G - 45, 0, G + 45, 0)}"/>`);
        cv.add(`<path d="M${G - 38} ${teaTop - 1} Q${G - 10} ${teaTop - 6} ${G + 14} ${teaTop - 5}" fill="none" stroke="#f4c8a0" stroke-width="1.6" stroke-opacity="0.7"/>`);
      });
      // the glass itself, clear: seen by what it reflects, by its edges, and by its thick base
      s.surface((cv) => {
        cv.add(`<path d="${glass(0, 226)}" fill="#dfe8ec" fill-opacity="0.1"/>`);
        cv.add(`<path d="M${G - 37} 434 Q${G} 448 ${G + 37} 434 L${G + 36} 446 Q${G} 460 ${G - 36} 446 Z" fill="#f0e0d0" fill-opacity="0.35"/>`);
      }, { inflate: { radius: 30, profile: 'round', height: 0.8 }, material: { clear: true, gloss: 1.2, shine: 160, sheen: 0.9, ambient: 0.4, hollows: 0 } });
      s.paint((cv) => {
        cv.add(`<path d="${glass(0, 226)}" fill="none" stroke="#c8d0d4" stroke-width="2" stroke-opacity="0.55"/>`);
        cv.add(`<ellipse cx="${G}" cy="226" rx="52" ry="9" fill="none" stroke="#fff" stroke-width="2.2" stroke-opacity="0.75"/>`);
        cv.add(`<path d="M${G - 40} 240 Q${G - 30} 300 ${G - 22} 328 Q${G - 26} 376 ${G - 36} 414" fill="none" stroke="#fff" stroke-width="5" stroke-opacity="0.6" stroke-linecap="round"/>`);
        cv.add(`<path d="M${G + 38} 270 Q${G + 30} 310 ${G + 28} 334" fill="none" stroke="#fff" stroke-width="2.5" stroke-opacity="0.4" stroke-linecap="round"/>`);
      }, { blur: 0.8 });
      return s.done({ finish: { grain: 0.004 } });
    },
  },
  {
    key: 'saz',
    ku: 'Saz',
    en: 'Saz',
    // a saz lying slantwise: the pear of its bowl, staves of dark mulberry round a pale spruce face with its small
    // sound hole and its bridge, the long walnut neck with its frets tied round it, the pegs at its head, the
    // strings running the length of it, all of it varnished and catching the light
    still(rnd) {
      const s = new Still(rnd);
      const O = [84, 446];
      const a = [Math.cos(-0.8), Math.sin(-0.8)];
      const q = [-a[1], a[0]];
      const S = (u, v) => [O[0] + a[0] * u + q[0] * v, O[1] + a[1] * u + q[1] * v];
      const deg = (-0.8 * 180) / Math.PI;
      const profile = [[0, 0], [8, 34], [20, 52], [40, 68], [65, 76], [90, 74], [115, 64], [140, 48], [165, 30], [185, 18], [200, 13]];
      const outline = (grow, shift) => spline([...profile.map(([u, w]) => S(u, -(w + grow) + shift)), ...profile.slice(1, -1).reverse().map(([u, w]) => S(u, w + grow + shift))]);
      const across = (cv, stops, u, w) => linear(cv, stops, ...S(u, -w), ...S(u, w));
      // the bowl, its staves just showing past the face on the shadowed side
      s.surface(
        (cv) => {
          const bowl = outline(4, 6);
          const clip = cv.id('bowl');
          cv.def(`<clipPath id="${clip}"><path d="${bowl}"/></clipPath>`);
          cv.add(`<path d="${bowl}" fill="#4a2010"/><g clip-path="url(#${clip})">`);
          for (let k = -4; k <= 4; k++) cv.add(`<path d="M${pt(S(4, k * 9 + 6))} Q${pt(S(90, k * 19 + 6))} ${pt(S(200, k * 3 + 6))}" fill="none" stroke="${k % 2 ? '#2e1208' : '#6a3418'}" stroke-width="7" stroke-opacity="0.8"/>`);
          cv.add('</g>');
        },
        { inflate: { radius: 60, profile: 'round', height: 0.7 }, mottle: { scale: 5, amount: 0.12, stretch: 10, angle: deg }, material: { gloss: 0.7, shine: 70, sheen: 0.35 } },
      );
      // the face: spruce, its fine straight grain, a dark binding round its edge
      s.surface(
        (cv) => {
          cv.add(`<path d="${outline(0, 0)}" fill="${across(cv, [[0, '#d8a466'], [0.5, '#c8904e'], [1, '#a8723a']], 80, 76)}" stroke="#2a1208" stroke-width="3"/>`);
          for (let k = -8; k <= 8; k++) cv.add(`<path d="M${pt(S(2, k * 8.6))} L${pt(S(200, k * 1.4))}" stroke="#7a4a20" stroke-width="0.8" stroke-opacity="0.35"/>`);
          // the sound hole with its ring of inlay, and the bridge the strings cross
          cv.add(`<circle cx="${n(S(150, 0)[0])}" cy="${n(S(150, 0)[1])}" r="8" fill="#1a0a04"/><circle cx="${n(S(150, 0)[0])}" cy="${n(S(150, 0)[1])}" r="13" fill="none" stroke="#3a1c0c" stroke-width="2.5" stroke-dasharray="2 2"/>`);
        },
        { inflate: { radius: 22, profile: 'soft', height: 0.35 }, mottle: { scale: 3, amount: 0.1, stretch: 16, angle: deg }, material: { gloss: 0.55, shine: 50, sheen: 0.3 } },
      );
      s.surface((cv) => cv.add(`<path d="M${pt(S(34, -28))} L${pt(S(42, -28))} L${pt(S(42, 28))} L${pt(S(34, 28))} Z" fill="#2a1408"/><path d="M${pt(S(2, -10))} L${pt(S(12, -10))} L${pt(S(12, 10))} L${pt(S(2, 10))} Z" fill="#2a1408"/>`), {
        inflate: { radius: 3, profile: 'round', height: 1 },
        material: { gloss: 0.5, shine: 40, sheen: 0.3 },
      });
      // the neck, dark walnut, narrowing toward the head; its frets, tied round it
      s.surface(
        (cv) => {
          cv.add(`<path d="M${pt(S(192, -14))} L${pt(S(522, -11))} L${pt(S(522, 11))} L${pt(S(192, 14))} Z" fill="${across(cv, [[0, '#5a361c'], [0.5, '#3e2412'], [1, '#24140a']], 350, 13)}"/>`);
          let u = 512;
          for (let k = 0; k < 19; k++) {
            cv.add(`<path d="M${pt(S(u, -13))} L${pt(S(u, 13))}" stroke="#d8c8a8" stroke-width="2.2" stroke-opacity="0.85"/>`);
            u -= 24 * Math.pow(0.95, k);
          }
        },
        { inflate: { radius: 12, profile: 'round', height: 0.8 }, mottle: { scale: 4, amount: 0.12, stretch: 14, angle: deg }, material: { gloss: 0.6, shine: 60, sheen: 0.35 } },
      );
      // the head and its pegs
      s.surface(
        (cv) => {
          cv.add(`<path d="${spline([S(516, -13), S(560, -15), S(590, -12), S(594, 0), S(590, 12), S(560, 15), S(516, 13)])}" fill="#3a2010"/>`);
          for (const u of [534, 556, 578]) for (const side of [-1, 1]) cv.add(`<path d="${spline([S(u - 4, side * 12), S(u - 3, side * 30), S(u - 7, side * 38), S(u, side * 41), S(u + 7, side * 38), S(u + 3, side * 30), S(u + 4, side * 12)])}" fill="#5a3418"/>`);
        },
        { inflate: { radius: 8, profile: 'round', height: 1 }, mottle: { scale: 4, amount: 0.1, stretch: 8, angle: deg }, material: { gloss: 0.6, shine: 60, sheen: 0.35 } },
      );
      // the strings, bright where the light runs along them, each with its fine shadow
      s.shadow((cv) => {
        for (const [v0, v1] of [[-18, -7], [-15, -5], [-2, -1], [1, 1], [14, 5], [17, 7]]) cv.add(`<path d="M${pt(S(6, v0 + 3))} L${pt(S(38, v0 + 3))} L${pt(S(560, v1 * 0.9 + 3))}" fill="none" stroke="#000" stroke-width="1.6"/>`);
      }, { blur: 1.4, opacity: 0.5 });
      s.paint((cv) => {
        for (const [v0, v1] of [[-18, -7], [-15, -5], [-2, -1], [1, 1], [14, 5], [17, 7]]) cv.add(`<path d="M${pt(S(6, v0))} L${pt(S(38, v0))} L${pt(S(560, v1 * 0.9))}" fill="none" stroke="${linear(cv, [[0, '#a8a090'], [0.4, '#f4eee0'], [1, '#9a9282']], ...S(0, 0), ...S(560, 0))}" stroke-width="1.2"/>`);
      });
      return s.done({ finish: { grain: 0.004 } });
    },
  },
  {
    key: 'kevok',
    ku: 'Kevok',
    en: 'Dove',
    // a white dove in flight, its wings raised high over its back, its tail spread, a sprig of olive in its beak:
    // each feather lying over the next, its shaft down the middle, white in the light and blue-grey in the shade
    still(rnd) {
      const s = new Still(rnd).place([0, 52], 0.9);
      const plume = { gloss: 0.1, shine: 14, wrap: 0.5, sheen: 0.55, hollows: 0.8 };
      const tone = (cv, base, tip, [dark, mid, light]) => linear(cv, [[0, dark], [0.35, mid], [1, light]], ...base, ...tip);
      const lit = ['#b8c0cc', '#e8ecf2', '#fbfcfd'];
      const shaded = ['#8e98a8', '#b8c0cc', '#d8dde6'];
      // a fan of feathers: [base, tip, width] each; painted, and raised one over another in the relief
      const fan = (list, colours, opts = { at: 0.5, point: 0.15 }) => ({
        draw: (cv) => {
          for (const [base, tip, w] of list) {
            cv.add(`<path d="${blade(base, tip, w, opts)}" fill="${tone(cv, base, tip, colours)}"/>`);
            cv.add(`<path d="M${pt(base)} L${pt(lerp(base, tip, 0.92))}" stroke="#9aa4b4" stroke-width="1.1" stroke-opacity="0.6"/>`);
            // (a parting or two in the vane, as a feather's barbs part)
            if (rnd() < 0.5) {
              const t = 0.4 + rnd() * 0.4;
              const m = lerp(base, tip, t);
              const side = rnd() < 0.5 ? -1 : 1;
              const dx = tip[0] - base[0];
              const dy = tip[1] - base[1];
              const l = Math.hypot(dx, dy);
              cv.add(`<path d="M${pt(m)} l${n((-dy / l) * side * w * 0.45 + (dx / l) * 6)} ${n((dx / l) * side * w * 0.45 + (dy / l) * 6)}" stroke="#a8b0bc" stroke-width="1" stroke-opacity="0.5"/>`);
            }
          }
        },
        relief: (cv) => {
          for (const [base, tip, w] of list) cv.add(`<path d="${blade(base, tip, w, opts)}" fill="#fff" stroke="#000" stroke-width="1.6" stroke-opacity="0.55"/>`);
        },
      });
      const feathers = (list, colours, { inflate = 8, opts } = {}) => {
        const f = fan(list, colours, opts);
        s.surface(f.draw, { inflate: { radius: inflate, profile: 'soft', height: 0.5 }, relief: { draw: f.relief, height: 2.4, blur: 1.3 }, mottle: { scale: 2, amount: 0.04, stretch: 6 }, material: plume });
      };
      // (no two feathers quite alike: each a little longer or shorter, a little turned)
      const ray = (base, deg, len) => {
        const a = ((deg + (rnd() - 0.5) * 5) * Math.PI) / 180;
        const l = len * (0.93 + rnd() * 0.14);
        return [base[0] + Math.cos(a) * l, base[1] + Math.sin(a) * l];
      };
      // the far wing, behind, in its own shade
      const far = [];
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const base = lerp([206, 104], [216, 160], t);
        far.push([base, ray(base, -112 + t * 44, 132 - t * 26), 27]);
      }
      feathers(far.reverse(), shaded);
      // the tail, spread
      const tail = [];
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const base = [334 + t * 4, 286 + t * 12];
        tail.push([base, ray(base, -24 + t * 44, 116 + Math.sin(t * Math.PI) * 14), 36]);
      }
      feathers(tail, lit, { opts: { at: 0.55, point: 0.05 } });
      // the olive sprig, held in the beak: grey-green leaves, silver beneath, and two olives
      const twig = [[112, 238], [92, 256], [76, 280], [62, 310], [54, 336]];
      s.surface((cv) => cv.add(`<path d="${tube(twig, 5, 3)}" fill="#6a5a44"/>`), { inflate: { radius: 2.5, profile: 'round', height: 1 }, material: { gloss: 0.3, shine: 30 } });
      const leaves = [[[90, 258], [44, 254], 13], [[84, 268], [112, 304], 12], [[74, 284], [32, 292], 13], [[68, 298], [94, 336], 12], [[60, 316], [24, 334], 11], [[56, 330], [70, 368], 11]];
      s.surface(
        (cv) => {
          for (const [base, tip, w] of leaves) {
            cv.add(`<path d="${blade(base, tip, w, { at: 0.5, point: 0.8 })}" fill="${linear(cv, [[0, '#3e5430'], [0.5, '#5a7244'], [1, '#8a9c70']], ...base, ...tip)}"/>`);
            cv.add(`<path d="M${pt(base)} L${pt(lerp(base, tip, 0.9))}" stroke="#a8b490" stroke-width="1" stroke-opacity="0.7"/>`);
          }
        },
        { inflate: { radius: 4, profile: 'soft', height: 0.6 }, material: { gloss: 0.5, shine: 40, wrap: 0.2, sheen: 0.4 } },
      );
      s.surface((cv) => cv.add(`<ellipse cx="52" cy="344" rx="8" ry="10" fill="#2e3a1c"/><ellipse cx="66" cy="352" rx="7" ry="9" fill="#3a2a30"/>`), { inflate: { radius: 7, profile: 'round', height: 1 }, material: { gloss: 0.9, shine: 90, sheen: 0.3 } });
      // the body: the round head, the full breast, the back running into the tail
      const body = spline([[112, 216], [128, 200], [152, 196], [172, 208], [196, 228], [236, 240], [290, 256], [338, 270], [350, 288], [338, 304], [290, 316], [240, 324], [196, 314], [166, 294], [148, 268], [130, 252], [114, 238]]);
      // (the small feathers of the body, lying in rows like scales, each a little arc)
      const scales = (cv, colour, width, opacity) => {
        const clip = cv.id('body');
        cv.def(`<clipPath id="${clip}"><path d="${body}"/></clipPath>`);
        cv.add(`<g clip-path="url(#${clip})" fill="none" stroke="${colour}" stroke-width="${width}" stroke-opacity="${opacity}">`);
        for (let y = 200; y < 330; y += 9) {
          for (let x = 150 + ((y / 9) % 2) * 7; x < 350; x += 14) {
            const r = 7 + rnd() * 2;
            cv.add(`<path d="M${pt([x + (rnd() - 0.5) * 4, y - r])} A${n(r * 0.6)} ${n(r)} 0 0 1 ${pt([x + (rnd() - 0.5) * 4, y + r])}"/>`);
          }
        }
        cv.add('</g>');
      };
      s.surface(
        (cv) => {
          cv.add(`<path d="${body}" fill="${linear(cv, [[0, '#fbfcfd'], [0.5, '#eceff4'], [1, '#b4bcc8']], 0, 196, 0, 324)}"/>`);
          scales(cv, '#aab4c2', 1, 0.12);
        },
        {
          inflate: { radius: 46, profile: 'soft', height: 0.75 },
          relief: { draw: (cv) => scales(cv, '#fff', 2.5, 0.6), height: 0.8, blur: 1.5 },
          mottle: { scale: 4, amount: 0.03 },
          material: plume,
        },
      );
      // the beak, pink-grey, its white cere, and the dark eye with its pale ring
      s.surface((cv) => cv.add(`<path d="M118 226 C110 226 98 230 88 237 C98 238 108 239 118 240 Z" fill="${linear(cv, [[0, '#d8b8b0'], [1, '#6a5450']], 118, 0, 88, 0)}"/><ellipse cx="117" cy="228" rx="6" ry="4" fill="#f4f0ee"/>`), {
        inflate: { radius: 4, profile: 'round', height: 0.9 },
        material: { gloss: 0.6, shine: 50, sheen: 0.3 },
      });
      s.surface((cv) => cv.add(`<circle cx="138" cy="222" r="7" fill="#c8ccd2"/><circle cx="138" cy="222" r="4.6" fill="#120c0a"/>`), { inflate: { radius: 4, profile: 'round', height: 0.8 }, material: { gloss: 1.5, shine: 200, hollows: 0 } });
      s.paint((cv) => cv.add(`<circle cx="136.4" cy="220.4" r="1.3" fill="#fff" fill-opacity="0.9"/>`));
      // the near wing, raised: its coverts along the leading edge, the long primaries fanned up and back from the
      // hand, the secondaries along the arm
      const secondaries = [];
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        const base = lerp([252, 150], [238, 238], t);
        secondaries.push([base, ray(base, -30 + t * 40, 116 - t * 22), 34]);
      }
      const primaries = [];
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        const base = lerp([252, 150], [266, 92], t);
        primaries.push([base, ray(base, -38 - t * 58, 128 + t * 30), 28]);
      }
      s.shadow((cv) => cv.add(`<path d="M232 252 C250 200 260 150 268 96 L330 120 L360 250 Z" fill="#000"/>`), { blur: 14, opacity: 0.3 });
      feathers(secondaries.reverse(), lit);
      feathers(primaries, lit);
      // (the coverts: short rounded feathers in rows over the bases of the long ones)
      const coverts = [];
      for (const [row, from, to, len, w] of [[0, [238, 246], [266, 96], 46, 26], [1, [232, 244], [258, 104], 34, 22]]) {
        for (let i = 0; i < 9; i++) {
          const t = i / 8;
          const base = lerp(from, to, t);
          coverts.push([base, ray(base, -40 + t * -10 + row * 8, len), w]);
        }
      }
      feathers(coverts, lit, { inflate: 10, opts: { at: 0.5, point: 0 } });
      return s.done({ finish: { grain: 0.004, warmth: 0.01 } });
    },
  },
  {
    key: 'genim',
    ku: 'Genim',
    en: 'Wheat',
    // a sheaf of ripe wheat tied with a ribbon of brown satin: the ears fanning out above the bow, plump grains in
    // their two rows and the long awns bristling from them, the straws crossing at the tie and spreading below
    still(rnd) {
      const s = new Still(rnd);
      const B = [256, 344];
      const fan = [-36, -23, -11, 0, 11, 23, 36];
      const stalks = fan.map((deg, i) => {
        const a = ((deg + (rnd() - 0.5) * 4) * Math.PI) / 180;
        const up = [Math.sin(a), -Math.cos(a)];
        const b = (-deg * 0.45 * Math.PI) / 180;
        const down = [Math.sin(b), Math.cos(b)];
        const reach = 128 + (i % 2) * 18 + rnd() * 12;
        const ear = 128 + rnd() * 20;
        return { up, down, base: [B[0] + up[0] * reach, B[1] + up[1] * reach], tip: [B[0] + up[0] * (reach + ear), B[1] + up[1] * (reach + ear)], foot: [B[0] + down[0] * (150 + rnd() * 14), B[1] + down[1] * (150 + rnd() * 14)] };
      });
      // the straws, crossing at the tie
      s.surface(
        (cv) => {
          for (const st of stalks) {
            cv.add(`<path d="M${pt(st.foot)} L${pt(st.base)}" stroke="${linear(cv, [[0, '#9a7028'], [0.45, '#d8ae5c'], [1, '#c49444']], ...st.foot, ...st.base)}" stroke-width="5.5" stroke-linecap="round"/>`);
          }
        },
        { inflate: { radius: 2.8, profile: 'round', height: 1 }, mottle: { scale: 3, amount: 0.12, stretch: 12, angle: -90 }, material: { gloss: 0.4, shine: 34, wrap: 0.2, sheen: 0.4 } },
      );
      // the ears: their spikelets in two rows, alternating up the stem, each a husk of pointed scales lying over the
      // one above it; a long awn from each, bristling up and out
      const spikelets = [];
      const awns = [];
      for (const st of stalks) {
        const dx = st.tip[0] - st.base[0];
        const dy = st.tip[1] - st.base[1];
        const len = Math.hypot(dx, dy);
        const u = [dx / len, dy / len];
        const v = [-u[1], u[0]];
        const ear = [];
        for (let k = 0, t = 2; t < len - 14; k++, t += 11) {
          const side = k % 2 ? 1 : -1;
          const shrink = t > len * 0.6 ? 1 - ((t - len * 0.6) / len) * 1.2 : 1;
          const turn = side * (0.36 + rnd() * 0.08);
          const d = [u[0] * Math.cos(turn) - v[0] * Math.sin(turn), u[1] * Math.cos(turn) - v[1] * Math.sin(turn)];
          const p0 = [st.base[0] + u[0] * t + v[0] * side * 1.5, st.base[1] + u[1] * t + v[1] * side * 1.5];
          const L = 30 * shrink + 6;
          const p1 = [p0[0] + d[0] * L, p0[1] + d[1] * L];
          ear.push({ p0, p1, w: 15 * shrink + 4, side });
          // (the awn rises from the husk's tip, nearer upright than the husk)
          const lean = side * (0.12 + rnd() * 0.1);
          const a = [u[0] * Math.cos(lean) - v[0] * Math.sin(lean), u[1] * Math.cos(lean) - v[1] * Math.sin(lean)];
          const l = (58 + rnd() * 40) * (0.6 + shrink * 0.4);
          const bow = (rnd() - 0.5) * 8;
          awns.push([p1, [p1[0] + a[0] * l * 0.5 + v[0] * bow, p1[1] + a[1] * l * 0.5 + v[1] * bow], [p1[0] + a[0] * l, p1[1] + a[1] * l]]);
        }
        // the topmost first, so that each husk lies over the one above it
        spikelets.push(...ear.reverse());
      }
      // the awns, fine and tapering, pale gold, behind the ears
      s.paint((cv) => {
        for (const [p0, m, p1] of awns) {
          const dx = p1[0] - p0[0];
          const dy = p1[1] - p0[1];
          const l = Math.hypot(dx, dy);
          const w = [-dy / l, dx / l];
          const side = (p, k) => [p[0] + w[0] * k, p[1] + w[1] * k];
          cv.add(`<path d="M${pt(side(p0, -0.9))} Q${pt(side(m, -0.5))} ${pt(p1)} Q${pt(side(m, 0.5))} ${pt(side(p0, 0.9))} Z" fill="${linear(cv, [[0, '#b88a40'], [0.35, '#e6c886'], [1, '#f2e2b4', 0.5]], ...p0, ...p1)}"/>`);
        }
      }, { blur: 0.25 });
      s.surface(
        (cv) => {
          for (const { p0, p1, w } of spikelets) {
            const d = blade(p0, p1, w, { at: 0.42, point: 0.8, count: 10 });
            cv.add(`<path d="${d}" fill="${linear(cv, [[0, '#8e5e22'], [0.35, '#c99644'], [0.8, '#e8c67c'], [1, '#f2dc9e']], ...p0, ...p1)}" stroke="#7a5020" stroke-width="0.8" stroke-opacity="0.5"/>`);
            // the keel down the husk
            cv.add(`<path d="M${pt(lerp(p0, p1, 0.15))} L${pt(lerp(p0, p1, 0.92))}" stroke="#f6e2ac" stroke-width="1" stroke-opacity="0.45"/>`);
          }
        },
        {
          inflate: { radius: 5, profile: 'round', height: 0.6 },
          relief: {
            draw: (cv) => {
              for (const { p0, p1, w } of spikelets) {
                const c = lerp(p0, p1, 0.45);
                cv.add(`<path d="${blade(p0, p1, w, { at: 0.42, point: 0.8, count: 10 })}" fill="${radial(cv, [[0, '#fff'], [0.7, '#bbb'], [1, '#555']], c[0], c[1], w * 0.75)}"/>`);
              }
            },
            height: 5,
            blur: 0.8,
          },
          mottle: { scale: 2, amount: 0.1, stretch: 6, angle: -90 },
          material: { gloss: 0.3, shine: 24, wrap: 0.35, sheen: 0.5, hollows: 0.8 },
        },
      );
      // the bow: two loops, their insides in shadow, the knot, two tails cut in a V
      const loopL = spline([[B[0] - 8, B[1] - 12], [B[0] - 60, B[1] - 46], [B[0] - 112, B[1] - 50], [B[0] - 118, B[1] - 14], [B[0] - 98, B[1] + 20], [B[0] - 50, B[1] + 18], [B[0] - 8, B[1] + 10]]);
      const loopR = spline([[B[0] + 8, B[1] - 12], [B[0] + 58, B[1] - 50], [B[0] + 108, B[1] - 60], [B[0] + 120, B[1] - 26], [B[0] + 104, B[1] + 12], [B[0] + 54, B[1] + 16], [B[0] + 8, B[1] + 10]]);
      const openL = spline([[B[0] - 18, B[1] - 4], [B[0] - 52, B[1] - 18], [B[0] - 80, B[1] - 20], [B[0] - 86, B[1] - 12], [B[0] - 70, B[1] - 4], [B[0] - 40, B[1]]]);
      const openR = spline([[B[0] + 18, B[1] - 6], [B[0] + 50, B[1] - 24], [B[0] + 78, B[1] - 30], [B[0] + 86, B[1] - 20], [B[0] + 70, B[1] - 10], [B[0] + 40, B[1] - 2]]);
      // (the inside of a loop is darkest, and deepest, where it goes into the knot)
      const inside = (cv, dark, light) => [[openL, -90], [openR, 90]].map(([d, dx]) => `<path d="${d}" fill="${linear(cv, [[0, dark], [1, light]], B[0], B[1], B[0] + dx, B[1] - 16)}"/>`).join('');
      const tailL = `M${pt([B[0] - 12, B[1] + 6])} C${pt([B[0] - 28, B[1] + 50])} ${pt([B[0] - 50, B[1] + 96])} ${pt([B[0] - 74, B[1] + 140])} L${pt([B[0] - 58, B[1] + 128])} L${pt([B[0] - 44, B[1] + 150])} C${pt([B[0] - 24, B[1] + 104])} ${pt([B[0] - 8, B[1] + 56])} ${pt([B[0] + 4, B[1] + 10])} Z`;
      const tailR = `M${pt([B[0] + 4, B[1] + 8])} C${pt([B[0] + 22, B[1] + 52])} ${pt([B[0] + 44, B[1] + 96])} ${pt([B[0] + 70, B[1] + 136])} L${pt([B[0] + 76, B[1] + 118])} L${pt([B[0] + 94, B[1] + 126])} C${pt([B[0] + 66, B[1] + 90])} ${pt([B[0] + 38, B[1] + 46])} ${pt([B[0] + 16, B[1] + 2])} Z`;
      const satin = (cv, d, x1, y1, x2, y2) => cv.add(`<path d="${d}" fill="${linear(cv, [[0, '#3a1a0c'], [0.45, '#6a3a1c'], [1, '#4a2410']], x1, y1, x2, y2)}"/>`);
      const ribbon = { gloss: 0.8, shine: 12, wrap: 0.2, sheen: 0.55, hollows: 0.6 };
      s.surface((cv) => {
        satin(cv, tailL, B[0] - 70, B[1] + 140, B[0], B[1]);
        satin(cv, tailR, B[0] + 80, B[1] + 130, B[0], B[1]);
      }, {
        inflate: { radius: 9, profile: 'soft', height: 0.5 },
        relief: {
          // (each tail twists once as it falls: a fold running down it)
          draw: (cv) => {
            cv.add(`<g fill="#fff">${[tailL, tailR].map((d) => `<path d="${d}"/>`).join('')}</g>`);
            cv.add(`<path d="M${pt([B[0] - 6, B[1] + 14])} C${pt([B[0] - 30, B[1] + 70])} ${pt([B[0] - 34, B[1] + 110])} ${pt([B[0] - 56, B[1] + 140])} M${pt([B[0] + 10, B[1] + 10])} C${pt([B[0] + 24, B[1] + 50])} ${pt([B[0] + 58, B[1] + 90])} ${pt([B[0] + 80, B[1] + 124])}" stroke="#000" stroke-width="4" stroke-opacity="0.7" fill="none"/>`);
          },
          height: 3,
          blur: 2.5,
        },
        material: ribbon,
      });
      s.surface((cv) => {
        satin(cv, loopL, B[0] - 118, B[1] - 50, B[0], B[1] + 10);
        satin(cv, loopR, B[0] + 120, B[1] - 60, B[0], B[1] + 10);
        cv.add(inside(cv, '#140804', '#3a1a0c'));
      }, {
        inflate: { radius: 20, profile: 'soft', height: 0.55 },
        relief: {
          // the loops raised, their insides sunk, and the creases where the ribbon gathers into the knot
          draw: (cv) => {
            cv.add(`<g fill="#fff">${[loopL, loopR].map((d) => `<path d="${d}"/>`).join('')}</g>`);
            cv.add(inside(cv, '#000', '#999'));
            cv.add(`<g stroke="#000" stroke-opacity="0.6" stroke-width="3.5" fill="none" stroke-linecap="round"><path d="M${pt([B[0] - 12, B[1] + 6])} Q${pt([B[0] - 50, B[1] + 12])} ${pt([B[0] - 82, B[1] + 14])}"/><path d="M${pt([B[0] - 12, B[1] - 8])} Q${pt([B[0] - 40, B[1] - 30])} ${pt([B[0] - 70, B[1] - 40])}"/><path d="M${pt([B[0] + 12, B[1] + 4])} Q${pt([B[0] + 50, B[1] + 8])} ${pt([B[0] + 84, B[1] + 6])}"/><path d="M${pt([B[0] + 12, B[1] - 10])} Q${pt([B[0] + 40, B[1] - 34])} ${pt([B[0] + 72, B[1] - 48])}"/></g>`);
          },
          height: 9,
          blur: 5,
        },
        material: ribbon,
      });
      s.shadow((cv) => cv.add(`<rect x="${B[0] - 20}" y="${B[1] - 18}" width="40" height="38" rx="14" fill="#000"/>`), { blur: 8, opacity: 0.55 });
      s.surface((cv) => cv.add(`<rect x="${B[0] - 16}" y="${B[1] - 17}" width="32" height="34" rx="11" fill="${linear(cv, [[0, '#7a4626'], [1, '#3e1e0e']], B[0] - 16, B[1] - 16, B[0] + 16, B[1] + 16)}"/>`), {
        inflate: { radius: 12, profile: 'round', height: 0.8 },
        relief: { draw: (cv) => cv.add(`<path d="M${B[0] - 4} ${B[1] - 16} Q${B[0] - 7} ${B[1]} ${B[0] - 4} ${B[1] + 16} M${B[0] + 6} ${B[1] - 16} Q${B[0] + 3} ${B[1]} ${B[0] + 6} ${B[1] + 16}" stroke="#fff" stroke-width="3" fill="none"/>`), height: -2, blur: 1.5 },
        material: ribbon,
      });
      return s.done({ finish: { grain: 0.004 } });
    },
  },
  {
    key: 'kilim',
    ku: 'Kilîm',
    en: 'Kilim diamond',
    // a small kilim, flat-woven in wool: a madder-red field with a stepped diamond in the middle of it, indigo,
    // gold and ivory one inside another; a border of interlocking triangles; the weave's fine ribs, the soft
    // folds it lies in, and its fringes knotted at either end
    still(rnd) {
      const s = new Still(rnd);
      const [x0, y0, x1, y1] = [112, 82, 400, 430];
      // (a hand-woven thing's edges are never quite straight)
      const edge = (a, b, count, sway) => Array.from({ length: count + 1 }, (_, i) => {
        const p = lerp(a, b, i / count);
        const k = Math.sin((i / count) * Math.PI) * sway * (0.6 + rnd() * 0.8);
        return [p[0] + (a[1] === b[1] ? 0 : k), p[1] + (a[1] === b[1] ? k : 0)];
      });
      const outline = [...edge([x0, y0], [x1, y0], 8, 2), ...edge([x1, y0], [x1, y1], 10, -3).slice(1), ...edge([x1, y1], [x0, y1], 8, -2).slice(1), ...edge([x0, y1], [x0, y0], 10, 3).slice(1, -1)];
      const rug = `M${outline.map(pt).join(' L')} Z`;
      const red = '#8a221e';
      const indigo = '#1c2850';
      const ivory = '#e2d4b2';
      const gold = '#c08628';
      // a stepped diamond: the stairs of a weave going round it
      const stepped = (cx, cy, w, h, steps) => {
        const dx = w / steps;
        const dy = h / steps;
        const p = [];
        for (let i = 0; i < steps; i++) p.push([cx + i * dx, cy - h + i * dy], [cx + (i + 1) * dx, cy - h + i * dy]);
        for (let i = 0; i < steps; i++) p.push([cx + w - i * dx, cy + i * dy], [cx + w - i * dx, cy + (i + 1) * dy]);
        for (let i = 0; i < steps; i++) p.push([cx - i * dx, cy + h - i * dy], [cx - (i + 1) * dx, cy + h - i * dy]);
        for (let i = 0; i < steps; i++) p.push([cx - w + i * dx, cy - i * dy], [cx - w + i * dx, cy - (i + 1) * dy]);
        return `M${p.map(pt).join(' L')} Z`;
      };
      const B = 34;
      // the fringes, behind the rug: its warps, knotted in bunches at each end and hanging loose
      s.surface(
        (cv) => {
          let d = '';
          for (const [y, dir] of [[y0, -1], [y1, 1]]) {
            for (let x = x0 + 6; x < x1 - 4; x += 12) {
              const knot = [x + 4, y + dir * 12];
              cv.add(`<ellipse cx="${n(knot[0])}" cy="${n(knot[1])}" rx="4.5" ry="3.5" fill="${ivory}"/>`);
              for (let k = 0; k < 4; k++) {
                const sx = x + k * 2.6;
                const len = 30 + rnd() * 10;
                const end = [knot[0] + (k - 1.5) * 2.6 + (rnd() - 0.5) * 6, knot[1] + dir * len];
                d += `M${pt([sx, y])} L${pt(knot)} Q${pt([knot[0] + (rnd() - 0.5) * 6, knot[1] + dir * len * 0.5])} ${pt(end)} `;
              }
            }
          }
          cv.add(`<path d="${d}" fill="none" stroke="${ivory}" stroke-width="1.8" stroke-linecap="round"/>`);
        },
        { inflate: { radius: 1.2, profile: 'round', height: 1 }, mottle: { scale: 3, amount: 0.1 }, material: { gloss: 0.1, shine: 10, wrap: 0.3, sheen: 0.4 } },
      );
      const weave = (cv, colour, width, opacity) => {
        const clip = cv.id('rug');
        cv.def(`<clipPath id="${clip}"><path d="${rug}"/></clipPath>`);
        let d = '';
        for (let x = x0 - 4; x < x1 + 4; x += 4.8) d += `M${n(x)} ${y0 - 6} L${n(x)} ${y1 + 6} `;
        cv.add(`<path d="${d}" clip-path="url(#${clip})" stroke="${colour}" stroke-width="${width}" stroke-opacity="${opacity}"/>`);
      };
      s.surface(
        (cv) => {
          const clip = cv.id('rug');
          cv.def(`<clipPath id="${clip}"><path d="${rug}"/></clipPath>`);
          cv.add(`<path d="${rug}" fill="${red}"/><g clip-path="url(#${clip})">`);
          // the plain-woven ends and the border: a dark line, the band of triangles, a guard line
          cv.add(`<rect x="${x0 - 6}" y="${y0 - 6}" width="${x1 - x0 + 12}" height="14" fill="${ivory}"/><rect x="${x0 - 6}" y="${y1 - 8}" width="${x1 - x0 + 12}" height="14" fill="${ivory}"/>`);
          cv.add(`<rect x="${x0 - 6}" y="${y0 + 3}" width="${x1 - x0 + 12}" height="3" fill="${red}"/><rect x="${x0 - 6}" y="${y1 - 6}" width="${x1 - x0 + 12}" height="3" fill="${red}"/>`);
          const bx0 = x0 + 6;
          const by0 = y0 + 12;
          const bx1 = x1 - 6;
          const by1 = y1 - 12;
          cv.add(`<path d="M${bx0} ${by0} H${bx1} V${by1} H${bx0} Z M${bx0 + B} ${by0 + B} V${by1 - B} H${bx1 - B} V${by0 + B} Z" fill="${indigo}" fill-rule="evenodd"/>`);
          // (the triangles, gold into the indigo, stepped as the weave steps them)
          const tri = (a, b, inward) => {
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const count = Math.round(len / 24);
            for (let i = 0; i < count; i++) {
              const p = lerp(a, b, i / count);
              const q = lerp(a, b, (i + 1) / count);
              const m = lerp(p, q, 0.5);
              const tip = [m[0] + inward[0] * (B - 8), m[1] + inward[1] * (B - 8)];
              const steps = 4;
              const pts = [];
              for (let k = 0; k <= steps; k++) {
                const t = k / steps;
                const left = lerp(p, tip, t);
                const right = lerp(q, tip, t);
                pts.push(left);
                if (k < steps) pts.push([left[0] + inward[0] * ((B - 8) / steps), left[1] + inward[1] * ((B - 8) / steps)]);
                void right;
              }
              const back = [];
              for (let k = steps; k >= 0; k--) {
                const t = k / steps;
                const right = lerp(q, tip, t);
                if (k < steps) back.push([right[0] + inward[0] * ((B - 8) / steps), right[1] + inward[1] * ((B - 8) / steps)]);
                back.push(right);
              }
              cv.add(`<path d="M${[...pts, ...back].map(pt).join(' L')} Z" fill="${i % 2 ? ivory : gold}"/>`);
            }
          };
          tri([bx0 + 4, by0 + 4], [bx1 - 4, by0 + 4], [0, 1]);
          tri([bx1 - 4, by1 - 4], [bx0 + 4, by1 - 4], [0, -1]);
          tri([bx0 + 4, by1 - 4], [bx0 + 4, by0 + 4], [1, 0]);
          tri([bx1 - 4, by0 + 4], [bx1 - 4, by1 - 4], [-1, 0]);
          cv.add(`<path d="M${bx0 + B} ${by0 + B} V${by1 - B} H${bx1 - B} V${by0 + B} Z" fill="none" stroke="${ivory}" stroke-width="4"/>`);
          // the medallion: a stepped diamond, indigo, gold and ivory one inside another, red at its heart
          const C = [256, 256];
          cv.add(`<path d="${stepped(C[0], C[1], 88, 112, 8)}" fill="${ivory}"/>`);
          cv.add(`<path d="${stepped(C[0], C[1], 78, 100, 8)}" fill="${indigo}"/>`);
          cv.add(`<path d="${stepped(C[0], C[1], 58, 74, 6)}" fill="${gold}"/>`);
          cv.add(`<path d="${stepped(C[0], C[1], 42, 54, 5)}" fill="${red}"/>`);
          cv.add(`<path d="${stepped(C[0], C[1], 22, 28, 3)}" fill="${ivory}"/>`);
          cv.add(`<path d="${stepped(C[0], C[1], 9, 12, 1)}" fill="${indigo}"/>`);
          // small stepped diamonds in the field's corners, and a pair above and below the medallion
          for (const [cx, cy] of [[184, 152], [328, 152], [184, 360], [328, 360]]) {
            cv.add(`<path d="${stepped(cx, cy, 16, 20, 3)}" fill="${ivory}"/><path d="${stepped(cx, cy, 7, 9, 1)}" fill="${indigo}"/>`);
          }
          for (const cy of [134, 378]) cv.add(`<path d="${stepped(256, cy, 12, 9, 2)}" fill="${gold}"/>`);
          cv.add('</g>');
          // the weave's ribs, darker between, and the selvedges wrapped in dark wool
          weave(cv, '#000', 1.4, 0.12);
          const side = (from, to) => `M${outline.slice(from, to).map(pt).join(' L')}`;
          cv.add(`<path d="${side(8, 19)} ${side(26, 35)} L${pt(outline[0])}" fill="none" stroke="#2a1a12" stroke-width="5" stroke-linejoin="round"/>`);
        },
        {
          inflate: { radius: 6, profile: 'soft', height: 0.5 },
          relief: [
            // the folds it lies in: a long soft ridge and a hollow across it
            {
              draw: (cv) => {
                cv.add(`<rect width="512" height="512" fill="#808080"/>`);
                cv.add(`<g fill="none"><path d="M60 176 C180 196 320 190 460 214" stroke="#fff" stroke-width="56" stroke-opacity="0.85"/><path d="M50 320 C190 300 320 326 470 312" stroke="#000" stroke-width="60" stroke-opacity="0.75"/></g>`);
              },
              height: 96,
              blur: 20,
            },
            // the ribs of the weave
            { draw: (cv) => weave(cv, '#fff', 1.8, 0.5), height: 3, blur: 0.6 },
          ],
          mottle: { scale: 14, amount: 0.07, stretch: 10, angle: 0 },
          material: { gloss: 0.05, shine: 6, wrap: 0.3, sheen: 0.4, hollows: 0.5 },
        },
      );
      return s.done({ finish: { grain: 0.004 } });
    },
  },
  {
    key: 'pet',
    ku: 'Pêta Newrozê',
    en: 'Newroz flame',
    // the Newroz fire: logs crossed on one another, their bark rough and charred, their ends cut pale, embers
    // glowing in their cracks, and the flames standing up out of them, white-gold at the heart, orange, then red
    // at their wavering tips, sparks going up, all of it throwing its light round it
    still(rnd) {
      const s = new Still(rnd);
      const bark = (angle) => ({
        bumps: { scale: 6, amount: 5, stretch: 4, angle, ridged: true },
        mottle: { scale: 5, amount: 0.3, stretch: 5, angle },
        material: { gloss: 0.12, shine: 12, wrap: 0.2, sheen: 0.5, hollows: 1 },
      });
      // a log from a to b, `w` thick, sawn square at both ends: its bark, split along its length, charred toward the
      // fire
      const log = (a, b, w, cut) => {
        const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        const side = (p, k) => [p[0] - uy * k, p[1] + ux * k];
        s.surface(
          (cv) => {
            // (its outline a little uneven, as a branch is)
            const top = [];
            const bottom = [];
            for (let k = 0; k <= 8; k++) {
              const p = lerp(a, b, k / 8);
              const r = (w / 2) * (1 - (k / 8) * 0.08) * (1 + (rnd() - 0.5) * 0.06);
              top.push(side(p, -r));
              bottom.push(side(p, r));
            }
            const d = `M${pt(top[0])} ${spline(top, false).slice(1 + pt(top[0]).length)} L${bottom.slice().reverse().map(pt).join(' L')} Z`;
            cv.add(`<path d="${d}" fill="${linear(cv, [[0, '#423830'], [0.5, '#2a2420'], [1, '#141110']], a[0], a[1] - w, a[0], a[1] + w)}"/>`);
            const clip = cv.id('log');
            cv.def(`<clipPath id="${clip}"><path d="${d}"/></clipPath>`);
            // (charred black toward the fire)
            const char = lerp(a, b, cut === 'a' ? 0.85 : 0.5);
            cv.add(`<g clip-path="url(#${clip})"><ellipse cx="${n(char[0])}" cy="${n(char[1])}" rx="${n(w * 2.4)}" ry="${n(w * 0.9)}" transform="rotate(${n(angle)} ${n(char[0])} ${n(char[1])})" fill="#0c0908" fill-opacity="0.7"/></g>`);
            cv.add(`<g clip-path="url(#${clip})" fill="none" stroke="#120c08" stroke-linecap="round">`);
            for (let k = 0; k < 14; k++) {
              const t = rnd();
              const off = (rnd() - 0.5) * w * 0.8;
              const p = lerp(a, b, t);
              const len = 20 + rnd() * 50;
              const ux = (b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
              const uy = (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
              cv.add(`<path d="M${pt([p[0] - uy * off, p[1] + ux * off])} l${n(ux * len)} ${n(uy * len)}" stroke-width="${n(1.5 + rnd() * 2)}" stroke-opacity="0.7"/>`);
            }
            cv.add('</g>');
            // the sawn ends, pale wood and its rings, darkened at the rim; the far end in shadow
            for (const [end, near] of [[a, cut === 'a'], [b, cut === 'b']]) {
              const [cx, cy] = end;
              const r = w * (end === b ? 0.46 : 0.5);
              cv.add(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(r * 0.55)}" ry="${n(r)}" transform="rotate(${n(angle)} ${n(cx)} ${n(cy)})" fill="${radial(cv, near ? [[0, '#a8845c'], [0.7, '#8a6644'], [1, '#2a1a10']] : [[0, '#4a3624'], [1, '#160e0a']], cx, cy, r)}"/>`);
              if (near) for (const k of [0.3, 0.55, 0.8]) cv.add(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(r * 0.55 * k)}" ry="${n(r * k)}" transform="rotate(${n(angle)} ${n(cx)} ${n(cy)})" fill="none" stroke="#5a4028" stroke-width="1.2" stroke-opacity="0.6"/>`);
            }
          },
          { inflate: { radius: w * 0.5, profile: 'round', height: 0.9 }, ...bark(angle) },
        );
      };
      log([96, 446], [404, 360], 46, 'a');
      log([428, 452], [130, 372], 44, 'a');
      // (embers in the cracks where the fire has eaten into them)
      const embers = (cv, fill) => {
        for (let k = 0; k < 26; k++) {
          const x = 170 + rnd() * 170;
          const y = 372 + rnd() * 50 - Math.abs(x - 256) * 0.1;
          cv.add(`<path d="M${pt([x, y])} l${n(6 + rnd() * 14)} ${n((rnd() - 0.5) * 6)}" stroke="${fill}" stroke-width="${n(1.5 + rnd() * 2.5)}" stroke-linecap="round"/>`);
        }
      };
      s.glow((cv) => embers(cv, '#ff6a1a'), { blur: 4, strength: 0.9, halo: 0.6 });
      s.paint((cv) => embers(cv, '#ffc060'), { blur: 0.6, opacity: 0.85 });
      // the flames: tongues of fire, each wavering up to a tip that curls
      const tongue = ([bx, by], height, width, lean, ph) => {
        const left = [];
        const right = [];
        for (let k = 0; k <= 16; k++) {
          const t = k / 16;
          const cx = bx + lean * height * t * t + Math.sin(t * Math.PI * 1.6 + ph) * width * 0.16 * t;
          const y = by - height * t;
          const w = (width / 2) * Math.pow(Math.max(0, 1 - t), 0.85) * Math.min(1, 0.55 + t * 3) * (1 + 0.12 * Math.sin(t * Math.PI * 3 + ph * 2));
          left.push([cx - w, y]);
          right.push([cx + w, y]);
        }
        return spline([...left, ...right.reverse().slice(1)]);
      };
      const flames = [
        [[256, 410], 330, 180, 0.04, 0.3],
        [[204, 404], 236, 120, -0.22, 1.7],
        [[312, 404], 254, 124, 0.18, 2.6],
        [[160, 410], 150, 80, -0.3, 4.1],
        [[350, 410], 168, 82, 0.28, 5.2],
        [[232, 400], 200, 70, -0.08, 0.9],
        [[284, 400], 216, 70, 0.1, 3.3],
      ];
      // (and torn by the air rising through them, their edges licking up in tongues of their own)
      const layer = (cv, scaleH, scaleW, stops, tear = 34) => {
        const f = cv.id('lick');
        cv.def(`<filter id="${f}" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.03 0.011" numOctaves="3" seed="${Math.floor(rnd() * 1000)}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="${tear}" xChannelSelector="R" yChannelSelector="G"/></filter>`);
        cv.add(`<g filter="url(#${f})">`);
        for (const [[bx, by], h, w, lean, ph] of flames) cv.add(`<path d="${tongue([bx, by], h * scaleH, w * scaleW, lean, ph)}" fill="${linear(cv, stops, 0, by, 0, by - h * scaleH)}"/>`);
        cv.add('</g>');
      };
      s.glow((cv) => layer(cv, 0.85, 0.9, [[0, '#ff7a20'], [0.6, '#e04010'], [1, '#c02008']]), { blur: 20, strength: 0.4, halo: 0.6 });
      s.paint((cv) => layer(cv, 1.05, 1, [[0, '#ff8a24'], [0.4, '#f05a14'], [0.75, '#c82a0a', 0.8], [1, '#8a1404', 0]], 46), { blur: 1.5 });
      s.paint((cv) => layer(cv, 0.74, 0.7, [[0, '#ffd060'], [0.5, '#ffa830'], [1, '#ff7a1a', 0]], 30), { blur: 2 });
      s.paint((cv) => layer(cv, 0.44, 0.44, [[0, '#fffbe8'], [0.5, '#fff0b0'], [1, '#ffd060', 0]], 18), { blur: 2.5 });
      s.glow((cv) => cv.add(`<ellipse cx="256" cy="380" rx="80" ry="50" fill="#ffd27a"/>`), { blur: 24, strength: 0.3, halo: 0.5 });
      // the log in front, across the foot of the fire
      log([150, 470], [372, 462], 40, 'b');
      s.glow((cv) => cv.add(`<path d="M190 446 C230 440 290 440 330 444" fill="none" stroke="#ff7a24" stroke-width="5"/>`), { blur: 5, strength: 0.6, halo: 0.6 });
      // sparks going up
      s.glow((cv) => {
        for (let k = 0; k < 22; k++) {
          const x = 150 + rnd() * 220;
          const y = 40 + rnd() * 220;
          cv.add(`<path d="M${pt([x, y])} l${n((rnd() - 0.5) * 6)} ${n(-3 - rnd() * 6)}" stroke="#ffd080" stroke-width="${n(1.5 + rnd() * 1.6)}" stroke-linecap="round"/>`);
        }
      }, { blur: 1.4, strength: 1.4, halo: 0.4 });
      return s.done({
        light: { key: [[0.05, -0.9, 0.45], [1, 0.6, 0.28], 1.25], fill: [[0, 0, 1], [0.3, 0.3, 0.4], 0.12], rim: [[0, -1, 0], [1, 0.62, 0.3], 1.2], ambient: [0.07, 0.05, 0.05] },
        finish: { grain: 0.004, contrast: 0.08, saturation: 1.05, warmth: 0.02 },
      });
    },
  },
  {
    key: 'heyv',
    ku: 'Heyv',
    en: 'Crescent moon',
    // the young moon: a crescent of the full grey globe, lit from beyond it, its seas and craters showing on the lit
    // edge, the rest of it lost in the dark, and a cold glow round it; the globe set to one side, so that what is
    // seen of it, the crescent, sits in the middle
    still(rnd) {
      const s = new Still(rnd).place([-96, 0]);
      const C = [256, 256];
      const R = 196;
      s.surface(
        (cv) => {
          cv.add(`<circle cx="${C[0]}" cy="${C[1]}" r="${R}" fill="#bdb8ae"/>`);
          // the seas: broad dark stains, softened
          const sea = cv.id('sea');
          cv.def(`<filter id="${sea}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>`);
          const clip = cv.id('globe');
          cv.def(`<clipPath id="${clip}"><circle cx="${C[0]}" cy="${C[1]}" r="${R}"/></clipPath>`);
          cv.add(`<g clip-path="url(#${clip})" filter="url(#${sea})" fill="#5e5a54">`);
          for (const [x, y, r] of [[404, 168, 44], [430, 262, 34], [398, 354, 40], [356, 220, 30], [440, 330, 22], [350, 410, 26]]) cv.add(`<path d="${spline(roundish([x, y], r, rnd, { wobble: 0.18, count: 10 }))}" fill-opacity="${n(0.5 + rnd() * 0.3)}"/>`);
          cv.add('</g>');
          for (let i = 0; i < 18; i++) {
            const a = rnd() * Math.PI * 2;
            const r = Math.sqrt(rnd()) * (R - 20);
            const cr = 3 + rnd() ** 2 * 12;
            cv.add(`<circle cx="${n(C[0] + Math.cos(a) * r)}" cy="${n(C[1] + Math.sin(a) * r)}" r="${n(cr)}" fill="#8e8a82" fill-opacity="0.35"/>`);
          }
          // the bright splash round a young crater
          cv.add(`<circle cx="410" cy="330" r="7" fill="#efece4" fill-opacity="0.8"/>`);
        },
        {
          inflate: { radius: R, profile: 'round', height: 1, soften: 6 },
          relief: {
            draw: (cv) => {
              // the craters' rims, raised round their floors
              for (let i = 0; i < 16; i++) {
                const a = rnd() * Math.PI * 2;
                const r = Math.sqrt(rnd()) * (R - 14);
                const cr = 3 + rnd() ** 2 * 12;
                cv.add(`<circle cx="${n(C[0] + Math.cos(a) * r)}" cy="${n(C[1] + Math.sin(a) * r)}" r="${n(cr)}" fill="none" stroke="#fff" stroke-width="${n(1.2 + cr * 0.15)}" stroke-opacity="0.45"/>`);
              }
            },
            height: 2,
            blur: 1.6,
          },
          bumps: { scale: 9, amount: 0.25 },
          mottle: { scale: 16, amount: 0.14 },
          material: { ambient: 0, fill: 0, gloss: 0, sheen: 0, hollows: 0.3, seen: 0.35 },
        },
      );
      s.glow((cv) => cv.add(`<path d="M${C[0]} ${C[1] - R} A${R} ${R} 0 1 1 ${C[0]} ${C[1] + R} A${R * 0.3} ${R} 0 1 0 ${C[0]} ${C[1] - R} Z" fill="#cfdcff" transform="rotate(-16 ${C[0]} ${C[1]})"/>`), { blur: 16, strength: 0.28, halo: 0.6 });
      return s.done({ light: { key: [[0.9, -0.28, -0.36], [1, 0.98, 0.94], 1.6], fill: [[0, 0, 1], [0, 0, 0], 0], ambient: [0, 0, 0] }, finish: { grain: 0.004, saturation: 0.9, warmth: 0 } });
    },
  },
];