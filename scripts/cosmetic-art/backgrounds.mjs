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
import { deer, lamb } from './figures.mjs';
import { aurora, birds, heightAt, range, ridge, village } from './landscape.mjs';
import { kilim } from './kilim.mjs';
import { akreTorches, amedi, citadel, delal, hewraman, ishakPasha, tent } from './places.mjs';
import { branch, clouds, embers, fire, flower, flowerField, glow, grass, motes, moon, noise, orb, petals, pine, reeds, silhouette, sky, starfield, tallGrass, tree } from './nature.mjs';

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
    // what is drawn past the edges and cut back, for clouds' filters (see nature.mjs `clouds`)
    if (cv.bleed) opts = { ...opts, bleed: cv.bleed };
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
      s.terrain({ blur: 1.6, haze: ['#f6c47e', 0.72] }, { base: 456, peaks: [{ x: 160, h: 120, l: 220, r: 300 }, { x: 560, h: 90, s: 240 }, { x: 1180, h: 140, l: 300, r: 240 }], rough: 0.2, lit: '#c08850', shadow: '#4a2a1a', light: [-0.5, -0.4, -0.3], ambient: 0.4, ribs: 5 });
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
      // reeds at the water's edge in front of us, the low sun through their plumes
      const glowRim = { x: 905, y: 372, colour: '#ffe2a0', width: 2.5, strength: 1, reach: 1500 };
      const r = reeds(rnd, { x0: 800, x1: 1320, y: 760, count: 34, height: 330, stem: '#24150a', plume: '#ffd286', wind: -0.16, plumeSize: 1.1 });
      const l = reeds(rnd, { x0: -40, x1: 240, y: 760, count: 18, height: 290, stem: '#24150a', plume: '#ffd286', wind: 0.12 });
      s.layer({ blur: 0.5, rim: glowRim }, (cv) => cv.add(r.stems + l.stems));
      // (the plumes soft, the light coming through them)
      s.layer({ blur: 1.1, rim: { ...glowRim, width: 1.5 } }, (cv) => cv.add(r.plumes + l.plumes));
      // and nearer still, out of focus
      s.layer({ blur: 7, rim: { ...glowRim, width: 5 } }, (cv) => {
        const r = reeds(rnd, { x0: 1060, x1: 1340, y: 790, count: 9, height: 520, stem: '#1c1108', plume: '#f0b860', wind: -0.2, plumeSize: 1.2 });
        const l = reeds(rnd, { x0: -60, x1: 120, y: 790, count: 5, height: 460, stem: '#1c1108', plume: '#f0b860', wind: 0.14 });
        cv.add(r.stems + r.plumes + l.stems + l.plumes);
      });
      s.layer({ blur: 0.6, blend: 'screen', opacity: 0.9 }, (cv) => {
        cv.add(motes(rnd, { x0: 560, x1: 1280, y0: 160, y1: 520, count: 160, size: 1.7, colours: ['#fff4d0', '#ffe2a0'] }));
      });
      return s.done({
        bloom: { threshold: 0.7, strength: 0.62, radius: 32, tint: '#ffd9a0' },
        diffuse: { radius: 18, strength: 0.25, soften: 0.08 },
        streaks: { threshold: 0.86, strength: 0.55, length: 460, tint: '#ffcf80' },
        grade: { lift: [0.05, 0.03, 0], gain: [1.03, 0.96, 0.82], gamma: [1.05, 1, 0.9], saturation: 1.08, contrast: 0.28, shadows: ['#3a1e0c', 0.5] },
        vignette: { strength: 0.5, colour: '#1a0d05' },
        grain: 0.018,
        clumps: 0.012,
      });
    },
  },

  hevalo: {
    ku: 'Hevalo',
    en: 'Hevalo violet',
    // a violet wood at dusk, row behind row of trees going into the haze; light breaking through, and Hevalo
    // standing in it
    scene(rnd) {
      const s = new Scene(rnd);
      s.layer({}, (cv) => {
        sky(cv, [[0, '#3b1d5e'], [0.4, '#7a3f9e'], [0.75, '#c27ab8'], [1, '#e7a8c4']]);
        glow(cv, { x: 820, y: 250, r: 560, colour: '#ffd6f0', opacity: 0.95 });
        glow(cv, { x: 820, y: 250, r: 150, colour: '#ffffff', opacity: 0.95 });
      });
      // the wood: row behind row going into the violet haze, every crown lit on the side toward the light
      const wood = (x0, x1, y, count, height, kind, twig, clump) => {
        const list = [];
        for (let i = 0; i < count; i++) list.push([between(rnd, x0, x1), y + between(rnd, -6, 6), height * between(rnd, 0.75, 1.15)]);
        list.sort((a, b) => a[2] - b[2]);
        let trunks = '';
        let crowns = '';
        for (const [x, yy, h] of list) {
          const t = tree(rnd, { x, y: yy, height: h, kind, wood: '#1e0e2a', leafColour: '#3a1a4e', volume: ['#24102e', '#5a2a74', '#b064c0'], light: [(820 - x) / 600, -0.8], leafiness: 0.9, twig, clump });
          trunks += t.wood;
          crowns += t.leaves;
        }
        return [trunks, crowns];
      };
      s.layer({ blur: 3, haze: ['#d79ad6', 0.7] }, (cv) => {
        const [trunks, crowns] = wood(-60, 1340, 545, 26, 380, 'oak', 9, 1.6);
        cv.add(trunks);
        rough(cv, crowns, { scale: 6, freq: 0.06, seed: s.seed() });
      });
      s.layer({ scale: 2, blur: 4 }, (cv) => {
        noise(cv, { y: 380, h: 220, freq: [0.003, 0.01], seed: s.seed(), colour: '#e4b4e4', contrast: 2.2, bias: -0.8, opacity: 0.7, fade: [[0, 0], [0.5, 1], [1, 0.4]] });
      });
      // the clearing's floor, the light pooled in the middle of it
      const ground = (x) => 545 - 6 * Math.sin((x / 1280) * Math.PI);
      s.terrain({ falloff: { x: 700, y: 560, r: 620, ambient: 0.35, squash: 0.45, power: 1.3 } }, { base: 545, line: ground, peaks: [{ x: 820, h: 0, s: 900 }], lit: '#6a3a86', shadow: '#1a0a26', light: [0.3, -0.6, 0.7], grassy: 0.6, blade: 3, wind: 0.1, relief: 0.5, ambient: 0.3 });
      s.layer({ blur: 1, haze: ['#9f63b8', 0.26], rim: { x: 820, y: 250, colour: '#ffc6f2', width: 4, strength: 0.8 } }, (cv) => {
        const [lt, lc] = wood(-80, 470, 565, 6, 560, 'walnut', 5, 1);
        const [rt, rc] = wood(1050, 1360, 565, 5, 560, 'walnut', 5, 1);
        cv.add(lt + rt);
        rough(cv, lc + rc, { scale: 9, freq: 0.05, seed: s.seed() });
      });
      s.effect('rays', { x: 820, y: 250, threshold: 0.48, strength: 1.8, decay: 0.978, density: 0.98, colour: '#ffd0f4' });
      // the clearing: soft light on the grass, mossy stones, and the deer in the light
      s.layer({}, (cv) => {
        glow(cv, { x: 690, y: 548, r: 330, colour: '#f7b8e8', opacity: 0.5 });
      });
      s.layer({ rim: { x: 820, y: 250, colour: '#ffd6f6', width: 2.5, strength: 1 } }, (cv) => {
        cv.add('<path d="M480,566 C500,540 560,534 610,548 C630,556 628,568 600,572 Z" fill="#3a1f4a"/><path d="M790,574 C800,556 850,552 880,564 C886,572 870,578 840,578 Z" fill="#3a1f4a"/>');
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 566, count: 900, height: 34, colours: ['#2a1438', '#3a1d4c', '#4c2a60'], wind: 0.1, width: 2.4 }));
        cv.add(flowerField(rnd, { kind: 'wild', y0: 566, y1: 720, count: 150, size: 10, colours: ['#ffb3e6', '#f08ad0', '#ffffff'], centre: '#ffe08a' }));
      });
      // brushwork over the wood and the clearing, before Hevalo steps into it, sharp
      s.effect('texture', { amount: 0.09, cells: [60, 18, 6], seed: s.seed() });
      s.effect('paint', { radius: 4 });
      s.layer({ rim: { x: 820, y: 250, colour: '#ffd6f6', width: 2.5, strength: 1 } }, (cv) => {
        cv.add(deer({ x: 700, y: 556, size: 104, colour: '#21102e', pose: 'alert', facing: -1 }));
        cv.add(grass(rnd, { x0: 560, x1: 840, y: 562, count: 170, height: 18, colours: ['#2a1438', '#3a1d4c'], wind: 0.1, width: 2 }));
      });
      s.layer({ blur: 7 }, (cv) => {
        cv.add('<path d="M-10,-10 L64,-10 C74,240 86,500 104,740 L-10,740 Z" fill="#12061c"/><path d="M1216,-10 L1290,-10 L1290,740 L1176,740 C1194,500 1206,240 1216,-10 Z" fill="#12061c"/>');
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 736, count: 110, height: 90, colours: ['#12061c'], wind: 0.1, width: 6 }));
      });
      s.layer({ blur: 0.8, blend: 'screen' }, (cv) => {
        cv.add(motes(rnd, { x0: 300, x1: 1200, y0: 120, y1: 560, count: 190, size: 2, colours: ['#ffe6fa', '#ffc6ee', '#ffffff'] }));
      });
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
    // dawn over the Zagros: ridge behind ridge going back into the mist that lies in the valleys, oaks along
    // their crests, the sun a pale disc through it, birds crossing
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [930, 220];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#9fb0c8'], [0.45, '#e0dcdc'], [0.75, '#f4e4d4'], [1, '#f0dccc']]);
        glow(cv, { x: sun[0], y: sun[1], r: 520, colour: '#fff4e0', opacity: 0.9 });
        cv.add(`<circle cx="${sun[0]}" cy="${sun[1]}" r="34" fill="#fffaf0" fill-opacity="0.9"/>`);
      });
      // the ridges, far to near: each darker and sharper than the one behind, mist pooled in the valley before it
      const ridges = [
        { base: 330, peaks: [{ x: 160, h: 70, s: 300 }, { x: 640, h: 90, s: 320 }, { x: 1100, h: 60, s: 280 }], colour: '#b8bccb', blur: 2.4, trees: 0 },
        { base: 390, peaks: [{ x: 360, h: 90, s: 320 }, { x: 900, h: 70, s: 300 }], colour: '#9ea4b8', blur: 1.8, trees: 260 },
        { base: 450, peaks: [{ x: 120, h: 100, s: 300 }, { x: 760, h: 80, s: 360 }, { x: 1240, h: 110, s: 300 }], colour: '#7e8698', blur: 1.2, trees: 300 },
        { base: 520, peaks: [{ x: 460, h: 110, s: 360 }, { x: 1060, h: 90, s: 320 }], colour: '#5c6476', blur: 0.7, trees: 320 },
        { base: 610, peaks: [{ x: 180, h: 130, s: 380 }, { x: 980, h: 120, s: 420 }], colour: '#363c4a', blur: 0.3, trees: 340 },
      ];
      for (const [i, r] of ridges.entries()) {
        s.layer({ blur: r.blur }, (cv) => {
          const pts = range(cv, rnd, { base: r.base, peaks: r.peaks, rough: 0.12, scale: 70, fill: r.colour, shade: r.colour, shadeOpacity: 0, gullies: 0, spurs: false });
          if (r.trees) {
            // oaks along the crest, small with distance
            const crowns = [];
            for (let k = 0; k < r.trees; k++) {
              const x = between(rnd, -20, 1300);
              const h = (4 + i * 2.6) * between(rnd, 0.6, 1.4);
              // most on the crest, some a little down the slope in front of it
              const y = heightAt(pts, x) + 2 + rnd() ** 2 * h * 3;
              crowns.push(`<ellipse cx="${n(x)}" cy="${n(y - h * 0.5)}" rx="${n(h * 0.6)}" ry="${n(h * 0.5)}"/>`);
            }
            rough(cv, `<g fill="${r.colour}">${crowns.join('')}</g>`, { scale: 2 + i * 0.8, freq: 0.2, seed: s.seed() });
          }
        });
        // mist lying in the valley in front of this ridge
        s.layer({ scale: 2, blur: 4 }, (cv) => {
          noise(cv, { y: r.base - 40, h: 120, freq: [0.0035, 0.03], seed: s.seed(), colour: i < 3 ? '#f2ece8' : '#e8e8ee', contrast: 2.4, bias: -0.7, opacity: 0.85 - i * 0.08, fade: [[0, 0], [0.5, 1], [1, 0]] });
        });
      }
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.8, strength: 1, decay: 0.975, density: 0.9, colour: '#fff4e0' });
      s.layer({}, (cv) => {
        birds(cv, rnd, { x: 640, y: 170, count: 6, size: 7, colour: '#4a5060', spread: 110 });
      });
      // close in front of us, a branch of wild almond in flower reaching in from the left, as sharp as the mist
      // is soft — the way an ink painter would set a spray of blossom against the far hills
      s.layer({ rim: { x: sun[0], y: sun[1], colour: '#fff6ec', width: 2, strength: 0.6, reach: 1600 } }, (cv) => {
        cv.add(branch(rnd, { x: -30, y: 250, angle: 1.72, length: 640, width: 15, wood: '#26242a', blossom: ['#ffffff', '#fdeef2', '#f6d2dc', '#fbe2ea'], centre: '#c8506a', bud: '#e88aa0' }));
      });
      s.layer({ blur: 1.2 }, (cv) => {
        cv.add(petals(rnd, { count: 26, colours: ['#ffffff', '#fbe2ea', '#f6d2dc'], size: 4, x0: 120, x1: 900, y0: 160, y1: 620 }));
      });
      return s.done({
        bloom: { threshold: 0.78, strength: 0.45, radius: 34, tint: '#fff0dc' },
        grade: { lift: [0.03, 0.03, 0.05], gain: [1.02, 1, 0.98], saturation: 0.85, contrast: 0.14, shadows: ['#2a3040', 0.3], highlights: ['#fff4e8', 0.2] },
        vignette: { strength: 0.25, colour: '#3a4250' },
        grain: 0.014,
      });
    },
  },

  'seva-zozanan': {
    ku: 'Şeva Zozanan',
    en: 'Night on the high pastures',
    // blue hour on the summer pastures: fog coming down over the meadow, lupins in flower to the knee, and the
    // black tents beyond with their lamps lit inside, warm in all the blue
    scene(rnd) {
      const s = new Scene(rnd);
      const light = [0.5, -0.6, 0.6];
      const fog = '#7a8cc4';
      s.layer({}, (cv) => {
        sky(cv, [[0, '#0d1838'], [0.45, '#22346a'], [0.8, '#4a5f9a'], [1, '#6a7cb4']]);
        cv.add(starfield(rnd, { y0: 0, y1: 300, count: 220, bright: 4 }));
      });
      s.terrain({ blur: 1.6, haze: ['#6274ac', 0.5] }, { base: 400, peaks: [{ x: 260, h: 210, l: 260, r: 300 }, { x: 760, h: 250, s: 300 }, { x: 1200, h: 200, s: 260 }], rough: 0.2, lit: '#5a6aa2', shadow: '#141c42', snowline: 270, snowLit: '#d0dcf8', snowShadow: '#6e7eb8', foot: '#34447a', footFrom: 340, light: [0.7, -0.5, 0.5] });
      s.layer({ scale: 2, blur: 4 }, (cv) => {
        noise(cv, { y: 330, h: 170, freq: [0.003, 0.02], seed: s.seed(), colour: '#8a9ad0', contrast: 2.6, bias: -0.9, opacity: 0.8, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      // the meadow
      const ground = (x) => 466 - 14 * Math.exp(-(((x - 640) / 420) ** 2)) + Math.max(0, x - 900) * 0.03;
      s.terrain({ blur: 0.6, haze: [fog, 0.3] }, { base: 466, line: ground, peaks: [{ x: 640, h: 0, s: 900 }], lit: '#3a5088', shadow: '#0c1430', foot: '#0e1634', footFrom: 600, light, grassy: 0.6, blade: 3, wind: 0.1, relief: 0.5, ambient: 0.3 });
      // the tents, lamps lit inside, the reed screens dim in the dusk
      s.layer({ blur: 0.6, haze: [fog, 0.2] }, (cv) => {
        for (const [x, w] of [[600, 124], [748, 96], [468, 84]]) {
          glow(cv, { x, y: ground(x) - w * 0.15, r: w * 1.6, colour: '#ffb35a', opacity: 0.45 });
          cv.add(tent({ x, y: ground(x) + 2, w, fill: '#0a0c18', lamp: '#ffc06a', screen: ['#3a3e58', '#6a2a3c', '#7a6a3a', '#7e82a0'] }));
        }
      });
      const blues = ['#4a5ac8', '#5e6ee0', '#7a68d8', '#3e4ab0', '#8a7ae8'];
      const band = (y0, y1, size, count, blur, hz) =>
        s.layer({ blur, haze: hz ? [fog, hz] : null }, (cv) => {
          for (const [x, y, t] of onGround(rnd, (x) => Math.max(ground(x), y0), count, { y1, bias: 1 })) cv.add(flower('spike', x, y, size * (0.7 + 0.6 * t), { petal: blues[Math.floor(rnd() * blues.length)], stem: '#16204a' }, rnd));
        });
      band(470, 530, 5, 900, 1, 0.5);
      // the fog coming down over the meadow
      s.layer({ scale: 2, blur: 4 }, (cv) => {
        noise(cv, { y: 430, h: 200, freq: [0.0028, 0.012], seed: s.seed(), colour: '#9aaada', contrast: 2.2, bias: -0.75, opacity: 0.75, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      band(510, 610, 11, 420, 0.5, 0.25);
      // the lupins in front of us, sharp
      s.layer({}, (cv) => {
        cv.add(tallGrass(rnd, { x0: -20, x1: 1300, y0: 590, y1: 740, count: 800, height: 44, colours: ['#16244a', '#1c2c58', '#22346a'], wind: 0.12, width: 2 }));
        for (const [x, y, t] of onGround(rnd, () => 586, 120, { y1: 736, bias: 0.9 })) cv.add(flower('spike', x, y, 18 + 14 * t, { petal: blues[Math.floor(rnd() * blues.length)], stem: '#141c40' }, rnd));
      });
      s.layer({ blur: 6 }, (cv) => {
        cv.add(flowerField(rnd, { kind: 'spike', y0: 680, y1: 770, count: 22, size: 40, colours: ['#3a46a8', '#5a52c0', '#6a5ad0'], stem: '#101838' }));
      });
      return s.done({
        bloom: { threshold: 0.62, strength: 0.6, radius: 26, tint: '#ffd09a' },
        diffuse: { radius: 18, strength: 0.24, soften: 0.08 },
        grade: { lift: [0.02, 0.03, 0.08], gain: [0.95, 0.98, 1.06], saturation: 1.05, contrast: 0.2, shadows: ['#0a1030', 0.5] },
        vignette: { strength: 0.45, colour: '#050818' },
        grain: 0.018,
        clumps: 0.012,
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
      // Agirî and Little Agirî, the dawn pink on their eastern snow, the western faces still blue
      s.terrain({ blur: 0.6, haze: ['#c9b4c8', 0.1] }, { base: 470, peaks: [{ x: 800, h: 330, l: 400, r: 460, k: 1.25 }, { x: 410, h: 178, s: 170, k: 1.1 }], rough: 0.05, scale: 70, lit: '#d8b4ae', shadow: '#363a68', snowline: 300, snowLit: '#fff0e6', snowShadow: '#b4aed0', foot: '#c4bed4', footFrom: 400, light: [0.75, -0.42, 0.55] });
      s.layer({ scale: 2, blur: 3 }, (cv) => {
        noise(cv, { y: 410, h: 120, freq: [0.003, 0.03], seed: s.seed(), colour: '#f6eef2', contrast: 2.8, bias: -0.9, opacity: 0.85, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      // the plain below, deep in snow, its drifts pink where the first light finds them and blue in their lee
      const plain = (x) => 506 - Math.max(0, x - 200) * 0.012 + Math.sin(x / 240) * 3;
      s.terrain({ blur: 0.4 }, { base: 506, line: plain, peaks: [{ x: 1500, h: 0, s: 1600 }], lit: '#f8eef0', shadow: '#76809e', foot: '#d8dcec', footFrom: 660, light: [0.75, -0.42, 0.55], grassy: 0.1, blade: 3, wind: 0.6, relief: 1.4, ambient: 0.45, dry: '#ffe2d2', dryness: 0.45 });
      // the spur and the palace on it, the dawn on its eastern faces
      s.layer({ rim: { x: sun[0], y: sun[1], colour: '#ffd8b4', width: 2.5, strength: 0.9, reach: 1300 } }, (cv) => {
        cv.add(ishakPasha({ x: 430, y: 512, w: 360, fill: '#3e3a58', rock: '#4a4764', lit: '#ffd59a', snow: '#e8ecf6' }));
      });
      // dry grass standing out of the snow in front of us
      s.layer({ blur: 0.8, rim: { x: sun[0], y: sun[1], colour: '#ffe2c8', width: 1.5, strength: 0.8, reach: 1600 } }, (cv) => {
        cv.add(tallGrass(rnd, { x0: -20, x1: 1300, y0: 620, y1: 760, count: 260, height: 54, colours: ['#8a6a50', '#9a7a58', '#6a5040'], heads: '#e8c8a0', share: 0.15, wind: 0.22, width: 1.6 }));
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
      s.layer({ blend: 'screen', blur: 0.8 }, (cv) => {
        aurora(cv, rnd, { y: 250, amp: 80, height: 240, colours: ['#3cf0a0', '#46c8ff', '#c06cff'], opacity: 0.9 });
      });
      s.terrain({ blur: 0.9 }, { base: 470, peaks: [{ x: 110, h: 190, l: 200, r: 250, k: 1.2 }, { x: 420, h: 130, s: 170 }, { x: 690, h: 276, l: 250, r: 220, k: 1.1 }, { x: 1000, h: 160, s: 190 }, { x: 1230, h: 226, l: 220, r: 200 }], rough: 0.2, lit: '#2a5a62', shadow: '#050f14', snowline: 352, snowLit: '#bff2e0', snowShadow: '#3a7478', foot: '#1a3c46', footFrom: 420, light: [-0.7, -0.5, 0.5], ambient: 0.2 });
      s.layer({ blur: 0.5 }, (cv) => {
        cv.add('<rect x="-10" y="464" width="1300" height="8" fill="#10262e"/>');
      });
      s.effect('reflect', { y: 470, deep: '#0a2028', near: 0.5, far: 0.85, ripple: 0.6, wave: 0.2, soften: 1.6, seed: s.seed() });
      s.layer({}, (cv) => {
        // snow drifting over the ice
        noise(cv, { y: 520, h: 200, freq: [0.006, 0.05], seed: s.seed(), colour: '#cfe8ea', contrast: 2.4, bias: -1.3, opacity: 0.4, fade: [[0, 0], [0.4, 1], [1, 1]] });
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
      s.terrain({ blur: 1.4, haze: ['#5a6a88', 0.45] }, { base: 460, peaks: [{ x: 300, h: 200, s: 260 }, { x: 760, h: 170, s: 300 }, { x: 1200, h: 210, s: 240 }], lit: '#46526e', shadow: '#0c1222', snowline: 304, snowLit: '#e2e8f4', snowShadow: '#76829e', foot: '#1c263a', footFrom: 380, light: [0.7, -0.5, 0.5] });
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
    // a summer night in the mountains with the whole galaxy overhead: its river of stars across the sky, green and
    // gold nebulae along it torn by dark lanes of dust, its heart low over the peaks; a lone oak, a lit tent below
    scene(rnd) {
      const s = new Scene(rnd);
      // the galaxy's band: a line falling to the right across the sky, its heart low on it
      const slope = 0.29;
      const band = (x) => 366 + (x - 640) * slope;
      const turn = (Math.atan(slope) * 180) / Math.PI;
      const heart = [1010, band(1010)];
      const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd() * 0.999)) * Math.cos(2 * Math.PI * rnd());
      s.layer({}, (cv) => {
        sky(cv, [[0, '#010405'], [0.55, '#03110f'], [1, '#08251e']]);
        // the band's own glow, and its heart
        cv.def(`<radialGradient id="mw" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#9adcc0" stop-opacity="0.3"/><stop offset="0.5" stop-color="#4a9a80" stop-opacity="0.12"/><stop offset="1" stop-color="#0a3a2a" stop-opacity="0"/></radialGradient>`);
        cv.add(`<ellipse cx="640" cy="${n(band(640))}" rx="980" ry="190" fill="url(#mw)" transform="rotate(${n(turn)} 640 ${n(band(640))})"/>`);
        glow(cv, { x: heart[0], y: heart[1], r: 360, colour: '#ffe2b4', opacity: 0.4 });
        // the nebulae: lit cloud along the band, green and gold
        clouds(cv, { x: -260, y: band(640) - 170, w: 1800, h: 340, freq: [0.0032, 0.009], seed: s.seed(), colour: '#2a8a66', light: '#c8ffe2', shade: '#041a12', dx: 5, dy: 8, density: 3, cover: -1.4, opacity: 0.8, rotate: turn, fade: [[0, 0], [0.5, 1], [1, 0]] });
        noise(cv, { x: -260, y: band(640) - 110, w: 1800, h: 220, freq: [0.006, 0.014], seed: s.seed(), colour: '#e8c890', contrast: 2.6, bias: -1.4, opacity: 0.45, rotate: turn, fade: [[0, 0], [0.5, 1], [1, 0]] });
        // and the dust lanes tearing through it
        noise(cv, { x: -260, y: band(640) - 70, w: 1800, h: 140, freq: [0.004, 0.02], seed: s.seed(), colour: '#010605', contrast: 4, bias: -1.7, opacity: 0.9, rotate: turn, fade: [[0, 0], [0.5, 1], [1, 0]] });
        // stars: everywhere, and crowded thick along the band
        cv.add(starfield(rnd, { y0: 0, y1: 560, count: 900, bright: 6, colours: ['#ffffff', '#fff1d0', '#d6fff0', '#ffd8b0'] }));
        const crowd = [];
        for (let i = 0; i < 2600; i++) {
          const x = between(rnd, -20, 1300);
          const y = band(x) + gauss() * 70;
          const r = between(rnd, 0.3, 0.8);
          crowd.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill-opacity="${n(between(rnd, 0.3, 0.95))}"/>`);
        }
        cv.add(`<g fill="#f4fff8">${crowd.join('')}</g>`);
      });
      // the mountains under it, black, just catching the starlight
      s.terrain({ blur: 1, haze: ['#0a241c', 0.3] }, { base: 548, peaks: [{ x: 160, h: 140, l: 240, r: 220 }, { x: 640, h: 170, s: 280 }, { x: 1160, h: 120, s: 250 }], rough: 0.2, lit: '#15302a', shadow: '#010403', light: [0.3, -0.6, 0.5], ambient: 0.3, ribs: 5 });
      s.layer({ rim: { x: heart[0], y: heart[1], colour: '#c8ffe4', width: 2, strength: 0.5, reach: 800 } }, (cv) => {
        cv.add('<path d="M-20,590 C240,556 520,540 760,546 C960,551 1120,564 1300,576 L1300,740 L-20,740 Z" fill="#020806"/>');
        rough(cv, silhouette(rnd, { x: 880, y: 552, height: 270, kind: 'oak', colour: '#020806' }), { scale: 4, freq: 0.14, seed: s.seed() });
        glow(cv, { x: 420, y: 548, r: 120, colour: '#ffb35a', opacity: 0.6 });
        cv.add(tent({ x: 420, y: 556, w: 70, fill: '#020806', lamp: '#ffc06a', screen: null }));
      });
      return s.done({
        bloom: { threshold: 0.5, strength: 0.7, radius: 20, tint: '#c8ffe4' },
        diffuse: { radius: 12, strength: 0.18, soften: 0.06 },
        grade: { lift: [0.01, 0.025, 0.02], gain: [0.96, 1.03, 1], saturation: 1.12, contrast: 0.26, shadows: ['#021a10', 0.4] },
        vignette: { strength: 0.5, colour: '#000604' },
        grain: 0.02,
        clumps: 0.012,
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
      s.terrain({ blur: 1.6, haze: ['#f2c2ac', 0.6] }, { base: 456, peaks: [{ x: 110, h: 200, l: 230, r: 280 }, { x: 470, h: 140, s: 240 }, { x: 900, h: 220, l: 320, r: 260 }, { x: 1260, h: 160, s: 220 }], rough: 0.2, lit: '#d8a8a8', shadow: '#5a4a72', light: [-0.2, -0.4, -0.5], ambient: 0.45, ribs: 5 });
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
    // a meadow of cosmos in a rose-coloured morning mist, the light white behind it: the far flowers a pink haze,
    // the near ones sharp, the nearest of all soft as breath; a wood standing faint in the mist beyond
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [760, 300];
      const light = [0.2, -0.5, 0.8];
      const mist = '#f6dce4';
      s.layer({}, (cv) => {
        sky(cv, [[0, '#ecc6d4'], [0.45, '#f8e4ea'], [1, '#f6dce2']]);
        glow(cv, { x: sun[0], y: sun[1], r: 640, colour: '#ffffff', opacity: 1 });
      });
      s.layer({ blur: 3.6, haze: [mist, 0.86] }, (cv) => {
        rough(cv, stand(rnd, { x0: -60, x1: 1340, y: 428, count: 26, height: 280, kind: 'slender', colour: '#3a2a34', needles: true }), { scale: 6, freq: 0.08, seed: s.seed() });
      });
      // the meadow, going back into the mist
      const ground = (x) => 424 + Math.sin(x / 300) * 4;
      s.terrain({ blur: 1.2, haze: [mist, 0.4] }, { base: 424, line: ground, peaks: [{ x: 640, h: 0, s: 2000 }], lit: '#b4c088', shadow: '#4a5a40', foot: '#6a7a52', footFrom: 640, light, grassy: 0.5, blade: 3, wind: 0.1, relief: 0.5, ambient: 0.45, dry: '#e8a8c0', dryness: 0.55 });
      const pinks = ['#ffd2e2', '#ffbcd4', '#ffffff', '#f7a2c2', '#fbe2ec', '#e888b0', '#e0649c'];
      const band = (y0, y1, size, count, blur, hz, bias = 1.2) =>
        s.layer({ blur, haze: hz ? [mist, hz] : null }, (cv) => {
          for (const [x, y, t] of onGround(rnd, () => y0, count, { y1, bias })) cv.add(flower('cosmos', x, y, size * (0.7 + 0.6 * t), { petal: pinks[Math.floor(rnd() * pinks.length)], centre: '#ffcf5a', stem: '#7a8a5a' }, rnd));
        });
      band(422, 490, 6, 1100, 1.6, 0.5);
      band(470, 570, 13, 460, 0.8, 0.22);
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.74, strength: 1.2, decay: 0.976, density: 0.95, colour: '#fff4f6' });
      // the flowers in focus, and their grass
      s.layer({ rim: { x: sun[0], y: sun[1], colour: '#fff4f8', width: 2, strength: 0.6, reach: 1200 } }, (cv) => {
        cv.add(tallGrass(rnd, { x0: -20, x1: 1300, y0: 556, y1: 740, count: 900, height: 46, colours: ['#6a7a4c', '#7a8a5a', '#566a40'], wind: 0.1, width: 2 }));
        for (const [x, y, t] of onGround(rnd, () => 552, 170, { y1: 736, bias: 0.9 })) cv.add(flower('cosmos', x, y, 22 + 18 * t, { petal: pinks[Math.floor(rnd() * pinks.length)], centre: '#ffcf5a', stem: '#6a7a4c' }, rnd));
      });
      // and right in front, out of focus
      s.layer({ blur: 10 }, (cv) => {
        cv.add(flowerField(rnd, { kind: 'cosmos', y0: 660, y1: 780, count: 12, size: 80, colours: ['#ffc8da', '#ffe0ea', '#f7a2c2'], centre: '#ffd88a', stem: '#7a8a5a' }));
      });
      s.layer({ blur: 0.8, blend: 'screen' }, (cv) => {
        cv.add(motes(rnd, { x0: 300, x1: 1200, y0: 150, y1: 560, count: 140, size: 1.8, colours: ['#ffffff', '#ffe6f0'] }));
      });
      return s.done({
        bloom: { threshold: 0.78, strength: 0.5, radius: 34 },
        diffuse: { radius: 24, strength: 0.34, soften: 0.12 },
        grade: { lift: [0.05, 0.035, 0.045], gain: [1.02, 0.97, 0.99], saturation: 1, contrast: 0.18, shadows: ['#4a2036', 0.3], highlights: ['#fff6f8', 0.2] },
        vignette: { strength: 0.22, colour: '#4a2a36' },
        grain: 0.015,
        clumps: 0.012,
      });
    },
  },

  'bin-erxewanan': {
    ku: 'Binê Erxewanan',
    en: 'Under the Judas trees',
    // in a grove of Judas trees in flower, the morning mist still among them: row behind row of magenta going pale
    // into the white, the sun coming through in shafts, and the grass under them pink with fallen blossom
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [930, 60];
      const light = [0.4, -0.6, 0.7];
      const mist = '#f4e4ee';
      s.layer({}, (cv) => {
        sky(cv, [[0, '#e8d4e4'], [0.5, '#f4e6ee'], [1, '#f8eef2']]);
        glow(cv, { x: sun[0], y: sun[1], r: 700, colour: '#fffaf4', opacity: 0.95 });
      });
      // the floor of the grove, green under drifts of fallen blossom
      const ground = (x) => 478 + Math.sin(x / 260) * 5;
      s.terrain({ blur: 0.8, haze: [mist, 0.35] }, { base: 478, line: ground, peaks: [{ x: 640, h: 0, s: 2000 }], lit: '#9ac070', shadow: '#2e4a34', foot: '#3a5232', footFrom: 600, light, grassy: 0.6, blade: 3, wind: 0.1, relief: 0.5, ambient: 0.4, dry: '#e690c4', dryness: 0.75 });
      // row behind row of trees, the further the paler
      // (the further rows grown no finer than their haze lets them be seen)
      const rows = [
        [470, 150, 0.78, 2.2, 14, 9, 1.8],
        [490, 230, 0.6, 1.4, 10, 7, 1.4],
        [530, 360, 0.36, 0.8, 7, 5, 1.1],
      ];
      for (const [y, h, hz, blur, count, twig, clump] of rows) {
        s.layer({ blur, haze: [mist, hz] }, (cv) => {
          let leaves = '';
          for (let i = 0; i < count; i++) {
            const x = (i + between(rnd, 0.1, 0.9)) * (1360 / count) - 40;
            const t = tree(rnd, { x, y: y + between(rnd, -6, 8), height: h * between(rnd, 0.8, 1.15), kind: 'blossom', wood: '#3a2028', leafColour: '#b02a7a', volume: ['#8a1660', '#d03c92', '#ff8cc8'], light: [0.5, -1], lean: between(rnd, -0.15, 0.15), leafiness: 1.3, twig, clump });
            cv.add(t.wood);
            leaves += t.leaves;
          }
          rough(cv, leaves, { scale: 4, freq: 0.14, seed: s.seed() });
        });
        s.layer({ scale: 2, blur: 3 }, (cv) => {
          noise(cv, { y: y - h * 0.9, h: h * 1.1, freq: [0.003, 0.009], seed: s.seed(), colour: mist, contrast: 2, bias: -0.7, opacity: 0.6, fade: [[0, 0], [0.5, 1], [1, 0.3]] });
        });
      }
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.7, strength: 1.4, decay: 0.976, density: 0.96, colour: '#fff4fa' });
      // the two old trees we stand between, their crowns over us
      s.layer({ blur: 0.7, rim: { x: sun[0], y: sun[1], colour: '#fff0f8', width: 2.5, strength: 0.7, reach: 1200 } }, (cv) => {
        let leaves = '';
        for (const [x, h, lean] of [[110, 880, 0.2], [1190, 820, -0.18]]) {
          const t = tree(rnd, { x, y: 790, height: h, kind: 'blossom', wood: '#2a141c', leafColour: '#a02470', volume: ['#7a1052', '#c83488', '#ff96cc'], light: [0.5, -1], lean, leafiness: 1, clump: 0.6, twig: 6 });
          cv.add(t.wood);
          leaves += t.leaves;
        }
        rough(cv, leaves, { scale: 6, freq: 0.13, seed: s.seed() });
      });
      s.layer({ blur: 1.4 }, (cv) => {
        cv.add(petals(rnd, { count: 160, colours: ['#e070b0', '#ffa6d2', '#c03a88'], size: 4.5 }));
      });
      s.layer({ blur: 8 }, (cv) => {
        cv.add(petals(rnd, { count: 10, colours: ['#e070b0', '#ffa6d2'], size: 18 }));
      });
      return s.done({
        bloom: { threshold: 0.76, strength: 0.5, radius: 32, tint: '#ffe4f2' },
        diffuse: { radius: 20, strength: 0.32, soften: 0.1 },
        grade: { lift: [0.04, 0.03, 0.05], gain: [1.02, 0.97, 1.0], saturation: 1.06, contrast: 0.18, shadows: ['#3a1030', 0.32], highlights: ['#fff4fa', 0.15] },
        vignette: { strength: 0.3, colour: '#2a0e22' },
        grain: 0.015,
        clumps: 0.012,
      });
    },
  },

  lalezar: {
    ku: 'Lalezar',
    en: 'Tulip field',
    // a hillside of mountain tulips on a spring morning, the fog not yet lifted: the near ones sharp and red as
    // blood, the rest going grey into the white, and a few old oaks standing in it like ghosts
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [930, 190];
      const light = [0.5, -0.6, 0.6];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#b4bcc4'], [0.4, '#d2d4d4'], [0.7, '#e6e2dc'], [1, '#ebe6de']]);
        // the sun only a brightness in the fog
        glow(cv, { x: sun[0], y: sun[1], r: 520, colour: '#fff6e8', opacity: 0.9 });
        glow(cv, { x: sun[0], y: sun[1], r: 120, colour: '#fffaf2', opacity: 0.7 });
      });
      // hills behind, hardly there
      s.terrain({ blur: 3, haze: ['#e2dfda', 0.84] }, { base: 450, peaks: [{ x: 200, h: 60, s: 360, round: true }, { x: 820, h: 84, s: 420, round: true }], rough: 0.06, lit: '#7a8a6a', shadow: '#3e4a44', light, grassy: 0.1, blade: 1.5, relief: 0.4, ambient: 0.4 });
      // the oaks, further off the greyer
      for (const [x, y, h, hz] of [[1110, 452, 150, 0.74], [250, 440, 110, 0.78], [690, 470, 190, 0.6]]) {
        s.layer({ blur: 1.6, haze: ['#e2dfda', hz] }, (cv) => {
          rough(cv, silhouette(rnd, { x, y, height: h, kind: 'oak', colour: '#1e2420', leafiness: 0.85, twig: 5 }), { scale: 4, freq: 0.12, seed: s.seed() });
        });
      }
      // the hillside, rising to the left, red with tulips into the fog
      const ground = (x) => 470 - Math.max(0, 520 - x) * 0.07 + Math.sin(x / 210) * 4;
      s.terrain({ blur: 1, haze: ['#e2dfda', 0.5] }, { base: 470, line: ground, peaks: [{ x: 1400, h: 0, s: 1800 }], lit: '#7e9468', shadow: '#2c3a2a', light, grassy: 0.4, blade: 2, wind: 0.1, relief: 0.5, ambient: 0.4, dry: '#8a8456', dryness: 0.3 });
      const reds = ['#c81e30', '#d82a36', '#b4182c', '#e43c34'];
      const band = (y0, y1, hz, blur, count, size) =>
        s.layer({ blur, haze: hz ? ['#e2dfda', hz] : null }, (cv) => {
          const items = onGround(rnd, (x) => Math.max(ground(x), y0), count, { y1, bias: 1 });
          for (const [x, y, t] of items) cv.add(flower('tulip', x, y, size * (0.75 + 0.5 * t), { petal: reds[Math.floor(rnd() * reds.length)], dark: '#7a0e22', stem: '#4a6a3a' }, rnd));
        });
      band(470, 540, 0.62, 1, 2600, 4);
      // the fog lying along the hill between the far flowers and the near
      s.layer({ scale: 2, blur: 3 }, (cv) => {
        noise(cv, { y: 400, h: 260, freq: [0.003, 0.012], seed: s.seed(), colour: '#ebe8e2', contrast: 2.2, bias: -0.55, opacity: 0.85, fade: [[0, 0], [0.4, 1], [1, 0]] });
      });
      band(520, 610, 0.3, 0.6, 1300, 8);
      s.layer({ scale: 2, blur: 4 }, (cv) => {
        noise(cv, { y: 470, h: 250, freq: [0.0028, 0.011], seed: s.seed(), colour: '#e8e6e0', contrast: 2, bias: -0.75, opacity: 0.7, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      // the near ones, every petal sharp, in their grass
      s.layer({}, (cv) => {
        cv.def('<linearGradient id="lz-near" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34482c" stop-opacity="0"/><stop offset="0.35" stop-color="#34482c" stop-opacity="0.9"/><stop offset="1" stop-color="#26361f"/></linearGradient>');
        cv.add('<rect x="-20" y="560" width="1320" height="200" fill="url(#lz-near)"/>');
        cv.add(tallGrass(rnd, { x0: -20, x1: 1300, y0: 590, y1: 740, count: 1300, height: 40, colours: ['#4a6a3a', '#5a7a44', '#3a5a30'], wind: 0.12, width: 2 }));
        for (const [x, y, t] of onGround(rnd, () => 584, 260, { y1: 736, bias: 0.9 })) cv.add(flower('tulip', x, y, 11 + 15 * t, { petal: reds[Math.floor(rnd() * reds.length)], dark: '#7a0e22', stem: '#4a6a3a' }, rnd));
      });
      // and right in front, out of focus
      s.layer({ blur: 9 }, (cv) => {
        cv.add(flowerField(rnd, { kind: 'tulip', y0: 660, y1: 770, count: 9, size: 66, colours: ['#d82a36', '#c81e30', '#e43c34'], dark: '#7a0e22', stem: '#3a5a30' }));
      });
      return s.done({
        bloom: { threshold: 0.8, strength: 0.35, radius: 30 },
        diffuse: { radius: 22, strength: 0.3, soften: 0.12 },
        grade: { lift: [0.04, 0.04, 0.045], gain: [1.02, 0.99, 0.97], saturation: 0.92, contrast: 0.16, shadows: ['#26302c', 0.3], highlights: ['#fff8f0', 0.15] },
        vignette: { strength: 0.3, colour: '#1c201c' },
        grain: 0.016,
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
    // spring in the orchards: almond trees in flower, row behind row up the terraces, a village above, snow on the peaks
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [260, 90];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#7aaee2'], [0.6, '#c8def2'], [1, '#eef3f0']]);
        glow(cv, { x: sun[0], y: sun[1], r: 600, colour: '#fffbea', opacity: 0.9 });
        clouds(cv, { y: 10, h: 280, freq: [0.006, 0.012], seed: s.seed(), colour: '#f6f4f6', light: '#ffffff', shade: '#a2b0c8', dx: -10, dy: -8, density: 3.2, cover: -1.6, opacity: 0.85, fade: [[0, 0], [0.4, 1], [1, 0]] });
      });
      s.terrain({ blur: 1.2, haze: ['#dde8f2', 0.4] }, { base: 400, peaks: [{ x: 300, h: 200, s: 280 }, { x: 760, h: 250, s: 300 }, { x: 1180, h: 210, s: 260 }], lit: '#b6b0ae', shadow: '#3e4e7e', snowline: 274, snowLit: '#ffffff', snowShadow: '#c8d2ea', foot: '#90a6c2', footFrom: 350, light: [-0.7, -0.5, 0.5] });
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
    // the citadel of Hewlêr on its mound, alone on the plain in the last red light, the sun going down on the left
    // and catching every house along the rim
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [150, 410];
      const light = [-0.85, -0.25, 0.35];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#360a1c'], [0.3, '#7e1c2a'], [0.48, '#c63e36'], [0.58, '#ea6e44'], [0.66, '#ff9a5e'], [1, '#ffc286']]);
        glow(cv, { x: sun[0], y: sun[1], r: 760, colour: '#ffac6c', opacity: 0.8 });
        clouds(cv, { y: 0, h: 400, freq: [0.0034, 0.0105], seed: s.seed(), colour: '#721a2a', light: '#ffae84', shade: '#28060f', dx: -18, dy: 10, density: 3, cover: -1.2, opacity: 0.95, fade: [[0, 1], [0.6, 0.85], [1, 0]] });
        orb(cv, { x: sun[0], y: sun[1], r: 25, core: '#fff2d8', edge: '#ffd49c', halo: '#ffb676', haloR: 300, haloOpacity: 0.85 });
      });
      // the far edge of the plain: low hills in the haze
      s.terrain({ blur: 1.6, haze: ['#ea8c66', 0.64] }, { base: 470, peaks: [{ x: 300, h: 22, s: 300, round: true }, { x: 1000, h: 38, s: 380, round: true }, { x: 1280, h: 28, s: 220, round: true }], rough: 0.14, lit: '#d8906a', shadow: '#6a2a3a', light, grassy: 0.1, blade: 1.2, relief: 0.4, ambient: 0.4 });
      // the mound, steep-sided and flat-topped, lit across its face from the west
      const cx = 700;
      const cw = 620;
      const top = 424;
      const foot = 508;
      const mound = (x) => {
        const d = Math.abs(x - cx) - cw * 0.42;
        if (d <= 0) return top;
        const t = Math.min(1, d / (cw * 0.17));
        return t >= 1 ? H + 10 : top + (foot + 10 - top) * t * t * (3 - 2 * t);
      };
      const rim = { x: sun[0], y: sun[1], colour: '#ffc08a', width: 2.5, strength: 1, reach: 1400 };
      // (its earth runnelled by the rain: long streaks straight down it)
      s.terrain({ blur: 0.3, haze: ['#ea8c66', 0.12], rim }, { base: foot, line: mound, peaks: [{ x: cx, h: foot - top, s: cw * 0.62 }], lit: '#d88250', shadow: '#4a1620', light, grassy: 0.55, blade: 26, wind: 0, relief: 0.6, ambient: 0.3, dry: '#b0603c', dryness: 0.5 });
      // the houses along its rim, the great gate and the ramp, the minaret and the dome over them
      s.layer({ blur: 0.3, haze: ['#ea8c66', 0.1], rim }, (cv) => {
        cv.add(citadel(rnd, { x: cx, y: top + cw * 0.13, w: cw, lights: '#ffd090', faces: { wall: ['#c27048', '#b4643e', '#ca7a50', '#a85a3a'], edge: '#f0a46c', dark: '#5a2222', window: '#3a1018' } }));
      });
      // the plain, gone red and gold with the dry grass at the end of summer, running out to our feet
      const plain = (x) => 500 + Math.sin(x / 190) * 3 + x * 0.006;
      s.terrain({ blur: 0.4 }, { base: 500, line: plain, peaks: [{ x: 640, h: 0, s: 2400 }], lit: '#d4844c', shadow: '#4a1418', foot: '#3a0e12', footFrom: 560, light, grassy: 0.7, blade: 3, wind: 0.25, relief: 0.7, ambient: 0.3, dry: '#e8a45c', dryness: 0.45 });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.6, strength: 1.2, decay: 0.975, density: 0.95, colour: '#ffb08a' });
      // tall dry grass right in front, the sun through its heads
      s.layer({ blur: 2.5, rim: { ...rim, width: 3 } }, (cv) => {
        cv.add(tallGrass(rnd, { x0: -20, x1: 1300, y0: 640, y1: 760, count: 700, height: 120, colours: ['#3a0c12', '#521418', '#6a2020'], heads: '#d88a5c', share: 0.12, wind: 0.22, width: 2.4 }));
      });
      return s.done({
        bloom: { threshold: 0.66, strength: 0.5, radius: 30, tint: '#ffb080' },
        diffuse: { radius: 16, strength: 0.26, soften: 0.08 },
        grade: { lift: [0.03, 0.005, 0.01], gain: [1.05, 0.94, 0.9], saturation: 1.06, contrast: 0.24, shadows: ['#2a0610', 0.4], highlights: ['#ffe2c0', 0.2] },
        vignette: { strength: 0.45, colour: '#0e0204' },
        grain: 0.018,
        clumps: 0.012,
      });
    },
  },

  'seva-sor': {
    ku: 'Şeva Sor',
    en: 'Red night',
    // a red night in the mountains of Behdînan: one old oak alone on a rise, lit cold by the moon behind us, the sky
    // beyond it red to the last of the light, and Amêdî's lamps far off on its cliff
    scene(rnd) {
      const s = new Scene(rnd);
      const light = [0.55, -0.35, 0.75];
      const moonlight = { x: 1500, y: 150, colour: '#8af6e8', width: 2.2, strength: 0.9, reach: 2600 };
      s.layer({}, (cv) => {
        sky(cv, [[0, '#12030a'], [0.28, '#320714'], [0.5, '#6e1220'], [0.66, '#a8222a'], [0.76, '#cc3e32'], [1, '#d85a3a']]);
        cv.add(starfield(rnd, { y0: 0, y1: 340, count: 520, bright: 7, colours: ['#ffffff', '#ffe4d8', '#d8f0ff'] }));
        glow(cv, { x: 760, y: 600, r: 900, colour: '#ff7040', opacity: 0.45 });
        noise(cv, { y: 220, h: 220, freq: [0.0025, 0.016], seed: s.seed(), colour: '#e85a40', contrast: 2.2, bias: -1, opacity: 0.35, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      // the far mountains, black against it
      s.terrain({ blur: 1, haze: ['#7a1420', 0.42] }, { base: 548, peaks: [{ x: 120, h: 150, l: 220, r: 260 }, { x: 560, h: 96, s: 260 }, { x: 1180, h: 170, l: 300, r: 220 }], rough: 0.2, lit: '#3a1a26', shadow: '#0e0408', light: [0.5, -0.4, 0.5], ambient: 0.5, ribs: 5 });
      // Amêdî on its cliff, its lamps lit
      s.layer({ blur: 0.6, haze: ['#7a1420', 0.22] }, (cv) => {
        cv.add(amedi(rnd, { x: 1010, y: 560, w: 280, fill: '#0e0308', lights: '#ffb860' }));
      });
      // mist in the valley under it, catching the red
      s.layer({ scale: 2, blur: 4 }, (cv) => {
        noise(cv, { y: 500, h: 170, freq: [0.004, 0.014], seed: s.seed(), colour: '#b8343a', contrast: 2.2, bias: -0.8, opacity: 0.7, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      // the rise the oak stands on, its grass lit by the moon
      const ground = (x) => 604 - 64 * Math.exp(-(((x - 430) / 360) ** 2)) + Math.max(0, x - 900) * 0.04;
      // (the light pooling round the tree and falling away from it)
      const pool = { x: 470, y: 520, r: 760, ambient: 0.22, squash: 0.55, power: 1.3 };
      s.terrain({ rim: moonlight, falloff: pool }, { base: 604, line: ground, peaks: [{ x: 430, h: 0, s: 420 }], lit: '#2e9890', shadow: '#061214', foot: '#04080a', footFrom: 640, light, grassy: 0.8, blade: 4, wind: 0.15, relief: 0.6, ambient: 0.16 });
      s.layer({ blur: 0.5, rim: moonlight }, (cv) => {
        const t = tree(rnd, { x: 430, y: 544, height: 310, kind: 'walnut', wood: '#06100f', leafColour: '#0a2a2c', volume: ['#062022', '#17605c', '#48c8ba'], light: [1, -0.5], leafiness: 1.2, twig: 4 });
        rough(cv, t.wood + t.leaves, { scale: 6, freq: 0.16, seed: s.seed() });
      });
      // the near grass, dark, its tips catching the moon
      s.layer({ blur: 1.5, rim: { ...moonlight, width: 1.6 } }, (cv) => {
        cv.add(tallGrass(rnd, { x0: -20, x1: 1300, y0: 650, y1: 760, count: 600, height: 70, colours: ['#04100f', '#08181a', '#0a2224'], heads: '#4ab8aa', share: 0.08, wind: 0.2, width: 2 }));
      });
      return s.done({
        bloom: { threshold: 0.55, strength: 0.6, radius: 28, tint: '#ff9a7a' },
        diffuse: { radius: 16, strength: 0.22, soften: 0.06 },
        grade: { lift: [0.02, 0.01, 0.02], gain: [1.02, 1, 1], saturation: 1.08, contrast: 0.26, shadows: ['#060c10', 0.4] },
        vignette: { strength: 0.5, colour: '#050102' },
        grain: 0.02,
        clumps: 0.014,
      });
    },
  },

  newroz: {
    ku: 'Rengên Newrozê',
    en: 'The colours of Newroz',
    // Newroz morning: the sun just up over the hills with its twenty-one rays, and at our feet the spring
    // in flower in Newroz's own colours — narcissus, red tulips, white daisies in the green
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
      s.layer({ blur: 9, blend: 'screen', opacity: 0.75 }, (cv) => {
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
      // hills going back into the morning haze, the low sun across them from the left
      const light = [-0.8, -0.35, 0.45];
      s.terrain({ blur: 2, haze: ['#ffc880', 0.34] }, { base: 470, peaks: [{ x: 640, h: 120, l: 420, r: 340, round: true }, { x: 1110, h: 160, s: 320, round: true }], rough: 0.06, lit: '#9cc460', shadow: '#1e4a2e', foot: '#3a6e3a', footFrom: 440, light, grassy: 0.2, blade: 1.6, relief: 0.6, ambient: 0.28 });
      s.terrain({ blur: 1.2, haze: ['#ffd090', 0.36] }, { base: 505, peaks: [{ x: 300, h: 36, l: 360, r: 300, round: true }, { x: 860, h: 30, s: 340, round: true }], rough: 0.04, lit: '#8ab858', shadow: '#2a5a30', light, grassy: 0.35, blade: 2.2, relief: 0.55, ambient: 0.3 });
      // the near slope, rising to the right, in flower
      const slope = (x) => 520 - Math.max(0, x) * 0.036 + Math.sin(x / 230) * 3;
      const rim = { x: sun[0], y: sun[1], colour: '#fff2b0', width: 2.5, strength: 1, reach: 1400 };
      s.terrain({ rim }, { base: 520, line: slope, peaks: [{ x: 1500, h: 0, s: 1800 }], lit: '#8ac458', shadow: '#245a2c', light, grassy: 0.8, blade: 5, wind: 0.14, relief: 0.6, ambient: 0.32 });
      s.layer({ rim }, (cv) => {
        cv.add(tallGrass(rnd, { x0: -20, x1: 1300, top: slope, y1: 740, count: 1400, height: 40, colours: ['#3a8a3e', '#4c9e48', '#5eb054', '#6ab85a'], wind: 0.14, width: 1.8 }));
        // the flowers thicken toward us; each kind among the others, as a hillside in spring is
        const kinds = [['narcissus', 300, 26, ['#fffaf0', '#fff6e2'], '#ffc21a'], ['tulip', 220, 24, ['#e0262c', '#f0402a', '#c81e2a'], null], ['daisy', 260, 18, ['#ffffff', '#fff4f4'], '#ffd23a']];
        const items = [];
        for (const [kind, count, size, colours, centre] of kinds) {
          for (const [x, y, t] of onGround(rnd, slope, count, { bias: 1.3 })) items.push([kind, x, y, size * (0.22 + 0.78 * t) * between(rnd, 0.8, 1.2), colours[Math.floor(rnd() * colours.length) % colours.length], centre]);
        }
        items.sort((a, b) => a[2] - b[2]);
        for (const [kind, x, y, size, petal, centre] of items) cv.add(flower(kind, x, y, size, { petal, centre: centre ?? undefined, stem: '#2f7a34' }, rnd));
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.72, strength: 1.25, decay: 0.975, density: 0.95, colour: '#fff0b0' });
      // the nearest flowers, out of focus
      s.layer({ blur: 5 }, (cv) => {
        cv.add(flowerField(rnd, { kind: 'narcissus', y0: 700, y1: 790, count: 12, size: 64, colours: ['#fffaf0'], centre: '#ffc21a', stem: '#2a6a2e' }));
        cv.add(flowerField(rnd, { kind: 'tulip', y0: 705, y1: 800, count: 10, size: 60, colours: ['#e8322f', '#d0202a'], stem: '#2a6a2e' }));
      });
      return s.done({
        bloom: { threshold: 0.72, strength: 0.55, radius: 30, tint: '#ffe0a0' },
        diffuse: { radius: 18, strength: 0.24, soften: 0.08 },
        grade: { lift: [0.04, 0.02, 0.01], gain: [1.03, 0.99, 0.92], saturation: 1.08, contrast: 0.2, shadows: ['#2a1008', 0.35] },
        vignette: { strength: 0.35, colour: '#2a0a04' },
        grain: 0.015,
        clumps: 0.01,
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
