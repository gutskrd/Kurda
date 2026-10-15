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
import { Canvas, between, doc, n } from './kit.mjs';
import { deer, govend, lamb } from './figures.mjs';
import { aurora, birds, heightAt, range, village } from './landscape.mjs';
import { kilim } from './kilim.mjs';
import { akreTorches, amedi, citadel, delal, hewraman, hillTown, ishakPasha, tent } from './places.mjs';
import { beams, branch, clouds, embers, fire, flowerField, glow, grass, motes, moon, noise, orb, petals, pine, reeds, silhouette, sky, starfield, tree, wash } from './nature.mjs';

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
   * blend, opacity, scale, rim). What `draw` adds through `rough()` makes the
   * layer one of parts, each rasterised on its own and the rough ones
   * roughened, laid one over the next in the order they were drawn.
   */
  layer(opts, draw) {
    const cv = new Canvas(W, H);
    cv.roughAt = new Map();
    draw(cv);
    if (!cv.roughAt.size) {
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
      const rough = cv.roughAt.get(i);
      if (!rough) {
        plain.push(markup);
        return;
      }
      flush();
      parts.push({ svg: doc(W, H, defs, markup), rough });
    });
    flush();
    this.steps.push({ ...opts, parts });
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
  cv.roughAt.set(cv.body.length, { scale, freq, seed });
  cv.add(markup);
}

/** Trees along a line, back to front by size. */
function stand(rnd, { x0, x1, y, count, height, kind, colour, leafiness = 1, spread = 0.35, twig = 4, needles = false }) {
  const out = [];
  const list = [];
  for (let i = 0; i < count; i++) list.push([between(rnd, x0, x1), y + between(rnd, -6, 6), height * between(rnd, 1 - spread, 1 + spread * 0.6)]);
  list.sort((a, b) => a[2] - b[2]);
  for (const [x, yy, h] of list) out.push(kind === 'pine' ? pine(rnd, { x, y: yy, height: h, colour }) : silhouette(rnd, { x, y: yy, height: h, kind, colour, leafiness, twig, needles }));
  return out.join('');
}

export const SCENES = {
  'evara-zerin': {
    ku: 'Êvara Zêrîn',
    en: 'Golden evening',
    // the lake at sundown: poplars on the far shore, a deer drinking at the near one, reeds alight
    scene(rnd) {
      const s = new Scene(rnd);
      s.layer({}, (cv) => {
        sky(cv, [[0, '#9c5a26'], [0.32, '#d9963f'], [0.58, '#ffd27f'], [0.7, '#fff0c6'], [1, '#ffe1a0']]);
        orb(cv, { x: 905, y: 372, r: 30, core: '#fffdf2', edge: '#fff0c0', halo: '#ffe2a0', haloR: 560, haloOpacity: 0.9 });
        noise(cv, { y: 90, h: 240, freq: [0.0022, 0.014], seed: s.seed(), colour: '#fff3d6', contrast: 2.4, bias: -1, opacity: 0.55, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      s.layer({ blur: 1.5, haze: ['#f6c47e', 0.8] }, (cv) => {
        range(cv, rnd, { base: 452, peaks: [{ x: 160, h: 120, s: 260 }, { x: 560, h: 90, s: 240 }, { x: 1180, h: 140, s: 280 }], fill: '#000000', shade: '#000000', shadeOpacity: 0, gullies: 0 });
      });
      s.layer({ blur: 1.4, haze: ['#efb46a', 0.62] }, (cv) => {
        rough(cv, stand(rnd, { x0: -40, x1: 1320, y: 468, count: 46, height: 72, kind: 'poplar', colour: '#000', twig: 6 }) + stand(rnd, { x0: 300, x1: 1000, y: 470, count: 10, height: 50, kind: 'oak', colour: '#000', twig: 6 }), { scale: 3, freq: 0.15, seed: s.seed() });
        cv.add('<rect x="-10" y="462" width="1300" height="20" fill="#000"/>');
      });
      // tall poplars on the far point, the sun going down among them
      s.layer({ blur: 0.7, haze: ['#d9954a', 0.4], rim: { x: 905, y: 372, colour: '#ffe2a8', width: 3, strength: 0.9 } }, (cv) => {
        cv.add('<path d="M690,474 C780,462 900,460 1050,470 L1050,480 L690,480 Z" fill="#000"/>');
        rough(cv, [[868, 250], [946, 300], [998, 214], [792, 172], [722, 140]].map(([x, h]) => silhouette(rnd, { x, y: 472, height: h, kind: 'poplar', colour: '#000' })).join(''), { scale: 5, freq: 0.12, seed: s.seed() });
      });
      s.effect('rays', { x: 905, y: 372, threshold: 0.6, strength: 1.8, decay: 0.978, density: 0.97, colour: '#ffd9a0' });
      // the near bank, and the deer drinking at its edge
      s.layer({ rim: { x: 905, y: 372, colour: '#ffcf7a', width: 2.5, strength: 0.85 } }, (cv) => {
        cv.add('<path d="M-30,446 C120,438 250,444 360,452 C420,457 470,465 520,471 L-30,474 Z" fill="#26170c"/>');
        cv.add(grass(rnd, { x0: -30, x1: 470, y: 455, count: 300, height: 26, colours: ['#26170c', '#331f10'], wind: 0.25, width: 2 }));
        cv.add(deer({ x: 300, y: 470, size: 112, colour: '#1d1209', pose: 'drink' }));
      });
      s.effect('reflect', { y: 471, deep: '#5a3c22', near: 0.45, far: 0.9, ripple: 2.2, wave: 0.11, soften: 1.4, seed: s.seed() });
      s.layer({ blend: 'screen' }, (cv) => {
        for (let i = 0; i < 46; i++) {
          const y = between(rnd, 478, 650);
          const x = 905 + between(rnd, -1, 1) * (16 + (y - 470) * 0.9);
          cv.add(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${between(rnd, 8, 44).toFixed(1)}" height="1.6" fill="#fff4cf" fill-opacity="${between(rnd, 0.3, 0.85).toFixed(2)}"/>`);
        }
      });
      // reeds right in front, out of focus
      s.layer({ blur: 6 }, (cv) => {
        const r = reeds(rnd, { x0: 990, x1: 1320, y: 770, count: 24, height: 380, stem: '#1c1108', plume: '#2e1c0c', wind: -0.2 });
        const l = reeds(rnd, { x0: -40, x1: 170, y: 770, count: 12, height: 320, stem: '#1c1108', plume: '#2e1c0c', wind: 0.14 });
        cv.add(r.stems + r.plumes + l.stems + l.plumes);
      });
      s.layer({ blur: 0.6, blend: 'screen', opacity: 0.9 }, (cv) => {
        cv.add(motes(rnd, { x0: 560, x1: 1280, y0: 160, y1: 520, count: 160, size: 1.7, colours: ['#fff4d0', '#ffe2a0'] }));
      });
      return s.done({
        bloom: { threshold: 0.7, strength: 0.62, radius: 32, tint: '#ffd9a0' },
        grade: { lift: [0.05, 0.03, 0], gain: [1.03, 0.96, 0.82], gamma: [1.05, 1, 0.9], saturation: 1.08, contrast: 0.28, shadows: ['#3a1e0c', 0.5] },
        vignette: { strength: 0.5, colour: '#1a0d05' },
        grain: 0.016,
      });
    },
  },

  hevalo: {
    ku: 'Hevalo',
    en: 'Hevalo violet',
    // a violet wood at dusk; light breaking through, and Hevalo standing in it
    scene(rnd) {
      const s = new Scene(rnd);
      s.layer({}, (cv) => {
        sky(cv, [[0, '#3b1d5e'], [0.4, '#7a3f9e'], [0.75, '#c27ab8'], [1, '#e7a8c4']]);
        glow(cv, { x: 820, y: 250, r: 560, colour: '#ffd6f0', opacity: 0.95 });
        glow(cv, { x: 820, y: 250, r: 150, colour: '#ffffff', opacity: 0.95 });
      });
      s.layer({ blur: 3, haze: ['#d79ad6', 0.74] }, (cv) => {
        rough(cv, stand(rnd, { x0: -60, x1: 1340, y: 545, count: 26, height: 380, kind: 'oak', colour: '#000', twig: 9, leafiness: 0.9 }), { scale: 6, freq: 0.06, seed: s.seed() });
      });
      s.layer({ blur: 1, haze: ['#9f63b8', 0.48], rim: { x: 820, y: 250, colour: '#ffc6f2', width: 4, strength: 0.8 } }, (cv) => {
        rough(cv, stand(rnd, { x0: -80, x1: 470, y: 565, count: 6, height: 560, kind: 'walnut', colour: '#000', leafiness: 0.75 }) + stand(rnd, { x0: 1050, x1: 1360, y: 565, count: 5, height: 560, kind: 'walnut', colour: '#000', leafiness: 0.75 }), { scale: 9, freq: 0.05, seed: s.seed() });
        cv.add('<path d="M-20,545 C300,526 700,532 1300,540 L1300,740 L-20,740 Z" fill="#000"/>');
      });
      s.effect('rays', { x: 820, y: 250, threshold: 0.48, strength: 1.8, decay: 0.978, density: 0.98, colour: '#ffd0f4' });
      // the clearing: soft light on the grass, mossy stones, and the deer in the light
      s.layer({}, (cv) => {
        glow(cv, { x: 690, y: 548, r: 330, colour: '#f7b8e8', opacity: 0.5 });
      });
      s.layer({ rim: { x: 820, y: 250, colour: '#ffd6f6', width: 2.5, strength: 1 } }, (cv) => {
        cv.add('<path d="M480,566 C500,540 560,534 610,548 C630,556 628,568 600,572 Z" fill="#3a1f4a"/><path d="M790,574 C800,556 850,552 880,564 C886,572 870,578 840,578 Z" fill="#3a1f4a"/>');
        cv.add(deer({ x: 700, y: 552, size: 100, colour: '#21102e', pose: 'alert', facing: -1 }));
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 566, count: 900, height: 34, colours: ['#2a1438', '#3a1d4c', '#4c2a60'], wind: 0.1, width: 2.4 }));
        cv.add(flowerField(rnd, { kind: 'wild', y0: 566, y1: 720, count: 150, size: 10, colours: ['#ffb3e6', '#f08ad0', '#ffffff'], centre: '#ffe08a' }));
      });
      s.layer({ blur: 7 }, (cv) => {
        cv.add('<path d="M-10,-10 L64,-10 C74,240 86,500 104,740 L-10,740 Z" fill="#12061c"/><path d="M1216,-10 L1290,-10 L1290,740 L1176,740 C1194,500 1206,240 1216,-10 Z" fill="#12061c"/>');
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 736, count: 110, height: 90, colours: ['#12061c'], wind: 0.1, width: 6 }));
      });
      s.layer({ blur: 0.8, blend: 'screen' }, (cv) => {
        cv.add(motes(rnd, { x0: 300, x1: 1200, y0: 120, y1: 560, count: 190, size: 2, colours: ['#ffe6fa', '#ffc6ee', '#ffffff'] }));
      });
      s.effect('texture', { amount: 0.09, cells: [60, 18, 6], seed: s.seed() });
      s.effect('paint', { radius: 4 });
      return s.done({
        bloom: { threshold: 0.64, strength: 0.62, radius: 34, tint: '#ffc8f0' },
        grade: { lift: [0.07, 0.03, 0.1], gain: [1, 0.92, 1.02], gamma: [1, 0.96, 1.04], saturation: 1.05, contrast: 0.22, shadows: ['#2a0a3a', 0.6] },
        vignette: { strength: 0.5, colour: '#12061c' },
        grain: 0.016,
      });
    },
  },

  'daristana-seve': {
    ku: 'Daristana Şevê',
    en: 'Forest at night',
    // moonlight through the oaks, a deer grazing in the beam, fireflies
    scene(rnd) {
      const s = new Scene(rnd);
      s.layer({}, (cv) => {
        sky(cv, [[0, '#071a26'], [0.5, '#123e4c'], [1, '#22626a']]);
        moon(cv, { x: 700, y: 150, r: 34, halo: '#bfe6ff', haloR: 460, haloOpacity: 0.7, seed: s.seed() });
        cv.add(starfield(rnd, { y0: 0, y1: 300, count: 160, bright: 2 }));
      });
      s.layer({ blur: 2.4, haze: ['#4f8f96', 0.74] }, (cv) => {
        rough(cv, stand(rnd, { x0: -60, x1: 1340, y: 520, count: 22, height: 300, kind: 'oak', colour: '#000', twig: 9 }), { scale: 5, freq: 0.07, seed: s.seed() });
        cv.add('<rect x="-10" y="505" width="1300" height="240" fill="#000"/>');
      });
      // the big oaks round the clearing, their crowns meeting overhead
      s.layer({ blur: 0.8, haze: ['#2d6470', 0.42] }, (cv) => {
        rough(cv, stand(rnd, { x0: -80, x1: 440, y: 580, count: 5, height: 760, kind: 'oak', colour: '#000', leafiness: 0.8 }) + stand(rnd, { x0: 980, x1: 1360, y: 580, count: 4, height: 760, kind: 'oak', colour: '#000', leafiness: 0.8 }), { scale: 9, freq: 0.05, seed: s.seed() });
      });
      s.effect('rays', { x: 700, y: 150, threshold: 0.26, strength: 3, decay: 0.984, density: 1, colour: '#c6ecff' });
      s.layer({}, (cv) => {
        glow(cv, { x: 690, y: 562, r: 300, colour: '#a4dbe8', opacity: 0.34 });
      });
      s.layer({ rim: { x: 700, y: 150, colour: '#cfeeff', width: 2.5, strength: 0.9 } }, (cv) => {
        cv.add('<path d="M-20,548 C300,536 800,540 1300,552 L1300,740 L-20,740 Z" fill="#06171c"/>');
        cv.add(deer({ x: 690, y: 566, size: 94, colour: '#04121a', pose: 'graze' }));
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 572, count: 800, height: 30, colours: ['#06171c', '#0a2228', '#0e2c33'], wind: 0.12, width: 2.2 }));
      });
      s.layer({ blur: 1, blend: 'screen' }, (cv) => {
        for (let i = 0; i < 70; i++) {
          const x = between(rnd, 120, 1180);
          const y = between(rnd, 380, 680);
          const r = between(rnd, 1.4, 3);
          cv.add(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 4).toFixed(1)}" fill="#c8ff6a" fill-opacity="0.12"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#efffb0"/>`);
        }
      });
      return s.done({
        bloom: { threshold: 0.6, strength: 0.6, radius: 26, tint: '#bfe8ff' },
        grade: { lift: [0.02, 0.05, 0.07], gain: [0.92, 1, 1.04], gamma: [0.95, 1, 1.05], saturation: 1.05, contrast: 0.25, shadows: ['#021820', 0.5] },
        vignette: { strength: 0.55, colour: '#020a0e' },
        grain: 0.018,
      });
    },
  },

  mij: {
    ku: 'Mij',
    en: 'Mist',
    // a spruce wood lost in fog, the sun a white glow through it, daisies at its edge
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [640, 300];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#c8d0dc'], [0.5, '#eceff4'], [1, '#dde2ea']]);
        glow(cv, { x: sun[0], y: sun[1], r: 560, colour: '#ffffff', opacity: 1 });
      });
      const ranks = [[470, 220, 32, 0.9, 3], [500, 300, 20, 0.78, 2.2], [530, 380, 12, 0.6, 1.4], [570, 470, 7, 0.4, 0.7]];
      for (const [y, h, count, hz, bl] of ranks) {
        s.layer({ blur: bl, haze: ['#e6eaf0', hz] }, (cv) => {
          const trees = [];
          for (let i = 0; i < count; i++) trees.push(pine(rnd, { x: between(rnd, -40, 1320), y: y + between(rnd, -8, 8), height: h * between(rnd, 0.75, 1.2), colour: '#1e2430' }));
          rough(cv, trees.join('') + `<rect x="-10" y="${y - 4}" width="1300" height="${H - y + 8}" fill="#1e2430"/>`, { scale: 4, freq: 0.1, seed: s.seed() });
        });
      }
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.72, strength: 1.5, decay: 0.976, density: 0.95, colour: '#ffffff' });
      s.layer({}, (cv) => {
        wash(cv, { y0: 560, y1: 720, colour: '#7f8a9a', from: 0, to: 1 });
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 640, count: 700, height: 32, colours: ['#6c7686', '#7c8696', '#8c96a6'], wind: 0.1, width: 2 }));
        cv.add(flowerField(rnd, { kind: 'daisy', y0: 600, y1: 720, count: 380, size: 17, colours: ['#ffffff', '#f4f2ff', '#e6e2f8'], centre: '#f2e6a0', stem: '#5f6a7a' }));
      });
      s.layer({ blur: 5 }, (cv) => {
        cv.add(flowerField(rnd, { kind: 'daisy', y0: 690, y1: 760, count: 40, size: 44, colours: ['#ffffff', '#eeeaf8'], centre: '#f2e6a0', stem: '#59647a' }));
      });
      return s.done({
        bloom: { threshold: 0.75, strength: 0.5, radius: 34 },
        grade: { lift: [0.04, 0.04, 0.06], gain: [0.98, 0.99, 1.02], saturation: 0.7, contrast: 0.12, shadows: ['#2a3040', 0.3], highlights: ['#fff8f0', 0.2] },
        vignette: { strength: 0.25, colour: '#3a4250' },
        grain: 0.014,
      });
    },
  },

  'seva-zozanan': {
    ku: 'Şeva Zozanan',
    en: 'Night on the high pastures',
    // blue hour on the summer pastures: mist, flowers to the knees, the tents lit from inside
    scene(rnd) {
      const s = new Scene(rnd);
      s.layer({}, (cv) => {
        sky(cv, [[0, '#0d1838'], [0.45, '#22346a'], [0.8, '#4a5f9a'], [1, '#6a7cb4']]);
        cv.add(starfield(rnd, { y0: 0, y1: 300, count: 220, bright: 4 }));
      });
      s.layer({ blur: 2, haze: ['#6274ac', 0.62] }, (cv) => {
        range(cv, rnd, { base: 400, peaks: [{ x: 260, h: 210, s: 280 }, { x: 760, h: 250, s: 300 }, { x: 1200, h: 200, s: 260 }], fill: '#2c3a6a', shade: '#121a38', shadeOpacity: 0.45, snow: 250, snowLit: '#c8d4f4', snowShade: '#8a9ad0', light: 1 });
      });
      s.layer({ scale: 2, blur: 4 }, (cv) => {
        noise(cv, { y: 330, h: 170, freq: [0.003, 0.02], seed: s.seed(), colour: '#8a9ad0', contrast: 2.6, bias: -0.9, opacity: 0.8, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      s.layer({}, (cv) => {
        const g = cv.id('meadow');
        cv.def(`<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22305e"/><stop offset="1" stop-color="#121a3a"/></linearGradient>`);
        cv.add(`<path d="M-20,470 C200,452 500,446 760,452 C960,458 1120,470 1300,480 L1300,740 L-20,740 Z" fill="url(#${g})"/>`);
        // the tents, lamps lit inside, the reed screens dim in the dusk
        for (const [x, w] of [[600, 124], [748, 96], [468, 84]]) {
          glow(cv, { x, y: 470 - w * 0.15, r: w * 1.6, colour: '#ffb35a', opacity: 0.45 });
          cv.add(tent({ x, y: 470, w, fill: '#0a0c18', lamp: '#ffc06a', screen: ['#3a3e58', '#6a2a3c', '#7a6a3a', '#7e82a0'] }));
        }
        // the meadow: grass thickening toward us, lupins and small pale flowers in it
        for (const [y, h, count] of [[500, 9, 700], [548, 15, 700], [610, 23, 700], [684, 34, 600]]) {
          cv.add(grass(rnd, { x0: -30, x1: 1310, y, count, height: h, colours: ['#18284a', '#1e3058', '#26386a'], wind: 0.1, width: Math.max(1.2, h * 0.07) }));
        }
        cv.add(flowerField(rnd, { kind: 'wild', y0: 476, y1: 720, count: 320, size: 7, colours: ['#9aa4d8', '#c8cce8', '#b8a8e0'], centre: '#e8dca0' }));
        cv.add(flowerField(rnd, { kind: 'spike', y0: 474, y1: 720, count: 480, size: 10, colours: ['#4a5ac8', '#5e6ee0', '#7a68d8', '#3e4ab0'], stem: '#16204a' }));
      });
      s.layer({ blur: 5 }, (cv) => {
        cv.add(flowerField(rnd, { kind: 'spike', y0: 660, y1: 760, count: 46, size: 26, colours: ['#3a46a8', '#5a52c0'], stem: '#101838' }));
      });
      return s.done({
        bloom: { threshold: 0.62, strength: 0.6, radius: 26, tint: '#ffd09a' },
        grade: { lift: [0.02, 0.03, 0.08], gain: [0.95, 0.98, 1.06], saturation: 1.05, contrast: 0.2, shadows: ['#0a1030', 0.5] },
        vignette: { strength: 0.45, colour: '#050818' },
        grain: 0.018,
      });
    },
  },
  'berfa-ciyayan': {
    ku: 'Berfa Çiyayan',
    en: 'Snow on the mountains',
    // Agirî at a winter dawn, the snow catching the first light; the palace of Ishak Pasha below it
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [1240, 360];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#33507e'], [0.45, '#7f9ac2'], [0.72, '#d9c2cc'], [1, '#f6d2bc']]);
        glow(cv, { x: sun[0], y: sun[1], r: 700, colour: '#ffe2c4', opacity: 0.8 });
        noise(cv, { y: 60, h: 200, freq: [0.0025, 0.016], seed: s.seed(), colour: '#fff0e6', contrast: 2.2, bias: -1, opacity: 0.45, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      s.layer({ blur: 0.6, haze: ['#c9b4c8', 0.12] }, (cv) => {
        range(cv, rnd, {
          base: 470,
          peaks: [{ x: 800, h: 330, l: 400, r: 460, k: 1.25 }, { x: 410, h: 178, s: 170, k: 1.1 }],
          rough: 0.05,
          scale: 70,
          fill: '#6f7aa0',
          foot: '#9aa2bf',
          shade: '#2e3462',
          shadeOpacity: 0.5,
          snow: 300,
          snowLit: '#fff0e4',
          snowShade: '#d8c4d6',
          light: 1,
          haze: '#e9dce4',
          hazeOpacity: 0.75,
        });
      });
      s.layer({ scale: 2, blur: 3 }, (cv) => {
        noise(cv, { y: 410, h: 120, freq: [0.003, 0.03], seed: s.seed(), colour: '#f6eef2', contrast: 2.8, bias: -0.9, opacity: 0.85, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      // the spur and the palace on it, the dawn on its eastern faces
      s.layer({ rim: { x: sun[0], y: sun[1], colour: '#ffd8b4', width: 2.5, strength: 0.9, reach: 1300 } }, (cv) => {
        cv.add('<path d="M-20,520 C200,500 420,488 640,494 C860,500 1060,512 1300,520 L1300,740 L-20,740 Z" fill="#c9cfe0"/>');
        cv.add(ishakPasha({ x: 430, y: 512, w: 360, fill: '#3e3a58', rock: '#4a4764', lit: '#ffd59a', snow: '#e8ecf6' }));
      });
      s.layer({}, (cv) => {
        wash(cv, { y0: 520, y1: 720, colour: '#eef1f8', from: 0.2, to: 1 });
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 640, count: 260, height: 26, colours: ['#8a8098', '#9a90a8'], wind: 0.2, width: 1.6 }));
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.72, strength: 1.1, decay: 0.97, density: 0.9, colour: '#ffe6cc' });
      s.layer({ blur: 0.7, blend: 'screen' }, (cv) => {
        cv.add(motes(rnd, { count: 260, size: 1.6, colours: ['#ffffff', '#f2f4ff'], opacity: [0.3, 0.9] }));
      });
      return s.done({
        bloom: { threshold: 0.78, strength: 0.45, radius: 30, tint: '#ffe0c8' },
        grade: { lift: [0.03, 0.03, 0.06], gain: [1.02, 0.99, 1], saturation: 1, contrast: 0.2, shadows: ['#1a2050', 0.45], highlights: ['#fff0e0', 0.25] },
        vignette: { strength: 0.35, colour: '#141a36' },
        grain: 0.013,
      });
    },
  },

  'gola-sin': {
    ku: 'Gola Şîn',
    en: 'Blue lake',
    // Sîpan over the lake at first light, mist on the water, a fisherman going out
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
      s.layer({ blur: 0.4, haze: ['#d6e2f0', 0.18] }, (cv) => {
        range(cv, rnd, { base: 452, peaks: [{ x: 700, h: 250, l: 420, r: 470, k: 1.2 }], rough: 0.06, fill: '#5f77a6', foot: '#9eb2d2', shade: '#2e3f70', shadeOpacity: 0.45, snow: 300, snowLit: '#ffffff', snowShade: '#d6e2f2', light: -1, haze: '#e6eef7', hazeOpacity: 0.6 });
        cv.add('<rect x="-10" y="446" width="1300" height="8" fill="#6f84ac"/>');
      });
      s.effect('reflect', { y: 452, deep: '#24477a', near: 0.42, far: 0.92, ripple: 1.6, wave: 0.16, soften: 1.2, seed: s.seed() });
      s.layer({ scale: 2, blur: 3 }, (cv) => {
        noise(cv, { y: 430, h: 90, freq: [0.003, 0.04], seed: s.seed(), colour: '#f4f8fc', contrast: 2.6, bias: -0.85, opacity: 0.85, fade: [[0, 0], [0.45, 1], [1, 0]] });
      });
      // the fisherman's boat, and its reflection below it
      s.layer({}, (cv) => {
        const bx = 560;
        const by = 548;
        cv.add(`<g opacity="0.45" transform="translate(0 ${by * 2}) scale(1 -1)"><path d="M${bx - 62},${by - 6} C${bx - 40},${by + 8} ${bx + 40},${by + 8} ${bx + 70},${by - 10} L${bx + 58},${by - 2} Z" fill="#14233f"/><rect x="${bx - 6}" y="${by - 40}" width="10" height="34" fill="#14233f"/></g>`);
        cv.add(`<path d="M${bx - 62},${by - 6} C${bx - 40},${by + 8} ${bx + 40},${by + 8} ${bx + 70},${by - 10} L${bx + 58},${by - 2} C${bx + 20},${by + 2} ${bx - 30},${by + 2} ${bx - 62},${by - 6} Z" fill="#14233f"/>`);
        cv.add(`<path d="M${bx - 6},${by - 4} L${bx - 4},${by - 30} C${bx - 4},${by - 38} ${bx + 6},${by - 38} ${bx + 6},${by - 30} L${bx + 8},${by - 4} Z" fill="#14233f"/><circle cx="${bx + 1}" cy="${by - 42}" r="6" fill="#14233f"/><path d="M${bx + 6},${by - 26} L${bx + 60},${by - 52}" stroke="#14233f" stroke-width="2.5"/>`);
        birds(cv, rnd, { x: 940, y: 200, count: 5, size: 9, colour: '#40557a' });
      });
      s.layer({ blur: 5 }, (cv) => {
        const r = reeds(rnd, { x0: 1040, x1: 1320, y: 770, count: 22, height: 360, stem: '#18263e', plume: '#24344e', wind: -0.15 });
        const l = reeds(rnd, { x0: -40, x1: 200, y: 770, count: 16, height: 320, stem: '#18263e', plume: '#24344e', wind: 0.14 });
        cv.add(r.stems + r.plumes + l.stems + l.plumes);
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
    // the northern lights over the snowbound peaks, held again in the frozen lake
    scene(rnd) {
      const s = new Scene(rnd);
      s.layer({}, (cv) => {
        sky(cv, [[0, '#020611'], [0.55, '#06182a'], [1, '#0c3040']]);
        cv.add(starfield(rnd, { y0: 0, y1: 430, count: 420, bright: 6 }));
      });
      s.layer({ blend: 'screen', blur: 3 }, (cv) => {
        aurora(cv, rnd, { y: 250, amp: 80, height: 240, colours: ['#3cf0a0', '#46c8ff', '#c06cff'], opacity: 0.9 });
      });
      let windows = '';
      s.layer({ blur: 0.5 }, (cv) => {
        const pts = range(cv, rnd, { base: 470, peaks: [{ x: 200, h: 220, s: 240 }, { x: 640, h: 270, s: 280 }, { x: 1080, h: 230, s: 260 }], fill: '#1c3440', foot: '#2a4a56', shade: '#06121a', shadeOpacity: 0.5, snow: 290, snowLit: '#bdf2df', snowShade: '#5f9a9a', light: -1, haze: '#2e6a6a', hazeOpacity: 0.35 });
        cv.add('<rect x="-10" y="464" width="1300" height="8" fill="#16303a"/>');
        // a village at the mountain's foot, snow on its flat roofs, its windows lit
        const v = hewraman(rnd, { x0: 730, y0: 470, x1: 900, y1: 432, thick: 46, bow: 4, ground: (x) => heightAt(pts, x), house: 10, wall: '#12262e', wallLit: '#1a323a', wallDark: '#0a161c', roof: '#a8c8c8', door: '#061014', lights: '#ffc77a', lit: 0.45, light: -1 });
        cv.add(v.houses);
        windows = v.glow;
      });
      s.layer({ blur: 1.5, blend: 'screen' }, (cv) => cv.add(windows));
      s.effect('reflect', { y: 470, deep: '#0a2028', near: 0.5, far: 0.85, ripple: 0.6, wave: 0.2, soften: 1.6, seed: s.seed() });
      s.layer({}, (cv) => {
        // snow drifting over the ice, and its cracks
        noise(cv, { y: 520, h: 200, freq: [0.004, 0.03], seed: s.seed(), colour: '#cfe8ea', contrast: 3, bias: -1.5, opacity: 0.7, fade: [[0, 0], [0.4, 1], [1, 1]] });
        const cracks = [];
        for (let i = 0; i < 9; i++) {
          let x = between(rnd, 100, 1180);
          let y = between(rnd, 500, 700);
          let d = `M${x.toFixed(1)},${y.toFixed(1)}`;
          for (let k = 0; k < 5; k++) {
            x += between(rnd, -60, 60);
            y += between(rnd, -6, 14);
            d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
          }
          cracks.push(d);
        }
        cv.add(`<path d="${cracks.join(' ')}" stroke="#d8f4f0" stroke-width="1" stroke-opacity="0.35" fill="none"/>`);
      });
      return s.done({
        bloom: { threshold: 0.55, strength: 0.65, radius: 26 },
        grade: { lift: [0.01, 0.03, 0.04], gain: [0.92, 1.02, 1.02], saturation: 1.15, contrast: 0.22, shadows: ['#021216', 0.5] },
        vignette: { strength: 0.5, colour: '#01060a' },
        grain: 0.017,
      });
    },
  },

  'heyva-zivin': {
    ku: 'Heyva Zîvîn',
    en: 'Silver moon',
    // a silver moon over a village stepped up the mountainside, mist lying in the valley below it
    scene(rnd) {
      const s = new Scene(rnd);
      s.layer({}, (cv) => {
        sky(cv, [[0, '#0e1626'], [0.5, '#25334e'], [1, '#4d5d78']]);
        moon(cv, { x: 880, y: 220, r: 64, core: '#f2f4f8', edge: '#d0d6e2', sea: '#a8b0c0', halo: '#d6e2ff', haloR: 520, haloOpacity: 0.5, seed: s.seed() });
        noise(cv, { y: 160, h: 140, freq: [0.003, 0.03], seed: s.seed(), colour: '#c6d0e4', contrast: 2.6, bias: -1.2, opacity: 0.55, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      s.layer({ blur: 1.6, haze: ['#5a6a88', 0.55] }, (cv) => {
        range(cv, rnd, { base: 460, peaks: [{ x: 300, h: 200, s: 260 }, { x: 760, h: 170, s: 300 }, { x: 1200, h: 210, s: 240 }], fill: '#1c263a', shade: '#0a1020', shadeOpacity: 0.4, snow: 300, snowLit: '#d8e0f0', snowShade: '#8a96b0', light: 1, spurs: false });
      });
      s.layer({ scale: 2, blur: 3 }, (cv) => {
        noise(cv, { y: 400, h: 120, freq: [0.003, 0.03], seed: s.seed(), colour: '#9aa8c4', contrast: 2.6, bias: -0.95, opacity: 0.6, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      // the near mountainside, scrub and stones on it catching the moon
      let slope = [];
      s.layer({ rim: { x: 880, y: 220, colour: '#c8d4f0', width: 2, strength: 0.7, reach: 1100 } }, (cv) => {
        slope = range(cv, rnd, { base: 700, peaks: [{ x: 1180, h: 420, l: 760, r: 300, k: 0.8 }], rough: 0.03, fill: '#151d2e', foot: '#0e1422', shade: '#070b14', shadeOpacity: 0.3, light: 1, gullies: 0.2, spurs: false });
        const scrub = [];
        for (let i = 0; i < 170; i++) {
          const x = between(rnd, 430, 1290);
          const y = between(rnd, heightAt(slope, x) + 14, 730);
          scrub.push(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(between(rnd, 3, 9))}" ry="${n(between(rnd, 1.6, 4))}" fill="${rnd() < 0.7 ? '#0f1626' : '#222c42'}"/>`);
        }
        cv.add(scrub.join(''));
      });
      s.effect('texture', { amount: 0.06, cells: [70, 20, 6], seed: s.seed() });
      s.effect('paint', { radius: 3 });
      // Hewraman's houses stepped up it, a window lit here and there
      let windows = '';
      s.layer({ rim: { x: 880, y: 220, colour: '#c8d4f0', width: 1.5, strength: 0.5, reach: 1100 } }, (cv) => {
        const v = hewraman(rnd, { x0: 560, y0: 672, x1: 1090, y1: 430, thick: 180, bow: 36, ground: (x) => heightAt(slope, x), house: 19, wall: '#2a3348', wallLit: '#36405a', wallDark: '#1a2030', roof: '#3e4862', door: '#0e121c', lights: '#ffcf7a', lit: 0.22, light: 1, tree: '#0c121e' });
        cv.add(v.houses);
        windows = v.glow;
      });
      s.layer({ blur: 2.5, blend: 'screen', opacity: 0.8 }, (cv) => cv.add(windows));
      s.layer({ blend: 'screen' }, (cv) => {
        cv.add(motes(rnd, { count: 70, size: 1.4, colours: ['#ffffff'], opacity: [0.2, 0.7] }));
      });
      return s.done({
        bloom: { threshold: 0.7, strength: 0.5, radius: 26, tint: '#dde6ff' },
        grade: { lift: [0.04, 0.045, 0.06], gain: [0.96, 0.98, 1.02], saturation: 0.7, contrast: 0.22, shadows: ['#0a1020', 0.4] },
        vignette: { strength: 0.5, colour: '#05080f' },
        grain: 0.02,
      });
    },
  },

  'ezmane-sterkan': {
    ku: 'Ezmanê Stêrkan',
    en: 'Sky full of stars',
    // a sky deep with stars and green nebulae, the heart of the galaxy glowing low, a lone oak and a lit tent below it
    scene(rnd) {
      const s = new Scene(rnd);
      s.layer({}, (cv) => {
        sky(cv, [[0, '#010605'], [0.6, '#041a14'], [1, '#0a3326']]);
        glow(cv, { x: 900, y: 420, r: 420, colour: '#ffe8c8', opacity: 0.22 });
        clouds(cv, { x: -200, y: 0, w: 1700, h: 560, freq: [0.0035, 0.007], seed: s.seed(), colour: '#1f7a5a', light: '#b8ffe0', shade: '#03160f', dx: 6, dy: 10, density: 3, cover: -1.45, opacity: 0.85, rotate: -16, fade: [[0, 0], [0.5, 1], [1, 0]] });
        noise(cv, { x: -200, y: 160, w: 1700, h: 240, freq: [0.008, 0.012], seed: s.seed(), colour: '#020a07', contrast: 4, bias: -2, opacity: 0.85, rotate: -16, fade: [[0, 0], [0.5, 1], [1, 0]] });
        cv.add(starfield(rnd, { y0: 0, y1: 540, count: 1100, bright: 14, colours: ['#ffffff', '#fff1d0', '#d6fff0', '#ffd8b0'] }));
      });
      s.layer({ blur: 1.4, haze: ['#0e3a2c', 0.45] }, (cv) => {
        range(cv, rnd, { base: 540, peaks: [{ x: 180, h: 130, s: 260 }, { x: 680, h: 160, s: 300 }, { x: 1160, h: 140, s: 260 }], fill: '#030d0a', shade: '#000000', shadeOpacity: 0.2 });
      });
      s.layer({ rim: { x: 900, y: 420, colour: '#c8ffe4', width: 2, strength: 0.6, reach: 800 } }, (cv) => {
        cv.add('<path d="M-20,580 C240,548 520,534 760,540 C960,545 1120,558 1300,570 L1300,740 L-20,740 Z" fill="#020806"/>');
        cv.add(silhouette(rnd, { x: 880, y: 546, height: 260, kind: 'oak', colour: '#020806' }));
        glow(cv, { x: 420, y: 540, r: 110, colour: '#ffb35a', opacity: 0.55 });
        cv.add(tent({ x: 420, y: 548, w: 70, fill: '#020806', lamp: '#ffc06a', screen: null }));
      });
      return s.done({
        bloom: { threshold: 0.5, strength: 0.7, radius: 22, tint: '#c8ffe4' },
        grade: { lift: [0.01, 0.03, 0.02], gain: [0.95, 1.03, 1], saturation: 1.12, contrast: 0.25, shadows: ['#021a10', 0.4] },
        vignette: { strength: 0.5, colour: '#000604' },
        grain: 0.02,
      });
    },
  },

  berbang: {
    ku: 'Berbang',
    en: 'Daybreak',
    // daybreak at the Delal bridge in Zaxo: the sun coming up through its arch, mist on the Xabûr
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [640, 400];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#4e5f9e'], [0.32, '#b886a8'], [0.6, '#ffb98a'], [0.78, '#ffe0b0'], [1, '#ffe6c0']]);
        orb(cv, { x: sun[0], y: sun[1], r: 28, core: '#fffdf4', edge: '#ffeec8', halo: '#ffd6a6', haloR: 640, haloOpacity: 0.95 });
        clouds(cv, { y: 30, h: 320, freq: [0.005, 0.011], seed: s.seed(), colour: '#e8a8ac', light: '#ffe6c8', shade: '#7a5a8a', dx: 0, dy: 12, density: 3, cover: -1.5, opacity: 0.85, fade: [[0, 0], [0.4, 1], [1, 0]] });
      });
      s.layer({ blur: 1.6, haze: ['#f0bca4', 0.72] }, (cv) => {
        range(cv, rnd, { base: 452, peaks: [{ x: 110, h: 200, s: 260 }, { x: 470, h: 140, s: 240 }, { x: 900, h: 220, s: 300 }, { x: 1260, h: 160, s: 220 }], fill: '#000', shade: '#000', shadeOpacity: 0, gullies: 0 });
      });
      s.layer({ blur: 0.9, haze: ['#d8957e', 0.5] }, (cv) => {
        cv.add('<path d="M-20,462 C120,450 260,452 380,466 L390,480 L-20,480 Z M900,466 C1020,448 1160,446 1300,454 L1300,480 L890,480 Z" fill="#000"/>');
        rough(cv, stand(rnd, { x0: -40, x1: 300, y: 468, count: 9, height: 110, kind: 'oak', colour: '#000', twig: 5 }) + stand(rnd, { x0: 1000, x1: 1320, y: 460, count: 8, height: 120, kind: 'oak', colour: '#000', twig: 5 }), { scale: 4, freq: 0.1, seed: s.seed() });
        rough(cv, [[250, 170], [310, 214], [366, 150], [930, 190], [992, 236], [1050, 160]].map(([x, h]) => silhouette(rnd, { x, y: 474, height: h, kind: 'poplar', colour: '#000' })).join(''), { scale: 4, freq: 0.12, seed: s.seed() });
        // a minaret over the roofs on the far bank
        cv.add('<rect x="1126" y="330" width="9" height="130" fill="#000"/><rect x="1121" y="372" width="19" height="5" fill="#000"/><path d="M1124,330 L1130.5,312 L1137,330 Z" fill="#000"/>');
      });
      s.layer({ rim: { x: sun[0], y: sun[1], colour: '#ffe2b8', width: 2.5, strength: 1, reach: 560 } }, (cv) => {
        const b = delal({ x: 640, y: 476, span: 132, fill: '#2c1c26', lit: '#ffd0a0' });
        const m = cv.id('arch');
        cv.def(`<mask id="${m}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><path d="${b.arch}" fill="#000"/></mask>`);
        cv.add(`<g mask="url(#${m})">${b.body}</g>`);
        cv.add('<path d="M330,482 C352,468 392,462 430,470 L440,482 Z M842,482 C870,468 916,462 960,472 L972,482 Z" fill="#2c1c26"/>');
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.6, strength: 1.9, decay: 0.977, density: 0.97, colour: '#ffdcb0' });
      s.effect('reflect', { y: 478, deep: '#5a3a4a', near: 0.45, far: 0.9, ripple: 2, wave: 0.12, soften: 1.4, seed: s.seed() });
      s.layer({ scale: 2, blur: 3 }, (cv) => {
        noise(cv, { y: 446, h: 120, freq: [0.006, 0.012], seed: s.seed(), colour: '#ffe6d6', contrast: 2.6, bias: -0.95, opacity: 0.75, fade: [[0, 0], [0.45, 1], [1, 0]] });
      });
      s.layer({}, (cv) => {
        birds(cv, rnd, { x: 860, y: 240, count: 6, size: 9, colour: '#5a3a4a' });
      });
      return s.done({
        bloom: { threshold: 0.72, strength: 0.55, radius: 30, tint: '#ffd8b4' },
        grade: { lift: [0.05, 0.03, 0.04], gain: [1.02, 0.97, 0.94], saturation: 1.05, contrast: 0.22, shadows: ['#3a1a30', 0.4] },
        vignette: { strength: 0.4, colour: '#1a0c14' },
        grain: 0.015,
      });
    },
  },

  'mija-gulan': {
    ku: 'Mija Gulan',
    en: 'Rose mist',
    // a wood in rose-coloured fog, the light white behind it, cosmos in flower in front
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [660, 320];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#e6c0cf'], [0.5, '#f8e2e8'], [1, '#f2d4dc']]);
        glow(cv, { x: sun[0], y: sun[1], r: 600, colour: '#ffffff', opacity: 1 });
      });
      s.layer({ blur: 3.4, haze: ['#f4d6de', 0.84] }, (cv) => {
        rough(cv, stand(rnd, { x0: -60, x1: 1340, y: 520, count: 24, height: 360, kind: 'slender', colour: '#000', needles: true }), { scale: 6, freq: 0.08, seed: s.seed() });
      });
      s.layer({ blur: 1.5, haze: ['#e8b8c8', 0.62] }, (cv) => {
        rough(cv, stand(rnd, { x0: -60, x1: 1340, y: 548, count: 12, height: 470, kind: 'slender', colour: '#000', needles: true }), { scale: 7, freq: 0.07, seed: s.seed() });
      });
      s.layer({ blur: 0.5, haze: ['#c48aa0', 0.38], rim: { x: sun[0], y: sun[1], colour: '#fff0f4', width: 3, strength: 0.8, reach: 900 } }, (cv) => {
        rough(cv, [130, 1110].map((x) => silhouette(rnd, { x, y: 640, height: 720, kind: 'slender', colour: '#000', needles: true })).join(''), { scale: 8, freq: 0.06, seed: s.seed() });
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.72, strength: 1.4, decay: 0.976, density: 0.95, colour: '#fff4f6' });
      s.layer({}, (cv) => {
        wash(cv, { y0: 480, y1: 720, colour: '#a46a84', from: 0, to: 1 });
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 620, count: 600, height: 34, colours: ['#9a6278', '#a86e86', '#b87c94'], wind: 0.1, width: 2 }));
        cv.add(flowerField(rnd, { kind: 'cosmos', y0: 560, y1: 720, count: 320, size: 20, colours: ['#ffd6e4', '#ffc0d6', '#ffffff', '#f7a8c4'], centre: '#ffd36a', stem: '#7a5a6a' }));
      });
      s.layer({ blur: 6 }, (cv) => {
        cv.add(flowerField(rnd, { kind: 'cosmos', y0: 680, y1: 760, count: 26, size: 60, colours: ['#ffc8da', '#ffe0ea'], centre: '#ffd36a', stem: '#7a5a6a' }));
      });
      s.layer({ blur: 0.8, blend: 'screen' }, (cv) => {
        cv.add(motes(rnd, { x0: 300, x1: 1100, y0: 150, y1: 560, count: 140, size: 1.8, colours: ['#ffffff', '#ffe6f0'] }));
      });
      return s.done({
        bloom: { threshold: 0.78, strength: 0.5, radius: 34 },
        grade: { lift: [0.06, 0.04, 0.05], gain: [1.02, 0.97, 0.99], saturation: 0.95, contrast: 0.12, shadows: ['#4a2036', 0.3], highlights: ['#fff6f8', 0.2] },
        vignette: { strength: 0.22, colour: '#4a2a36' },
        grain: 0.014,
      });
    },
  },

  'bin-erxewanan': {
    ku: 'Binê Erxewanan',
    en: 'Under the Judas trees',
    // under the Judas trees in flower: the sun through the blossom, more of them down the valley, petals coming down
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [1000, 120];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#8db6e4'], [0.55, '#d2e2f2'], [1, '#f6e8f0']]);
        glow(cv, { x: sun[0], y: sun[1], r: 600, colour: '#ffffff', opacity: 0.95 });
      });
      s.layer({ blur: 2.4, haze: ['#e8e2f2', 0.6] }, (cv) => {
        range(cv, rnd, { base: 500, peaks: [{ x: 240, h: 170, s: 280 }, { x: 760, h: 200, s: 300 }, { x: 1180, h: 150, s: 240 }], fill: '#8a9cc4', shade: '#5a6a96', shadeOpacity: 0.3, snow: 380, snowShade: '#e4e8f4' });
      });
      // more Judas trees down the valley, pink in the haze
      s.layer({ blur: 1.6, haze: ['#f2e0ec', 0.5] }, (cv) => {
        cv.add('<path d="M-20,520 C300,500 700,506 1300,516 L1300,740 L-20,740 Z" fill="#94c26e"/>');
        for (let i = 0; i < 9; i++) {
          const t = tree(rnd, { x: between(rnd, 80, 1220), y: 524 + between(rnd, -6, 10), height: between(rnd, 90, 140), kind: 'oak', wood: '#5a3a40', leafColour: '#d2509a', volume: ['#b23a82', '#e070b0', '#ffc2e0'], light: [1, -1], twig: 5 });
          cv.add(t.wood + t.leaves);
        }
        cv.add(flowerField(rnd, { kind: 'wild', y0: 520, y1: 600, count: 400, size: 5, colours: ['#ffffff', '#ffe27a', '#f7a8d0'], centre: '#ffd36a' }));
      });
      // the two trees we are under
      s.layer({ rim: { x: sun[0], y: sun[1], colour: '#fff4fa', width: 2.5, strength: 0.7, reach: 1000 } }, (cv) => {
        cv.add('<path d="M-20,600 C300,580 900,586 1300,600 L1300,740 L-20,740 Z" fill="#7cb45a"/>');
        for (const [x, h, lean] of [[220, 760, 0.22], [1130, 700, -0.18]]) {
          const t = tree(rnd, { x, y: 640, height: h, kind: 'oak', wood: '#3e2228', leafColour: '#c03a88', volume: ['#9a1e66', '#d6489a', '#ffb0d6'], light: [1, -1], lean, leafiness: 1.1 });
          cv.add(t.wood);
          // the blossom in sprays, not balls: its clumps broken up, the light through them
          rough(cv, t.leaves, { scale: 12, freq: 0.09, seed: s.seed() });
        }
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 650, count: 800, height: 34, colours: ['#5f9a44', '#72ae50', '#86c25c'], wind: 0.12, width: 2 }));
        cv.add(flowerField(rnd, { kind: 'wild', y0: 600, y1: 720, count: 200, size: 10, colours: ['#ffffff', '#ffe27a', '#f7a8d0'], centre: '#ffd36a' }));
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.72, strength: 1.3, decay: 0.975, density: 0.95, colour: '#fff4fa' });
      s.layer({ blur: 1.6 }, (cv) => {
        cv.add(petals(rnd, { count: 140, colours: ['#e070b0', '#ffa6d2', '#c03a88'], size: 5 }));
      });
      s.layer({ blur: 7 }, (cv) => {
        cv.add(branch(rnd, { x: 640, y: -40, angle: 3.3, length: 260, width: 18, wood: '#3e2228', blossom: ['#d6489a', '#ff9acc', '#c03a88'], centre: '#ffe0f0' }));
        cv.add(petals(rnd, { count: 12, colours: ['#e070b0', '#ffa6d2'], size: 20 }));
      });
      return s.done({
        bloom: { threshold: 0.78, strength: 0.5, radius: 32 },
        grade: { lift: [0.04, 0.03, 0.05], gain: [1.02, 0.98, 1.0], saturation: 1.05, contrast: 0.16, shadows: ['#3a1030', 0.3] },
        vignette: { strength: 0.25, colour: '#3a1a30' },
        grain: 0.013,
      });
    },
  },

  lalezar: {
    ku: 'Lalezar',
    en: 'Tulip field',
    // down among the mountain tulips: the far ones a red haze, the near ones out of focus, the peaks soft behind
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [1060, 220];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#76a4d8'], [0.5, '#c6dcef'], [0.8, '#f2e4e0'], [1, '#f8eee6']]);
        glow(cv, { x: sun[0], y: sun[1], r: 540, colour: '#fff6e6', opacity: 0.95 });
        clouds(cv, { y: 20, h: 280, freq: [0.005, 0.012], seed: s.seed(), colour: '#f6f2f2', light: '#ffffff', shade: '#a6b4cc', dx: 10, dy: -6, density: 3, cover: -1.6, opacity: 0.85, fade: [[0, 0], [0.4, 1], [1, 0]] });
      });
      s.layer({ blur: 2.2, haze: ['#e6e8f2', 0.55] }, (cv) => {
        range(cv, rnd, { base: 460, peaks: [{ x: 220, h: 200, s: 280 }, { x: 700, h: 240, s: 300 }, { x: 1180, h: 180, s: 260 }], fill: '#8698c0', shade: '#55668f', shadeOpacity: 0.35, snow: 300, snowShade: '#e2e8f4' });
      });
      s.layer({ blur: 1.2 }, (cv) => {
        cv.add('<path d="M-20,470 C300,452 800,460 1300,468 L1300,740 L-20,740 Z" fill="#86b462"/>');
        cv.add(flowerField(rnd, { kind: 'wild', y0: 468, y1: 520, count: 1800, size: 5, colours: ['#e0303c', '#c82a36', '#f0503a', '#d23a3a'], centre: '#e0303c' }));
      });
      s.layer({ blur: 0.4 }, (cv) => {
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 560, count: 900, height: 22, colours: ['#5f9a44', '#72ae50'], wind: 0.15, width: 1.4 }));
        cv.add(flowerField(rnd, { kind: 'tulip', y0: 505, y1: 590, count: 520, size: 9, colours: ['#d7263d', '#e8323f', '#c41e34', '#f04a3a'], dark: '#8e1028', stem: '#3f7a34' }));
      });
      s.layer({}, (cv) => {
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 680, count: 600, height: 50, colours: ['#4f8a3a', '#64a048', '#7ab858'], wind: 0.15, width: 2.4 }));
        cv.add(flowerField(rnd, { kind: 'tulip', y0: 580, y1: 680, count: 120, size: 22, colours: ['#d7263d', '#e8323f', '#c41e34', '#f04a3a'], dark: '#8e1028', stem: '#3f7a34' }));
      });
      s.layer({ blur: 8 }, (cv) => {
        cv.add(flowerField(rnd, { kind: 'tulip', y0: 640, y1: 760, count: 14, size: 60, colours: ['#d7263d', '#e8323f', '#f04a3a'], dark: '#8e1028', stem: '#3f7a34' }));
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.8, strength: 0.9, decay: 0.972, density: 0.9, colour: '#fff4e0' });
      return s.done({
        bloom: { threshold: 0.8, strength: 0.45, radius: 30 },
        grade: { lift: [0.03, 0.03, 0.04], gain: [1.02, 1, 0.97], saturation: 1.1, contrast: 0.18, shadows: ['#20301a', 0.3], highlights: ['#fff6ea', 0.2] },
        vignette: { strength: 0.25, colour: '#1a2010' },
        grain: 0.012,
      });
    },
  },

  zozan: {
    ku: 'Zozan',
    en: 'High pasture',
    // midsummer on the high pasture: lambs at play in a walnut's shade, the black tents and the flock beyond
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [980, 60];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#86b0da'], [0.6, '#d4e4ee'], [1, '#eef2e6']]);
        glow(cv, { x: sun[0], y: sun[1], r: 620, colour: '#fff8e0', opacity: 0.85 });
        clouds(cv, { y: 20, h: 260, freq: [0.006, 0.012], seed: s.seed(), colour: '#f4f2f2', light: '#ffffff', shade: '#a0aec4', dx: 10, dy: -8, density: 3.2, cover: -1.6, opacity: 0.8, fade: [[0, 0], [0.4, 1], [1, 0]] });
      });
      s.layer({ blur: 1.6, haze: ['#dce6ee', 0.5] }, (cv) => {
        range(cv, rnd, { base: 420, peaks: [{ x: 200, h: 200, s: 260 }, { x: 640, h: 240, s: 300 }, { x: 1100, h: 210, s: 260 }], fill: '#8494b8', shade: '#55668f', shadeOpacity: 0.38, snow: 262, snowShade: '#e2e8f4', light: 1 });
      });
      s.layer({ blur: 0.8, haze: ['#e8eee6', 0.25] }, (cv) => {
        cv.add('<path d="M-20,440 C300,420 800,428 1300,436 L1300,740 L-20,740 Z" fill="#a2c46e"/>');
        cv.add(tent({ x: 960, y: 452, w: 96, fill: '#1e1a1c' }) + tent({ x: 1076, y: 457, w: 74, fill: '#1e1a1c' }));
        for (let i = 0; i < 28; i++) cv.add(lamb(rnd, { x: between(rnd, 680, 1240), y: between(rnd, 466, 500), size: 9, wool: '#f6f2ea', shade: '#c8c0b0', facing: rnd() < 0.5 ? -1 : 1 }));
        cv.add(flowerField(rnd, { kind: 'wild', y0: 440, y1: 540, count: 400, size: 5, colours: ['#f0a030', '#ffd040', '#ffffff'], centre: '#ffe08a' }));
      });
      // the walnut: its shade on the grass, the light coming through it
      s.layer({}, (cv) => {
        cv.add('<ellipse cx="380" cy="612" rx="440" ry="72" fill="#557f36" fill-opacity="0.6"/>');
        const t = tree(rnd, { x: 330, y: 612, height: 600, kind: 'oak', wood: '#3e2e22', leafColour: '#2e5222', volume: ['#2e5222', '#4a7e30', '#9cc860'], light: [1, -1.1], leafiness: 1.25 });
        cv.add(t.wood);
        // the crown broken up into leaf, sky showing through its edges
        rough(cv, t.leaves, { scale: 14, freq: 0.07, seed: s.seed() });
      });
      s.layer({ blend: 'screen', blur: 10 }, (cv) => {
        beams(cv, { x: 780, y: -60, angle: -0.42, spread: 0.55, count: 6, length: 950, colour: '#fff6d0', opacity: 0.3, rnd });
      });
      s.layer({}, (cv) => {
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 650, count: 1000, height: 36, colours: ['#5f8f3e', '#6fa048', '#86b456', '#4f7e34'], wind: 0.12, width: 2.2 }));
        cv.add(flowerField(rnd, { kind: 'wild', y0: 560, y1: 720, count: 180, size: 11, colours: ['#f0a030', '#ffd040', '#ffffff'], centre: '#ffe08a' }));
        for (const [x, y, size, pose, facing] of [[250, 646, 74, 'stand', 1], [460, 632, 66, 'leap', -1], [600, 660, 70, 'stand', -1], [140, 668, 62, 'lie', 1], [760, 648, 58, 'stand', 1]]) {
          cv.add(lamb(rnd, { x, y, size, pose, facing, wool: '#fcf9f3', shade: '#d2c8b8', face: '#f0e0d4' }));
        }
      });
      s.effect('paint', { radius: 3 });
      return s.done({
        bloom: { threshold: 0.82, strength: 0.4, radius: 28, tint: '#fff2cc' },
        grade: { lift: [0.04, 0.04, 0.02], gain: [1.02, 1, 0.94], saturation: 1.02, contrast: 0.16, shadows: ['#20301a', 0.3], highlights: ['#fff6e0', 0.2] },
        vignette: { strength: 0.3, colour: '#202a14' },
        grain: 0.012,
      });
    },
  },

  bihar: {
    ku: 'Bihar',
    en: 'Spring',
    // spring in the orchards: almond trees in flower, row behind row up the terraces, a village above, snow on the peaks
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [260, 90];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#7aaee2'], [0.6, '#c8def2'], [1, '#eef3f0']]);
        glow(cv, { x: sun[0], y: sun[1], r: 600, colour: '#fffbea', opacity: 0.9 });
        clouds(cv, { y: 10, h: 280, freq: [0.006, 0.012], seed: s.seed(), colour: '#f6f4f6', light: '#ffffff', shade: '#a2b0c8', dx: -10, dy: -8, density: 3.2, cover: -1.6, opacity: 0.85, fade: [[0, 0], [0.4, 1], [1, 0]] });
      });
      s.layer({ blur: 1.4, haze: ['#dde8f2', 0.48] }, (cv) => {
        range(cv, rnd, { base: 400, peaks: [{ x: 300, h: 200, s: 280 }, { x: 760, h: 250, s: 300 }, { x: 1180, h: 210, s: 260 }], fill: '#7a8eb6', shade: '#4a5c8a', shadeOpacity: 0.4, snow: 270, snowShade: '#dfe6f2', light: -1 });
      });
      // the far hillside with its village, the terraces stepping down from it
      s.layer({ blur: 0.8, haze: ['#e4ecee', 0.32] }, (cv) => {
        cv.add('<path d="M-20,420 C300,396 700,404 1300,416 L1300,740 L-20,740 Z" fill="#8fbf66"/>');
        for (let i = 0; i < 9; i++) {
          const y = 430 + i * i * 4.2 + i * 6;
          cv.add(`<path d="M-20,${y} C300,${y - 12} 900,${y - 6} 1300,${y + 2}" stroke="#7aa852" stroke-width="${2 + i}" fill="none" stroke-opacity="0.7"/>`);
        }
        village(cv, rnd, { x: 860, y: 420, w: 240, rows: 3, house: 18, wall: '#e8dcc4', wallLit: '#f6ecd8', wallDark: '#b8a888', roof: '#9a8a6a', door: '#5a4a3a', light: -1, climb: 1, rise: 0.7 });
      });
      // the orchard: row behind row of almond in flower, smaller as they go back
      const rows = [[468, 70, 0.9], [500, 105, 0.7], [548, 160, 0.4], [620, 250, 0]];
      for (const [i, [y, h, hz]] of rows.entries()) {
        s.layer({ haze: hz ? ['#eef2f2', hz * 0.45] : null, blur: i < 2 ? 0.6 : 0, rim: i >= 2 ? { x: sun[0], y: sun[1], colour: '#fffaf0', width: 2, strength: 0.5, reach: 1300 } : null }, (cv) => {
          const step = h * 1.25;
          for (let x = -40 + between(rnd, 0, step * 0.5); x < 1340; x += step * between(rnd, 0.9, 1.15)) {
            const t = tree(rnd, { x, y: y + between(rnd, -4, 4), height: h * between(rnd, 0.85, 1.15), kind: 'walnut', wood: '#5a3e32', leafColour: '#e8cbd8', volume: ['#d4a6ba', '#f0d4e0', '#ffffff'], light: [-1, -0.9], leafiness: 1, twig: i < 2 ? 5 : 4 });
            cv.add(t.wood + t.leaves);
          }
          cv.add(grass(rnd, { x0: -30, x1: 1310, y: y + 6, count: 120 + i * 120, height: 8 + i * 6, colours: ['#6aa448', '#7cb456', '#8fc464'], wind: 0.1, width: 1 + i * 0.4 }));
        });
      }
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.8, strength: 1, decay: 0.972, density: 0.9, colour: '#fffbe8' });
      s.layer({}, (cv) => {
        cv.add(flowerField(rnd, { kind: 'daisy', y0: 640, y1: 720, count: 160, size: 14, colours: ['#ffffff', '#fff8e6'], centre: '#ffd36a', stem: '#4f8a3e' }));
      });
      s.layer({ blur: 1.6 }, (cv) => {
        cv.add(petals(rnd, { count: 80, colours: ['#ffffff', '#ffe6f0', '#f6c6d8'], size: 5 }));
      });
      s.layer({ blur: 6 }, (cv) => {
        cv.add(branch(rnd, { x: -30, y: 10, angle: 2.1, length: 440, width: 16, wood: '#3a2620', blossom: ['#ffffff', '#ffeef4', '#f8d6e2'], centre: '#e0909c' }));
      });
      return s.done({
        bloom: { threshold: 0.82, strength: 0.45, radius: 30 },
        grade: { lift: [0.03, 0.04, 0.04], gain: [1.01, 1.01, 0.98], saturation: 1.05, contrast: 0.16, shadows: ['#20301a', 0.3], highlights: ['#fffaf0', 0.2] },
        vignette: { strength: 0.28, colour: '#1a2414' },
        grain: 0.012,
      });
    },
  },

  'agire-newroze': {
    ku: 'Agirê Newrozê',
    en: 'Newroz fire',
    // Newroz night at Akre: the climbers' torches zig-zagging up the mountain to the fire at the top, the town lit
    // below, and in front a bonfire with a govend round it, every face and sash lit by it
    scene(rnd) {
      const s = new Scene(rnd);
      const flame = [640, 568];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#07040f'], [0.45, '#1e0a1e'], [0.8, '#4a1418'], [1, '#6a1e1a']]);
        cv.add(starfield(rnd, { y0: 0, y1: 260, count: 200, bright: 3 }));
      });
      let summit = [700, 170];
      let torchGlow = '';
      s.layer({ blur: 1 }, (cv) => {
        const pts = range(cv, rnd, { base: 470, peaks: [{ x: 700, h: 300, l: 420, r: 460, k: 1.1 }, { x: 160, h: 140, s: 260 }, { x: 1200, h: 170, s: 260 }], rough: 0.1, fill: '#1a0a14', foot: '#240c14', shade: '#0a0408', shadeOpacity: 0.4, gullies: 0.4, spurs: false });
        const yAt = (x) => {
          for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) return pts[i][1];
          return pts[pts.length - 1][1];
        };
        cv.add(hillTown(rnd, { x0: 300, x1: 1100, yAt: (x) => Math.max(yAt(x) + 120, 440), rows: 4, house: 16, fill: '#12060c', lights: '#ffc06a' }));
        const t = akreTorches(rnd, { x: 700, y: 430, top: yAt(700) + 8, width: 600, paths: 3 });
        summit = t.summit;
        torchGlow = t.glow;
        cv.add(t.dots);
      });
      // the torches and the fire on the summit, as light
      s.layer({ blur: 2.2, blend: 'screen' }, (cv) => {
        cv.add(torchGlow);
        glow(cv, { x: summit[0], y: summit[1], r: 70, colour: '#ff9a3a', opacity: 0.85 });
        cv.add(`<circle cx="${summit[0]}" cy="${summit[1] + 4}" r="5" fill="#fff0c0"/>`);
      });
      // smoke from a thousand torches over the town, lit from below
      s.layer({ scale: 2, blur: 4, blend: 'screen' }, (cv) => {
        noise(cv, { y: 300, h: 300, freq: [0.005, 0.01], seed: s.seed(), colour: '#ff6a2a', contrast: 2.4, bias: -1.1, opacity: 0.32, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      // the ground round the fire
      s.layer({}, (cv) => {
        cv.add('<path d="M-20,530 C300,518 900,518 1300,530 L1300,740 L-20,740 Z" fill="#140608"/>');
        const g = cv.id('ground');
        cv.def(`<radialGradient id="${g}" gradientUnits="userSpaceOnUse" cx="${flame[0]}" cy="${flame[1]}" r="560" gradientTransform="translate(0 ${flame[1] * 0.72}) scale(1 0.28)"><stop offset="0" stop-color="#ff8a3a" stop-opacity="0.75"/><stop offset="0.35" stop-color="#c8401a" stop-opacity="0.35"/><stop offset="1" stop-color="#c8401a" stop-opacity="0"/></radialGradient>`);
        cv.add(`<rect x="-20" y="516" width="1320" height="224" fill="url(#${g})"/>`);
      });
      // the govend on the far side of the fire, its colours warm in the firelight
      s.layer({ haze: ['#ff7a2a', 0.2], falloff: { x: flame[0], y: flame[1] - 40, r: 430, ambient: 0.16 }, rim: { x: flame[0], y: flame[1] - 60, colour: '#ffc070', width: 3, strength: 1, reach: 560 } }, (cv) => {
        govend(cv, rnd, { x: 640, y: 548, count: 13, size: 98, step: 47, curve: 18, dress: ['#c8262a', '#2a8a4a', '#d89a1e', '#3a56b8', '#b83a8a'], vest: ['#3a0e20', '#1a2048', '#3a1c0c'], clothes: ['#5a4432', '#433e4e', '#54462f'], sash: ['#c8382a', '#d8a02a', '#2a7a44'], turban: ['#e4dccc', '#2a2424'], skin: '#c48a64', hair: '#160e0a', headscarf: '#f2e8d6', klash: '#d8ccb4', scarf: '#e8322f' });
      });
      // the bonfire: the logs and the embers they lie in, then the flames as light, and its glow over everything
      const f = fire(rnd, { x: flame[0], y: flame[1], w: 170, h: 236, wind: 0.08, tongues: 13 });
      s.layer({}, (cv) => cv.add(f.logs));
      s.layer({ blur: 1.1, blend: 'screen' }, (cv) => rough(cv, f.flames, { scale: 9, freq: 0.035, seed: s.seed() }));
      s.layer({ blend: 'screen' }, (cv) => {
        glow(cv, { x: flame[0], y: flame[1] - 90, r: 420, colour: '#ff6a1a', opacity: 0.4 });
        glow(cv, { x: flame[0], y: flame[1] - 70, r: 150, colour: '#ffc060', opacity: 0.55 });
      });
      s.layer({ blur: 0.6, blend: 'screen' }, (cv) => {
        cv.add(embers(rnd, { x: flame[0], y: flame[1] - 150, rise: 430, spread: 70, count: 170, wind: 0.22, colours: ['#ffd36a', '#ff9a3a', '#fff0c0', '#ff6a2a'] }));
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
    // the citadel of Hewlêr on its mound, alone on the plain under a burning sky
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [660, 430];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#4a0a16'], [0.45, '#a8222e'], [0.75, '#e4483e'], [1, '#ff7a4e']]);
        glow(cv, { x: sun[0], y: sun[1], r: 560, colour: '#ffb07a', opacity: 0.7 });
        clouds(cv, { y: 0, h: 420, freq: [0.004, 0.009], seed: s.seed(), colour: '#6a0e1e', light: '#ffa08a', shade: '#24030a', dx: 0, dy: 16, density: 3.2, cover: -1.25, opacity: 0.95, fade: [[0, 1], [0.7, 0.9], [1, 0]] });
      });
      s.layer({ blur: 1.4, haze: ['#d24a40', 0.62] }, (cv) => {
        range(cv, rnd, { base: 470, peaks: [{ x: 160, h: 80, s: 300 }, { x: 980, h: 120, s: 380 }, { x: 1260, h: 90, s: 240 }], rough: 0.14, fill: '#000', shade: '#000', shadeOpacity: 0, gullies: 0 });
      });
      s.layer({ rim: { x: sun[0], y: sun[1], colour: '#ffb08a', width: 2.5, strength: 0.9, reach: 800 } }, (cv) => {
        cv.add('<path d="M-20,482 C300,474 900,476 1300,480 L1300,740 L-20,740 Z" fill="#2a0610"/>');
        cv.add(citadel(rnd, { x: 640, y: 492, w: 760, fill: '#1c0309', lights: '#ffc080' }));
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.55, strength: 1.4, decay: 0.975, density: 0.95, colour: '#ffb08a' });
      s.layer({}, (cv) => {
        wash(cv, { y0: 480, y1: 720, colour: '#14020a', from: 0.2, to: 0.9 });
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 660, count: 1300, height: 56, colours: ['#2a0610', '#3a0a16', '#521020'], wind: 0.3, width: 1.8 }));
      });
      return s.done({
        bloom: { threshold: 0.62, strength: 0.45, radius: 28 },
        grade: { mono: ['#12020a', '#ff9a86', 0.55], lift: [0.03, 0, 0.01], gain: [1.06, 0.92, 0.92], saturation: 1.12, contrast: 0.3 },
        vignette: { strength: 0.5, colour: '#0a0104' },
        grain: 0.028,
      });
    },
  },

  'seva-sor': {
    ku: 'Şeva Sor',
    en: 'Red night',
    // Amêdî on its cliff-top at night, a great red moon rising behind the minaret, the valley full of mist
    scene(rnd) {
      const s = new Scene(rnd);
      const moonAt = [700, 270];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#07030a'], [0.6, '#22060e'], [1, '#4a0e16']]);
        cv.add(starfield(rnd, { y0: 0, y1: 320, count: 300, bright: 5, colours: ['#ffffff', '#ffe0d0'] }));
        moon(cv, { x: moonAt[0], y: moonAt[1], r: 112, core: '#ff9a5a', edge: '#c8382a', sea: '#a8301e', halo: '#ff4a2a', haloR: 560, haloOpacity: 0.55, seed: s.seed() });
      });
      s.layer({ blur: 1.6, haze: ['#5a1018', 0.55] }, (cv) => {
        range(cv, rnd, { base: 520, peaks: [{ x: 140, h: 200, s: 280 }, { x: 1180, h: 230, s: 300 }], fill: '#000', shade: '#000', shadeOpacity: 0, gullies: 0 });
      });
      s.layer({ rim: { x: moonAt[0], y: moonAt[1], colour: '#ff9a6a', width: 2.5, strength: 0.9, reach: 700 } }, (cv) => {
        cv.add(amedi(rnd, { x: 640, y: 620, w: 600, fill: '#0e0306', lights: '#ffc06a' }));
      });
      s.layer({ scale: 2, blur: 4 }, (cv) => {
        noise(cv, { y: 470, h: 230, freq: [0.006, 0.012], seed: s.seed(), colour: '#8a2028', contrast: 2.4, bias: -0.75, opacity: 0.85, fade: [[0, 0], [0.45, 1], [1, 0.7]] });
      });
      s.layer({}, (cv) => {
        cv.add('<path d="M-20,650 C300,630 900,636 1300,650 L1300,740 L-20,740 Z" fill="#0a0204"/>');
        cv.add(stand(rnd, { x0: -40, x1: 1320, y: 660, count: 14, height: 120, kind: 'oak', colour: '#0a0204', twig: 5 }));
      });
      return s.done({
        bloom: { threshold: 0.55, strength: 0.6, radius: 26, tint: '#ff9a7a' },
        grade: { lift: [0.02, 0, 0.01], gain: [1.05, 0.9, 0.88], saturation: 1.1, contrast: 0.25, shadows: ['#100204', 0.5] },
        vignette: { strength: 0.55, colour: '#050102' },
        grain: 0.02,
      });
    },
  },

  newroz: {
    ku: 'Rengên Newrozê',
    en: 'The colours of Newroz',
    // Newroz morning: the sun just up over the hills, its light through the govend dancing on the crest in all its colours
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [250, 400];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#b0262e'], [0.3, '#e2562c'], [0.55, '#ff983a'], [0.76, '#ffd27a'], [1, '#ffeec0']]);
        clouds(cv, { y: 30, h: 280, freq: [0.0045, 0.012], seed: s.seed(), colour: '#ee8a5c', light: '#ffe8b8', shade: '#a2404a', dx: -10, dy: 8, density: 3, cover: -1.6, opacity: 0.7, fade: [[0, 0], [0.4, 1], [1, 0]] });
        orb(cv, { x: sun[0], y: sun[1], r: 44, core: '#fffdf0', edge: '#fff0a8', halo: '#ffd060', haloR: 700, haloOpacity: 0.95 });
        birds(cv, rnd, { x: 560, y: 190, count: 7, size: 7, colour: '#6a2a2a', spread: 90 });
      });
      // the sun's twenty-one rays, as light
      s.layer({ blur: 6, blend: 'screen' }, (cv) => {
        const beams = [];
        for (let i = 0; i < 21; i++) {
          const a = (i / 21) * Math.PI * 2 - Math.PI / 2;
          const at = (r, da) => `${n(sun[0] + Math.cos(a + da) * r)},${n(sun[1] + Math.sin(a + da) * r)}`;
          beams.push(`M${at(56, -0.03)} L${at(1500, -0.024)} L${at(1500, 0.024)} L${at(56, 0.03)} Z`);
        }
        const g = cv.id('beams');
        cv.def(`<radialGradient id="${g}" gradientUnits="userSpaceOnUse" cx="${sun[0]}" cy="${sun[1]}" r="1000"><stop offset="0" stop-color="#fff4c0" stop-opacity="0.55"/><stop offset="0.35" stop-color="#ffe08a" stop-opacity="0.2"/><stop offset="1" stop-color="#ffd060" stop-opacity="0"/></radialGradient>`);
        cv.add(`<path d="${beams.join(' ')}" fill="url(#${g})"/>`);
      });
      // hills going back into the morning haze
      s.layer({ blur: 2.2, haze: ['#ffcf8a', 0.72] }, (cv) => {
        range(cv, rnd, { base: 470, peaks: [{ x: 640, h: 120, s: 380 }, { x: 1110, h: 160, s: 320 }], rough: 0.1, fill: '#5a7a4a', shade: '#2a4a2a', shadeOpacity: 0.3, gullies: 0.2, light: -1, spurs: false });
      });
      s.layer({ blur: 1.4, haze: ['#ffd090', 0.5] }, (cv) => {
        cv.add('<path d="M-20,505 C160,474 380,466 560,480 C760,496 980,472 1300,488 L1300,740 L-20,740 Z" fill="#4a8a3e"/>');
      });
      // the crest, and the govend on it
      s.layer({ blur: 0.4, haze: ['#ff9a4a', 0.12], rim: { x: sun[0], y: sun[1], colour: '#fff2b0', width: 4, strength: 1.2, reach: 1300 } }, (cv) => {
        const g = cv.id('crest');
        cv.def(`<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5aa848"/><stop offset="1" stop-color="#2f7a36"/></linearGradient>`);
        cv.add(`<path d="M-20,566 C180,532 420,510 700,512 C960,514 1140,530 1300,542 L1300,740 L-20,740 Z" fill="url(#${g})"/>`);
        govend(cv, rnd, { x: 800, y: 520, count: 11, size: 132, step: 57, curve: 4, dress: ['#e0262c', '#2a9a48', '#f0b02a', '#8a3ab8', '#2f6ad0', '#e04a8a'], vest: ['#3a0e24', '#14204a', '#0e3a2a', '#2a1a08'], clothes: ['#5a4632', '#46404e', '#3e4a3a', '#6a5a42'], sash: ['#d8282a', '#f0b42a', '#2a8a4a', '#ece4d4'], headscarf: ['#f6eee0', '#f0d24a', '#f6eee0', '#f08aa8'], skin: '#c88a62', light: -1, contrast: 0.5, shadow: { colour: '#14400f', opacity: 0.4, reach: 1.1 } });
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.72, strength: 1.25, decay: 0.975, density: 0.95, colour: '#fff0b0' });
      // spring at our feet: grass and flowers, the nearest out of focus
      s.layer({}, (cv) => {
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 650, count: 900, height: 36, colours: ['#2a7a36', '#3a9a46', '#4cae52'], wind: 0.15, width: 2.2 }));
        cv.add(flowerField(rnd, { kind: 'wild', y0: 575, y1: 720, count: 240, size: 11, colours: ['#ffffff', '#ffd23a', '#e8322f'], centre: '#ffe08a' }));
      });
      s.layer({ blur: 5 }, (cv) => {
        cv.add(flowerField(rnd, { kind: 'tulip', y0: 690, y1: 780, count: 26, size: 46, colours: ['#e8322f', '#f04a2a', '#ffcf3a'], stem: '#2a6a2e' }));
      });
      return s.done({
        bloom: { threshold: 0.72, strength: 0.55, radius: 30, tint: '#ffe0a0' },
        grade: { lift: [0.04, 0.02, 0.01], gain: [1.03, 0.99, 0.92], saturation: 1.1, contrast: 0.2, shadows: ['#2a1008', 0.35] },
        vignette: { strength: 0.35, colour: '#2a0a04' },
        grain: 0.012,
      });
    },
  },
};

/** Kilim palettes: ground, outlining wool, undyed wool, and the dyes; and the layout each is woven in. */
const KILIMS = [
  ['kilima-sor', 'Kilîma Sor', 'Red kilim', 'guls', { field: '#a3202c', ink: '#2a1418', light: '#f1e2c4', dyes: ['#e9a93a', '#1f4f8a', '#2f7a4a', '#f4d27a'] }],
  ['kilima-mor', 'Kilîma Mor', 'Purple kilim', 'bands', { field: '#4d2a6e', ink: '#1c0f29', light: '#efe1cf', dyes: ['#d24d6a', '#e9b23a', '#7fb0d8', '#c08ad9'] }],
  ['kilima-zer', 'Kilîma Zer', 'Gold kilim', 'lattice', { field: '#d39a2c', ink: '#3a2414', light: '#f6ead0', dyes: ['#a3202c', '#1f4f8a', '#2f6e44', '#7a3b1c'] }],
  ['kilima-kesk', 'Kilîma Kesk', 'Green kilim', 'guls', { field: '#245c3e', ink: '#10261a', light: '#f0e6cc', dyes: ['#c8323c', '#e9b23a', '#f3d9a4', '#9a5ab0'] }],
  ['kilima-sin', 'Kilîma Şîn', 'Blue kilim', 'bands', { field: '#1d3b72', ink: '#0d1830', light: '#ede4d0', dyes: ['#c8323c', '#e9a93a', '#7ec2c6', '#f2d27a'] }],
  ['kilima-gulan', 'Kilîma Gulan', 'Rose kilim', 'lattice', { field: '#b8506a', ink: '#3a1420', light: '#f8e8dc', dyes: ['#2f6e5a', '#f0b84a', '#5a2c6e', '#f5c6cf'] }],
  ['kilima-seve', 'Kilîma Şevê', 'Night kilim', 'guls', { field: '#1c1a2a', ink: '#0a0910', light: '#d9d2c4', dyes: ['#8a2a3a', '#c79a3a', '#3e6a8a', '#6b4a8a'] }],
];

for (const [key, ku, en, layout, palette] of KILIMS) {
  SCENES[key] = {
    ku,
    en,
    // a kilim, woven cell by cell, lying in soft light with the folds it was kept in
    scene(rnd) {
      const s = new Scene(rnd);
      s.layer({}, (cv) => kilim(cv, rnd, { ...palette, layout }));
      s.layer({ blur: 26 }, (cv) => {
        // folds: broad bands a little lighter and darker, across the weave
        for (let i = 0; i < 4; i++) {
          const x = between(rnd, -200, 1100);
          const w = between(rnd, 160, 340);
          const a = between(rnd, -0.25, 0.25);
          cv.add(`<g transform="rotate(${(a * 57.3).toFixed(1)} ${(x + w / 2).toFixed(1)} 360)"><rect x="${x.toFixed(1)}" y="-200" width="${(w * 0.5).toFixed(1)}" height="1120" fill="#ffffff" fill-opacity="0.07"/><rect x="${(x + w * 0.5).toFixed(1)}" y="-200" width="${(w * 0.5).toFixed(1)}" height="1120" fill="#000000" fill-opacity="0.12"/></g>`);
        }
      });
      return s.done({
        grade: { saturation: 1.02, contrast: 0.08 },
        vignette: { strength: 0.4, colour: '#000000', inner: 0.35 },
        grain: 0.02,
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
