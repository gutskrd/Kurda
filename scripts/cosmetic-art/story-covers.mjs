/**
 * The covers painted for the legends in the Stories library — one for each,
 * not sold in the shop: Kawa the smith and the first Newroz, Şahmaran under
 * the earth, Mem û Zîn at Cizîr, Siyabend û Xecê on Sîpan, and the fortress of
 * Dimdim. They are laid up exactly as the shop's backgrounds are (the Scene
 * of backgrounds.mjs, the compositor of render.mjs) and written beside them,
 * but under names of their own (`story-kawa.webp`, …) rather than the shop's
 * numbers, so the shop's set and its order are never touched; shared
 * `STORY_COVERS` lists them with the shop's pictures.
 *
 *   node scripts/cosmetic-art/story-covers.mjs              write them into the repo
 *   node scripts/cosmetic-art/story-covers.mjs --out <dir>  write the same files under <dir>
 *   node scripts/cosmetic-art/story-covers.mjs --only kawa  only the one
 *
 * There are no people in them, as there are none in the backgrounds: each
 * legend is told by its place, its light and the things left in it — the
 * smith's apron raised on a spear, the empty throne in the serpent's coils,
 * two lamps in the castle, the stag at the cliff's edge, the smoke of the
 * camp below the walls.
 *
 * A cover is shown as the shop's pictures are: whole on a card (16:9), cut to
 * 4:3 beside a story's words on a wide screen (x from 160 to 1120), and as a
 * band about twice as wide as it is tall over the title in the phone app (y
 * from about 70 to 650). So what each is about stands in the middle of the
 * frame, inside all three.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import sharp from 'sharp';
import { H, Scene, W, leaves, rough } from './backgrounds.mjs';
import { between, n, pt, random, seedOf } from './kit.mjs';
import { birds, heightAt } from './landscape.mjs';
import { deer } from './figures.mjs';
import { beams, blob, clouds, embers, fire, glow, grass, motes, noise, orb, silhouette, sky, starfield, tree } from './nature.mjs';
import { renderScene } from './render.mjs';
import { anvil, apronOnSpear, campTents, cizir, crown, forge, fortress, hammer, rockFace, roseBush, roots, serpent, spline, throne, twoGraves } from './story-props.mjs';

/** The highest point of a skyline within `reach` of x: where a summit's fire is lit. */
function summit(line, x, reach = 50) {
  let best = [x, heightAt(line, x)];
  for (const [px, py] of line) if (Math.abs(px - x) <= reach && py < best[1]) best = [px, py];
  return best;
}

/**
 * A fire on a far summit, `size` its height in pixels: a small flame, and the
 * light of it round about to lay in as light.
 */
function beacon(x, y, size) {
  const s = size / 11;
  const flame = (k, colour) => `<path d="M${n(x - 3 * s * k)},${n(y)} Q${n(x - 2.2 * s * k)},${n(y - 7 * s * k)} ${n(x + 0.4 * s)},${n(y - 11 * s * k)} Q${n(x + 2 * s * k)},${n(y - 6 * s * k)} ${n(x + 3 * s * k)},${n(y)} Z" fill="${colour}"/>`;
  return { flame: flame(1, '#ff8a3a') + flame(0.6, '#ffe2a8'), x, y: y - size * 0.4, size };
}

/**
 * The smoke of a fire going up into still, cold air and leaning off with the
 * wind as it climbs: puffs along a curve, wider and fainter as they rise.
 */
function smoke(rnd, { x, y, rise, lean, width, colour, opacity }) {
  const out = [];
  const steps = Math.max(8, Math.round(rise / 6));
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const px = x + lean * rise * t ** 1.6 + Math.sin(t * 6 + x) * width * 0.4 * t;
    const py = y - rise * t;
    const r = width * (0.5 + 2.2 * t) * between(rnd, 0.8, 1.2);
    out.push(`<circle cx="${n(px)}" cy="${n(py)}" r="${n(r)}" fill-opacity="${n(opacity * (1 - t) ** 1.3)}"/>`);
  }
  return `<g fill="${colour}">${out.join('')}</g>`;
}

export const SCENES = {
  kawa: {
    ku: 'Kawayê Hesinkar',
    en: 'Kawa the blacksmith',
    // the night the tyrant fell, high in the mountains: the fires of Newroz lit on the peaks one after another as far
    // as the eye goes, and close in front of us the smith's ground — the coals of his forge still bright, the anvil
    // and the hammer by it, and his leather apron hung from a spear by its neck strap, stirring in the cold wind
    scene(rnd) {
      const s = new Scene(rnd);
      s.layer({}, (cv) => {
        sky(cv, [[0, '#03061a'], [0.34, '#08102e'], [0.5, '#112048'], [0.6, '#1c2a5c'], [0.67, '#2a2a5c'], [1, '#1a2048']]);
        cv.add(starfield(rnd, { y0: 0, y1: 440, count: 360, bright: 3, colours: ['#ffffff', '#dfe6ff', '#c8d4ff'] }));
      });
      // the ranges, one behind another, cold and dim with distance; a fire lit on summit after summit
      const light = [-0.5, -0.6, 0.6];
      const farthest = s.terrain({ blur: 2.2, haze: ['#1e2a5a', 0.66] }, { base: 452, peaks: [{ x: 960, h: 44, s: 150 }, { x: 1180, h: 56, s: 170 }, { x: 760, h: 30, s: 140 }], rough: 0.22, lit: '#26326a', shadow: '#0a1028', light, ambient: 0.5, ribs: 4, relief: 0.6 });
      const far = s.terrain({ blur: 1.6, haze: ['#182452', 0.48] }, { base: 470, peaks: [{ x: 110, h: 92, l: 170, r: 150 }, { x: 640, h: 84, s: 170 }, { x: 1250, h: 46, s: 160 }], rough: 0.2, lit: '#222e62', shadow: '#070b22', light, ambient: 0.4, ribs: 5, relief: 0.7 });
      const mid = s.terrain({ blur: 1, haze: ['#121a40', 0.24] }, { base: 500, peaks: [{ x: 372, h: 178, l: 230, r: 250, k: 1.15 }, { x: -60, h: 90, s: 200 }, { x: 900, h: 52, s: 260 }], rough: 0.16, lit: '#1e2a54', shadow: '#03061a', foot: '#03040c', footFrom: 520, light, ambient: 0.26, ribs: 4, relief: 0.75 });
      // nearest first, then on along the ranges, each smaller, as far as they can be seen
      const fires = [
        beacon(...summit(mid, 372), 21),
        beacon(...summit(far, 640), 10),
        beacon(...summit(far, 110), 8),
        beacon(...summit(farthest, 960), 5),
        beacon(...summit(farthest, 1180), 4),
        beacon(...summit(far, 1250), 3.4),
      ];
      // their smoke going up into the still air, and the fires themselves, as light
      s.layer({ blur: 3, opacity: 0.5 }, (cv) => {
        for (const f of fires) cv.add(smoke(rnd, { x: f.x, y: f.y - f.size * 0.4, rise: f.size * 8, lean: 0.3, width: f.size * 0.42, colour: '#2a2c48', opacity: 0.6 }));
      });
      s.layer({ blur: 1.4, blend: 'screen' }, (cv) => {
        for (const f of fires) glow(cv, { x: f.x, y: f.y, r: 6 + f.size * 2.6, colour: '#ff6a1a', opacity: 0.4 });
      });
      s.layer({ blur: 0.4, blend: 'screen' }, (cv) => {
        for (const f of fires) cv.add(f.flame);
        cv.add(embers(rnd, { x: fires[0].x, y: fires[0].y - 14, rise: 80, spread: 6, count: 36, wind: 0.35, colours: ['#ffd36a', '#ff9a3a'] }));
      });
      // the valleys between them full of cold mist
      s.layer({ scale: 2, blur: 4, blend: 'screen' }, (cv) => {
        noise(cv, { y: 420, h: 140, freq: [0.004, 0.016], seed: s.seed(), colour: '#1e2a5a', contrast: 2.2, bias: -1, opacity: 0.4, fade: [[0, 0], [0.5, 1], [1, 0]] });
      });
      // the smith's ground: a shelf of the mountain, short dry grass on it, dark but where the forge lights it
      const ground = (x) => 604 - 8 * Math.exp(-(((x - 260) / 260) ** 2)) + 6 * Math.sin(x / 140) + 2 * Math.sin(x / 41);
      const forgeAt = [232, ground(232) + 34];
      const f = forge(rnd, { x: forgeAt[0], y: forgeAt[1], w: 138, h: 80, stone: '#221a1e', stoneDark: '#120e12', mortar: '#060407', tongs: '#0e0e14' });
      const bed = f.bed;
      const warm = { x: bed[0], y: bed[1] - 30, colour: '#ff9a4a', width: 3, strength: 1, reach: 780 };
      s.carpet({}, {
        top: ground,
        far: 1.6,
        near: 18,
        ground: '#060508',
        light: [-0.8, -0.6],
        pool: { x: bed[0] + 40, y: forgeAt[1] + 30, r: 620, ambient: 0.1, squash: 0.36 },
        patches: 0.15,
        focus: { from: 0.8, blur: 1.6 },
        plants: [
          { kind: 'blades', share: 5, colours: ['#2a2418', '#3a3020', '#1e1a12', '#4a3a22'], height: 1 },
          { kind: 'tuft', share: 2, colours: ['#1a1810', '#2a2416', '#14120c'], drifts: 1.3 },
        ],
      });
      // the forge: the fireback and its chimney, the coals and the flame on the hearth, and the hearth and the tongs
      // before them
      const flames = fire(rnd, { x: bed[0], y: bed[1], w: 96, h: 58, wind: 0.24, tongues: 9 });
      s.layer({ blur: 0.6, rim: { ...warm, y: bed[1] + 10, width: 2.4, reach: 200 } }, (cv) => cv.add(f.back));
      s.layer({ blur: 3, opacity: 0.6 }, (cv) => cv.add(smoke(rnd, { x: f.chimney[0], y: f.chimney[1], rise: 220, lean: 0.5, width: 9, colour: '#2a2630', opacity: 0.55 })));
      s.layer({ blur: 1.6 }, (cv) => cv.add(flames.bed));
      s.layer({ blur: 1.6, blend: 'screen' }, (cv) => rough(cv, flames.flames(cv, 'edge'), { scale: 10, freq: 0.03, seed: s.seed() }));
      s.layer({ blur: 1.2, blend: 'screen' }, (cv) => rough(cv, flames.flames(cv, 'body'), { scale: 8, freq: 0.034, seed: s.seed() }));
      s.layer({ blur: 1, blend: 'screen', opacity: 0.75 }, (cv) => rough(cv, flames.flames(cv, 'heart'), { scale: 6, freq: 0.04, seed: s.seed() }));
      s.layer({ blur: 0.5, rim: { ...warm, y: bed[1] - 60, width: 2.2, strength: 0.9, reach: 300 }, falloff: { x: bed[0], y: bed[1], r: 300, ambient: 0.5 } }, (cv) => cv.add(f.front));
      // the forge's light on the ground round it
      s.layer({ blend: 'light' }, (cv) => {
        const g = cv.id('lit');
        cv.def(`<radialGradient id="${g}" gradientUnits="userSpaceOnUse" cx="${n(bed[0])}" cy="${n(forgeAt[1])}" r="460" gradientTransform="translate(0 ${n(forgeAt[1] * 0.62)}) scale(1 0.38)"><stop offset="0" stop-color="#ffb070" stop-opacity="0.55"/><stop offset="0.35" stop-color="#ff8a44" stop-opacity="0.22"/><stop offset="1" stop-color="#ff6a2a" stop-opacity="0"/></radialGradient>`);
        let d = 'M-20,740';
        for (let x = -20; x <= 1300; x += 20) d += ` L${x},${n(ground(x))}`;
        cv.add(`<path d="${d} L1300,740 Z" fill="url(#${g})"/>`);
      });
      // the anvil on its block and the hammer leant against the block, the forge's light along their edges
      const footY = 700;
      const a = anvil({ x: 530, y: footY, size: 250, iron: '#101016', face: '#34323e', wood: '#1a120c', woodDark: '#0c0805' });
      s.layer({ blur: 0.5, rim: { ...warm, width: 2.4, strength: 0.75, soften: 1.4 }, falloff: { x: bed[0], y: bed[1], r: 900, ambient: 0.5, squash: 0.9 } }, (cv) => {
        cv.add(`<ellipse cx="552" cy="${n(footY + 2)}" rx="156" ry="11" fill="#020204" fill-opacity="0.7"/>`);
        cv.add(a.markup);
        cv.add(hammer({ x: 696, y: footY - 6, to: [636, a.face[0][1] + 104], size: 64, iron: '#16161e', wood: '#24160e' }));
      });
      // the spear, and the apron hung from it
      const raised = apronOnSpear(rnd, { foot: [826, ground(826) + 46], top: [818, 140], size: 270, sway: 0.06, wind: 1, wood: '#140d0a', iron: '#181822', leather: '#402a1a', leatherLit: '#5c3e26', leatherDark: '#26180e', scorch: '#120a06', stitch: '#76563a', cord: '#382214' });
      s.layer({ blur: 0.4, rim: { ...warm, width: 2.4, strength: 1, reach: 1300 } }, (cv) => {
        cv.add(raised.staff);
        cv.add(raised.apron);
      });
      // sparks from the forge going up on the wind, and a few close enough to be out of focus
      s.layer({ blur: 0.5, blend: 'screen' }, (cv) => {
        cv.add(embers(rnd, { x: f.chimney[0] + 4, y: f.chimney[1] - 14, rise: 400, spread: 22, count: 100, wind: 0.4, colours: ['#ffd36a', '#ff9a3a', '#fff0c0', '#ff6a2a'] }));
      });
      // the grass at the edge of the shelf and at our feet, dark, its tips catching the forge
      s.layer({ blur: 2.2, rim: { ...warm, width: 2, strength: 0.7, reach: 700 } }, (cv) => {
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 726, count: 300, height: 44, colours: ['#030306', '#06060a', '#05050a'], wind: 0.3, width: 3 }));
      });
      // the forge's glow in the air
      s.layer({ blend: 'screen' }, (cv) => {
        glow(cv, { x: bed[0], y: bed[1] - 20, r: 340, colour: '#ff6a1a', opacity: 0.18 });
        glow(cv, { x: bed[0], y: bed[1] - 10, r: 110, colour: '#ffa848', opacity: 0.32 });
      });
      s.effect('texture', { amount: 0.05, cells: [60, 16, 5], seed: s.seed() });
      return s.done({
        bloom: { threshold: 0.64, strength: 0.42, radius: 22, tint: '#ffb070' },
        diffuse: { radius: 14, strength: 0.1, soften: 0.04 },
        grade: { lift: [0.012, 0.016, 0.036], gain: [1.04, 0.99, 1], saturation: 1.04, contrast: 0.22, shadows: ['#060c2a', 0.42] },
        vignette: { strength: 0.5, colour: '#02030c' },
        grain: 0.016,
        clumps: 0.01,
      });
    },
  },

  sahmaran: {
    ku: 'Şahmaran',
    en: 'The serpent queen',
    // under the earth, where the queen of the serpents keeps her hidden country: a chamber of honey-coloured stone
    // with the roots of the world above hanging down through its roof, a still pool, and in the half-dark beyond
    // it a throne cut from the rock, empty, a small crown on its seat, and the coils of a great serpent wound round
    // it and over its head, patterned down their length in scales like a crown's — a place of secrets, not of fear
    scene(rnd) {
      const s = new Scene(rnd);
      const opening = [716, -70];
      const seat = [640, 552];
      const lamp = { x: seat[0] + 16, y: seat[1] - 150, r: 700, ambient: 0.15, squash: 0.8, power: 1.4 };
      s.layer({}, (cv) => sky(cv, [[0, '#1c0f06'], [0.5, '#2a1709'], [1, '#160b04']]));
      // the far wall: honey stone hanging in folds, as stone does where water has run down it for an age
      s.terrain({ blur: 1.4, falloff: lamp, haze: ['#3a2210', 0.12] }, { base: 0, line: (x) => -40 + 6 * Math.sin(x / 50), peaks: [{ x: 80, h: 0, s: 170 }, { x: 330, h: 0, s: 160 }, { x: 560, h: 0, s: 150 }, { x: 790, h: 0, s: 160 }, { x: 1030, h: 0, s: 160 }, { x: 1260, h: 0, s: 170 }], lit: '#f2ba62', shadow: '#2c170a', light: [0.2, -0.9, 0.55], ribs: 6, relief: 1, ambient: 0.32 });
      // the floor of the chamber, stone and grit, and the steps up to the throne
      const floor = (x) => 560 + 10 * Math.sin(x / 160) - 6 * Math.exp(-(((x - 640) / 200) ** 2));
      s.terrain({ blur: 0.8, falloff: lamp }, { base: 560, line: floor, peaks: [{ x: 640, h: 0, s: 900 }], lit: '#c8904c', shadow: '#1c0e06', light: [0.2, -0.8, 0.6], rocky: 0.8, stone: 36, relief: 1.1, ambient: 0.25 });
      s.layer({ blur: 0.6, falloff: lamp }, (cv) => {
        const step = (y, w, h, top, face) => {
          const left = seat[0] - w / 2;
          rough(cv, `<path d="M${n(left)},${n(y)} L${n(left + 6)},${n(y - h)} L${n(left + w - 6)},${n(y - h)} L${n(left + w)},${n(y)} Z" fill="${face}"/><path d="M${n(left + 4)},${n(y - h + 3)} L${n(left + 6)},${n(y - h)} L${n(left + w - 6)},${n(y - h)} L${n(left + w - 4)},${n(y - h + 3)} Z" fill="${top}"/>`, { scale: 4, freq: 0.06, seed: s.seed() });
        };
        step(seat[1] + 50, 560, 22, '#d8a058', '#6a4422');
        step(seat[1] + 28, 420, 18, '#dcaa60', '#7a4e26');
        step(seat[1] + 10, 300, 14, '#e4b46a', '#86582c');
      });
      // the coils: turn over turn round the throne, rising, each turn's far side behind it, until the last goes
      // behind its back out of sight
      const coilAt = (a) => {
        const up = a / (3 * Math.PI);
        const r = 132 - 44 * up + 7 * Math.sin(a * 0.8 + 1);
        return [seat[0] + r * Math.sin(a), seat[1] - 40 - (128 * a) / (2 * Math.PI) + 24 * Math.cos(a) - 14, Math.cos(a)];
      };
      const turns = [];
      for (let a = -1.35; a <= 3 * Math.PI + 1e-6; a += 0.05) turns.push(coilAt(a));
      // below them the rest of the body lies in a great loop round the foot of the throne on the steps, the tail
      // run off it down to the pool, and the body climbs from the loop into the turns
      const loop = [];
      for (let a = -Math.PI / 2; a <= 1.5 * Math.PI + 1e-6; a += 0.05) loop.push([seat[0] + 14 + (250 + 16 * Math.sin(2 * a + 0.6)) * Math.sin(a), seat[1] + 34 + (24 + 4 * Math.sin(a + 0.4)) * Math.cos(a) + 3 * Math.sin(3 * a), Math.cos(a)]);
      const tail = spline([[404, 640], [372, 622], [372, 600], [loop[0][0] + 4, loop[0][1] + 10]], 10).map(([x, y]) => [x, y, 1]);
      const climb = spline([loop[loop.length - 1].slice(0, 2), [404, 568], [452, 552], [turns[0][0] - 4, turns[0][1] + 6]], 12).slice(1).map(([x, y]) => [x, y, 1]);
      const path = [...tail, ...loop, ...climb, ...turns];
      // runs of it in front of the throne and behind it
      const runs = [];
      for (const p of path) {
        const front = p[2] > 0;
        if (!runs.length || runs[runs.length - 1].front !== front) runs.push({ front, points: runs.length ? [runs[runs.length - 1].points.at(-1)] : [] });
        runs[runs.length - 1].points.push([p[0], p[1]]);
      }
      const coil = { body: '#1c4c42', lit: '#3a806a', shade: '#0b201c', scale: '#d2aa50', scaleDark: '#081613', light: [0.25, -1] };
      // (thickest round the foot of the throne, a little less as the body climbs)
      const thickAt = (y) => 24 + 8 * Math.min(1, Math.max(0, (y - 300) / 220));
      const thick = (run) => (run === runs[0] ? (t) => 5 + (thickAt(run.points.at(-1)[1]) - 5) * Math.min(1, t / 0.75) : (t) => thickAt(run.points[Math.min(run.points.length - 1, Math.round(t * (run.points.length - 1)))][1]));
      const coilLight = { falloff: { ...lamp, ambient: 0.34 }, rim: { x: opening[0], y: opening[1], colour: '#ffe0a0', width: 2, strength: 0.55, reach: 1200 } };
      s.layer({ blur: 0.5, ...coilLight }, (cv) => {
        for (const run of runs) if (!run.front) cv.add(serpent({ points: run.points, width: thick(run), ...coil }));
      });
      s.layer({ blur: 0.4, falloff: { ...lamp, ambient: 0.3 }, rim: { x: opening[0], y: opening[1], colour: '#ffd890', width: 2.4, strength: 0.7, reach: 1200 } }, (cv) => {
        rough(cv, throne({ x: seat[0], y: seat[1], w: 200, stone: '#b07a40', lit: '#deb070', dark: '#583616' }), { scale: 3, freq: 0.07, seed: s.seed() });
        cv.add(crown({ x: seat[0], y: seat[1] - 104 * (200 / 240), w: 44, gold: '#b88a34', lit: '#e0bc6c', dark: '#6a4818' }));
      });
      s.layer({ blur: 0.4, ...coilLight }, (cv) => {
        for (const run of runs) if (run.front) cv.add(serpent({ points: run.points, width: thick(run), ...coil, caps: [run !== runs[0], run !== runs[runs.length - 1]] }));
      });
      // the light from far above, falling through dust onto the throne
      s.layer({ blur: 22, blend: 'screen' }, (cv) => {
        beams(cv, rnd, { x: opening[0], y: opening[1], count: 9, angle: 0.11, spread: 0.26, length: 780, width: [60, 150], colour: '#ffe2a8', opacity: 0.16 });
      });
      s.layer({ blur: 0.6, blend: 'screen' }, (cv) => {
        cv.add(motes(rnd, { x0: 560, x1: 760, y0: 60, y1: 520, count: 70, size: 1.3, colours: ['#fff2d0', '#ffe2a0'], opacity: [0.2, 0.7] }));
      });
      // the pool, still, holding all of it
      s.effect('reflect', { y: 618, deep: '#0c1a16', near: 0.5, far: 0.86, ripple: 0.7, wave: 0.1, soften: 1.4, seed: s.seed() });
      s.layer({ blur: 0.8 }, (cv) => {
        rough(cv, `<path d="M-20,622 C200,614 420,620 640,617 C860,614 1080,621 1300,616 L1300,628 C1080,632 860,626 640,629 C420,632 200,626 -20,634 Z" fill="#2a170a"/>`, { scale: 6, freq: 0.05, seed: s.seed() });
      });
      // the roof and the walls close round us, dark, the roots hanging down through it
      s.layer({ blur: 0.8, rim: { x: opening[0], y: 160, colour: '#ffcf80', width: 3, strength: 0.55, reach: 1000 } }, (cv) => {
        // the roof hanging low over the pool, lumpy, and the walls bulging in on either hand
        const roof = [];
        for (let x = -60; x < 1360; x += between(rnd, 60, 130)) roof.push(blob(rnd, x, between(rnd, -20, 30), between(rnd, 70, 130), between(rnd, 50, 90), 0.4, 10));
        // (each wall's inner edge broken into jutting shelves and hollows, as rock breaks)
        const wall = (x, dir) => {
          const edge = [];
          for (let y = -40; y <= 780; y += between(rnd, 18, 46)) edge.push([x + dir * (between(rnd, 40, 120) + 50 * Math.sin(y / 150 + x)), y]);
          const outer = dir > 0 ? -60 : 1340;
          return `M${outer},-40 L${edge.map(pt).join(' L')} L${outer},780 Z`;
        };
        rough(cv, `<path d="${roof.join(' ')}" fill="#120904"/><path d="${wall(30, 1)}" fill="#120904"/><path d="${wall(1250, -1)}" fill="#120904"/>`, { scale: 12, freq: 0.04, seed: s.seed() });
      });
      s.layer({ blur: 1.2, haze: ['#4a2c14', 0.35], falloff: { ...lamp, ambient: 0.35 } }, (cv) => {
        cv.add(`<path d="${roots(rnd, { x0: 380, x1: 900, y: 20, count: 14, len: [80, 220], width: 8 })}" fill="#6a4420"/>`);
      });
      s.layer({ blur: 0.5, rim: { x: opening[0], y: 220, colour: '#ffcf80', width: 2, strength: 0.6, reach: 900 } }, (cv) => {
        cv.add(`<path d="${roots(rnd, { x0: 60, x1: 360, y: 10, count: 9, len: [160, 380], width: 14 })} ${roots(rnd, { x0: 940, x1: 1240, y: 10, count: 9, len: [160, 360], width: 14 })}" fill="#0e0703"/>`);
      });
      s.effect('texture', { amount: 0.06, cells: [50, 14, 5], seed: s.seed(), warm: 0.3 });
      return s.done({
        bloom: { threshold: 0.7, strength: 0.38, radius: 26, tint: '#ffd890' },
        diffuse: { radius: 18, strength: 0.16, soften: 0.06 },
        grade: { lift: [0.024, 0.014, 0.004], gain: [1.08, 1.01, 0.88], saturation: 1.06, contrast: 0.24, shadows: ['#1a0c04', 0.42], highlights: ['#fff0d0', 0.12] },
        vignette: { strength: 0.46, colour: '#080402' },
        grain: 0.016,
        clumps: 0.01,
      });
    },
  },

  'mem-u-zin': {
    ku: 'Mem û Zîn',
    en: 'Mem and Zîn',
    // Cizîr at dusk, from the garden across the Tigris: the castle of the emirs dark on its bluff over the river,
    // the last of the light behind it, and a lamp lit in two of its windows, far apart, both held in the water;
    // on our bank a rose bush in flower, and at the edge of the garden two old graves side by side with a small
    // thorn bush grown up between them
    scene(rnd) {
      const s = new Scene(rnd);
      const glowAt = [250, 452];
      const evening = { x: glowAt[0], y: glowAt[1], colour: '#ffb894', width: 2.6, strength: 0.8, reach: 1500 };
      s.layer({}, (cv) => {
        sky(cv, [[0, '#1c1832'], [0.28, '#33284c'], [0.46, '#5a3a5c'], [0.56, '#94566e'], [0.62, '#c8727a'], [0.67, '#e4987e'], [1, '#e4987e']]);
        glow(cv, { x: glowAt[0], y: glowAt[1], r: 640, colour: '#ffb890', opacity: 0.5 });
        clouds(cv, { y: 150, h: 230, freq: [0.0026, 0.016], seed: s.seed(), colour: '#7a4a68', light: '#ffc4a4', shade: '#3a2a4a', dx: -12, dy: 6, density: 3, cover: -1.6, opacity: 0.75, fade: [[0, 0], [0.45, 1], [1, 0]] });
        // the evening star, alone
        cv.add('<circle cx="1004" cy="128" r="1.8" fill="#fff6ec"/>');
        glow(cv, { x: 1004, y: 128, r: 14, colour: '#fff0e0', opacity: 0.5 });
      });
      // Cûdî behind, a long low ridge in the haze
      s.terrain({ blur: 1.6, haze: ['#a86a7e', 0.55] }, { base: 474, peaks: [{ x: 110, h: 46, s: 200 }, { x: 390, h: 66, s: 250 }, { x: 650, h: 44, s: 220 }, { x: 930, h: 84, l: 320, r: 260 }, { x: 1220, h: 58, s: 220 }], rough: 0.22, lit: '#7a5070', shadow: '#2c2040', light: [-0.7, -0.4, 0.5], ambient: 0.4, ribs: 4, relief: 0.6 });
      // the far bank: gardens and poplars along it, the town low and dark beyond the castle
      s.layer({ blur: 0.9, haze: ['#9a6078', 0.32] }, (cv) => {
        let trees = '';
        for (const [x, h] of [[96, 120], [134, 150], [172, 104], [1118, 130], [1160, 158], [1206, 118], [1258, 140]]) trees += silhouette(rnd, { x, y: 488, height: h, kind: 'poplar', colour: '#3a2a46', leafiness: 1, twig: 3 });
        for (const [x, h] of [[30, 64], [230, 56], [300, 70], [370, 50], [1070, 52]]) trees += silhouette(rnd, { x, y: 488, height: h, kind: 'walnut', colour: '#3a2a46', leafiness: 1.1, twig: 4 });
        leaves(cv, trees, { size: 2.2, masses: 3, contrast: 0.2, gaps: 0.6, light: [-1, -0.5], seed: s.seed() });
        const houses = [];
        for (let x = 980; x < 1290; x += between(rnd, 18, 34)) houses.push(`<rect x="${n(x)}" y="${n(480 - between(rnd, 8, 22))}" width="${n(between(rnd, 16, 30))}" height="30" fill="#30243e"/>`);
        cv.add(houses.join(''));
      });
      const castle = cizir(rnd, { x: 690, y: 438, w: 470, stone: '#2a2232', pale: '#4a3e4c', lit: '#7a5464', dark: '#18121e', rock: '#221a28', window: '#100a14', lamp: '#ffd27a', bank: 490, light: -1 });
      s.layer({ blur: 0.5, haze: ['#a06a7c', 0.08], rim: { ...evening, width: 2, strength: 0.6 } }, (cv) => {
        cv.add('<path d="M-20,486 C200,482 400,487 640,484 C880,480 1080,485 1300,482 L1300,500 L-20,500 Z" fill="#221a28"/>');
        cv.add(castle.markup);
      });
      // the lamps' light about their windows
      s.layer({ blur: 1, blend: 'screen' }, (cv) => {
        for (const [lx, ly] of castle.lamps) glow(cv, { x: lx, y: ly, r: 26, colour: '#ffb860', opacity: 0.55 });
      });
      // the river, still, holding the sky and the castle and the lamps
      s.effect('reflect', { y: 492, deep: '#3a2a46', near: 0.5, far: 0.88, ripple: 1.8, wave: 0.12, soften: 1.4, seed: s.seed() });
      s.layer({ blur: 0.8, blend: 'screen' }, (cv) => {
        // each lamp again in the water below it, drawn out long and broken by the current
        for (const [lx, ly] of castle.lamps) {
          const streaks = [];
          for (let y = 496 + (492 - ly) * 0.2; y < 492 + (492 - ly) * 1.15; y += between(rnd, 3, 7)) {
            const w = between(rnd, 3, 9) * (1 - (y - 492) / 400);
            streaks.push(`<rect x="${n(lx - w / 2 + between(rnd, -2, 2))}" y="${n(y)}" width="${n(w)}" height="1.6" fill-opacity="${n(between(rnd, 0.3, 0.8))}"/>`);
          }
          cv.add(`<g fill="#ffcc80">${streaks.join('')}</g>`);
        }
      });
      s.layer({ scale: 2, blur: 3, blend: 'screen' }, (cv) => {
        noise(cv, { y: 470, h: 90, freq: [0.003, 0.03], seed: s.seed(), colour: '#d08a90', contrast: 2.4, bias: -1, opacity: 0.35, fade: [[0, 0], [0.4, 1], [1, 0]] });
      });
      // our bank: the garden's grass running down to the water
      const bank = (x) => 606 - 18 * Math.exp(-(((x - 240) / 300) ** 2)) - 10 * Math.exp(-(((x - 1060) / 260) ** 2)) + 3 * Math.sin(x / 60);
      s.carpet({ rim: { ...evening, width: 1.6, strength: 0.6 } }, {
        top: bank,
        far: 1.4,
        near: 18,
        ground: '#0e0c14',
        fog: ['#5a3a5a', 0.4],
        light: [-0.8, -0.6],
        patches: 0.2,
        focus: { from: 0.82, blur: 1.6 },
        plants: [
          { kind: 'blades', share: 5, colours: ['#26302c', '#34403a', '#1c2420', '#3e4a40'], height: 1.1 },
          { kind: 'daisy', share: 0.18, colours: ['#26302c'], flower: ['#b8a8b8', '#c8b4bc'], leaves: '#26302c', centre: '#a88a3a', drifts: 2 },
          { kind: 'tuft', share: 1.2, colours: ['#1c2622', '#28322c'], drifts: 1.2 },
        ],
      });
      // the rose bush, the evening on its far side
      const bush = roseBush(rnd, { x: 240, y: bank(240) + 40, w: 210, leaf: '#18261f', rose: '#8a1630', roseLit: '#c84458', heart: '#3a0612', light: [-1, -0.7] });
      s.layer({ blur: 0.5, rim: { ...evening, width: 2, strength: 0.7 } }, (cv) => {
        leaves(cv, bush.leaves, { size: 2.8, masses: 4, contrast: 0.5, gaps: 0.42, light: [-1, -0.7], seed: s.seed() });
        cv.add(bush.roses);
      });
      // the graves at the garden's edge, and the thorn between them
      const graves = twoGraves(rnd, { x: 1052, y: bank(1052) + 30, gap: 100, stone: '#4a4250', stoneLit: '#8a7a88', stoneDark: '#28222e', mound: '#141a16', thorn: '#120e14' });
      s.layer({ blur: 0.5, rim: { ...evening, width: 1.6, strength: 0.6 } }, (cv) => {
        cv.add(graves.graves);
        cv.add(graves.thorn);
        cv.add(grass(rnd, { x0: 990, x1: 1120, y: bank(1052) + 32, count: 40, height: 12, colours: ['#1c2420', '#26302c'], wind: 0.1, width: 1.4 }));
      });
      // grass at our feet, too near to be in focus
      s.layer({ blur: 2.4, rim: { ...evening, width: 2, strength: 0.5 } }, (cv) => {
        cv.add(grass(rnd, { x0: -30, x1: 1310, y: 728, count: 260, height: 40, colours: ['#0c0c12', '#121218', '#0e1014'], wind: 0.12, width: 2.6 }));
      });
      s.effect('texture', { amount: 0.05, cells: [60, 16, 5], seed: s.seed() });
      return s.done({
        bloom: { threshold: 0.7, strength: 0.4, radius: 26, tint: '#ffc0a0' },
        diffuse: { radius: 18, strength: 0.2, soften: 0.06 },
        grade: { lift: [0.02, 0.012, 0.03], gain: [1.02, 0.97, 0.98], saturation: 0.94, contrast: 0.2, shadows: ['#160e22', 0.45], highlights: ['#ffe4d4', 0.12] },
        vignette: { strength: 0.45, colour: '#0c0814' },
        grain: 0.016,
        clumps: 0.01,
      });
    },
  },

  siyabend: {
    ku: 'Siyabend û Xecê',
    en: 'Siyabend and Xecê',
    // high summer on the pastures above Lake Wan: Sîpan across the water with the last snow on its head, the lake a
    // deep blue far below, flowers at our feet; and on the brink of a crag beside us, dark against the bright sky, a
    // great stag, his head lowered and his antlers forward over the drop — and far down the slope under the cliff a
    // lone tree
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [1150, 120];
      const light = [0.75, -0.5, 0.45];
      s.layer({}, (cv) => {
        sky(cv, [[0, '#4a76ae'], [0.3, '#7298c4'], [0.48, '#a8c2dc'], [0.56, '#d4e0ea'], [1, '#e2eaf0']]);
        glow(cv, { x: sun[0], y: sun[1], r: 640, colour: '#fff8e4', opacity: 0.7 });
        clouds(cv, { y: 30, h: 320, freq: [0.0032, 0.0068], seed: s.seed(), colour: '#eef2f4', light: '#ffffff', shade: '#a2b4c6', dx: 10, dy: -8, density: 3.2, cover: -1.7, opacity: 0.9, fade: [[0, 0.5], [0.6, 1], [1, 0]] });
      });
      // the ranges round the lake, low and pale with distance, and Sîpan over them
      s.terrain({ blur: 1.8, haze: ['#c8d6e4', 0.62] }, { base: 404, peaks: [{ x: 960, h: 40, s: 220 }, { x: 1240, h: 58, s: 200 }, { x: 30, h: 36, s: 180 }], rough: 0.2, lit: '#8e9cb4', shadow: '#4e5e80', light, ambient: 0.4, ribs: 4 });
      s.terrain({ blur: 1, haze: ['#ccd8e6', 0.34] }, { base: 404, peaks: [{ x: 380, h: 220, l: 380, r: 400, k: 1.2 }, { x: 740, h: 28, s: 160 }], rough: 0.07, lit: '#b4a690', shadow: '#46547a', snowline: 258, snowLit: '#ffffff', snowShadow: '#b8c6de', foot: '#94a6c4', footFrom: 360, light });
      s.layer({ blur: 0.8 }, (cv) => cv.add('<rect x="-10" y="401" width="1300" height="5" fill="#7a8ca8"/>'));
      // the lake, deep blue: from so high it holds the sky, the mountain only faintly
      s.effect('reflect', { y: 404, deep: '#1e4c88', near: 0.05, far: 0.18, ripple: 2.4, wave: 0.22, soften: 2.4, seed: s.seed() });
      s.layer({ scale: 2, blur: 6, blend: 'screen', opacity: 0.5 }, (cv) => {
        noise(cv, { y: 404, h: 120, freq: [0.002, 0.03], seed: s.seed(), colour: '#9ab8d8', contrast: 2, bias: -0.9, opacity: 0.5, fade: [[0, 1], [1, 0]] });
      });
      s.layer({ blur: 0.8, blend: 'screen', opacity: 0.45 }, (cv) => {
        const glints = [];
        for (let i = 0; i < 140; i++) {
          const t = rnd() ** 1.3;
          const x = 700 + (rnd() + rnd() - 1) * (60 + t * 260);
          const y = 408 + t * 110;
          const w = between(rnd, 2, 9) * (0.5 + t);
          glints.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="1" fill-opacity="${n(between(rnd, 0.2, 0.8))}"/>`);
        }
        cv.add(`<g fill="#ffffff">${glints.join('')}</g>`);
      });
      // the mountainside below us running down to the shore, dry grass and boulders, in the haze
      const slope = (x) => 504 + (x / 900) * 42 + 8 * Math.sin(x / 120) + 3 * Math.sin(x / 31);
      s.layer({ blur: 0.8, haze: ['#b4c8dc', 0.3] }, (cv) => {
        // the shore: a pale line of shingle where the slope meets the water
        let d = 'M-20,520';
        for (let x = -20; x <= 900; x += 20) d += ` L${x},${n(slope(x) - 3)}`;
        cv.add(`<path d="${d} L900,560 L-20,560 Z" fill="#94a088"/>`);
      });
      s.terrain({ blur: 0.7, haze: ['#b4c8dc', 0.24] }, { base: 520, line: (x) => slope(x) + 2, peaks: [{ x: 300, h: 0, s: 700 }], lit: '#98a262', shadow: '#2e4228', foot: '#405a32', footFrom: 640, dry: '#c0a868', dryness: 0.8, light, relief: 2, ambient: 0.3, grassy: 0.6, blade: 1.3, wind: 0.2 });
      s.layer({ blur: 0.6, haze: ['#b4c8dc', 0.22] }, (cv) => {
        // boulders strewn down the slope, each with its shadow
        const rocks = [];
        for (let i = 0; i < 26; i++) {
          const x = between(rnd, 20, 780);
          const y = slope(x) + between(rnd, 8, 80);
          const r = between(rnd, 1.5, 4.5) * (1 + (y - 510) / 90);
          rocks.push(`<ellipse cx="${n(x + r * 0.5)}" cy="${n(y + r * 0.35)}" rx="${n(r * 1.3)}" ry="${n(r * 0.4)}" fill="#2a3a2a" fill-opacity="0.5"/><path d="${blob(rnd, x, y, r * 1.1, r * 0.75, 0.4, 7)}" fill="${rnd() < 0.5 ? '#8a8a7a' : '#6e7068'}"/>`);
        }
        cv.add(rocks.join(''));
      });
      // the crag's shadow thrown down the slope toward us, and the lone tree out in the light beyond it
      s.layer({ blur: 10, opacity: 0.55 }, (cv) => cv.add('<path d="M820,600 L700,560 L560,590 L600,640 L820,640 Z" fill="#1a2a2a"/>'));
      const treeAt = [640, 566];
      s.layer({ blur: 0.6, haze: ['#b4c8dc', 0.22] }, (cv) => {
        cv.add(`<ellipse cx="${n(treeAt[0] - 10)}" cy="${n(treeAt[1] + 1)}" rx="16" ry="2.6" fill="#24382a" fill-opacity="0.6"/>`);
        const t = tree(rnd, { x: treeAt[0], y: treeAt[1], height: 30, kind: 'walnut', wood: '#2a2a20', leafColour: '#3a5a30', volume: ['#24402a', '#3e6234', '#6e9448'], light: [1, -0.6], twig: 3 });
        cv.add(t.wood + t.leaves);
      });
      // an eagle turning over the slope, below us
      s.layer({ blur: 0.3 }, (cv) => birds(cv, rnd, { x: 520, y: 470, count: 1, size: 11, colour: '#2a3442', spread: 4 }));
      // the crag beside us, the sun beyond it: its face in its own shadow, buttress after buttress of rock falling
      // sheer to the slope below, its brink lit along the top
      // (a spur: its back rising from the right to the point it ends in, the face under the point stepping down)
      const crag = (x) => {
        if (x >= 900) return 336 + ((x - 900) / 400) ** 1.3 * 96 + 4 * Math.sin(x / 37) + 3 * Math.sin(x / 13);
        if (x >= 790) {
          const t = (900 - x) / 110;
          return 336 + 300 * t ** 1.5 + 34 * Math.max(0, Math.sin(t * 9)) * t + 4 * Math.sin(x / 7);
        }
        return 820;
      };
      const rim = { x: sun[0], y: sun[1], colour: '#fff2cc', width: 2.6, strength: 1, reach: 1600 };
      s.layer({ blur: 0.5, rim }, (cv) => {
        rough(cv, rockFace(rnd, { line: crag, x0: 786, x1: 1300, bottom: 740, tones: ['#1c2128', '#2e343c', '#3a4048', '#444850'], lip: '#7a7868', grass: '#3a4a2e' }), { scale: 5, freq: 0.07, seed: s.seed() });
      });
      // the grass along its top, and the stag on its brink
      const brink = [912, crag(912)];
      s.layer({ blur: 0.3, rim }, (cv) => {
        for (let x = 892; x < 1300; x += 30) cv.add(grass(rnd, { x0: x, x1: x + 30, y: crag(x + 15) + 3, count: 16, height: 14, colours: ['#2a3a22', '#34482a', '#3e522e'], wind: 0.3, width: 1.6 }));
        cv.add(deer({ x: brink[0], y: brink[1] + 3, size: 104, colour: '#16140f', facing: -1 }));
      });
      // our own pasture, in flower out to its edge, beyond which the land falls away
      const edge = (x) => 620 - (x / 1280) * 30 + 5 * Math.sin(x / 110);
      s.carpet({}, {
        top: edge,
        far: 1.4,
        near: 22,
        ground: '#26361a',
        fog: ['#b4c8dc', 0.25],
        light: [0.7, -1],
        patches: 0.3,
        focus: { from: 0.78, blur: 1.8 },
        plants: [
          { kind: 'blades', share: 6, colours: ['#5a7a34', '#6e8a3a', '#8a9a48', '#4a6a2c', '#a49a52'], height: 1.2 },
          { kind: 'daisy', share: 1, colours: ['#4a6a2c'], flower: ['#e8be36', '#f0cc4a'], leaves: '#4a6a2c', centre: '#c88214', drifts: 1.6 },
          { kind: 'daisy', share: 0.8, colours: ['#4a6a2c'], flower: ['#f6f4ec', '#ece8de'], leaves: '#4a6a2c', centre: '#e0b030', drifts: 1.4 },
          { kind: 'spike', share: 0.14, colours: ['#4a6a2c'], flower: ['#7a62b0', '#8c72bc'], leaves: '#4a6a2c', height: 1.1, drifts: 2.4 },
          { kind: 'tuft', share: 1, colours: ['#3e5a26', '#4e6a2e', '#5e7434'], drifts: 1.4 },
          { kind: 'bell', share: 0.18, colours: ['#4a6a2c'], flower: ['#c8302c', '#d8462e'], leaves: '#5a7a34', height: 1.2, drifts: 2 },
        ],
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.8, strength: 0.45, decay: 0.96, density: 0.85, colour: '#fffbe8' });
      return s.done({
        bloom: { threshold: 0.84, strength: 0.28, radius: 28, tint: '#fffbe8' },
        diffuse: { radius: 16, strength: 0.16, soften: 0.06 },
        grade: { lift: [0.02, 0.025, 0.04], gain: [1, 0.99, 0.98], saturation: 0.92, contrast: 0.18, shadows: ['#101c2c', 0.35], highlights: ['#fffcf0', 0.15] },
        vignette: { strength: 0.3, colour: '#0a1424' },
        grain: 0.014,
      });
    },
  },

  dimdim: {
    ku: 'Kela Dimdimê',
    en: 'The fortress of Dimdim',
    // Dimdim in the winter of the siege: the fortress along the top of its crag at the end of a spur of the
    // Bradost mountains, held; a low sun going down behind the ranges; and below in the valley the tents of the
    // army that has come against it, the smoke of its fires going up into the cold, and a stream frozen in its bed
    scene(rnd) {
      const s = new Scene(rnd);
      const sun = [214, 352];
      const light = [-0.85, -0.25, 0.45];
      const rim = { x: sun[0], y: sun[1], colour: '#ffd8a8', width: 2.4, strength: 0.85, reach: 1800 };
      s.layer({}, (cv) => {
        sky(cv, [[0, '#2a3248'], [0.3, '#48526a'], [0.46, '#7a7c8c'], [0.54, '#c8b4a4'], [0.6, '#e8c8a4'], [1, '#d8bca0']]);
        glow(cv, { x: sun[0], y: sun[1], r: 520, colour: '#ffd8a8', opacity: 0.6 });
        orb(cv, { x: sun[0], y: sun[1], r: 18, core: '#fff6e6', edge: '#ffe8c8', halo: '#ffd8a8', haloR: 130, haloOpacity: 0.5 });
        clouds(cv, { y: -60, h: 440, freq: [0.0024, 0.011], seed: s.seed(), colour: '#4a5064', light: '#f0c8a0', shade: '#262a3a', dx: -16, dy: 8, density: 3.2, cover: -1.3, opacity: 0.9, fade: [[0, 1], [0.7, 0.8], [1, 0]] });
      });
      // the Bradost ranges, dark rock under snow, the low sun on their western faces
      s.terrain({ blur: 1.6, haze: ['#9a8e98', 0.5] }, { base: 480, peaks: [{ x: 90, h: 110, s: 210 }, { x: 430, h: 150, l: 240, r: 220 }, { x: 1180, h: 178, l: 260, r: 240 }], rough: 0.22, lit: '#9a8478', shadow: '#2e3448', snowline: 440, snowLit: '#f8e8d8', snowShadow: '#8a92ac', light, ambient: 0.3, ribs: 6 });
      // the spur: up from the valley sheer on the west to the level top the fortress stands on, then down along
      // its back to the ranges in the east
      const knots = [[590, 556], [597, 522], [604, 478], [612, 458], [628, 452], [633, 410], [640, 352], [649, 304], [652, 274], [661, 256], [672, 247], [930, 247], [948, 258], [972, 262], [990, 284], [1030, 292], [1064, 318], [1110, 326], [1150, 352], [1196, 362], [1240, 388], [1300, 404]];
      const crag = (x) => {
        if (x < 590) return 820;
        let i = 1;
        while (i < knots.length - 1 && knots[i][0] < x) i++;
        const [xa, ya] = knots[i - 1];
        const [xb, yb] = knots[i];
        const y = ya + ((yb - ya) * (x - xa)) / Math.max(1, xb - xa);
        // the rock's edge is broken, more so on the faces than along the top where the walls stand
        return y + (x > 672 && x < 930 ? 2 * Math.sin(x / 11) : 4 * Math.sin(x / 7) + 3 * Math.sin(x / 17));
      };
      s.terrain({ blur: 0.5, haze: ['#9a8e98', 0.06], rim }, { base: 246, line: crag, peaks: [{ x: 640, h: 0, s: 70 }, { x: 720, h: 0, s: 80 }, { x: 820, h: 0, s: 90 }, { x: 920, h: 0, s: 90 }, { x: 1060, h: 0, s: 130 }, { x: 1220, h: 0, s: 150 }], lit: '#86725f', shadow: '#1a1e2a', foot: '#4a5068', footFrom: 520, snowline: 330, snowLit: '#f6e8dc', snowShadow: '#7a849e', light, ribs: 5, relief: 1.6, ambient: 0.22, scale: 1.2 });
      s.layer({ blur: 0.4, rim: { ...rim, width: 1.8, strength: 0.7 } }, (cv) => {
        cv.add(fortress(rnd, { line: (x) => crag(x) + 3, x0: 668, x1: 952, wallH: 36, stone: '#4a4448', lit: '#c09878', dark: '#22252e', snow: '#f0e6e2', slit: '#101016', light: -1 }));
      });
      // the valley under snow, and the long shadows of the low sun across it
      const floor = (x) => 556 + 6 * Math.sin(x / 210) + 2 * Math.sin(x / 47);
      s.terrain({ blur: 0.5 }, { base: 556, line: floor, peaks: [{ x: 1500, h: 0, s: 1600 }], lit: '#e8dcd6', shadow: '#7a84a2', foot: '#c8cad6', footFrom: 660, light, grassy: 0.12, blade: 2.6, wind: 0.6, relief: 1.4, ambient: 0.45, dry: '#f0d0b8', dryness: 0.35 });
      s.layer({ blur: 16, opacity: 0.55 }, (cv) => cv.add('<path d="M640,560 L1300,590 L1300,660 L900,610 L620,566 Z" fill="#3e4868"/>'));
      // the stream, frozen, winding down the valley toward us between snowy banks
      s.layer({ blur: 0.7 }, (cv) => {
        const bed = spline([[600, 560], [530, 572], [590, 594], [470, 620], [400, 660], [470, 706], [430, 760]], 16);
        const width = (y) => 2 + ((y - 556) / 200) ** 1.4 * 46;
        const left = bed.map(([x, y]) => [x - width(y) / 2, y]);
        const right = bed.map(([x, y]) => [x + width(y) * 0.6, y]);
        cv.add(`<path d="M${[...left, ...right.reverse()].map(pt).join(' L')} Z" fill="#8c9cb0"/>`);
        const sheen = bed.map(([x, y]) => [x - width(y) * 0.1, y]);
        const sheen2 = bed.map(([x, y]) => [x + width(y) * 0.25, y]);
        cv.add(`<path d="M${[...sheen, ...sheen2.reverse()].map(pt).join(' L')} Z" fill="#b4c2d0" fill-opacity="0.7"/>`);
        const cracks = [];
        bed.forEach(([x, y], i) => {
          if (i % 4 || y < 580) return;
          const w = width(y);
          cracks.push(`M${pt([x - w * 0.4, y + between(rnd, -2, 2)])} L${pt([x + between(rnd, -0.1, 0.2) * w, y + between(rnd, -3, 3)])} L${pt([x + w * 0.5, y + between(rnd, -2, 2)])}`);
        });
        cv.add(`<path d="${cracks.join(' ')}" fill="none" stroke="#5a6a82" stroke-width="1" stroke-opacity="0.6"/>`);
      });
      // the camp: tents across the valley floor in rows, nearer ones bigger, and its fires
      const tentsAt = [];
      for (let row = 0; row < 5; row++) {
        const y0 = 560 + row * 9;
        for (let x = between(rnd, 20, 60); x < 1290; x += between(rnd, 16, 34)) {
          if (x > 580 && x < 1000) continue;
          if (Math.abs(x - (row < 2 ? 560 : 480)) < 50) continue;
          if (rnd() < 0.25) continue;
          const y = y0 + between(rnd, -2, 3);
          tentsAt.push([x, y, 9 + (y - 556) * 0.3 + between(rnd, -1, 2)]);
        }
      }
      tentsAt.sort((p, q) => p[1] - q[1]);
      const fires = tentsAt.filter(([x]) => x < 600 && rnd() < 0.2).map(([x, y]) => [x + between(rnd, -10, 10), y + 4]);
      s.layer({ blur: 0.4, rim: { ...rim, width: 1.4, strength: 0.7 } }, (cv) => {
        cv.add(campTents(rnd, { at: tentsAt, canvas: '#8a7c70', shade: '#3a3a48', door: '#1a1820', light: -1 }));
      });
      // the smoke of its fires going up and leaning off east, across the foot of the crag, and the fires
      s.layer({ blur: 2.4, opacity: 0.9 }, (cv) => {
        for (const [x, y] of fires) cv.add(smoke(rnd, { x, y: y - 4, rise: between(rnd, 180, 300), lean: 0.9, width: 10, colour: '#5e5660', opacity: 0.75 }));
      });
      s.layer({ blur: 0.8, blend: 'screen' }, (cv) => {
        for (const [x, y] of fires) glow(cv, { x, y: y - 2, r: 9, colour: '#ff9a4a', opacity: 0.85 });
      });
      // the snow at our feet, dry grass and a stone or two showing through it, and a bare oak on the left
      const near = (x) => 664 + 18 * Math.sin(x / 300);
      s.terrain({ blur: 0.6 }, { base: 664, line: near, peaks: [{ x: 1500, h: 0, s: 1600 }], lit: '#e4dcd8', shadow: '#6e7896', foot: '#b8bccc', footFrom: 720, light, grassy: 0.2, blade: 4, wind: 0.5, relief: 1.6, ambient: 0.45, dry: '#f0d4bc', dryness: 0.3 });
      s.layer({ blur: 0.9, rim: { ...rim, width: 1.4, strength: 0.6 } }, (cv) => {
        for (let x = 0; x < 1280; x += between(rnd, 50, 140)) cv.add(grass(rnd, { x0: x, x1: x + between(rnd, 20, 60), y: near(x) + between(rnd, 6, 40), count: Math.round(between(rnd, 6, 18)), height: between(rnd, 14, 30), colours: ['#8a7458', '#6a5a46', '#a08a6a'], wind: 0.35, width: 1.4 }));
      });
      s.layer({ blur: 0.8, rim: { ...rim, width: 2, strength: 0.9 } }, (cv) => {
        const oak = tree(rnd, { x: 88, y: 760, height: 460, kind: 'oak', wood: '#1e1a1c', leafColour: '#1e1a1c', leafiness: 0, lean: 0.14, twig: 4 });
        cv.add(oak.wood);
      });
      s.effect('rays', { x: sun[0], y: sun[1], threshold: 0.74, strength: 0.7, decay: 0.965, density: 0.9, colour: '#ffe0b8' });
      return s.done({
        bloom: { threshold: 0.78, strength: 0.36, radius: 28, tint: '#ffd8b0' },
        diffuse: { radius: 16, strength: 0.14, soften: 0.05 },
        grade: { lift: [0.02, 0.024, 0.04], gain: [1.03, 0.99, 0.97], saturation: 0.88, contrast: 0.26, shadows: ['#10141f', 0.5], highlights: ['#fff0dc', 0.14] },
        vignette: { strength: 0.45, colour: '#0c0e16' },
        grain: 0.016,
        clumps: 0.01,
      });
    },
  },
};

/** The covers, in the order the library's legends are listed: `key` names the file, `ku` and `en` are its names. */
const ORDER = ['kawa', 'sahmaran', 'mem-u-zin', 'siyabend', 'dimdim'];

export const STORY_COVERS = ORDER.map((key) => ({ key, ku: SCENES[key].ku, en: SCENES[key].en, scene: SCENES[key].scene }));

/** The size and weight of a cover: the shop's backgrounds', as they are shown in the same places. */
export const COVER = { width: W, height: H, maxBytes: 120 * 1024 };

/** Where a cover is written, relative to the repo root. */
export const storyCoverFile = (piece) => `web/public/cosmetics/backgrounds/story-${piece.key}.webp`;

/** A cover's scene: its layers and effects, seeded by its own name (kept apart from the shop's by `story:`). */
export function storyCoverScene(piece) {
  return piece.scene(random(seedOf(`story:${piece.key}`)));
}

/** A cover, rendered by the compositor and written as WebP at the best quality that fits under the budget. */
export async function renderStoryCover(piece) {
  const rgb = await renderScene({ w: COVER.width, h: COVER.height, ...storyCoverScene(piece), seed: seedOf(`story:${piece.key}:grain`) });
  for (let q = 92; q >= 60; q -= 4) {
    const buf = await sharp(rgb, { raw: { width: COVER.width, height: COVER.height, channels: 3 } }).webp({ quality: q, effort: 6, smartSubsample: true }).toBuffer();
    if (buf.length <= COVER.maxBytes) return buf;
  }
  throw new Error(`${piece.key}: cannot fit under ${COVER.maxBytes} bytes`);
}

// ─────────────────────────────────────────────────────────────── on every core

/**
 * Draws the covers on worker threads, one per core up to five (each takes
 * seconds, the compositor being plain JavaScript), and resolves to their
 * bytes in the order given. Each is seeded by its own name, so which thread
 * draws it changes nothing.
 */
function drawAll(pieces) {
  const out = new Array(pieces.length);
  let next = 0;
  const threads = Math.min(os.availableParallelism(), pieces.length);
  const crew = Array.from({ length: threads }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { draws: true }, execArgv: [] });
    const hand = () => {
      if (next >= pieces.length) return worker.terminate().then(() => resolve(), reject);
      const at = next++;
      worker.postMessage({ at, key: pieces[at].key });
    };
    worker.on('message', ({ at, bytes, error }) => {
      if (error) return worker.terminate().then(() => reject(new Error(`drawing ${pieces[at].key}: ${error}`)), reject);
      out[at] = Buffer.from(bytes);
      hand();
    });
    worker.on('error', reject);
    hand();
  }));
  return Promise.all(crew).then(() => out);
}

if (!isMainThread && workerData?.draws) {
  parentPort.on('message', async ({ at, key }) => {
    try {
      parentPort.postMessage({ at, bytes: await renderStoryCover(STORY_COVERS.find((p) => p.key === key)) });
    } catch (err) {
      parentPort.postMessage({ at, error: err?.stack ?? String(err) });
    }
  });
}

/** Writes the covers (or the one `only` names) under `outRoot`, as the repo lays them out; returns the files written. */
export async function renderStoryCovers(outRoot, { only = null, log = () => {} } = {}) {
  const pieces = STORY_COVERS.filter((p) => !only || p.key === only);
  if (!pieces.length) throw new Error(`no story cover is called ${only}`);
  const files = await drawAll(pieces);
  return pieces.map((piece, i) => {
    const rel = storyCoverFile(piece);
    const file = path.join(outRoot, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, files[i]);
    log(`  ${rel.padEnd(56)} ${(files[i].length / 1024).toFixed(0).padStart(4)}KB`);
    return rel;
  });
}

if (isMainThread && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const at = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  await renderStoryCovers(at('--out') ? path.resolve(at('--out')) : root, { only: at('--only'), log: console.log });
}
