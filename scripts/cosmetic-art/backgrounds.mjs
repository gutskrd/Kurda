/**
 * The shop's backgrounds, as scenes: layers of a place, back to front, with
 * light and air between them (see render.mjs for how they are put together).
 *
 * Each is painted for the way it is shown. On a profile card the 1280 × 720
 * picture is cropped to a strip about three times as wide as it is tall, from
 * the middle — so what a scene is about sits between y = 210 and y = 510, and
 * the sky above and the ground below are there to be cut.
 *
 * `key` names the file and seeds the drawing; `ku` and `en` are its names in
 * the shop, which api/content/cosmetics.json and migration 1751000161000 hold
 * too — a piece is redrawn here, never renamed.
 */
import { Canvas, between, doc, n, pt } from './kit.mjs';
import { deer, lamb } from './figures.mjs';
import { aurora, birds, heightAt, range, ridge } from './landscape.mjs';
import { fringes, kilim } from './kilim.mjs';
import { akreTorches, amedi, citadel, delal, hewraman, tent } from './places.mjs';
import { beams, blob, branch, clouds, embers, fire, flower, glow, grass, motes, noise, orb, petals, pine, reeds, silhouette, sky, starfield, tallGrass, tree } from './nature.mjs';

export const W = 1280;
export const H = 720;

/** A scene under construction: layers and effects, in order. */
export class Scene {
  constructor(rnd) {
    this.rnd = rnd;
    this.steps = [];
  }
  /**
   * A layer: `draw(cv)` paints it; `opts` say how it is laid in (blur, haze,
   * blend, opacity, scale, rim). What `draw` adds through `rough()` or
   * `leaves()` makes the layer one of parts, each rasterised on its own — the
   * rough ones roughened, the leaves repainted leaf by leaf — and laid one
   * over the next in the order they were drawn.
   */
  layer(opts, draw) {
    const cv = new Canvas(W, H);
    cv.partAt = new Map();
    draw(cv);
    // what is drawn past the edges and cut back, for clouds' filters (see nature.mjs `clouds`)
    if (cv.bleed) opts = { ...opts, bleed: cv.bleed };
    if (!cv.partAt.size) {
      this.steps.push({ ...opts, svg: cv.svg() });
      return this;
    }
    const defs = cv.defs.join('');
    const parts = [];
    let plain = [];
    const flush = () => {
      if (plain.length) parts.push({ svg: doc(W, H, defs, plain.join('')) });
      plain = [];
    };
    cv.body.forEach((markup, i) => {
      const part = cv.partAt.get(i);
      if (!part) {
        plain.push(markup);
        return;
      }
      flush();
      parts.push({ svg: doc(W, H, defs, markup), ...part });
    });
    flush();
    this.steps.push({ ...opts, parts });
    return this;
  }
  /**
   * A range of mountains painted from a relief by the compositor (render.mjs
   * `terrain`), laid in like a layer (`opts`: blur, haze, rim, falloff).
   * `range` gives its skyline — `base`, `peaks` of { x, h, s or l and r, k },
   * `rough` — and its paint; or `line(x)` gives it, and `peaks` only say
   * which way its slopes face. Returns the skyline, for what stands on it.
   */
  terrain(opts, { base, peaks, line = null, rough = 0.18, scale = 90, ...paint }) {
    const pts = [];
    if (line) for (let x = -60; x <= W + 60; x += 4) pts.push([x, line(x)]);
    else pts.push(...ridge(this.rnd, { w: W, base, peaks, rough, scale, step: 4 }));
    const summits = peaks.map((pk) => {
      let top = [pk.x, base - pk.h];
      for (const [px, py] of pts) if (Math.abs(px - pk.x) < 60 && py < top[1]) top = [px, py];
      return [top[0], top[1], Math.max(pk.s ?? 0, pk.l ?? 0, pk.r ?? 0)];
    });
    this.steps.push({ ...opts, terrain: { ridge: pts.map(([px, py]) => [Math.round(px * 100) / 100, Math.round(py * 100) / 100]), peaks: summits, seed: this.seed(), ...paint } });
    return pts;
  }
  /**
   * Ground cover painted plant by plant by the compositor (marks.mjs `carpet`), laid in like a layer (`opts`):
   * `top(x)` (or a number) is its far edge, and the rest is its paint — the plants that grow there, the fog.
   */
  carpet(opts, { top, ...paint }) {
    const line = typeof top === 'function' ? top : () => top;
    const pts = [];
    for (let x = -40; x <= W + 40; x += 8) pts.push([x, Math.round(line(x) * 100) / 100]);
    this.steps.push({ ...opts, carpet: { top: pts, seed: this.seed(), ...paint } });
    return this;
  }
  /** A layer the compositor paints whole (marks.mjs): `kind` is 'nebula' or 'wash'. */
  painted(kind, opts, paint) {
    this.steps.push({ ...opts, [kind]: { seed: this.seed(), ...paint } });
    return this;
  }
  effect(effect, opts) {
    this.steps.push({ effect, ...opts });
    return this;
  }
  done(finish) {
    return { steps: this.steps, finish };
  }
  /** A seed for a noise field, from the scene's own generator. */
  seed() {
    return 1 + Math.floor(this.rnd() * 9000);
  }
}

/** Adds `markup` to a layer with its edges roughened into leaf and twig (render.mjs `roughen`). */
function rough(cv, markup, { scale = 7, freq = 0.09, seed = 3 } = {}) {
  cv.partAt.set(cv.body.length, { rough: { scale, freq, seed } });
  cv.add(markup);
}

/**
 * Adds crowns to a layer, to be repainted leaf by leaf (marks.mjs `leafy`, with `opts`), their edges roughened
 * first if `roughen` is given.
 */
function leaves(cv, markup, opts, roughen = null) {
  cv.partAt.set(cv.body.length, { leafy: opts, ...(roughen ? { rough: { scale: 7, freq: 0.09, seed: 3, ...roughen } } : {}) });
  cv.add(markup);
}

/**
 * Points scattered over sloping ground whose skyline is `ground(x)`, from it down to `y1`, the most of them
 * near the top (further off, `bias`), back to front: [x, y, t], t from 0 at the ground's line to 1 at y1.
 */
function onGround(rnd, ground, count, { x0 = -20, x1 = 1300, y1 = 744, bias = 1.4 } = {}) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const x = between(rnd, x0, x1);
    const g = ground(x);
    if (g > y1 - 18) continue;
    const t = rnd() ** bias;
    items.push([x, g + 6 + (y1 - g) * t, t]);
  }
  return items.sort((a, b) => a[1] - b[1]);
}

/**
 * Scrub along a line `y(x)`: low bushes packed shoulder to shoulder, `h0` to `h1` high, as one path in `colour`
 * (to be painted leaf by leaf), so a field's far edge runs into it rather than meeting the sky.
 */
function hedge(rnd, { y, x0 = -40, x1 = 1320, count, h0, h1, colour }) {
  const shapes = [];
  for (let i = 0; i < count; i++) {
    const x = between(rnd, x0, x1);
    const h = between(rnd, h0, h1);
    shapes.push(blob(rnd, x, y(x) - h * 0.45, h * between(rnd, 0.6, 1.3), h * 0.55, 0.5, 11));
  }
  return `<path d="${shapes.join(' ')}" fill="${colour}"/>`;
}

/**
 * A tall trunk as it stands in a wood, its crown out of sight overhead: from its foot at (x, y) up past the top
 * of the picture, `w` wide at the foot and narrowing, bending a little as it goes (`lean`), with a few boughs
 * and broken stubs off it. Markup for one path's `d`.
 */
function trunk(rnd, { x, y, w, lean = 0, boughs = 3 }) {
  const top = -40;
  const pts = [];
  const steps = 8;
  let drift = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    drift += between(rnd, -0.5, 0.5) * w * 0.12;
    pts.push([x + lean * (y - top) * t + drift, y + (top - y) * t, w * (1 - t * 0.45) * (i === 0 ? 1.25 : 1)]);
  }
  const left = pts.map(([px, py, pw]) => [px - pw / 2, py]);
  const right = pts.map(([px, py, pw]) => [px + pw / 2, py]).reverse();
  let d = `M${pt(left[0])}`;
  for (let i = 1; i < left.length; i++) d += ` L${pt(left[i])}`;
  for (const p of right) d += ` L${pt(p)}`;
  d += ' Z';
  // boughs reaching up and out, curving toward the light, and stubs where one broke off
  for (let b = 0; b < boughs; b++) {
    const i = 3 + Math.floor(rnd() * (steps - 4));
    const [px, py, pw] = pts[i];
    const side = rnd() < 0.5 ? -1 : 1;
    const stub = rnd() < 0.35;
    const len = stub ? pw * between(rnd, 0.6, 1.1) : (y - top) * between(rnd, 0.06, 0.13);
    const a = side * between(rnd, 0.7, 1.15);
    const bw = pw * between(rnd, 0.18, 0.32);
    const ex = px + Math.sin(a) * len;
    const ey = py - Math.cos(a) * len - (stub ? 0 : len * 0.35);
    const mx = px + Math.sin(a) * len * 0.62;
    const my = py - Math.cos(a) * len * 0.45;
    d += ` M${pt([px, py + bw])} Q${pt([mx, my + bw * 0.5])} ${pt([ex, ey])} Q${pt([mx, my - bw * 0.5])} ${pt([px, py - bw])} Z`;
  }
  return d;
}

export const SCENES = {
  'evara-zerin': {
    ku: 'Êvara Zêrîn',
    en: 'Golden evening',
    // a misty lake at the golden end of the day: the sun low and soft in the haze, old pines standing grey on the
    // far shore, and close in front of us a stag come down to the water to drink, the light all round him
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [1010, 330];
      const haze = '#f2c27a';
      s.layer({}, (cv) => {
        sky(cv, [[0, '#b07a3a'], [0.35, '#dca45a'], [0.6, '#f6cf8a'], [1, '#ffe6b0']]);
        glow(cv, { x: sun[0], y: sun[1], r: 700, colour: '#ffe8b8', opacity: 0.95 });
        orb(cv, { x: sun[0], y: sun[1], r: 34, core: '#fffbec', edge: '#fff2cc', halo: '#ffe6b4', haloR: 300, haloOpacity: 0.7 });
      });
      // the far shore: a low wooded ridge in the haze, old pines standing up out of it, a few long dead
      const shore = (x) => 452 - 26 * Math.exp(-(((x - 320) / 300) ** 2)) - 10 * Math.exp(-(((x - 860) / 200) ** 2));
      s.layer({ blur: 2.4, haze: [haze, 0.8] }, (cv) => {
        leaves(cv, hedge(rnd, { y: (x) => shore(x) + 6, count: 90, h0: 20, h1: 56, colour: '#5a3a1e' }), { size: 3, masses: 4, contrast: 0, gaps: 0.6, seed: s.seed() });
        let firs = '';
        for (let i = 0; i < 26; i++) {
          const x = between(rnd, 60, 720);
          firs += pine(rnd, { x, y: shore(x) + 10, height: between(rnd, 50, 150), colour: '#5a3a1e', width: between(rnd, 0.26, 0.36) });
        }
        leaves(cv, firs, { size: 2.6, masses: 3, contrast: 0, gaps: 0.5, tip: 1, seed: s.seed() });
      });
      s.layer({ blur: 1.4, haze: [haze, 0.62], rim: { x: sun[0], y: sun[1], colour: '#fff0c8', width: 2, strength: 0.7, reach: 900 } }, (cv) => {
        // tall old pines, lanky and thin-crowned, standing up over the rest
        let firs = '';
        for (const [x, h] of [[640, 250], [700, 330], [770, 280], [1150, 300], [1225, 220]]) {
          firs += pine(rnd, { x, y: shore(x) + 10, height: h, colour: '#4a2e18', width: 0.2 });
          firs += `<rect x="${n(x - 1.5)}" y="${n(shore(x) - h * 0.98)}" width="3" height="${n(h)}" fill="#4a2e18"/>`;
        }
        leaves(cv, firs, { size: 2.6, masses: 3, contrast: 0, gaps: 0.9, tip: 1, seed: s.seed() });
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.66, strength: 1.4, decay: 0.978, density: 0.97, colour: '#ffe2a8' });
      s.effect('reflect', { y: 456, deep: '#6a4a26', near: 0.5, far: 0.9, ripple: 1.4, wave: 0.14, soften: 1.6, seed: s.seed() });
      // the mist lying on the water
      s.layer({ scale: 2, blur: 4 }, (cv) => {
        noise(cv, { y: 400, h: 150, freq: [0.003, 0.03], seed: s.seed(), colour: '#ffe8c0', contrast: 2.4, bias: -0.8, opacity: 0.85, fade: [[0, 0], [0.45, 1], [1, 0]] });
      });
      // the sun's path on the water
      s.layer({ blur: 0.8, blend: 'screen' }, (cv) => {
        const sparks = [];
        for (let i = 0; i < 160; i++) {
          const t = rnd() ** 1.3;
          const y = 470 + t * 250;
          const x = sun[0] + (rnd() + rnd() - 1) * (30 + t * 220);
          const w = between(rnd, 4, 16) * (0.5 + t);
          sparks.push(`<rect x="${n(x - w / 2)}" y="${n(y)}" width="${n(w)}" height="${n(Math.max(0.8, w * 0.12))}" fill-opacity="${n(between(rnd, 0.3, 0.9) * (1 - t * 0.4))}"/>`);
        }
        cv.add(`<g fill="#fff4d0">${sparks.join('')}</g>`);
      });
      // the near bank on the left, the grass on it, and the stag at its foot with his muzzle in the water — and
      // what of him the water holds
      // (all of him above the foot of the strip a profile card shows, his muzzle at the water)
      const water = 530;
      const stag = deer({ x: 300, y: water - 4, size: 200, colour: '#24160a', pose: 'drink', facing: 1 });
      const rim = { x: sun[0], y: sun[1], colour: '#ffd890', width: 3, strength: 1, reach: 1500 };
      s.layer({ blur: 1.6, opacity: 0.5 }, (cv) => {
        cv.add(`<g transform="translate(0 ${2 * water}) scale(1 -1)">${stag}</g>`);
      });
      // the rings spreading from his muzzle
      s.layer({ blur: 0.8, blend: 'screen' }, (cv) => {
        for (const [r, o] of [[12, 0.5], [26, 0.35], [46, 0.2]]) cv.add(`<ellipse cx="478" cy="${water + 2}" rx="${r}" ry="${n(r * 0.16)}" fill="none" stroke="#fff0c0" stroke-width="1.6" stroke-opacity="${o}"/>`);
      });
      // the bank he stands on, coming down from the left and running on into the shallows toward us
      const bankAt = (x) => {
        if (x < 220) {
          const t = Math.max(0, (x + 30) / 250);
          return water - 74 + 68 * t * t * (3 - 2 * t);
        }
        if (x < 390) return water - 6 + (4 * (x - 220)) / 170;
        return water - 2 + 240 * ((x - 390) / 180) ** 1.5;
      };
      s.layer({ blur: 0.6, rim }, (cv) => {
        const edge = [];
        for (let x = -30; x <= 570; x += 6) edge.push(`${n(x)},${n(Math.min(770, bankAt(x)))}`);
        cv.add(`<path d="M${edge.join(' L')} L570,770 L-30,770 Z" fill="#2a1a0c"/>`);
        cv.add(tallGrass(rnd, { x0: -30, x1: 560, top: (x) => bankAt(x) + 3, y1: 760, count: 640, height: 60, colours: ['#2a1a0c', '#3a2410', '#4a3016'], heads: '#c89a50', share: 0.1, wind: 0.12, width: 2 }));
        cv.add(stag);
        cv.add(grass(rnd, { x0: 360, x1: 430, y: water + 6, count: 36, height: 20, colours: ['#2a1a0c', '#3a2410'], wind: 0.1, width: 1.6 }));
        cv.add(grass(rnd, { x0: 420, x1: 560, y: 750, count: 60, height: 60, colours: ['#2a1a0c', '#3a2410'], wind: 0.14, width: 2 }));
      });
      // reeds right in front, out of focus, the light through them
      s.layer({ blur: 6, rim: { ...rim, width: 5 } }, (cv) => {
        const r = reeds(rnd, { x0: 1160, x1: 1340, y: 790, count: 6, height: 380, stem: '#2a1808', plume: '#d8a050', wind: -0.18, plumeSize: 1.1 });
        cv.add(r.stems + r.plumes);
      });
      s.layer({ blur: 0.6, blend: 'screen', opacity: 0.8 }, (cv) => {
        cv.add(motes(rnd, { x0: 600, x1: 1280, y0: 180, y1: 560, count: 120, size: 1.6, colours: ['#fff4d0', '#ffe2a0'] }));
      });
      return s.done({
        bloom: { threshold: 0.72, strength: 0.55, radius: 34, tint: '#ffd9a0' },
        diffuse: { radius: 22, strength: 0.3, soften: 0.1 },
        streaks: { threshold: 0.88, strength: 0.4, length: 420, tint: '#ffcf80' },
        grade: { lift: [0.06, 0.04, 0.01], gain: [1.03, 0.97, 0.8], gamma: [1.04, 1, 0.9], saturation: 1.02, contrast: 0.24, shadows: ['#3a1e0c', 0.5], highlights: ['#fff2d0', 0.2] },
        vignette: { strength: 0.45, colour: '#1a0d05' },
        grain: 0.02,
        clumps: 0.012,
      });
    },
  },

  hevalo: {
    ku: 'Hevalo',
    en: 'Hevalo violet',
    // deep in a violet wood at dusk: the leaves overhead lit pink where the last light comes through them, the
    // trunks going back into the haze, the light falling in a pool on the moss of a clearing, and Hevalo in it
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [860, 90];
      const haze = '#b48cd0';
      const light = [0.45, -1];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#6a4a92'], [0.35, '#a07cc4'], [0.7, '#c8a6dc'], [1, '#9a78bc']]);
        glow(cv, { x: sun[0], y: sun[1] + 140, r: 640, colour: '#f6dcf8', opacity: 0.9 });
        glow(cv, { x: sun[0], y: sun[1] + 80, r: 220, colour: '#ffffff', opacity: 0.8 });
      });
      const floor = (x) => 526 + Math.sin(x / 230) * 6;
      // the far wood: thin trunks in the haze, and the leaves of it overhead
      s.layer({ blur: 2, haze: [haze, 0.66] }, (cv) => {
        let trunks = '';
        for (let i = 0; i < 22; i++) {
          const x = (i + between(rnd, 0.1, 0.9)) * (1400 / 22) - 60;
          const w = between(rnd, 6, 14);
          trunks += `<path d="M${n(x - w / 2)},${n(floor(x) + 4)} C${n(x - w * 0.4)},400 ${n(x - w * 0.3 + between(rnd, -10, 10))},200 ${n(x - w * 0.2)},-20 L${n(x + w * 0.2)},-20 C${n(x + w * 0.3)},200 ${n(x + w * 0.4)},400 ${n(x + w / 2)},${n(floor(x) + 4)} Z"/>`;
        }
        cv.add(`<g fill="#4a2e6a">${trunks}</g>`);
        leaves(cv, hedge(rnd, { y: () => between(rnd, 60, 250), x0: -80, x1: 1360, count: 80, h0: 100, h1: 240, colour: '#6a4a92' }), { size: 4, masses: 6, contrast: 0.8, gaps: 0.85, light, seed: s.seed() });
      });
      // the nearer trees, their crowns closing overhead, lit pink on the side toward the light
      s.layer({ blur: 0.9, haze: [haze, 0.26], rim: { x: sun[0], y: sun[1], colour: '#ffd0f0', width: 4, strength: 0.9, reach: 1300 } }, (cv) => {
        let trunks = '';
        let crowns = '';
        for (const [x, h, lean] of [[230, 760, 0.06], [480, 700, -0.04], [600, 780, 0.03], [1010, 740, -0.05]]) {
          const t = tree(rnd, { x, y: floor(x) + 6, height: h, kind: 'oak', wood: '#1e1032', leafColour: '#3a2258', volume: ['#24123a', '#4a2c6e', '#b484d4'], light, lean, leafiness: 1.3, twig: 6, girth: 1.2, clump: 1.2 });
          trunks += t.wood;
          crowns += t.leaves;
        }
        cv.add(trunks);
        leaves(cv, crowns, { size: 4.6, masses: 5, contrast: 0.7, gaps: 0.6, light, seed: s.seed() });
      });
      // the clearing's floor: moss and low growth, the light pooled in the middle of it
      s.carpet({}, {
        top: floor,
        far: 1.6,
        near: 14,
        ground: '#1a0e28',
        fog: [haze, 0.55],
        light,
        pool: { x: 740, y: 570, r: 520, ambient: 0.22, squash: 0.35 },
        patches: 0.3,
        focus: { from: 0.82, blur: 1.4 },
        plants: [
          { kind: 'tuft', share: 5, colours: ['#4e3a6e', '#6a5486', '#8a6a9a', '#9aac84', '#7a9a72', '#c88aa8'], drifts: 0.6 },
          { kind: 'blades', share: 2, colours: ['#5a4a7a', '#6e5e88', '#5a7060', '#8aa070'] },
          { kind: 'daisy', share: 0.2, colours: ['#4e3a6e'], flower: ['#f8e0fc', '#ffe8f6'], leaves: '#4e3a6e', centre: '#ffe08a' },
        ],
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.62, strength: 1.5, decay: 0.978, density: 0.98, colour: '#f8dcff' });
      // light come through the leaves in patches, on the moss and up the trunks
      s.layer({ blur: 5, blend: 'screen', opacity: 0.8 }, (cv) => {
        const spots = [];
        for (let i = 0; i < 46; i++) {
          const x = between(rnd, 380, 1100);
          const y = between(rnd, 540, 700);
          const r = between(rnd, 10, 46) * (0.6 + (y - 520) / 300);
          spots.push(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r)}" ry="${n(r * 0.3)}" fill-opacity="${n(between(rnd, 0.2, 0.6))}"/>`);
        }
        cv.add(`<g fill="#ffd6ec">${spots.join('')}</g>`);
      });
      // the undergrowth round the clearing, lit on its tops, mossy stones in the light
      s.layer({ rim: { x: sun[0], y: sun[1], colour: '#ffe0f8', width: 2, strength: 0.7, reach: 1100 } }, (cv) => {
        cv.add('<path d="M806,588 C818,566 870,560 902,572 C910,584 890,592 852,592 Z" fill="#6e6a7e"/><path d="M820,574 C836,566 868,566 890,574" stroke="#a8b8a0" stroke-width="3" fill="none" stroke-opacity="0.6"/>');
        cv.def('<linearGradient id="hv-bush" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a86b0"/><stop offset="0.5" stop-color="#5a4a7e"/><stop offset="1" stop-color="#2a1a44"/></linearGradient>');
        leaves(cv, hedge(rnd, { y: (x) => floor(x) + 40, x0: 300, x1: 600, count: 12, h0: 30, h1: 70, colour: 'url(#hv-bush)' }) + hedge(rnd, { y: (x) => floor(x) + 50, x0: 880, x1: 1120, count: 12, h0: 30, h1: 80, colour: 'url(#hv-bush)' }), { size: 4, masses: 4, contrast: 0.8, gaps: 0.6, light, seed: s.seed() });
      });
      // the nearest things, dark: a great trunk on the right, ferns and brush down the left and along the bottom
      s.layer({ blur: 1.4 }, (cv) => {
        cv.add('<path d="M1120,-20 C1136,180 1132,400 1110,560 C1100,640 1086,700 1070,740 L1300,740 L1300,-20 Z" fill="#160a24"/>');
        leaves(cv, hedge(rnd, { y: (x) => 720 - Math.max(0, 220 - x) * 0.8, x0: -80, x1: 300, count: 18, h0: 70, h1: 170, colour: '#24143a' }) + hedge(rnd, { y: () => 790, x0: -80, x1: 1360, count: 40, h0: 50, h1: 110, colour: '#1e1030' }), { size: 6, masses: 4, contrast: 0.6, gaps: 0.6, light, seed: s.seed() });
      });
      s.effect('texture', { amount: 0.07, cells: [60, 18, 6], seed: s.seed() });
      s.effect('paint', { radius: 2 });
      s.layer({ rim: { x: sun[0], y: sun[1], colour: '#ffe0f8', width: 2.5, strength: 1, reach: 1200 } }, (cv) => {
        cv.add(deer({ x: 690, y: 556, size: 92, colour: '#24123a', pose: 'alert', facing: -1 }));
      });
      s.layer({ blur: 0.8, blend: 'screen' }, (cv) => {
        cv.add(motes(rnd, { x0: 420, x1: 1080, y0: 120, y1: 560, count: 140, size: 1.8, colours: ['#ffe6fa', '#ffc6ee', '#ffffff'] }));
      });
      return s.done({
        bloom: { threshold: 0.7, strength: 0.45, radius: 30, tint: '#ffd0f4' },
        diffuse: { radius: 18, strength: 0.2, soften: 0.05 },
        grade: { lift: [0.03, 0.015, 0.065], gain: [1.02, 0.94, 1.02], gamma: [0.96, 0.92, 1], saturation: 1.1, contrast: 0.3, shadows: ['#1a1048', 0.55], highlights: ['#ffd6ea', 0.25] },
        vignette: { strength: 0.5, colour: '#0e0418' },
        grain: 0.018,
      });
    },
  },

  'daristana-seve': {
    ku: 'Daristana Şevê',
    en: 'Forest at night',
    // an oak wood by a stream at night, the moon behind the trees and its light coming through the mist between
    // them in long beams; a stag grazing on the bank in the light, the stream glinting in front of us
    scene(rnd) {
      const s = new Scene(rnd);
      const moonAt = [430, 110];
      const fog = '#5a8a96';
      s.layer({}, (cv) => {
        sky(cv, [[0, '#18343e'], [0.4, '#2c5662'], [1, '#3a6a74']]);
        glow(cv, { x: moonAt[0], y: moonAt[1], r: 640, colour: '#9ad0e0', opacity: 0.6 });
        glow(cv, { x: moonAt[0], y: moonAt[1], r: 160, colour: '#e8fbff', opacity: 0.95 });
      });
      const bank = (x) => 546 + Math.sin(x / 170) * 5 - 16 * Math.exp(-(((x - 640) / 260) ** 2));
      // the wood going back into the mist, row behind row: tall trunks, each leaning its own way, a bough here
      // and there, and the leaves dark overhead with the moon coming through them
      const wood = (count, w0, w1, colour, blur, hz, clear) =>
        s.layer({ blur, haze: [fog, hz], rim: { x: moonAt[0], y: moonAt[1], colour: '#bfeaf6', width: 2.5, strength: 0.7, reach: 1000 } }, (cv) => {
          let d = '';
          for (let i = 0; i < count; i++) {
            const x = (i + between(rnd, 0.05, 0.95)) * (1400 / count) - 60;
            if (Math.abs(x - moonAt[0]) < clear) continue;
            d += `${trunk(rnd, { x, y: bank(x) + 26, w: between(rnd, w0, w1), lean: between(rnd, -0.05, 0.05), boughs: Math.floor(rnd() * 3) })} `;
          }
          cv.add(`<path d="${d}" fill="${colour}"/>`);
          // (the leaves overhead in tatters, the moon through them)
          leaves(cv, hedge(rnd, { y: () => between(rnd, -60, 60), count: 26, h0: 50, h1: 130, colour }), { size: 3.6, masses: 4, contrast: 0.1, gaps: 1, light: [-0.6, -1], seed: s.seed() });
        });
      wood(30, 5, 16, '#16323a', 3, 0.82, 0);
      wood(14, 12, 28, '#0c2229', 1.8, 0.6, 50);
      wood(6, 30, 56, '#061418', 0.8, 0.26, 130);
      s.effect('rays', { x: moonAt[0], y: moonAt[1], threshold: 0.42, strength: 3.6, decay: 0.986, density: 1, colour: '#c8f0ff' });
      // the stream in front, holding the light and the wood beyond the bank (the bank laid in after)
      s.effect('reflect', { y: 610, deep: '#04161a', near: 0.45, far: 0.85, ripple: 3, wave: 0.11, soften: 1.8, seed: s.seed() });
      // the bank, and the stag grazing on it in the light
      s.layer({ rim: { x: moonAt[0], y: moonAt[1], colour: '#d8f6ff', width: 2.5, strength: 1, reach: 1300 } }, (cv) => {
        cv.add(`<path d="M-20,${n(bank(-20))} ${Array.from({ length: 34 }, (_, i) => `L${n(i * 40)},${n(bank(i * 40))}`).join(' ')} L1300,${n(bank(1300))} L1300,614 C1000,608 600,614 300,610 C160,608 60,612 -20,614 Z" fill="#071518"/>`);
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 576, count: 700, height: 24, colours: ['#071518', '#0c2024', '#10282c'], wind: 0.1, width: 1.8 }));
        cv.add(deer({ x: 600, y: 536, size: 150, colour: '#050f12', pose: 'graze', facing: 1 }));
        cv.add(grass(rnd, { x0: 540, x1: 840, y: 540, count: 90, height: 14, colours: ['#071518', '#0c2024'], wind: 0.1, width: 1.6 }));
      });
      s.layer({ blur: 0.7, blend: 'screen' }, (cv) => {
        const sparks = [];
        for (let i = 0; i < 160; i++) {
          const t = rnd();
          const y = 618 + t * 100;
          const x = moonAt[0] + 140 + (rnd() + rnd() - 1) * (120 + t * 300);
          const w = between(rnd, 3, 16) * (0.6 + t);
          sparks.push(`<rect x="${n(x - w / 2)}" y="${n(y)}" width="${n(w)}" height="${n(Math.max(0.8, w * 0.14))}" fill-opacity="${n(between(rnd, 0.3, 0.9))}"/>`);
        }
        cv.add(`<g fill="#e6faff">${sparks.join('')}</g>`);
      });
      // stones in the water at the edges, their tops catching the moon
      s.layer({ blur: 1.4, rim: { x: moonAt[0], y: moonAt[1], colour: '#d8f6ff', width: 3, strength: 0.9, reach: 1600 } }, (cv) => {
        cv.add('<path d="M1010,740 C1020,680 1070,650 1130,652 C1200,656 1250,690 1262,740 Z M-20,700 C20,664 70,654 110,666 C140,680 150,710 150,740 L-20,740 Z" fill="#0a1a1e"/>');
      });
      s.layer({ blur: 1, blend: 'screen' }, (cv) => {
        for (let i = 0; i < 36; i++) {
          const x = between(rnd, 160, 1180);
          const y = between(rnd, 380, 590);
          const r = between(rnd, 1.2, 2.6);
          cv.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 4)}" fill="#c8ff6a" fill-opacity="0.1"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#efffb0"/>`);
        }
      });
      return s.done({
        bloom: { threshold: 0.6, strength: 0.55, radius: 28, tint: '#bfe8ff' },
        diffuse: { radius: 18, strength: 0.2, soften: 0.06 },
        grade: { lift: [0.015, 0.04, 0.055], gain: [0.9, 1, 1.04], gamma: [0.95, 1, 1.04], saturation: 1, contrast: 0.26, shadows: ['#021820', 0.5], highlights: ['#e8fbff', 0.15] },
        vignette: { strength: 0.55, colour: '#020a0e' },
        grain: 0.02,
        clumps: 0.012,
      });
    },
  },

  mij: {
    ku: 'Mij',
    en: 'Mist',
    // the mist over the Zagros as an ink painter would set it down: a wash of grey-blue ink run wet across the
    // paper, the ridges in thinned ink going back into it, and close in front a spray of wild almond in flower,
    // the ink spattered from the brush
    scene(rnd) {
      const s = new Scene(rnd);
      const ink = '#161b24';
      s.painted('wash', {}, { paper: '#e6e4de', ink: '#3a4454', stops: [[0, 0.82], [0.45, 0.6], [0.75, 0.46], [1, 0.62]], blooms: 0.6, streaks: 0.7, fibre: 0.7 });
      // the ridges, in ink thinned with more water the further off they are, the mist the paper left bare between
      const ridgeLayer = (base, peaks, colour, opacity, blur) =>
        s.layer({ blur, opacity }, (cv) => {
          range(cv, rnd, { base, peaks, rough: 0.16, scale: 60, fill: colour, shade: colour, shadeOpacity: 0, gullies: 0, spurs: false });
        });
      ridgeLayer(430, [{ x: 520, h: 150, s: 300 }, { x: 900, h: 110, s: 280 }, { x: 1220, h: 160, s: 260 }], '#4a5464', 0.32, 3);
      s.layer({ scale: 2, blur: 5 }, (cv) => {
        noise(cv, { y: 330, h: 160, freq: [0.003, 0.02], seed: s.seed(), colour: '#e6e4de', contrast: 2.4, bias: -0.7, opacity: 0.8, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      ridgeLayer(540, [{ x: 640, h: 130, s: 340 }, { x: 1060, h: 170, s: 300 }], '#2a323e', 0.5, 1.6);
      s.layer({ scale: 2, blur: 5 }, (cv) => {
        noise(cv, { y: 470, h: 180, freq: [0.003, 0.02], seed: s.seed(), colour: '#e6e4de', contrast: 2.4, bias: -0.7, opacity: 0.85, fade: [[0, 0], [0.5, 1], [1, 0.2]] });
      });
      // a few hairline twigs hanging down the right side, the brush dragged nearly dry
      s.layer({ blur: 0.5, opacity: 0.6 }, (cv) => {
        const lines = [];
        for (let k = 0; k < 3; k++) {
          let x = between(rnd, 760, 1160);
          let y = between(rnd, -10, 60);
          let a = between(rnd, -0.2, 0.2);
          let d = `M${n(x)},${n(y)}`;
          const steps = Math.round(between(rnd, 10, 18));
          for (let i = 0; i < steps; i++) {
            a += between(rnd, -0.25, 0.25);
            a = Math.max(-0.5, Math.min(0.5, a));
            const len = between(rnd, 16, 30);
            const nx = x + Math.sin(a) * len;
            const ny = y + Math.cos(a) * len;
            d += ` Q${n((x + nx) / 2 + between(rnd, -4, 4))},${n((y + ny) / 2)} ${n(nx)},${n(ny)}`;
            if (rnd() < 0.18) lines.push(`M${n(nx)},${n(ny)} q${n(between(rnd, -10, 10))},${n(between(rnd, 6, 12))} ${n(between(rnd, -26, 26))},${n(between(rnd, 10, 30))}`);
            x = nx;
            y = ny;
          }
          lines.push(d);
        }
        cv.add(`<path d="${lines.join(' ')}" fill="none" stroke="${ink}" stroke-width="1.1" stroke-linecap="round"/>`);
      });
      // the almond, reaching in from the left
      s.layer({}, (cv) => {
        cv.add(branch(rnd, { x: -30, y: 150, angle: 2.05, length: 780, width: 22, wood: ink, blossom: ['#f8f8f4', '#f2f2ec', '#eceee6'], centre: '#a8b468', bud: '#d8dccc' }));
        cv.add(branch(rnd, { x: -30, y: 560, angle: 1.75, length: 500, width: 15, wood: ink, blossom: ['#f8f8f4', '#eceee6'], centre: '#a8b468', bud: '#d8dccc' }));
      });
      // the ink spattered from the brush: dark dots, clustered, some running; and a few flecks of white
      s.layer({ blur: 0.3 }, (cv) => {
        const dots = [];
        for (let c = 0; c < 6; c++) {
          const cx = between(rnd, 120, 1240);
          const cy = between(rnd, 60, 680);
          const spread = between(rnd, 40, 140);
          for (let i = 0; i < 22; i++) {
            const r = 0.35 + rnd() ** 6 * 6.5;
            const x = cx + (rnd() + rnd() - 1) * spread;
            const y = cy + (rnd() + rnd() - 1) * spread * 0.6;
            // round where it fell straight, drawn out where it flew
            const stretch = rnd() < 0.3 ? between(rnd, 1.5, 2.6) : 1;
            const a = between(rnd, -40, 40);
            dots.push(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r * stretch)}" ry="${n(r)}" transform="rotate(${n(a)} ${n(x)} ${n(y)})" fill-opacity="${n(between(rnd, 0.5, 0.95))}"/>`);
          }
        }
        cv.add(`<g fill="${ink}">${dots.join('')}</g>`);
        const flecks = [];
        for (let i = 0; i < 70; i++) flecks.push(`<circle cx="${n(between(rnd, 0, 1280))}" cy="${n(between(rnd, 0, 720))}" r="${n(between(rnd, 0.6, 1.8))}" fill-opacity="${n(between(rnd, 0.4, 0.9))}"/>`);
        cv.add(`<g fill="#f4f4ee">${flecks.join('')}</g>`);
      });
      s.layer({ blur: 1.2 }, (cv) => {
        cv.add(petals(rnd, { count: 16, colours: ['#f8f8f4', '#eceee6'], size: 4, x0: 200, x1: 900, y0: 200, y1: 640 }));
      });
      return s.done({
        grade: { lift: [0.02, 0.02, 0.03], saturation: 0.7, contrast: 0.18 },
        vignette: { strength: 0.3, colour: '#101418' },
        grain: 0.02,
        clumps: 0.014,
      });
    },
  },

  'seva-zozanan': {
    ku: 'Şeva Zozanan',
    en: 'Night on the high pastures',
    // blue hour on the summer pastures with the fog come down: the meadow deep in lupins to the knee, a stand of
    // firs on the rise going grey into it, and far off in the blue a black tent with its lamp lit inside
    scene(rnd) {
      const s = new Scene(rnd);
      const fog = '#4a5a94';
      s.layer({}, (cv) => {
        sky(cv, [[0, '#1c2858'], [0.5, '#2f3f78'], [1, '#46568e']]);
        glow(cv, { x: 640, y: 330, r: 700, colour: '#5c6ca6', opacity: 0.6 });
      });
      // the rise, and the firs standing on it: the far ones barely there, the near ones dark
      const rise = (x) => 392 - 30 * Math.exp(-(((x - 600) / 300) ** 2)) - Math.max(0, 260 - x) * 0.04 + Math.max(0, x - 900) * 0.02;
      const firs = (count, x0, x1, h0, h1, colour, spread) => {
        let out = '';
        const list = [];
        for (let i = 0; i < count; i++) {
          const x = x0 + (x1 - x0) * (0.5 + (rnd() + rnd() - 1) * spread);
          // taller toward the middle of the stand
          const mid = 1 - Math.abs((x - (x0 + x1) / 2) / ((x1 - x0) / 2));
          list.push([x, between(rnd, h0, h1) * (0.55 + 0.6 * mid)]);
        }
        list.sort((a, b) => a[1] - b[1]);
        for (const [x, h] of list) out += pine(rnd, { x, y: rise(x) + 10, height: h, colour, width: between(rnd, 0.3, 0.42) });
        return out;
      };
      s.layer({ blur: 2.2, haze: [fog, 0.8] }, (cv) => {
        leaves(cv, firs(60, 300, 1000, 90, 200, '#101830', 0.9) + firs(26, -40, 300, 26, 64, '#101830', 1) + firs(14, 980, 1320, 26, 56, '#101830', 1), { size: 2.4, masses: 3, contrast: 0, gaps: 0.4, tip: 1, seed: s.seed() });
      });
      s.layer({ blur: 1.1, haze: [fog, 0.55] }, (cv) => {
        leaves(cv, firs(24, 400, 880, 110, 240, '#0a1024', 0.8) + firs(9, 40, 330, 30, 70, '#0a1024', 1), { size: 2.6, masses: 3, contrast: 0, gaps: 0.4, tip: 1, seed: s.seed() });
      });
      // the tent, far off to the left, its lamp the only warm thing in the blue
      s.layer({ blur: 0.9, haze: [fog, 0.45] }, (cv) => {
        glow(cv, { x: 196, y: rise(196) + 2, r: 120, colour: '#ffb35a', opacity: 0.5 });
        cv.add(tent({ x: 196, y: rise(196) + 14, w: 64, fill: '#0a0e1e', lamp: '#ffc06a', screen: null }));
      });
      // the meadow: lupins thick in their leaves, a white bistort here and there, back into the fog
      s.carpet({}, {
        top: (x) => rise(x) + 10,
        far: 1,
        near: 17,
        ground: '#070c1a',
        fog: [fog, 0.92],
        light: [0, -1],
        patches: 0.38,
        focus: { from: 0.78, blur: 1.5 },
        plants: [
          { kind: 'spike', share: 3, colours: ['#14282a'], flower: ['#3a3ad8', '#4a3ce0', '#5a4ae8', '#3e52e0', '#6a54e0', '#2e30b0'], leaves: '#173027', height: 0.8, drifts: 1.6 },
          { kind: 'tuft', share: 4, colours: ['#14301f', '#1c3e29', '#0e2218', '#24482f'], drifts: 0.6 },
          { kind: 'daisy', share: 0.3, colours: ['#14282a'], flower: ['#e6eaf2', '#d8dcec'], leaves: '#173027', centre: '#c8c8b0' },
        ],
      });
      // the fog lying over the far meadow
      s.layer({ scale: 2, blur: 4 }, (cv) => {
        noise(cv, { y: 300, h: 220, freq: [0.0028, 0.012], seed: s.seed(), colour: '#5a6aa6', contrast: 2.2, bias: -0.7, opacity: 0.7, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      return s.done({
        bloom: { threshold: 0.7, strength: 0.4, radius: 26, tint: '#ffd09a' },
        diffuse: { radius: 18, strength: 0.2, soften: 0.08 },
        grade: { lift: [0.015, 0.02, 0.06], gain: [0.96, 0.98, 1.06], saturation: 1.08, contrast: 0.2, shadows: ['#080c28', 0.45] },
        vignette: { strength: 0.42, colour: '#04061a' },
        grain: 0.02,
        clumps: 0.012,
      });
    },
  },
  'berfa-ciyayan': {
    ku: 'Berfa Çiyayan',
    en: 'Snow on the mountains',
    // Agirî at a winter dawn, seen from inside the palace of Ishak Pasha: through its pointed arches the mountain
    // white with the first light on it, and the sun coming in through an arch onto the snow of the court
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [1180, 330];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#5a6a92'], [0.45, '#a8b0cc'], [0.72, '#e6d6dc'], [1, '#f6e2d4']]);
        glow(cv, { x: sun[0], y: sun[1], r: 700, colour: '#ffe6cc', opacity: 0.8 });
      });
      // Agirî and Little Agirî beyond, the dawn pink on their eastern snow
      s.terrain({ blur: 1, haze: ['#e8dce4', 0.3] }, { base: 470, peaks: [{ x: 700, h: 300, l: 420, r: 460, k: 1.25 }, { x: 290, h: 160, s: 170, k: 1.1 }], rough: 0.05, scale: 70, lit: '#d8b4ae', shadow: '#4a4e78', snowline: 330, snowLit: '#fff2e8', snowShadow: '#b8b2d4', foot: '#d0cade', footFrom: 420, light: [0.75, -0.42, 0.55] });
      s.layer({ scale: 2, blur: 3 }, (cv) => {
        noise(cv, { y: 420, h: 100, freq: [0.003, 0.03], seed: s.seed(), colour: '#f6eef2', contrast: 2.8, bias: -0.9, opacity: 0.85, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      // the plain under snow, running out to the palace
      const plain = (x) => 486 + Math.sin(x / 240) * 3;
      s.terrain({ blur: 0.6 }, { base: 486, line: plain, peaks: [{ x: 1500, h: 0, s: 1600 }], lit: '#f8eef0', shadow: '#8a90ae', foot: '#e0e0ec', footFrom: 600, light: [0.75, -0.42, 0.55], grassy: 0.1, blade: 3, wind: 0.6, relief: 1.4, ambient: 0.45, dry: '#ffe2d2', dryness: 0.4 });
      // the court's floor inside, snow lying on it, and the light from the arch laid across it
      s.layer({}, (cv) => {
        cv.def('<linearGradient id="bc-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa0be"/><stop offset="1" stop-color="#6a6e8e"/></linearGradient>');
        cv.add('<rect x="-10" y="572" width="1300" height="160" fill="url(#bc-floor)"/>');
      });
      s.layer({ blur: 6, blend: 'screen', opacity: 0.85 }, (cv) => {
        cv.add('<path d="M860,572 L1040,572 L860,730 L560,730 Z" fill="#ffe8cc" fill-opacity="0.75"/>');
      });
      // the arcade: a wall of dressed stone, three tall pointed arches cut through it on slender piers
      const arch = (cx, w, spring, floor) => {
        const r = w * 0.82;
        const xl = cx - w / 2;
        const xr = cx + w / 2;
        const apex = spring - Math.sqrt(r * r - (r - w / 2) ** 2);
        return `M${n(xl)},${n(floor)} L${n(xl)},${n(spring)} A${n(r)},${n(r)} 0 0 1 ${n(cx)},${n(apex)} A${n(r)},${n(r)} 0 0 1 ${n(xr)},${n(spring)} L${n(xr)},${n(floor)} Z`;
      };
      const rim = { x: sun[0], y: sun[1], colour: '#ffe6c8', width: 4, strength: 0.9, reach: 1500 };
      s.layer({ blur: 1.2, rim }, (cv) => {
        const holes = [arch(230, 300, 330, 580), arch(640, 330, 320, 580), arch(1050, 300, 330, 580)].join(' ');
        const wall = `M-20,-20 H1300 V590 H-20 Z ${holes}`;
        cv.def('<linearGradient id="bc-wall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2e2a36"/><stop offset="0.5" stop-color="#3e3842"/><stop offset="1" stop-color="#4a424a"/></linearGradient>');
        cv.def(`<clipPath id="bc-clip"><path d="${wall}" clip-rule="evenodd"/></clipPath>`);
        cv.add(`<path d="${wall}" fill="url(#bc-wall)" fill-rule="evenodd"/>`);
        // the courses of the dressed stone, each block a shade of its own, and the joints between them
        const blocks = [];
        const joints = [];
        for (let y = 0, row = 0; y < 590; y += 26, row++) {
          joints.push(`M-20,${y} H1300`);
          for (let x = -20 - (row % 2) * 30; x < 1300; x += between(rnd, 48, 72)) {
            joints.push(`M${n(x)},${y} V${y + 26}`);
            if (rnd() < 0.35) blocks.push(`<rect x="${n(x)}" y="${y}" width="60" height="26" fill="${rnd() < 0.5 ? '#000000' : '#ffffff'}" fill-opacity="${n(between(rnd, 0.03, 0.08))}"/>`);
          }
        }
        cv.add(`<g clip-path="url(#bc-clip)">${blocks.join('')}<path d="${joints.join(' ')}" stroke="#1a1620" stroke-width="1.2" stroke-opacity="0.55" fill="none"/></g>`);
        for (const [cx, w, spring] of [[230, 300, 330], [640, 330, 320], [1050, 300, 330]]) {
          cv.add(`<path d="${arch(cx, w + 26, spring, 590)}" fill="none" stroke="#26222c" stroke-width="10"/>`);
          // the capitals the arches spring from
          cv.add(`<rect x="${n(cx - w / 2 - 16)}" y="${n(spring - 6)}" width="22" height="12" fill="#2a2630"/><rect x="${n(cx + w / 2 - 6)}" y="${n(spring - 6)}" width="22" height="12" fill="#2a2630"/>`);
        }
        cv.add('<rect x="-20" y="572" width="1320" height="20" fill="#24202a"/>');
      });
      s.effect('texture', { amount: 0.06, cells: [40, 12, 4], seed: s.seed() });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.7, strength: 1.2, decay: 0.97, density: 0.9, colour: '#ffe6cc' });
      s.layer({ blur: 0.7, blend: 'screen' }, (cv) => {
        cv.add(motes(rnd, { x0: 500, x1: 1280, y0: 100, y1: 700, count: 160, size: 1.6, colours: ['#ffffff', '#fff2e4'], opacity: [0.3, 0.9] }));
      });
      return s.done({
        bloom: { threshold: 0.76, strength: 0.5, radius: 30, tint: '#ffe0c8' },
        diffuse: { radius: 22, strength: 0.32, soften: 0.1 },
        grade: { lift: [0.04, 0.04, 0.06], gain: [1.02, 0.99, 1], saturation: 0.92, contrast: 0.18, shadows: ['#1a1c40', 0.45], highlights: ['#fff2e4', 0.25] },
        vignette: { strength: 0.4, colour: '#141836' },
        grain: 0.016,
        clumps: 0.01,
      });
    },
  },

  'gola-sin': {
    ku: 'Gola Şîn',
    en: 'Blue lake',
    // Sîpan over the lake at first light, mist on the water, the early sun laid across it in a path of sparks
    scene(rnd) {
      const s = new Scene(rnd);
      s.layer({}, (cv) => {
        sky(cv, [[0, '#5d8bc4'], [0.5, '#a9c8e6'], [0.85, '#e4eef7'], [1, '#f2f6fa']]);
        glow(cv, { x: 260, y: 300, r: 600, colour: '#ffffff', opacity: 0.6 });
        noise(cv, { y: 80, h: 200, freq: [0.002, 0.012], seed: s.seed(), colour: '#ffffff', contrast: 2.4, bias: -1.05, opacity: 0.6, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      s.layer({ blur: 1.2, haze: ['#cfdced', 0.5] }, (cv) => {
        range(cv, rnd, { base: 452, peaks: [{ x: 120, h: 70, s: 240 }, { x: 1180, h: 90, s: 260 }], fill: '#7d93ba', shade: '#4a5f8f', shadeOpacity: 0.25 });
      });
      // Sîpan: a broad old volcano, snow down its gullies, the morning on its western faces
      s.terrain({ blur: 0.4, haze: ['#d6e2f0', 0.16] }, { base: 452, peaks: [{ x: 700, h: 250, l: 420, r: 470, k: 1.2 }], rough: 0.06, lit: '#c4b8ac', shadow: '#34466e', snowline: 300, snowLit: '#ffffff', snowShadow: '#bccbe6', foot: '#a8bad8', footFrom: 392, light: [-0.75, -0.45, 0.55] });
      s.layer({ blur: 0.4 }, (cv) => cv.add('<rect x="-10" y="446" width="1300" height="8" fill="#6f84ac"/>'));
      s.effect('reflect', { y: 452, deep: '#24477a', near: 0.42, far: 0.92, ripple: 1.6, wave: 0.16, soften: 1.2, seed: s.seed() });
      s.layer({ scale: 2, blur: 3 }, (cv) => {
        noise(cv, { y: 430, h: 90, freq: [0.003, 0.04], seed: s.seed(), colour: '#f4f8fc', contrast: 2.6, bias: -0.85, opacity: 0.85, fade: [[0, 0], [0.45, 1], [1, 0]] });
      });
      // the low sun's path over the water, sparks of it on every ripple, and gulls going out
      s.layer({ blur: 0.6, blend: 'screen' }, (cv) => {
        const sparks = [];
        for (let i = 0; i < 420; i++) {
          const t = rnd() ** 1.4;
          const y = 458 + t * 262;
          const x = 262 + (rnd() + rnd() - 1) * (16 + t * 130);
          const w = between(rnd, 2, 7) * (0.5 + t);
          sparks.push(`<rect x="${n(x - w / 2)}" y="${n(y)}" width="${n(w)}" height="${n(Math.max(0.8, w * 0.18))}" fill-opacity="${n(between(rnd, 0.35, 1) * (1 - t * 0.5))}"/>`);
        }
        cv.add(`<g fill="#fff6e4">${sparks.join('')}</g>`);
      });
      s.layer({}, (cv) => {
        birds(cv, rnd, { x: 940, y: 200, count: 5, size: 9, colour: '#40557a' });
        birds(cv, rnd, { x: 640, y: 400, count: 3, size: 6, colour: '#5a6e92', spread: 60 });
      });
      s.layer({ blur: 4, rim: { x: 260, y: 300, colour: '#f4f8ff', width: 3, strength: 0.6, reach: 1600 } }, (cv) => {
        const r = reeds(rnd, { x0: 1080, x1: 1320, y: 770, count: 12, height: 380, stem: '#18263e', plume: '#6a7c98', wind: -0.12, fluffy: true });
        const l = reeds(rnd, { x0: -40, x1: 160, y: 770, count: 9, height: 340, stem: '#18263e', plume: '#6a7c98', wind: 0.1, fluffy: true });
        cv.add(r.stems + r.plumes + r.fluff + l.stems + l.plumes + l.fluff);
      });
      return s.done({
        bloom: { threshold: 0.8, strength: 0.4, radius: 30 },
        grade: { lift: [0.02, 0.04, 0.07], gain: [0.96, 1, 1.04], saturation: 1.02, contrast: 0.18, shadows: ['#0a1a3a', 0.4], highlights: ['#fff8ee', 0.15] },
        vignette: { strength: 0.3, colour: '#0a1428' },
        grain: 0.012,
      });
    },
  },

  'ronahiya-bakur': {
    ku: 'Ronahiya Bakur',
    en: 'Northern lights',
    // a winter night by a lake in the high mountains, the northern lights hanging over the peaks in green
    // curtains, held again in the still water, and the snow on the near shore pale under them
    scene(rnd) {
      const s = new Scene(rnd);
      s.layer({}, (cv) => {
        sky(cv, [[0, '#01040c'], [0.5, '#041224'], [0.8, '#0a2432'], [1, '#0e2e36']]);
      });
      // the stars, fine and many, as a long exposure gathers them (the nebula's painter, its gas all black)
      s.painted('nebula', { blend: 'screen' }, { colours: [[0, '#000000'], [1, '#000000']], gain: 0, dust: 0, stars: 5200, starColours: ['#ffffff', '#e8f0ff', '#fff2e0', '#dcfff0'] });
      s.layer({ blend: 'screen', blur: 0.8 }, (cv) => {
        aurora(cv, rnd, { y: 300, amp: 70, height: 280, colours: ['#46ffa8', '#3ad6ff', '#b46cff'], opacity: 1 });
      });
      s.layer({ blend: 'screen', blur: 26, opacity: 0.6 }, (cv) => {
        cv.def('<linearGradient id="rb-glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2aff9a" stop-opacity="0"/><stop offset="0.6" stop-color="#2aff9a" stop-opacity="0.35"/><stop offset="1" stop-color="#2aff9a" stop-opacity="0"/></linearGradient>');
        cv.add('<rect x="-20" y="120" width="1320" height="360" fill="url(#rb-glow)"/>');
      });
      // the mountains, dark against it, their snow taking the green of the light
      s.terrain({ blur: 0.8, haze: ['#0e2e36', 0.16] }, { base: 470, peaks: [{ x: 150, h: 170, l: 260, r: 240, k: 1.1 }, { x: 520, h: 120, s: 220 }, { x: 760, h: 230, l: 260, r: 300, k: 1.05 }, { x: 1160, h: 180, l: 260, r: 240 }], rough: 0.22, lit: '#0e2224', shadow: '#010406', snowline: 380, snowLit: '#62b4a0', snowShadow: '#123638', foot: '#04100e', footFrom: 430, light: [-0.4, -0.7, 0.5], ambient: 0.14 });
      s.effect('reflect', { y: 470, deep: '#03121a', near: 0.62, far: 0.9, ripple: 0.5, wave: 0.22, soften: 1.4, seed: s.seed() });
      // the near shore under snow, a few pines dark on it
      // (banks on either hand, low, the lake open between them)
      const shore = (x) => 680 - 110 * Math.exp(-(((x + 40) / 300) ** 2)) - 130 * Math.exp(-(((x - 1330) / 320) ** 2)) + 6 * Math.sin(x / 80);
      s.terrain({}, { base: 680, line: shore, peaks: [{ x: 640, h: 0, s: 900 }], lit: '#8cc4bc', shadow: '#14303a', foot: '#22424e', footFrom: 700, light: [-0.4, -0.7, 0.5], rocky: 0.6, stone: 50, relief: 1.2, ambient: 0.36 });
      s.layer({}, (cv) => {
        cv.add(grass(rnd, { x0: -20, x1: 300, y: 650, count: 90, height: 26, colours: ['#0a1a1e', '#14282c'], wind: 0.3, width: 1.4 }));
        cv.add(grass(rnd, { x0: 1000, x1: 1300, y: 640, count: 90, height: 26, colours: ['#0a1a1e', '#14282c'], wind: 0.3, width: 1.4 }));
      });
      s.layer({ rim: { x: 640, y: 300, colour: '#7affc0', width: 1.5, strength: 0.5, reach: 1400 } }, (cv) => {
        let firs = '';
        for (const [x, h] of [[60, 190], [130, 140], [1160, 170], [1230, 230], [1270, 150]]) firs += pine(rnd, { x, y: shore(x) + 8, height: h, colour: '#02080a', width: 0.3 });
        leaves(cv, firs, { size: 3, masses: 3, contrast: 0, gaps: 0.5, tip: 1, seed: s.seed() });
      });
      return s.done({
        bloom: { threshold: 0.66, strength: 0.5, radius: 26, tint: '#a8ffd8' },
        diffuse: { radius: 14, strength: 0.14, soften: 0.04 },
        grade: { lift: [0.01, 0.025, 0.04], gain: [0.92, 1.03, 1.03], saturation: 1.12, contrast: 0.24, shadows: ['#021216', 0.5] },
        vignette: { strength: 0.5, colour: '#01060a' },
        grain: 0.02,
        clumps: 0.012,
      });
    },
  },

  'heyva-zivin': {
    ku: 'Heyva Zîvîn',
    en: 'Silver moon',
    // painted in oils, thick: a silver moon behind thin cloud over the lake, the night sky worked all over with
    // the brush, and along the far shore the lamps of a village, held again in the water
    scene(rnd) {
      const s = new Scene(rnd);
      const moonAt = [800, 290];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#24272e'], [0.45, '#50555e'], [0.78, '#6e7278'], [1, '#5a5e64']]);
        glow(cv, { x: moonAt[0], y: moonAt[1], r: 560, colour: '#d0d4d8', opacity: 0.8 });
        clouds(cv, { y: -40, h: 540, freq: [0.0024, 0.007], seed: s.seed(), colour: '#454a54', light: '#c4c8ce', shade: '#1c2026', dx: 10, dy: -12, density: 3, cover: -1.3, opacity: 0.85, fade: [[0, 1], [0.8, 0.7], [1, 0]] });
        glow(cv, { x: moonAt[0], y: moonAt[1], r: 170, colour: '#eef0ee', opacity: 0.95 });
        cv.add(`<circle cx="${moonAt[0]}" cy="${moonAt[1]}" r="34" fill="#fbfbf4"/>`);
        // thin cloud drawn across its face
        noise(cv, { y: moonAt[1] - 40, h: 80, freq: [0.005, 0.04], seed: s.seed(), colour: '#8a9098', contrast: 2.6, bias: -1.1, opacity: 0.5, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      // the far shore, low and dark, and the village's lamps along it and thick on the hill on the right
      const shore = (x) => 516 - 34 * Math.exp(-(((x - 1080) / 240) ** 2)) - 8 * Math.sin(x / 170);
      const waterline = 548;
      let lamps = '';
      s.layer({ blur: 0.6 }, (cv) => {
        cv.add(`<path d="M-20,${n(shore(-20))} ${Array.from({ length: 34 }, (_, i) => `L${n(i * 40)},${n(shore(i * 40))}`).join(' ')} L1300,${n(shore(1300))} L1300,${waterline + 28} L-20,${waterline + 28} Z" fill="#16181e"/>`);
        const dots = [];
        for (let i = 0; i < 90; i++) {
          const x = i < 50 ? between(rnd, 960, 1220) : between(rnd, 0, 1280);
          const y = shore(x) + 6 + rnd() * (waterline - shore(x) - 10);
          dots.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(between(rnd, 1.1, 2.2))}"/>`);
        }
        lamps = `<g fill="#ffd28a">${dots.join('')}</g>`;
        cv.add(lamps);
      });
      s.layer({ blur: 3, blend: 'screen', opacity: 0.9 }, (cv) => cv.add(lamps));
      // the lake, holding the moon and the lamps
      s.effect('reflect', { y: waterline, deep: '#1a1c22', near: 0.5, far: 0.85, ripple: 3, wave: 0.2, soften: 2.4, seed: s.seed() });
      s.layer({ blur: 1, blend: 'screen' }, (cv) => {
        const sparks = [];
        for (let i = 0; i < 80; i++) {
          const t = rnd();
          const y = waterline + 4 + t * 168;
          const x = moonAt[0] + (rnd() + rnd() - 1) * (40 + t * 180);
          const w = between(rnd, 4, 18) * (0.6 + t);
          sparks.push(`<rect x="${n(x - w / 2)}" y="${n(y)}" width="${n(w)}" height="${n(Math.max(1, w * 0.18))}" fill-opacity="${n(between(rnd, 0.3, 0.8))}"/>`);
        }
        cv.add(`<g fill="#f0f2f0">${sparks.join('')}</g>`);
      });
      // the paint itself: laid on thick, the canvas showing where it is thin
      s.effect('impasto', { weave: 2.8, canvas: 0.6, strokes: 3, length: 22, width: 6, light: [-0.6, -0.8], relief: 0.6, paintover: 0.55, seed: s.seed() });
      return s.done({
        bloom: { threshold: 0.75, strength: 0.4, radius: 26, tint: '#e8e4d8' },
        grade: { lift: [0.04, 0.04, 0.045], gain: [1.02, 1, 0.96], saturation: 0.7, contrast: 0.2, shadows: ['#14161e', 0.35], highlights: ['#f4f0e4', 0.2] },
        vignette: { strength: 0.5, colour: '#08090c' },
        grain: 0.012,
      });
    },
  },

  'ezmane-sterkan': {
    ku: 'Ezmanê Stêrkan',
    en: 'Sky full of stars',
    // a summer night in the mountains, the sky over them deep in stars: a nebula's green gas lit from within, torn
    // by dark threads of dust, and the stars thick through it; the ridge black below, a lone oak on it and a
    // tent's lamp
    scene(rnd) {
      const s = new Scene(rnd);
      s.painted('nebula', {}, {
        colours: [[0, '#000302'], [0.25, '#03140e'], [0.45, '#0c3a2a'], [0.62, '#1f6a4c'], [0.8, '#4a9e78'], [0.93, '#9ed8b8'], [1, '#dcf8e8']],
        dust: 0.75,
        scale: 560,
        warp: 1.3,
        gain: 1,
        heart: { x: 560, y: 300, r: 420, k: 0.22 },
        stars: 7000,
      });
      // the ridge, black under it, just catching the starlight
      s.terrain({ blur: 0.8, haze: ['#0a241c', 0.12] }, { base: 668, peaks: [{ x: 140, h: 92, l: 220, r: 240 }, { x: 700, h: 64, s: 260 }, { x: 1160, h: 110, s: 230 }], rough: 0.2, lit: '#0a1c16', shadow: '#000302', light: [0.3, -0.6, 0.5], ambient: 0.3, ribs: 5 });
      s.layer({ rim: { x: 560, y: 300, colour: '#9effd0', width: 1.6, strength: 0.45, reach: 900 } }, (cv) => {
        cv.add('<path d="M-20,690 C240,664 520,652 760,656 C960,660 1120,672 1300,684 L1300,740 L-20,740 Z" fill="#000302"/>');
        const oak = tree(rnd, { x: 930, y: 664, height: 150, kind: 'oak', wood: '#000302', leafColour: '#000302' });
        cv.add(oak.wood);
        leaves(cv, oak.leaves, { size: 2.6, masses: 4, contrast: 0, gaps: 0.7, seed: s.seed() });
        glow(cv, { x: 330, y: 664, r: 70, colour: '#ffb35a', opacity: 0.6 });
        cv.add(tent({ x: 330, y: 668, w: 44, fill: '#000302', lamp: '#ffc06a', screen: null }));
      });
      return s.done({
        bloom: { threshold: 0.7, strength: 0.4, radius: 18, tint: '#c8ffe4' },
        diffuse: { radius: 14, strength: 0.16, soften: 0.05 },
        grade: { lift: [0.005, 0.02, 0.014], gain: [0.94, 1.04, 0.98], saturation: 1.1, contrast: 0.22, shadows: ['#021a10', 0.4] },
        vignette: { strength: 0.45, colour: '#000604' },
        grain: 0.02,
        clumps: 0.01,
      });
    },
  },

  berbang: {
    ku: 'Berbang',
    en: 'Daybreak',
    // daybreak by the Xabûr at Zaxo: the sun just up and gold in the river mist, the Delal bridge standing faint
    // in it, and the reeds along the bank in front of us lit through, their seeding plumes alight; the light
    // breaking in the lens in long streaks
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [250, 170];
      const rim = { x: sun[0], y: sun[1], colour: '#ffe89a', width: 3.5, strength: 1.5, reach: 1800 };
      s.layer({}, (cv) => {
        sky(cv, [[0, '#6a4a1a'], [0.4, '#a8782a'], [0.75, '#c89a40'], [1, '#a07830']]);
        glow(cv, { x: sun[0], y: sun[1], r: 760, colour: '#ffd890', opacity: 0.85 });
        glow(cv, { x: sun[0], y: sun[1], r: 160, colour: '#fffbe8', opacity: 1 });
        noise(cv, { y: 200, h: 420, freq: [0.0025, 0.01], seed: s.seed(), colour: '#ffe2a0', contrast: 2.2, bias: -0.9, opacity: 0.4, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      // the bridge, faint in the mist over the river
      s.layer({ blur: 2.4, haze: ['#d8a850', 0.6] }, (cv) => {
        const b = delal({ x: 820, y: 470, span: 110, fill: '#4a3010' });
        const m = cv.id('arch');
        cv.def(`<mask id="${m}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><path d="${b.arch}" fill="#000"/></mask>`);
        cv.add(`<g mask="url(#${m})">${b.body}</g>`);
        cv.add('<rect x="-10" y="468" width="1300" height="260" fill="#4a3010"/>');
      });
      s.layer({ scale: 2, blur: 5 }, (cv) => {
        noise(cv, { y: 380, h: 220, freq: [0.003, 0.02], seed: s.seed(), colour: '#e8b860', contrast: 2.2, bias: -0.6, opacity: 0.8, fade: [[0, 0], [0.5, 1], [1, 0.3]] });
      });
      // the reeds: a far bed of them soft in the mist, then the near ones, every plume full and lit through
      s.layer({ blur: 3, haze: ['#c89040', 0.4], rim }, (cv) => {
        const r = reeds(rnd, { x0: -40, x1: 1320, y: 760, count: 40, height: 420, stem: '#3a2408', plume: '#8a5a20', wind: 0.18, plumeSize: 1.1, fluffy: true });
        cv.add(r.stems + r.plumes + r.fluff);
      });
      s.layer({ blur: 0.8, rim }, (cv) => {
        const r = reeds(rnd, { x0: -40, x1: 1320, y: 800, count: 18, height: 600, stem: '#2a1806', plume: '#5a3a12', wind: 0.22, plumeSize: 1.3, fluffy: true });
        cv.add(r.stems + r.plumes + r.fluff);
      });
      // and right in front of us, out of focus
      s.layer({ blur: 7, rim: { ...rim, width: 6 } }, (cv) => {
        const r = reeds(rnd, { x0: 900, x1: 1340, y: 820, count: 5, height: 760, stem: '#1e1204', plume: '#4a2e0e', wind: 0.14, plumeSize: 1.2, fluffy: true });
        cv.add(r.stems + r.plumes + r.fluff);
      });
      // the lens: long streaks of the sun across the picture, split into colour at their edges, and glints
      s.layer({ blur: 2.4, blend: 'screen', opacity: 0.8 }, (cv) => {
        const a = 0.42;
        const lines = [];
        for (let i = 0; i < 9; i++) {
          const off = between(rnd, -260, 260);
          const len = between(rnd, 400, 1400);
          const x0 = sun[0] + off * Math.sin(a) * 0.4;
          const y0 = sun[1] + off * Math.cos(a) * 0.4;
          const x1 = x0 + Math.cos(a) * len;
          const y1 = y0 + Math.sin(a) * len;
          const id = cv.id('flare');
          cv.def(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(x0)}" y1="${n(y0)}" x2="${n(x1)}" y2="${n(y1)}"><stop offset="0" stop-color="#fff2c0" stop-opacity="0"/><stop offset="0.3" stop-color="#fff2c0" stop-opacity="0.8"/><stop offset="0.6" stop-color="#b8ffb0" stop-opacity="0.55"/><stop offset="1" stop-color="#a0d8ff" stop-opacity="0"/></linearGradient>`);
          lines.push(`<path d="M${n(x0)},${n(y0)} L${n(x1)},${n(y1)}" stroke="url(#${id})" stroke-width="${n(between(rnd, 1.2, 3.6))}" stroke-linecap="round"/>`);
        }
        cv.add(lines.join(''));
        const glints = [];
        for (let i = 0; i < 26; i++) {
          const x = between(rnd, 0, 1280);
          const y = between(rnd, 0, 560);
          const r = between(rnd, 3, 10) * (rnd() ** 2 + 0.3);
          glints.push(`M${n(x - r)},${n(y)} L${n(x)},${n(y - r * 0.12)} L${n(x + r)},${n(y)} L${n(x)},${n(y + r * 0.12)} Z M${n(x)},${n(y - r)} L${n(x + r * 0.12)},${n(y)} L${n(x)},${n(y + r)} L${n(x - r * 0.12)},${n(y)} Z`);
        }
        cv.add(`<path d="${glints.join(' ')}" fill="#fff8e0" fill-opacity="0.8"/>`);
      });
      s.layer({ blur: 0.8, blend: 'screen', opacity: 0.8 }, (cv) => {
        cv.add(motes(rnd, { x0: 0, x1: 1000, y0: 60, y1: 600, count: 140, size: 1.6, colours: ['#fff4d0', '#ffe2a0'] }));
      });
      return s.done({
        bloom: { threshold: 0.66, strength: 0.6, radius: 34, tint: '#ffd890' },
        diffuse: { radius: 20, strength: 0.3, soften: 0.08 },
        streaks: { threshold: 0.88, strength: 0.4, length: 520, angle: 0.42, tint: '#ffe0a0' },
        grade: { lift: [0.06, 0.04, 0.0], gain: [1.04, 0.95, 0.72], gamma: [1.04, 1, 0.88], saturation: 1.05, contrast: 0.24, shadows: ['#2a1606', 0.5], highlights: ['#fff0c8', 0.2] },
        vignette: { strength: 0.45, colour: '#140a02' },
        grain: 0.045,
        clumps: 0.022,
      });
    },
  },

  'mija-gulan': {
    ku: 'Mija Gulan',
    en: 'Rose mist',
    // a stand of mountain pines in the morning mist, the sun a whiteness behind them, and the slope under them
    // white and lilac with wild asters going up into the fog
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [520, 250];
      const mist = '#dfe4ee';
      s.layer({}, (cv) => {
        sky(cv, [[0, '#c4ccdc'], [0.5, '#dfe3ec'], [1, '#e8eaf0']]);
        glow(cv, { x: sun[0], y: sun[1], r: 620, colour: '#ffffff', opacity: 1 });
        glow(cv, { x: sun[0], y: sun[1], r: 200, colour: '#ffffff', opacity: 0.9 });
      });
      // the slope the pines stand on
      const ground = (x) => 452 - x * 0.03 + Math.sin(x / 210) * 5;
      // pines: tall bare trunks leaning a little each their own way, their crowns high up in the mist
      const pines = (count, x0, x1, h0, h1, wood, crown, girth) => {
        let trunks = '';
        let crowns = '';
        const list = [];
        for (let i = 0; i < count; i++) list.push([between(rnd, x0, x1), between(rnd, h0, h1)]);
        for (const [x, h] of list) {
          const t = tree(rnd, { x, y: ground(x) + 6, height: h, kind: 'slender', wood, leafColour: crown, lean: between(rnd, -0.25, 0.25), leafiness: 1.2, clump: 1.2, needles: true, girth });
          trunks += t.wood;
          crowns += t.leaves;
        }
        return [trunks, crowns];
      };
      const stand = (count, h0, h1, blur, hz, colour, girth) =>
        s.layer({ blur, haze: [mist, hz], rim: { x: sun[0], y: sun[1], colour: '#ffffff', width: 1.5, strength: 0.25, reach: 900 } }, (cv) => {
          const [trunks, crowns] = pines(count, -60, 1340, h0, h1, colour, colour, girth);
          cv.add(trunks);
          leaves(cv, crowns, { size: 3.2, masses: 4, contrast: 0.2, gaps: 0.8, tip: 1, seed: s.seed() });
        });
      stand(18, 300, 460, 3, 0.84, '#4a5464', 1.2);
      stand(11, 420, 600, 1.8, 0.6, '#283040', 1.4);
      // the light through the mist between them, before the nearest trunks, which stand dark against it
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.78, strength: 1.1, decay: 0.975, density: 0.95, colour: '#ffffff' });
      stand(5, 560, 700, 0.9, 0.18, '#0e1218', 1.9);
      // the asters, thick on the slope, going up into the mist
      s.carpet({}, {
        top: ground,
        far: 1.2,
        near: 16,
        ground: '#0a1410',
        fog: ['#c8d0e2', 0.7],
        light: [-0.2, -1],
        patches: 0.36,
        focus: { from: 0.8, blur: 1.6 },
        plants: [
          { kind: 'daisy', share: 5, colours: ['#1e3428'], flower: ['#f6f8fc', '#eef0f8', '#e2e4f4', '#d8d4f0', '#c8bce8'], leaves: '#1c3226', centre: '#d6d0a0', drifts: 1.4 },
          { kind: 'tuft', share: 3, colours: ['#18301f', '#22402a', '#10241a'] },
          { kind: 'daisy', share: 0.4, colours: ['#1e3428'], flower: ['#b48ad8', '#c49ae0', '#d0a6e4'], leaves: '#1c3226', centre: '#e0c870', drifts: 2.4 },
        ],
      });
      s.layer({ scale: 2, blur: 4 }, (cv) => {
        noise(cv, { y: 330, h: 240, freq: [0.0028, 0.012], seed: s.seed(), colour: '#eef0f6', contrast: 2.2, bias: -0.6, opacity: 0.75, fade: [[0, 0], [0.45, 1], [1, 0]] });
      });
      return s.done({
        bloom: { threshold: 0.8, strength: 0.4, radius: 34 },
        diffuse: { radius: 24, strength: 0.22, soften: 0.06 },
        grade: { lift: [0.03, 0.04, 0.065], gain: [0.97, 0.99, 1.04], saturation: 0.95, contrast: 0.22, shadows: ['#1c2a48', 0.4], highlights: ['#f6f8ff', 0.15] },
        vignette: { strength: 0.3, colour: '#202838' },
        grain: 0.016,
        clumps: 0.01,
      });
    },
  },

  'bin-erxewanan': {
    ku: 'Binê Erxewanan',
    en: 'Under the Judas trees',
    // deep in a wood of Judas trees in flower on a misty morning: magenta on every bough, row behind row going
    // pale into the white, the slender black trunks and the branches crossing in front of us
    scene(rnd) {
      const s = new Scene(rnd);
      const mist = '#f2e4ec';
      const light = [0.2, -1];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#f6eef2'], [0.5, '#f0e2ea'], [1, '#e8d2de']]);
      });
      // the wood going back into the mist: crowns over crowns, the further the paler
      const crowns = (count, y0, y1, h0, h1, colour) => hedge(rnd, { y: () => between(rnd, y0, y1), count, h0, h1, colour });
      const trunks = (count, y, h0, h1, w0, w1, colour) => {
        let out = '';
        for (let i = 0; i < count; i++) {
          const x = between(rnd, -40, 1320);
          const w = between(rnd, w0, w1);
          const top = y - between(rnd, h0, h1);
          const bend = between(rnd, -30, 30);
          out += `M${n(x - w / 2)},${n(y)} C${n(x - w * 0.45 + bend * 0.3)},${n(y - (y - top) * 0.4)} ${n(x - w * 0.3 + bend)},${n(top + (y - top) * 0.3)} ${n(x + bend * 1.2)},${n(top)} C${n(x + w * 0.3 + bend)},${n(top + (y - top) * 0.3)} ${n(x + w * 0.45 + bend * 0.3)},${n(y - (y - top) * 0.4)} ${n(x + w / 2)},${n(y)} Z `;
        }
        return `<path d="${out}" fill="${colour}"/>`;
      };
      for (const [hz, blur, tcount, tw, leafC, size, count] of [[0.82, 2.6, 30, [3, 6], '#d08ab4', 3.2, 70], [0.58, 1.8, 20, [4, 9], '#c45496', 3.4, 50]]) {
        s.layer({ blur, haze: [mist, hz] }, (cv) => {
          cv.add(trunks(tcount, 760, 300, 700, tw[0], tw[1], '#3a1a2c'));
          leaves(cv, crowns(count, -60, 600, 80, 220, leafC), { size, masses: 6, contrast: 0.45, gaps: 0.6, light, seed: s.seed() });
        });
        s.layer({ scale: 2, blur: 4 }, (cv) => {
          noise(cv, { y: 100, h: 560, freq: [0.003, 0.009], seed: s.seed(), colour: mist, contrast: 2, bias: -0.75, opacity: 0.5, fade: [[0, 0.4], [0.5, 1], [1, 0.3]] });
        });
      }
      s.effect('rays', { x: 760, y: -40, threshold: 0.8, strength: 1, decay: 0.975, density: 0.95, colour: '#fff4fa' });
      // the undergrowth, thick with seedlings in flower
      s.layer({ blur: 1.2, haze: [mist, 0.26] }, (cv) => {
        cv.add('<path d="M-20,640 C300,620 900,630 1300,640 L1300,740 L-20,740 Z" fill="#5a0e36"/>');
        leaves(cv, hedge(rnd, { y: () => between(rnd, 560, 800), count: 56, h0: 70, h1: 190, colour: '#b0306e' }), { size: 4, masses: 5, contrast: 0.5, gaps: 0.5, light, seed: s.seed() });
      });
      // the trees we stand among: slender black trunks leaning every way, their branches crossing, magenta
      // overhead — a few a little way off, a few right by us
      const grove = (list, size, blur, hz, wood, vol) =>
        s.layer({ blur, haze: hz ? [mist, hz] : null, rim: { x: 760, y: -40, colour: '#fff0f8', width: 2, strength: 0.45, reach: 1400 } }, (cv) => {
          let trunk = '';
          let bloom = '';
          for (const [x, h, lean] of list) {
            const t = tree(rnd, { x, y: 790, height: h, kind: 'wild', wood, leafColour: vol[1], volume: vol, light, lean, leafiness: 1.3, twig: 5, girth: 0.9 });
            trunk += t.wood;
            bloom += t.leaves;
          }
          cv.add(trunk);
          leaves(cv, bloom, { size, masses: 4, contrast: 0.55, gaps: 0.75, light, seed: s.seed() });
        });
      grove([[190, 560, 0.22], [470, 620, -0.14], [760, 540, 0.1], [1040, 600, -0.2]], 4.4, 0.9, 0.2, '#3a1428', ['#8a1650', '#c03482', '#f27cba']);
      grove([[40, 760, 0.12], [640, 720, -0.06], [1230, 740, -0.14]], 5.6, 0, 0, '#1e0a16', ['#6e0c40', '#b02470', '#ee6aac']);
      s.layer({ blur: 1.4 }, (cv) => {
        cv.add(petals(rnd, { count: 70, colours: ['#e070b0', '#ffa6d2', '#c03a88'], size: 4 }));
      });
      return s.done({
        bloom: { threshold: 0.8, strength: 0.35, radius: 30, tint: '#ffe4f2' },
        diffuse: { radius: 20, strength: 0.24, soften: 0.08 },
        grade: { lift: [0.04, 0.02, 0.035], gain: [1.03, 0.95, 1.0], saturation: 1.08, contrast: 0.22, shadows: ['#3a0828', 0.4], highlights: ['#fff2f8', 0.15] },
        vignette: { strength: 0.35, colour: '#2a0618' },
        grain: 0.016,
        clumps: 0.01,
      });
    },
  },

  lalezar: {
    ku: 'Lalezar',
    en: 'Tulip field',
    // a hillside of mountain tulips on a spring morning with the fog down on it: the near ones red as blood among
    // the grass, the rest going dark into the grey, and an old oak, long dead, standing in the fog with the scrub
    scene(rnd) {
      const s = new Scene(rnd);
      const fog = '#c6c3be';
      s.layer({}, (cv) => {
        sky(cv, [[0, '#a9a7a3'], [0.45, '#c2bfba'], [1, '#cdcac4']]);
        glow(cv, { x: 760, y: 200, r: 560, colour: '#e6e2da', opacity: 0.7 });
      });
      // the far edge of the field, and the scrub along it, the dead oak standing up out of it, hardly there in the
      // fog: the scrub grows from below the field's edge, so the field runs into it
      const ground = (x) => 414 + Math.sin(x / 190) * 6 + Math.sin(x / 67) * 2;
      const scrub = (count, h0, h1, colour) => {
        let out = '';
        for (let i = 0; i < count; i++) {
          const x = between(rnd, -60, 1340);
          const h = between(rnd, h0, h1);
          out += silhouette(rnd, { x, y: ground(x) + h * 0.3, height: h, kind: rnd() < 0.6 ? 'walnut' : 'oak', colour, leafiness: 1, twig: 5 });
        }
        return out;
      };
      s.layer({ blur: 2.6, haze: [fog, 0.84] }, (cv) => {
        leaves(cv, scrub(30, 70, 140, '#3a3634') + hedge(rnd, { y: (x) => ground(x) + 4, count: 90, h0: 26, h1: 60, colour: '#3a3634' }), { size: 3, masses: 4, contrast: 0, gaps: 0.6, seed: s.seed() });
      });
      s.layer({ blur: 1.4, haze: [fog, 0.62] }, (cv) => {
        const dead = tree(rnd, { x: 720, y: 440, height: 280, kind: 'oak', wood: '#2e2a28', leafColour: '#2e2a28', twig: 3, lean: -0.08 });
        cv.add(dead.wood);
        leaves(cv, hedge(rnd, { y: (x) => ground(x) + 10, count: 70, h0: 14, h1: 34, colour: '#2e2a28' }), { size: 3.2, masses: 4, contrast: 0, gaps: 0.6, seed: s.seed() });
        // last year's grass standing up out of the scrub
        cv.add(grass(rnd, { x0: 0, x1: 1280, y: 428, count: 40, height: 46, colours: ['#3a3634'], wind: 0.12, width: 1.2 }));
      });
      // the hillside: tulips and the low red scrub of spring among the grass, back into the fog
      s.carpet({}, {
        top: ground,
        far: 1.1,
        near: 15,
        ground: '#1a0605',
        fog: [fog, 0.95],
        light: [0.2, -1],
        patches: 0.42,
        focus: { from: 0.8, blur: 1.6 },
        plants: [
          { kind: 'tuft', share: 5, colours: ['#8a0e12', '#a81616', '#c8241c', '#6a0a0e', '#e03a26'] },
          { kind: 'bell', share: 2, colours: ['#3a4a22'], flower: ['#d0181e', '#e02a24', '#b8121c'], leaves: '#3a4a26', height: 1.3 },
          { kind: 'blades', share: 1.4, colours: ['#4a5228', '#5e6030', '#3a4420', '#7a7040'] },
        ],
      });
      // the fog lying along the hill
      s.layer({ scale: 2, blur: 4 }, (cv) => {
        noise(cv, { y: 350, h: 220, freq: [0.0028, 0.012], seed: s.seed(), colour: '#d2cfca', contrast: 2.2, bias: -0.6, opacity: 0.85, fade: [[0, 0], [0.45, 1], [1, 0]] });
      });
      return s.done({
        bloom: { threshold: 0.82, strength: 0.25, radius: 30 },
        diffuse: { radius: 20, strength: 0.22, soften: 0.1 },
        grade: { lift: [0.03, 0.03, 0.035], gain: [1.03, 0.98, 0.97], saturation: 1, contrast: 0.2, shadows: ['#20141a', 0.3], highlights: ['#f6f2ea', 0.1] },
        vignette: { strength: 0.4, colour: '#140a0a' },
        grain: 0.02,
        clumps: 0.012,
      });
    },
  },

  zozan: {
    ku: 'Zozan',
    en: 'High pasture',
    // evening on the summer pastures: green hills rolling away into the gold of a low sun under cloud lit from
    // beneath, the black tents and the flock far off on a slope, and at our feet the grass to the knee bowing in
    // the wind, pink with wild flowers
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [1120, 334];
      // the sun low on the right, raking across every slope
      const light = [0.85, -0.3, 0.25];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#4c5884'], [0.28, '#8a82a4'], [0.44, '#d4a6a0'], [0.54, '#f0c6a2'], [0.62, '#ffdeb2'], [1, '#f6e2c0']]);
        glow(cv, { x: sun[0], y: sun[1], r: 760, colour: '#ffd6a0', opacity: 0.85 });
        clouds(cv, { y: 0, h: 380, freq: [0.0036, 0.009], seed: s.seed(), colour: '#8a7f9c', light: '#ffd4a6', shade: '#4a4866', dx: 16, dy: 8, density: 3.2, cover: -1.3, opacity: 0.95, fade: [[0, 1], [0.5, 0.85], [1, 0]] });
        orb(cv, { x: sun[0], y: sun[1], r: 24, core: '#fffaf0', edge: '#ffeccc', halo: '#ffe2b0', haloR: 320, haloOpacity: 0.8 });
      });
      // a far range in the haze, snow still on its summits; then hill behind hill going back into the evening
      s.terrain({ blur: 2.2, haze: ['#eecab0', 0.62] }, { base: 414, peaks: [{ x: 60, h: 84, l: 200, r: 150 }, { x: 290, h: 132, l: 160, r: 230, k: 1.1 }, { x: 470, h: 112, l: 120, r: 210 }, { x: 760, h: 78, l: 210, r: 260 }], rough: 0.24, scale: 70, lit: '#c8aca8', shadow: '#4e5676', snowline: 312, snowShadow: '#b8bed6', light, ribs: 5, ambient: 0.36 });
      s.terrain({ blur: 1.8, haze: ['#ecc8ac', 0.54] }, { base: 426, peaks: [{ x: 160, h: 54, l: 300, r: 420, round: true }, { x: 700, h: 40, l: 260, r: 300, round: true }, { x: 1400, h: 90, s: 400, round: true }], rough: 0.06, lit: '#d6cc78', shadow: '#5a6a62', light, grassy: 0.15, blade: 1.5, relief: 0.5, ambient: 0.3 });
      s.terrain({ blur: 1.4, haze: ['#e8c4a8', 0.42] }, { base: 454, peaks: [{ x: 420, h: 64, l: 380, r: 300, round: true }, { x: 1010, h: 58, l: 280, r: 360, round: true }], rough: 0.06, lit: '#cccc70', shadow: '#466050', light, grassy: 0.2, blade: 1.8, relief: 0.55, ambient: 0.28 });
      const mid = s.terrain({ blur: 0.9, haze: ['#e4c0a4', 0.24] }, { base: 490, peaks: [{ x: 110, h: 130, l: 300, r: 380, round: true }, { x: 640, h: 70, l: 300, r: 260, round: true }, { x: 1080, h: 96, l: 260, r: 340, round: true }], rough: 0.05, lit: '#c4cc60', shadow: '#2a4634', foot: '#46663a', footFrom: 486, light, grassy: 0.32, blade: 2.4, relief: 0.6, ambient: 0.26, dry: '#d0aa60', dryness: 0.4 });
      // the black tents on the far slope, the flock scattered below them
      s.layer({ blur: 0.8, haze: ['#e6c2a6', 0.28] }, (cv) => {
        for (const [x, w] of [[842, 34], [884, 26]]) cv.add(tent({ x, y: heightAt(mid, x) + 30, w, fill: '#1c1a1c', screen: ['#8a8070', '#a03a2e', '#b8962e', '#e8e0d0'] }));
        const flock = [];
        for (let i = 0; i < 46; i++) {
          const x = between(rnd, 720, 1020);
          flock.push([x, heightAt(mid, x) + between(rnd, 40, 76)]);
        }
        flock.sort((a, b) => a[1] - b[1]);
        for (const [x, y] of flock) cv.add(lamb(rnd, { x, y, size: between(rnd, 5, 6.5), wool: '#f6eee0', shade: '#c8bca8', facing: rnd() < 0.5 ? -1 : 1 }));
      });
      s.terrain({ blur: 0.4 }, { base: 598, peaks: [{ x: 400, h: 104, l: 420, r: 520, round: true }, { x: 1100, h: 70, l: 360, r: 420, round: true }], rough: 0.04, lit: '#b6c850', shadow: '#1c3a20', foot: '#2a4a1e', footFrom: 560, light, grassy: 0.55, blade: 3.4, relief: 0.7, ambient: 0.26, dry: '#c8a850', dryness: 0.35 });
      // the slope we stand on, in grass to the knee, the light through it from the right
      const ground = (x) => 452 + Math.max(0, x) * 0.2 + Math.max(0, x - 600) * 0.18;
      const rim = { x: sun[0], y: sun[1], colour: '#ffe2a8', width: 2.5, strength: 1, reach: 1700 };
      s.terrain({ rim }, { base: 452, line: ground, peaks: [{ x: -400, h: 0, s: 1600 }], lit: '#b2c84c', shadow: '#183616', light, grassy: 0.9, blade: 6, wind: 0.32, relief: 0.8, ambient: 0.3, dry: '#d0b45a', dryness: 0.4 });
      // what grows on it, the nearer the bigger: wild pinks and vetch among the blades
      const onSlope = (count, draw) => onGround(rnd, ground, count).map(draw).join('');
      s.layer({ rim }, (cv) => {
        cv.add(tallGrass(rnd, { x0: -20, x1: 1300, top: ground, y1: 740, count: 2600, height: 62, colours: ['#4e7a2e', '#6a9440', '#3a6424', '#86a850', '#9eb65c'], heads: '#ecc878', wind: 0.32, width: 2 }));
        cv.add(onSlope(150, ([x, y, t]) => flower('spike', x, y, 9 * (0.3 + 0.7 * t), { petal: ['#c060c0', '#d878d0', '#a850b8'][Math.floor(rnd() * 3)], stem: '#3a5a24' }, rnd)));
        cv.add(onSlope(260, ([x, y, t]) => flower('wild', x, y, 9 * (0.3 + 0.7 * t), { petal: ['#f28cbc', '#e870a8', '#f8b4cc', '#fbe6ee'][Math.floor(rnd() * 4)], centre: '#ffd36a' }, rnd)));
        cv.add(tallGrass(rnd, { x0: -20, x1: 1300, top: (x) => ground(x) + 60, y1: 760, count: 900, height: 110, colours: ['#4e7a2e', '#6a9440', '#3a6424', '#86a850'], heads: '#f0d088', wind: 0.36, width: 2.8 }));
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.74, strength: 1.1, decay: 0.975, density: 0.92, colour: '#ffe8c0' });
      // stalks and flowers right in front of us, out of focus, the sun through them
      s.layer({ blur: 5, rim: { ...rim, width: 4 } }, (cv) => {
        cv.add(tallGrass(rnd, { x0: 760, x1: 1320, y0: 760, y1: 790, count: 60, height: 360, colours: ['#3a5a24', '#4e7030'], heads: '#f0d088', share: 0.3, wind: 0.3, width: 6 }));
      });
      s.layer({ blur: 10, opacity: 0.9 }, (cv) => {
        for (const [x, y, size] of [[940, 700, 38], [1050, 640, 50], [1200, 604, 60], [1250, 700, 44]]) cv.add(flower('wild', x, y, size, { petal: '#f49cc6', centre: '#fbd0dc' }, rnd));
      });
      return s.done({
        bloom: { threshold: 0.7, strength: 0.55, radius: 34, tint: '#ffe0b0' },
        diffuse: { radius: 18, strength: 0.3, soften: 0.08 },
        grade: { lift: [0.04, 0.03, 0.04], gain: [1.04, 1, 0.92], saturation: 1.04, contrast: 0.2, shadows: ['#1e2a3a', 0.35], highlights: ['#fff0d8', 0.25] },
        vignette: { strength: 0.38, colour: '#1a1e14' },
        grain: 0.016,
        clumps: 0.012,
      });
    },
  },

  bihar: {
    ku: 'Bihar',
    en: 'Spring',
    // a spring wood with the morning sun low through it: the new leaves lit gold-green, the light coming through
    // the haze between the trunks in long shafts, a wild almond in flower, and the grass to the knee in front of
    // us, its seed-heads alight
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [1010, 150];
      const haze = '#c8d890';
      const light = [0.6, -0.8];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#7a9a4a'], [0.4, '#b8c878'], [0.75, '#d8e0a0'], [1, '#c0d088']]);
        glow(cv, { x: sun[0], y: sun[1], r: 700, colour: '#fffbd8', opacity: 0.9 });
        glow(cv, { x: sun[0], y: sun[1], r: 180, colour: '#ffffff', opacity: 0.9 });
      });
      const floor = (x) => 520 + Math.sin(x / 210) * 6;
      // the wood behind, soft in the haze
      s.layer({ blur: 2.6, haze: [haze, 0.72] }, (cv) => {
        let d = '';
        for (let i = 0; i < 16; i++) {
          const x = between(rnd, -40, 1320);
          d += `${trunk(rnd, { x, y: floor(x) + 10, w: between(rnd, 6, 14), lean: between(rnd, -0.05, 0.05), boughs: 1 })} `;
        }
        cv.add(`<path d="${d}" fill="#4a5a2a"/>`);
        leaves(cv, hedge(rnd, { y: () => between(rnd, 120, 480), count: 50, h0: 80, h1: 200, colour: '#6a8a3a' }), { size: 4, masses: 5, contrast: 0.6, gaps: 0.85, light, seed: s.seed() });
      });
      // a wild almond in flower in the middle distance, and the nearer trunks
      s.layer({ blur: 1.2, haze: [haze, 0.38], rim: { x: sun[0], y: sun[1], colour: '#fff8d0', width: 2, strength: 0.6, reach: 1200 } }, (cv) => {
        const t = tree(rnd, { x: 330, y: floor(330) + 6, height: 280, kind: 'blossom', wood: '#3a3020', leafColour: '#f4ecee', volume: ['#d8c8cc', '#f4eaee', '#ffffff'], light, leafiness: 1, twig: 5 });
        cv.add(t.wood);
        leaves(cv, t.leaves, { size: 3.4, masses: 4, contrast: 0.4, gaps: 0.7, light, seed: s.seed() });
        let d = '';
        for (const [x, w] of [[120, 30], [560, 22], [760, 26]]) d += `${trunk(rnd, { x, y: floor(x) + 14, w, lean: between(rnd, -0.04, 0.04), boughs: 0 })} `;
        cv.add(`<path d="${d}" fill="#2a3018"/>`);
      });
      // the near trees: a great trunk on the left, and boughs of new leaves hanging in over the top, dark against
      // the light with their edges lit
      s.layer({ blur: 0.6, rim: { x: sun[0], y: sun[1], colour: '#f0ffa0', width: 2.5, strength: 0.9, reach: 1400 } }, (cv) => {
        cv.add(`<path d="${trunk(rnd, { x: 40, y: 760, w: 70, lean: 0.03, boughs: 0 })} ${trunk(rnd, { x: 210, y: 760, w: 36, lean: -0.05, boughs: 0 })}" fill="#141a0a"/>`);
        // (the leaves thinning out toward the sun, so it comes through them)
        leaves(cv, hedge(rnd, { y: () => between(rnd, -60, 110), x0: -80, x1: 640, count: 30, h0: 70, h1: 180, colour: '#24341a' }) + hedge(rnd, { y: () => between(rnd, -60, 160), x0: 640, x1: 1360, count: 22, h0: 50, h1: 130, colour: '#24341a' }), { size: 5.4, masses: 4, contrast: 0.5, gaps: 1, light, seed: s.seed() });
        // a bough of new leaves hanging in from the right, against the light
        const bough = tree(rnd, { x: 1330, y: 40, height: 300, kind: 'walnut', wood: '#141a0a', leafColour: '#24341a', lean: -1.2, leafiness: 0.8, twig: 4 });
        cv.add(bough.wood);
        leaves(cv, bough.leaves, { size: 5, masses: 4, contrast: 0.4, gaps: 0.9, light, seed: s.seed() });
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.55, strength: 2.6, decay: 0.984, density: 1, colour: '#fff4c0' });
      // and the shafts of it, through the haze
      s.layer({ blur: 5, blend: 'screen' }, (cv) => {
        beams(cv, rnd, { x: sun[0], y: sun[1], count: 11, angle: 0.8, spread: 0.95, length: 1150, width: [8, 46], colour: '#fff6c8', opacity: 0.5 });
      });
      // the meadow under the trees, the grass to the knee, its heads catching the sun
      s.carpet({ rim: { x: sun[0], y: sun[1], colour: '#fff8c0', width: 2, strength: 0.8, reach: 1500 } }, {
        top: floor,
        far: 1.6,
        near: 22,
        ground: '#141a08',
        fog: [haze, 0.7],
        light,
        pool: { x: 800, y: 600, r: 700, ambient: 0.4, squash: 0.4 },
        patches: 0.3,
        focus: { from: 0.8, blur: 1.8 },
        plants: [
          { kind: 'blades', share: 6, colours: ['#2e4a16', '#4a6a24', '#6a8a30', '#9ab040', '#3a5a1c'], height: 1.6 },
          { kind: 'tuft', share: 3, colours: ['#24401a', '#34521e', '#1a3012', '#4a6a28'], drifts: 1.2 },
          { kind: 'daisy', share: 0.5, colours: ['#3a5a20'], flower: ['#ffffff', '#fff8e0'], leaves: '#3a5a20', centre: '#ffd040', drifts: 1.6 },
          { kind: 'daisy', share: 0.3, colours: ['#3a5a20'], flower: ['#ffe040', '#ffd020'], leaves: '#3a5a20', centre: '#e09010', drifts: 1.8 },
        ],
      });
      // the tall grass and its seed-heads in front of us, the sun through them
      s.layer({ blur: 1.2, rim: { x: sun[0], y: sun[1], colour: '#fff8c0', width: 2, strength: 1, reach: 1600 } }, (cv) => {
        cv.add(tallGrass(rnd, { x0: -20, x1: 1300, y0: 660, y1: 790, count: 300, height: 170, colours: ['#1e3012', '#2a4018', '#3a5420'], heads: '#d8d890', share: 0.18, wind: 0.22, width: 2.4 }));
      });
      s.layer({ blur: 1.2, blend: 'screen' }, (cv) => {
        cv.add(motes(rnd, { x0: 300, x1: 1280, y0: 160, y1: 600, count: 140, size: 2, colours: ['#fffbe0', '#f0ffc0'] }));
      });
      s.layer({ blur: 1.6 }, (cv) => {
        cv.add(petals(rnd, { count: 40, colours: ['#ffffff', '#ffe6f0', '#f6d6e0'], size: 4, x0: 120, x1: 900, y0: 200, y1: 640 }));
      });
      return s.done({
        bloom: { threshold: 0.72, strength: 0.55, radius: 34, tint: '#fff4c0' },
        diffuse: { radius: 22, strength: 0.28, soften: 0.08 },
        grade: { lift: [0.03, 0.04, 0.0], gain: [1.02, 1.02, 0.86], gamma: [1, 1.02, 0.94], saturation: 1.05, contrast: 0.26, shadows: ['#101c08', 0.5], highlights: ['#fffbe0', 0.2] },
        vignette: { strength: 0.5, colour: '#0a1004' },
        grain: 0.018,
        clumps: 0.012,
      });
    },
  },

  'agire-newroze': {
    ku: 'Agirê Newrozê',
    en: 'Newroz fire',
    // Newroz night at Akre: the climbers' torches zig-zagging up the mountain to the fire at the top, the town
    // lit below it, fires on the hills all round, and in front of us the bonfire, its sparks going up into the dark
    scene(rnd) {
      const s = new Scene(rnd);
      const flame = [640, 572];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#07040f'], [0.45, '#1e0a1e'], [0.8, '#4a1418'], [1, '#6a1e1a']]);
        cv.add(starfield(rnd, { y0: 0, y1: 260, count: 200, bright: 3 }));
      });
      // the mountain, its faces lit from below by the town and the fires
      const pts = s.terrain({ blur: 1 }, { base: 470, peaks: [{ x: 700, h: 300, l: 420, r: 460, k: 1.1 }, { x: 160, h: 140, s: 260 }, { x: 1200, h: 170, s: 260 }], rough: 0.1, lit: '#4a1c1c', shadow: '#0e050a', foot: '#22090f', footFrom: 420, light: [0.1, 0.55, 0.6], ambient: 0.28 });
      const yAt = (x) => heightAt(pts, x);
      let summit = [700, 170];
      let torchGlow = '';
      let windows = '';
      s.layer({ blur: 1 }, (cv) => {
        const t = akreTorches(rnd, { x: 700, y: 430, top: yAt(700) + 8, width: 600, paths: 3 });
        summit = t.summit;
        torchGlow = t.glow;
        cv.add(t.dots);
        // Akre, its houses stepped up the foot of the mountain, every window lit
        const town = hewraman(rnd, { x0: 270, y0: 528, x1: 1130, y1: 528, thick: 120, bow: 64, ground: (x) => yAt(x) + 60, house: 15, wall: '#1e0c10', wallLit: '#2a1216', wallDark: '#12060a', roof: '#2e1418', door: '#0a0306', lights: '#ffc06a', lit: 0.26, light: 1 });
        cv.add(town.houses);
        windows = town.glow;
      });
      s.layer({ blur: 2, blend: 'screen', opacity: 0.5 }, (cv) => cv.add(windows));
      // the torches, the fire on the summit, and the fires on the hills round about, as light
      s.layer({ blur: 2.2, blend: 'screen' }, (cv) => {
        cv.add(torchGlow);
        glow(cv, { x: summit[0], y: summit[1], r: 70, colour: '#ff9a3a', opacity: 0.85 });
        cv.add(`<circle cx="${summit[0]}" cy="${summit[1] + 4}" r="5" fill="#fff0c0"/>`);
        for (const hx of [90, 210, 1130, 1240]) {
          const hy = yAt(hx) + 3;
          glow(cv, { x: hx, y: hy, r: 34, colour: '#ff8a3a', opacity: 0.8 });
          cv.add(`<path d="M${hx - 4},${hy} Q${hx - 2},${hy - 9} ${hx},${hy - 13} Q${hx + 2},${hy - 9} ${hx + 4},${hy} Z" fill="#ffe0a0"/>`);
        }
      });
      // smoke from a thousand torches over the town, lit from below
      s.layer({ scale: 2, blur: 4, blend: 'screen' }, (cv) => {
        noise(cv, { y: 300, h: 300, freq: [0.005, 0.01], seed: s.seed(), colour: '#ff6a2a', contrast: 2.4, bias: -1.1, opacity: 0.32, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      // the ground round the fire, a ring of stones
      s.layer({}, (cv) => {
        cv.add('<path d="M-20,530 C300,518 900,518 1300,530 L1300,740 L-20,740 Z" fill="#140608"/>');
        const g = cv.id('ground');
        cv.def(`<radialGradient id="${g}" gradientUnits="userSpaceOnUse" cx="${flame[0]}" cy="${flame[1]}" r="560" gradientTransform="translate(0 ${flame[1] * 0.72}) scale(1 0.28)"><stop offset="0" stop-color="#ff8a3a" stop-opacity="0.8"/><stop offset="0.35" stop-color="#c8401a" stop-opacity="0.38"/><stop offset="1" stop-color="#c8401a" stop-opacity="0"/></radialGradient>`);
        cv.add(`<rect x="-20" y="516" width="1320" height="224" fill="url(#${g})"/>`);
        const stones = [];
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const sx = flame[0] + Math.cos(a) * 150;
          const sy = flame[1] + 6 + Math.sin(a) * 26;
          if (Math.sin(a) < -0.2) continue;
          stones.push(`<ellipse cx="${n(sx)}" cy="${n(sy)}" rx="${n(between(rnd, 13, 19))}" ry="${n(between(rnd, 7, 10))}" fill="#2a0e0c"/><ellipse cx="${n(sx - 2)}" cy="${n(sy - 3)}" rx="${n(between(rnd, 8, 12))}" ry="${n(3.5)}" fill="#a8441e" fill-opacity="0.55"/>`);
        }
        cv.add(stones.join(''));
      });
      // the bonfire: the logs and the embers they lie in, then the flames as light, and its glow over everything
      const f = fire(rnd, { x: flame[0], y: flame[1], w: 220, h: 320, wind: 0.08, tongues: 15 });
      s.layer({}, (cv) => cv.add(f.logs));
      s.layer({ blur: 1.1, blend: 'screen' }, (cv) => rough(cv, f.flames, { scale: 11, freq: 0.03, seed: s.seed() }));
      s.layer({ blend: 'screen' }, (cv) => {
        glow(cv, { x: flame[0], y: flame[1] - 110, r: 480, colour: '#ff6a1a', opacity: 0.42 });
        glow(cv, { x: flame[0], y: flame[1] - 90, r: 180, colour: '#ffc060', opacity: 0.55 });
      });
      s.layer({ blur: 0.6, blend: 'screen' }, (cv) => {
        cv.add(embers(rnd, { x: flame[0], y: flame[1] - 200, rise: 470, spread: 80, count: 220, wind: 0.22, colours: ['#ffd36a', '#ff9a3a', '#fff0c0', '#ff6a2a'] }));
      });
      // grass at our feet, too near to be in focus, its tips catching the fire
      s.layer({ blur: 2, rim: { x: flame[0], y: flame[1] - 80, colour: '#ff9a4a', width: 2, strength: 0.8, reach: 900 } }, (cv) => {
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 716, count: 420, height: 44, colours: ['#0a0305', '#120507', '#0e0406'], wind: 0.08, width: 3 }));
      });
      return s.done({
        bloom: { threshold: 0.55, strength: 0.75, radius: 26, tint: '#ffb070' },
        grade: { lift: [0.03, 0.01, 0.02], gain: [1.04, 0.95, 0.88], saturation: 1.1, contrast: 0.24, shadows: ['#1a0408', 0.5] },
        vignette: { strength: 0.5, colour: '#080204' },
        grain: 0.018,
      });
    },
  },

  'evara-sor': {
    ku: 'Êvara Sor',
    en: 'Red evening',
    // the citadel of Hewlêr on its mound, far off and alone on the plain under a heavy evening sky, the long
    // ridge of the mountains behind it, the dry grass of the plain running out to our feet: all of it red
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [300, 330];
      const light = [-0.8, -0.35, 0.45];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#3a3a3a'], [0.5, '#7a7a7a'], [0.8, '#b0b0b0'], [1, '#c4c4c4']]);
        glow(cv, { x: sun[0], y: sun[1], r: 600, colour: '#e8e8e8', opacity: 0.6 });
        clouds(cv, { y: -20, h: 360, freq: [0.0028, 0.0085], seed: s.seed(), colour: '#5a5a5a', light: '#d8d8d8', shade: '#1e1e1e', dx: -16, dy: 10, density: 3.2, cover: -1.1, opacity: 1, fade: [[0, 1], [0.7, 0.9], [1, 0]] });
        clouds(cv, { y: 150, h: 190, freq: [0.004, 0.016], seed: s.seed(), colour: '#6a6a6a', light: '#e8e8e8', shade: '#2a2a2a', dx: -12, dy: 8, density: 3, cover: -1.4, opacity: 0.85, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      // the mountains: a long ridge right across, worn and broken, its faces lit from the west
      // (a long table of a range, flat along the top and broken at its edges, not peaks)
      const range = (x) => 394 - (52 + 18 * Math.sin(x / 190 + 0.6) + 9 * Math.sin(x / 61 + 2) + 4 * Math.sin(x / 19)) * (0.6 + 0.4 * Math.min(1, Math.abs(Math.sin(x / 260 + 0.4)) * 1.6));
      s.terrain({ blur: 1.4, haze: ['#9a9a9a', 0.5] }, { base: 394, line: range, peaks: [{ x: 120, h: 0, s: 200 }, { x: 420, h: 0, s: 200 }, { x: 760, h: 0, s: 200 }, { x: 1100, h: 0, s: 200 }], lit: '#b0b0b0', shadow: '#262626', light, ambient: 0.3, ribs: 2, relief: 0.6 });
      // the citadel on its mound, far off, and the plain
      s.layer({ blur: 0.6, haze: ['#8a8a8a', 0.3] }, (cv) => {
        cv.add(citadel(rnd, { x: 610, y: 396, w: 250, fill: '#202020', lights: null }));
      });
      s.carpet({}, {
        top: 396,
        far: 0.9,
        near: 20,
        ground: '#141414',
        fog: ['#8a8a8a', 0.6],
        light: [-0.6, -1],
        patches: 0.45,
        focus: { from: 0.85, blur: 1.4 },
        plants: [
          { kind: 'blades', share: 6, colours: ['#6a6a6a', '#8a8a8a', '#5a5a5a', '#a0a0a0'], height: 1.2 },
          { kind: 'tuft', share: 1.5, colours: ['#3a3a3a', '#4a4a4a', '#2a2a2a'] },
        ],
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.7, strength: 0.8, decay: 0.97, density: 0.9, colour: '#ffffff' });
      return s.done({
        bloom: { threshold: 0.8, strength: 0.3, radius: 30 },
        grade: { mono: ['#0e0003', '#ff4462', 1], contrast: 0.3, saturation: 1.1, lift: [0.015, 0, 0.005] },
        vignette: { strength: 0.5, colour: '#0a0002' },
        grain: 0.03,
        clumps: 0.016,
      });
    },
  },

  'seva-sor': {
    ku: 'Şeva Sor',
    en: 'Red night',
    // a red night in the mountains of Behdînan: one old tree alone on stony ground, its leaves lit cold by the
    // moon behind us, the sky beyond it red to the last of the light, and Amêdî's lamps far off on its cliff
    scene(rnd) {
      const s = new Scene(rnd);
      const moonlight = { x: -300, y: 300, colour: '#7af0e0', width: 2.4, strength: 0.9, reach: 2600 };
      s.layer({}, (cv) => {
        sky(cv, [[0, '#0c0204'], [0.3, '#2a0606'], [0.55, '#5a0e08'], [0.72, '#8a1e0c'], [0.82, '#a42c10'], [1, '#7a1a0c']]);
        cv.add(starfield(rnd, { y0: 0, y1: 320, count: 160, bright: 2, colours: ['#ffffff', '#ffe4d8'] }));
        glow(cv, { x: 760, y: 560, r: 760, colour: '#c8401c', opacity: 0.35 });
      });
      // the far mountains, black against it, and Amêdî's lamps on its cliff
      s.terrain({ blur: 0.8, haze: ['#5a1008', 0.3] }, { base: 548, peaks: [{ x: 120, h: 120, l: 220, r: 260 }, { x: 560, h: 60, s: 260 }, { x: 1180, h: 100, l: 300, r: 220 }], rough: 0.2, lit: '#2a0a08', shadow: '#0a0202', light: [0.5, -0.4, 0.5], ambient: 0.5, ribs: 5 });
      s.layer({ blur: 0.6, haze: ['#5a1008', 0.2] }, (cv) => {
        cv.add(amedi(rnd, { x: 1040, y: 552, w: 220, fill: '#0a0202', lights: '#ffb860' }));
      });
      // the stony ground the tree stands on, rising toward us on either side, lit by the moon from our left
      const ground = (x) => 586 - 120 * Math.exp(-(((x + 60) / 360) ** 2)) - 90 * Math.exp(-(((x - 1340) / 300) ** 2)) + 6 * Math.sin(x / 90);
      const pool = { x: 520, y: 620, r: 600, ambient: 0.12, squash: 0.45, power: 1.2 };
      s.terrain({ falloff: pool, blur: 0.5 }, { base: 586, line: ground, peaks: [{ x: 640, h: 0, s: 900 }], lit: '#58c4b6', shadow: '#020a0a', foot: '#010606', footFrom: 690, light: [-0.75, -0.35, 0.55], rocky: 1, stone: 80, relief: 1.6, ambient: 0.1 });
      // the tree: a short crooked trunk and a wide crown, its leaves fine and feathery, the moon on the side of it
      // toward us
      s.layer({ blur: 0.3, rim: moonlight }, (cv) => {
        const t = tree(rnd, { x: 600, y: 566, height: 300, kind: 'oak', wood: '#041614', leafColour: '#0e4440', volume: ['#03100f', '#125a52', '#5ae0cc'], light: [-1, -0.3], lean: 0.05, leafiness: 1.1, twig: 4, clump: 0.7 });
        cv.add(t.wood);
        leaves(cv, t.leaves, { size: 2.6, masses: 4, contrast: 0.8, gaps: 0.85, light: [-1, -0.3], tip: 1, seed: s.seed() });
      });
      return s.done({
        bloom: { threshold: 0.6, strength: 0.4, radius: 24, tint: '#ff9a7a' },
        diffuse: { radius: 14, strength: 0.16, soften: 0.04 },
        grade: { lift: [0.01, 0.005, 0.01], gain: [1.04, 1, 1], saturation: 1.1, contrast: 0.3, shadows: ['#020a0c', 0.4] },
        vignette: { strength: 0.55, colour: '#020000' },
        grain: 0.022,
        clumps: 0.014,
      });
    },
  },

  newroz: {
    ku: 'Rengên Newrozê',
    en: 'The colours of Newroz',
    // Newroz morning: the sun just up over the hills with its twenty-one rays, the slopes still in shadow with the
    // light along their crests, and the spring at our feet in flower in Newroz's own colours — narcissus, red
    // tulips, white daisies in the green
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [250, 392];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#a8222c'], [0.3, '#dc4a2a'], [0.55, '#ff8e36'], [0.76, '#ffcc74'], [1, '#ffe8b8']]);
        clouds(cv, { y: 30, h: 300, freq: [0.0045, 0.012], seed: s.seed(), colour: '#e87a54', light: '#ffe2b0', shade: '#9a3442', dx: -10, dy: 8, density: 3, cover: -1.5, opacity: 0.75, fade: [[0, 0], [0.4, 1], [1, 0]] });
        orb(cv, { x: sun[0], y: sun[1], r: 40, core: '#fffdf0', edge: '#fff0a8', halo: '#ffd060', haloR: 700, haloOpacity: 0.95 });
        birds(cv, rnd, { x: 560, y: 190, count: 7, size: 7, colour: '#6a2a2a', spread: 90 });
      });
      // the sun's twenty-one rays, as light
      s.layer({ blur: 9, blend: 'screen', opacity: 0.7 }, (cv) => {
        const shafts = [];
        for (let i = 0; i < 21; i++) {
          const a = (i / 21) * Math.PI * 2 - Math.PI / 2;
          const at = (r, da) => `${n(sun[0] + Math.cos(a + da) * r)},${n(sun[1] + Math.sin(a + da) * r)}`;
          shafts.push(`M${at(56, -0.03)} L${at(1500, -0.024)} L${at(1500, 0.024)} L${at(56, 0.03)} Z`);
        }
        const g = cv.id('beams');
        cv.def(`<radialGradient id="${g}" gradientUnits="userSpaceOnUse" cx="${sun[0]}" cy="${sun[1]}" r="1000"><stop offset="0" stop-color="#fff4c0" stop-opacity="0.55"/><stop offset="0.35" stop-color="#ffe08a" stop-opacity="0.2"/><stop offset="1" stop-color="#ffd060" stop-opacity="0"/></radialGradient>`);
        cv.add(`<path d="${shafts.join(' ')}" fill="url(#${g})"/>`);
      });
      // the hills, against the light: their faces in shadow, their crests lit, oak copses dark on them
      const light = [-0.85, -0.3, 0.42];
      const rim = { x: sun[0], y: sun[1], colour: '#ffe8a0', width: 3, strength: 1, reach: 1500 };
      const far = s.terrain({ blur: 1.4, haze: ['#ffb070', 0.24], rim }, { base: 470, peaks: [{ x: 640, h: 120, l: 420, r: 340, round: true }, { x: 1110, h: 170, s: 320, round: true }], rough: 0.06, lit: '#6e9a44', shadow: '#1a3020', light, grassy: 0.3, blade: 1.8, relief: 0.8, ambient: 0.18 });
      s.layer({ blur: 0.9, haze: ['#ffb070', 0.16] }, (cv) => {
        // oaks in copses down the slopes, a few standing alone on the crests
        let copses = '';
        for (let c = 0; c < 9; c++) {
          const cx = between(rnd, 440, 1280);
          const cy = heightAt(far, cx) + between(rnd, 10, 60);
          for (let i = 0; i < 6; i++) {
            const x = cx + between(rnd, -40, 40);
            copses += silhouette(rnd, { x, y: Math.max(heightAt(far, x) + 6, cy + between(rnd, -8, 12)), height: between(rnd, 26, 44), kind: 'oak', colour: '#16301a', leafiness: 1.2, twig: 5 });
          }
        }
        leaves(cv, copses, { size: 2.6, masses: 3, contrast: 0.3, gaps: 0.5, light: [-1, -0.4], seed: s.seed() });
      });
      const near = s.terrain({ blur: 0.9, haze: ['#ffc080', 0.14], rim }, { base: 505, peaks: [{ x: 300, h: 40, l: 360, r: 300, round: true }, { x: 860, h: 34, s: 340, round: true }], rough: 0.04, lit: '#78a84a', shadow: '#1e4220', light, grassy: 0.45, blade: 2.4, relief: 0.6, ambient: 0.22 });
      // the slope we stand on, in flower
      const slope = (x) => Math.min(heightAt(near, x) + 18, 528 - Math.max(0, x) * 0.03);
      s.carpet({ rim }, {
        top: slope,
        far: 1.4,
        near: 20,
        ground: '#122a10',
        fog: ['#ffd8a0', 0.45],
        light: [-0.8, -1],
        patches: 0.3,
        focus: { from: 0.82, blur: 1.6 },
        plants: [
          { kind: 'blades', share: 4, colours: ['#3a7a32', '#4e9440', '#6aa84a', '#2e6a2a'], height: 1.2 },
          { kind: 'daisy', share: 1.6, colours: ['#2e6a2a'], flower: ['#fffaf0', '#fff6e2'], leaves: '#2e6a2a', centre: '#ffb81a', drifts: 1.5 },
          { kind: 'bell', share: 1.2, colours: ['#2e6a2a'], flower: ['#e0262c', '#f0402a', '#c81e2a'], leaves: '#3a7a32', height: 1.4, drifts: 1.8 },
          { kind: 'daisy', share: 1, colours: ['#2e6a2a'], flower: ['#ffffff', '#fff4f4'], leaves: '#2e6a2a', centre: '#ffd23a', drifts: 1.2 },
        ],
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.72, strength: 1.2, decay: 0.975, density: 0.95, colour: '#fff0b0' });
      return s.done({
        bloom: { threshold: 0.72, strength: 0.55, radius: 30, tint: '#ffe0a0' },
        diffuse: { radius: 18, strength: 0.24, soften: 0.08 },
        grade: { lift: [0.04, 0.02, 0.01], gain: [1.03, 0.99, 0.92], saturation: 1.08, contrast: 0.22, shadows: ['#2a1008', 0.35] },
        vignette: { strength: 0.38, colour: '#2a0a04' },
        grain: 0.016,
        clumps: 0.01,
      });
    },
  },
};

/**
 * The kilims: each woven after one Kurdish tradition (kilim.mjs), and the light it lies in — a shaft from a high
 * window falling across it at `angle` (radians below level) through `at`, `width` wide, in `colour`.
 */
const KILIMS = [
  ['kilima-sor', 'Kilîma Sor', 'Red kilim', 'herki', { angle: 0.62, at: [600, 340], width: 330, colour: '#ffe0aa' }],
  ['kilima-mor', 'Kilîma Mor', 'Purple kilim', 'sine', { angle: 0.7, at: [640, 360], width: 360, colour: '#ffe6c0' }],
  ['kilima-zer', 'Kilîma Zer', 'Gold kilim', 'harsin', { angle: 0.55, at: [560, 330], width: 300, colour: '#fff0c8' }],
  ['kilima-kesk', 'Kilîma Kesk', 'Green kilim', 'jaff', { angle: 0.66, at: [680, 360], width: 320, colour: '#ffe8bc' }],
  ['kilima-sin', 'Kilîma Şîn', 'Blue kilim', 'stars', { angle: 0.6, at: [620, 350], width: 340, colour: '#fff2d4' }],
  ['kilima-gulan', 'Kilîma Gulan', 'Rose kilim', 'gulan', { angle: 0.68, at: [640, 340], width: 360, colour: '#fff0d8' }],
  ['kilima-seve', 'Kilîma Şevê', 'Night kilim', 'night', { angle: 0.74, at: [640, 360], width: 300, colour: '#cfe0ff', night: true }],
];

/** Old floorboards, dark in the shade of the room: planks of a few tones, their grain, their joints. */
function boards(cv, rnd) {
  const tones = ['#3a2416', '#33200f', '#402a19', '#2e1c10', '#36220f'];
  const grain = [];
  for (let y = -12, i = 0; y < 740; i++) {
    const h = between(rnd, 58, 74);
    cv.add(`<rect x="-10" y="${n(y)}" width="1300" height="${n(h)}" fill="${tones[i % tones.length]}"/>`);
    for (let k = 0; k < 5; k++) {
      const gy = y + between(rnd, 6, h - 6);
      grain.push(`M-10,${n(gy)} C${n(between(rnd, 200, 500))},${n(gy + between(rnd, -4, 4))} ${n(between(rnd, 700, 1000))},${n(gy + between(rnd, -4, 4))} 1290,${n(gy + between(rnd, -3, 3))}`);
    }
    cv.add(`<rect x="-10" y="${n(y + h - 2)}" width="1300" height="2" fill="#120a05"/>`);
    for (let x = between(rnd, -200, 300); x < 1300; x += between(rnd, 380, 700)) cv.add(`<rect x="${n(x)}" y="${n(y)}" width="2" height="${n(h)}" fill="#120a05"/>`);
    y += h;
  }
  cv.add(`<path d="${grain.join(' ')}" fill="none" stroke="#5a3a22" stroke-width="1" stroke-opacity="0.35"/>`);
}

for (const [key, ku, en, design, light] of KILIMS) {
  SCENES[key] = {
    ku,
    en,
    // a kilim, woven cell by cell, lying on old boards in a dim room, a shaft of light from a high window falling
    // across it, the dust turning in the light
    scene(rnd) {
      const s = new Scene(rnd);
      const { angle, at, width, colour, night = false } = light;
      const d = [Math.cos(angle), Math.sin(angle)];
      const nrm = [-d[1], d[0]];
      // the shaft, and a narrower one beside it where the window's other pane is
      const shafts = [
        [0, width],
        [width * 0.95, width * 0.42],
      ];
      const shaftPath = shafts
        .map(([off, w]) => {
          const c = [at[0] + nrm[0] * off, at[1] + nrm[1] * off];
          const P = (t, side) => [c[0] + d[0] * t + nrm[0] * side * (w / 2), c[1] + d[1] * t + nrm[1] * side * (w / 2)];
          return `M${pt(P(-1800, -1))} L${pt(P(1800, -1))} L${pt(P(1800, 1))} L${pt(P(-1800, 1))} Z`;
        })
        .join(' ');
      s.layer({}, (cv) => boards(cv, rnd));
      // the rug's own shadow on the boards
      s.layer({ blur: 9 }, (cv) => cv.add('<rect x="34" y="27" width="1212" height="668" rx="6" fill="#000000" fill-opacity="0.6"/>'));
      s.layer({}, (cv) => kilim(cv, rnd, design));
      s.layer({ blur: 0.5 }, (cv) => cv.add(fringes(rnd)));
      // the folds it was kept in, not quite lain out of it: broad swells a little lit, a little shadowed
      s.layer({ blur: 34 }, (cv) => {
        for (let i = 0; i < 3; i++) {
          const x = between(rnd, 100, 1100);
          const w = between(rnd, 120, 260);
          const a = between(rnd, -0.3, 0.3);
          cv.add(`<g transform="rotate(${n(a * 57.3)} ${n(x + w / 2)} 360)"><rect x="${n(x)}" y="-200" width="${n(w * 0.5)}" height="1120" fill="#ffffff" fill-opacity="0.05"/><rect x="${n(x + w * 0.5)}" y="-200" width="${n(w * 0.5)}" height="1120" fill="#000000" fill-opacity="0.1"/></g>`);
        }
      });
      // the room's shade everywhere the light does not fall
      s.layer({ blur: 44 }, (cv) => {
        cv.add(`<path d="M-200,-200 H1480 V920 H-200 Z ${shaftPath}" fill="${night ? '#04050c' : '#140a05'}" fill-opacity="${night ? 0.62 : 0.5}" fill-rule="evenodd"/>`);
      });
      // the light itself, brightest where it comes in at the top left, and the glow of the window it comes through
      s.layer({ blur: 26, blend: 'screen' }, (cv) => {
        const g = cv.id('shaft');
        cv.def(`<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${n(at[0] - d[0] * 900)}" y1="${n(at[1] - d[1] * 900)}" x2="${n(at[0] + d[0] * 900)}" y2="${n(at[1] + d[1] * 900)}"><stop offset="0" stop-color="${colour}" stop-opacity="0.62"/><stop offset="0.55" stop-color="${colour}" stop-opacity="0.36"/><stop offset="1" stop-color="${colour}" stop-opacity="0.16"/></linearGradient>`);
        cv.add(`<path d="${shaftPath}" fill="url(#${g})"/>`);
        glow(cv, { x: at[0] - d[0] * 760, y: at[1] - d[1] * 760, r: 620, colour, opacity: 0.5 });
      });
      // dust turning in the light: fine motes, and a few out of focus nearer the window
      const motesIn = (count, size, opacity) => {
        const out = [];
        while (out.length < count) {
          const [off, w] = shafts[rnd() < 0.72 ? 0 : 1];
          const t = between(rnd, -900, 900);
          const side = between(rnd, -0.5, 0.5) * w;
          const x = at[0] + nrm[0] * off + d[0] * t + nrm[0] * side;
          const y = at[1] + nrm[1] * off + d[1] * t + nrm[1] * side;
          if (x < 0 || x > 1280 || y < 0 || y > 720) continue;
          out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(size * between(rnd, 0.4, 1.3))}" fill-opacity="${n(opacity * between(rnd, 0.4, 1))}"/>`);
        }
        return `<g fill="${night ? '#eef4ff' : '#fff6e2'}">${out.join('')}</g>`;
      };
      s.layer({ blur: 0.5, blend: 'screen' }, (cv) => cv.add(motesIn(220, 1.2, 0.9)));
      s.layer({ blur: 5, blend: 'screen' }, (cv) => cv.add(motesIn(16, 7, 0.32)));
      return s.done({
        bloom: { threshold: 0.7, strength: 0.42, radius: 30, tint: colour },
        diffuse: { radius: 18, strength: 0.2, soften: 0.06 },
        grade: night
          ? { lift: [0.01, 0.015, 0.03], gain: [0.96, 0.99, 1.04], saturation: 1, contrast: 0.16, shadows: ['#05070e', 0.4] }
          : { lift: [0.025, 0.015, 0.005], gain: [1.03, 1, 0.94], saturation: 1.04, contrast: 0.14, shadows: ['#1a0c06', 0.35], highlights: ['#fff2dc', 0.15] },
        vignette: { strength: 0.42, colour: '#000000' },
        grain: 0.012,
      });
    },
  };
}

/** The shop's order, which the files' numbers follow. */
const ORDER = [
  'hevalo', 'seva-zozanan', 'ezmane-sterkan', 'heyva-zivin', 'berfa-ciyayan', 'gola-sin', 'ronahiya-bakur', 'bin-erxewanan',
  'berbang', 'mija-gulan', 'evara-zerin', 'agire-newroze', 'evara-sor', 'seva-sor', 'lalezar', 'zozan', 'bihar',
  'daristana-seve', 'mij', 'newroz', 'kilima-sor', 'kilima-mor', 'kilima-zer', 'kilima-kesk', 'kilima-sin', 'kilima-gulan', 'kilima-seve',
];

/** Every background, in shop order: `key` names the file and seeds the drawing, `ku` and `en` are its names. */
export const BACKGROUNDS = ORDER.map((key) => ({ key, ku: SCENES[key].ku, en: SCENES[key].en, scene: SCENES[key].scene }));
