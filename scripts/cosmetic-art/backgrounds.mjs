/**
 * The shop's backgrounds: Kurdish mountains, valleys and skies, and kilims.
 *
 * Each is painted for the way it is shown. On a profile card the 1280 × 720
 * picture is cropped to a strip about three times as wide as it is tall, from
 * the middle — so what a scene is about (the peaks, the village, the fire) sits
 * between y = 210 and y = 510, and the sky above and ground below are there to
 * be cut.
 *
 * The places are the country's own: Agirî and the little mountain beside it,
 * Sîpan over its lake, a village stepped up the mountainside the way Hewraman
 * is, black tents on the summer pastures, poplars along the water, Zagros oaks,
 * Judas trees and almonds in flower, and Newroz — fires on every hill and a
 * govend round the nearest one.
 *
 * `key` names the file and seeds the drawing; `ku` and `en` are its names in
 * the shop, which api/content/cosmetics.json and migration 1751000161000 hold
 * too — a piece is redrawn here, never renamed.
 */
import { tint } from './kit.mjs';
import { kilim } from './kilim.mjs';
import {
  aurora, birds, bonfire, cloud, crescent, deer, drifts, fireflies, flock, fog, fullMoon, glow, govend, grass, grove, heightAt,
  hillFires, hills, kurdishSun, lake, river, meadow, milkyWay, mist, oak, orb, petals, poplarRow, range, rays, sky, stars, tent, tulips,
  village, vignette,
} from './landscape.mjs';

/** Kilim palettes: ground, outlining wool, undyed wool, and the dyes. */
const KILIMS = [
  ['kilima-sor', 'Kilîma Sor', 'Red kilim', 'guls', { field: '#a3202c', ink: '#2a1418', light: '#f1e2c4', dyes: ['#e9a93a', '#1f4f8a', '#2f7a4a', '#f4d27a'] }],
  ['kilima-mor', 'Kilîma Mor', 'Purple kilim', 'bands', { field: '#4d2a6e', ink: '#1c0f29', light: '#efe1cf', dyes: ['#d24d6a', '#e9b23a', '#7fb0d8', '#c08ad9'] }],
  ['kilima-zer', 'Kilîma Zer', 'Gold kilim', 'lattice', { field: '#d39a2c', ink: '#3a2414', light: '#f6ead0', dyes: ['#a3202c', '#1f4f8a', '#2f6e44', '#7a3b1c'] }],
  ['kilima-kesk', 'Kilîma Kesk', 'Green kilim', 'guls', { field: '#245c3e', ink: '#10261a', light: '#f0e6cc', dyes: ['#c8323c', '#e9b23a', '#f3d9a4', '#9a5ab0'] }],
  ['kilima-sin', 'Kilîma Şîn', 'Blue kilim', 'bands', { field: '#1d3b72', ink: '#0d1830', light: '#ede4d0', dyes: ['#c8323c', '#e9a93a', '#7ec2c6', '#f2d27a'] }],
  ['kilima-gulan', 'Kilîma Gulan', 'Rose kilim', 'lattice', { field: '#b8506a', ink: '#3a1420', light: '#f8e8dc', dyes: ['#2f6e5a', '#f0b84a', '#5a2c6e', '#f5c6cf'] }],
  ['kilima-seve', 'Kilîma Şevê', 'Night kilim', 'guls', { field: '#1c1a2a', ink: '#0a0910', light: '#d9d2c4', dyes: ['#8a2a3a', '#c79a3a', '#3e6a8a', '#6b4a8a'] }],
];

export const BACKGROUNDS = [
  {
    key: 'hevalo',
    ku: 'Hevalo',
    en: 'Hevalo violet',
    // dusk in the Zagros, range behind range in Hevalo's violets, and the deer keeping watch
    draw(cv, rnd) {
      sky(cv, [[0, '#1d0f33'], [0.45, '#4a2477'], [0.75, '#9a5bc4'], [1, '#e7a6c8']]);
      stars(cv, rnd, { count: 120, bottom: 300, colour: '#f3e6ff', bright: 3 });
      crescent(cv, 300, 215, 30, { colour: '#fff1d6', halo: '#e2b8ff', tilt: -0.9 });
      glow(cv, 760, 420, 520, '#ffc2dc', 0.35);
      range(cv, rnd, { base: 420, peaks: [{ x: 140, h: 150, s: 220 }, { x: 560, h: 200, s: 260 }, { x: 980, h: 170, s: 240 }, { x: 1260, h: 140, s: 200 }], fill: '#8e5cb8', foot: '#c486c9', shade: '#4a2a72', shadeOpacity: 0.35, haze: '#e6a9cc', hazeOpacity: 0.6 });
      range(cv, rnd, { base: 470, peaks: [{ x: 320, h: 150, s: 240 }, { x: 820, h: 120, s: 220 }, { x: 1160, h: 150, s: 230 }], fill: '#6a3c98', foot: '#9a62b2', shade: '#2e1752', shadeOpacity: 0.4, haze: '#c58ac4', hazeOpacity: 0.5 });
      const near = range(cv, rnd, { base: 560, peaks: [{ x: 900, h: 190, l: 260, r: 330, k: 1.1 }, { x: 220, h: 90, s: 260 }], rough: 0.12, fill: '#43215f', foot: '#2a133e', shade: '#1a0a2a', shadeOpacity: 0.4 });
      deer(cv, { x: 905, y: heightAt(near, 905) + 6, size: 92, colour: '#1c0b2b', facing: -1 });
      hills(cv, rnd, { base: 660, amp: 40, count: 2, fill: '#231033', foot: '#140820', scale: 300 });
    },
  },
  {
    key: 'seva-zozanan',
    ku: 'Şeva Zozanan',
    en: 'Night on the high pastures',
    // the summer camp at night: black tents lit from inside, the flock asleep, the peaks under the moon
    draw(cv, rnd) {
      sky(cv, [[0, '#060d24'], [0.55, '#14275a'], [1, '#3b5c96']]);
      stars(cv, rnd, { count: 300, bottom: 360, bright: 6 });
      crescent(cv, 1060, 200, 34, { colour: '#fbf1d0', halo: '#9fb8ff' });
      range(cv, rnd, { base: 420, peaks: [{ x: 200, h: 220, s: 240 }, { x: 610, h: 250, s: 260 }, { x: 1050, h: 230, s: 250 }], fill: '#34507f', foot: '#4a6a9c', shade: '#101c3c', shadeOpacity: 0.45, snow: 250, snowLit: '#dfe8fa', snowShade: '#93a8cf', light: 1, haze: '#5f7fb5', hazeOpacity: 0.45 });
      drifts(cv, rnd, { y: 420, count: 6, colour: '#8fa9d8', opacity: 0.35, h: 34 });
      const slope = hills(cv, rnd, { base: 480, amp: 45, count: 2, fill: '#1f3358', foot: '#142443', scale: 300 });
      tent(cv, { x: 560, y: heightAt(slope, 560) + 34, w: 130, cloth: '#0c0a10', clothLit: '#26222e', lamp: '#ffb85c' });
      tent(cv, { x: 740, y: heightAt(slope, 740) + 40, w: 96, cloth: '#0c0a10', clothLit: '#26222e', lamp: '#ffc477' });
      flock(cv, rnd, { x: 330, y: 530, w: 260, count: 26, size: 7, wool: '#b8c4dc', woolShade: '#7f8fb0', head: '#0e1424' });
      hills(cv, rnd, { base: 600, amp: 50, count: 2, fill: '#13213d', foot: '#0a1428', scale: 260 });
      grass(cv, rnd, { y: 720, count: 120, h: 30, dark: '#0a1426', lit: '#1d3256' });
    },
  },
  {
    key: 'ezmane-sterkan',
    ku: 'Ezmanê Stêrkan',
    en: 'Sky full of stars',
    // the Milky Way over the ridges, and a lone oak on the hill
    draw(cv, rnd) {
      sky(cv, [[0, '#04040f'], [0.55, '#121440'], [0.85, '#2e2560'], [1, '#5a3a6e']]);
      glow(cv, 640, 560, 700, '#c06a9a', 0.35);
      milkyWay(cv, rnd, { from: [-60, 640], to: [1340, 0], width: 280, colours: ['#7a6ad0', '#f0c8ff', '#fff4e4'], dust: '#0a0920' });
      milkyWay(cv, rnd, { from: [-60, 640], to: [1340, 0], width: 120, colours: ['#a08ae6', '#ffd8f0', '#ffffff'], dust: '#0a0920' });
      stars(cv, rnd, { count: 700, bottom: 520, bright: 12, colour: '#fff8ef' });
      range(cv, rnd, { base: 500, peaks: [{ x: 160, h: 120, s: 220 }, { x: 640, h: 150, s: 280 }, { x: 1130, h: 130, s: 240 }], fill: '#151638', foot: '#1c1d45', shade: '#05051a', shadeOpacity: 0.4 });
      const hill = hills(cv, rnd, { base: 560, amp: 60, count: 1, fill: '#0b0b20', foot: '#06060f', scale: 500 });
      oak(cv, rnd, { x: 820, y: heightAt(hill, 820) + 8, size: 150, leaf: '#08081a', leafLit: '#0e0e26', leafDark: '#05050f', trunk: '#05050f' });
      glow(cv, 380, heightAt(hill, 380) - 6, 40, '#ffcf7a', 0.4);
      cvWindow(cv, 380, heightAt(hill, 380) - 8);
    },
  },
  {
    key: 'heyva-zivin',
    ku: 'Heyva Zîvîn',
    en: 'Silver moon',
    // a full moon over a village stepped up the mountainside, its windows lit
    draw(cv, rnd) {
      sky(cv, [[0, '#0f1a33'], [0.55, '#253b62'], [1, '#56709a']]);
      stars(cv, rnd, { count: 140, bottom: 330, colour: '#e8eefc', bright: 3 });
      fullMoon(cv, 960, 215, 52, { halo: '#bcd0ff', haloOpacity: 0.4 });
      range(cv, rnd, { base: 400, peaks: [{ x: 300, h: 200, s: 260 }, { x: 760, h: 230, s: 300 }, { x: 1200, h: 190, s: 220 }], fill: '#3a4f78', foot: '#4f6890', shade: '#18233f', shadeOpacity: 0.45, snow: 230, snowLit: '#e6edfa', snowShade: '#9fb0cf', light: 1, haze: '#7088b4', hazeOpacity: 0.45 });
      drifts(cv, rnd, { y: 400, count: 6, colour: '#9fb4d6', opacity: 0.4, h: 36 });
      range(cv, rnd, { base: 640, peaks: [{ x: 120, h: 400, l: 300, r: 820, k: 0.75 }], rough: 0.03, fill: '#2b3d5e', foot: '#1b2942', shade: '#0f1830', shadeOpacity: 0.3, light: 1, gullies: 0.2 });
      village(cv, rnd, { x: 330, y: 520, w: 300, rows: 9, house: 24, wall: '#56698c', wallLit: '#6a7fa5', wallDark: '#34425f', roof: '#7a8db3', door: '#1a2236', lights: '#ffcf7a', light: 1, climb: -1.55, rise: 0.8, shrink: 0.04 });
      poplarRow(cv, rnd, { x0: 760, x1: 1180, y: 560, h: 110, count: 9, leaf: '#1b2a40', leafLit: '#30466a', light: 1 });
      hills(cv, rnd, { base: 640, amp: 30, count: 2, fill: '#141f33', foot: '#0b1322', scale: 300 });
    },
  },
  {
    key: 'berfa-ciyayan',
    ku: 'Berfa Çiyayan',
    en: 'Snow on the mountains',
    // Agirî: the great mountain and the little one beside it, in snow, from the plain
    draw(cv, rnd) {
      sky(cv, [[0, '#4f86d0'], [0.45, '#94bdec'], [0.72, '#d3e5f5'], [1, '#eef4fa']]);
      glow(cv, 1080, 110, 520, '#ffffff', 0.45);
      cloud(cv, rnd, { x: 250, y: 140, w: 240, lit: '#ffffff', shade: '#cfdcef', opacity: 0.9 });
      cloud(cv, rnd, { x: 1100, y: 220, w: 180, lit: '#ffffff', shade: '#d4e0f0', opacity: 0.75 });
      range(cv, rnd, { base: 450, peaks: [{ x: 110, h: 70, s: 200 }, { x: 1190, h: 90, s: 240 }], fill: '#9db6d6', foot: '#c9d8ea', shade: '#5f7aa8', shadeOpacity: 0.25 });
      range(cv, rnd, {
        base: 450,
        peaks: [{ x: 760, h: 300, l: 360, r: 420, k: 1.25 }, { x: 395, h: 165, s: 165, k: 1.1 }],
        rough: 0.06,
        scale: 70,
        fill: '#7e8fb4',
        foot: '#b8c4d8',
        shade: '#3b4a78',
        shadeOpacity: 0.4,
        snow: 280,
        snowLit: '#ffffff',
        snowShade: '#dfe8f5',
        haze: '#eef4fa',
        hazeOpacity: 0.7,
      });
      drifts(cv, rnd, { y: 445, count: 7, colour: '#f2f7fc', opacity: 0.7, h: 30 });
      const plain = hills(cv, rnd, { base: 480, amp: 26, count: 2, fill: '#c2b47a', foot: '#9aa25e', scale: 400 });
      poplarRow(cv, rnd, { x0: 90, x1: 330, y: heightAt(plain, 210) + 46, h: 70, count: 7, leaf: '#4b6b34', leafLit: '#7c9a4c' });
      village(cv, rnd, { x: 930, y: 530, w: 240, rows: 2, house: 26, wall: '#d9c7a4', wallLit: '#efe0c0', wallDark: '#a8946f', roof: '#8a7556', light: -1 });
      hills(cv, rnd, { base: 560, amp: 34, count: 3, fill: '#86a258', foot: '#5d7d3e', scale: 300 });
      hills(cv, rnd, { base: 650, amp: 50, count: 2, fill: '#5d7d3e', foot: '#3f5e2c', scale: 250 });
      meadow(cv, rnd, { top: 600, bottom: 720, count: 170, colours: ['#ffffff', '#ffe27a', '#f4a4c0'] });
    },
  },
  {
    key: 'gola-sin',
    ku: 'Gola Şîn',
    en: 'Blue lake',
    // Sîpan in snow over the still blue lake, poplars on the near shore
    draw(cv, rnd) {
      sky(cv, [[0, '#2e6fc0'], [0.5, '#7fb6e6'], [1, '#d8ecf6']]);
      cloud(cv, rnd, { x: 300, y: 120, w: 220, lit: '#ffffff', shade: '#d3e0f0', opacity: 0.9 });
      cloud(cv, rnd, { x: 1040, y: 170, w: 260, lit: '#ffffff', shade: '#d3e0f0', opacity: 0.85 });
      const far = range(cv, rnd, { base: 400, peaks: [{ x: 120, h: 80, s: 220 }, { x: 1150, h: 100, s: 260 }], fill: '#88a5c9', foot: '#b5cbe2', shade: '#56739f', shadeOpacity: 0.25 });
      const sipan = range(cv, rnd, { base: 400, peaks: [{ x: 600, h: 220, l: 330, r: 380, k: 1.15 }], rough: 0.07, fill: '#6f86ad', foot: '#a2b6d1', shade: '#34466f', shadeOpacity: 0.4, snow: 250, snowShade: '#d9e3f2', haze: '#d8ecf6', hazeOpacity: 0.5 });
      lake(cv, rnd, { y: 400, colours: [[0, '#4fa3c9'], [0.4, '#2b7fb0'], [1, '#14507e']], reflect: [{ pts: far, fill: '#7fa3c7', opacity: 0.35 }, { pts: sipan, fill: '#a9c3df', opacity: 0.4 }], shimmer: '#e8f6ff', shimmerX: 600, shimmerWidth: 380 });
      const shore = hills(cv, rnd, { base: 560, amp: 26, count: 2, fill: '#6f9e4c', foot: '#4f7e3a', scale: 340 });
      poplarRow(cv, rnd, { x0: 760, x1: 1260, y: heightAt(shore, 1000) + 30, h: 170, count: 10, leaf: '#3f6e34', leafLit: '#82ad52' });
      oak(cv, rnd, { x: 170, y: heightAt(shore, 170) + 40, size: 150, leaf: '#4f7e3a', leafLit: '#86b35a', leafDark: '#33572a', trunk: '#4a3426' });
      hills(cv, rnd, { base: 660, amp: 30, count: 2, fill: '#4f7e3a', foot: '#36602a', scale: 300 });
      meadow(cv, rnd, { top: 620, bottom: 720, count: 120, colours: ['#ffffff', '#ffe27a', '#bfa6f0'] });
    },
  },
  {
    key: 'ronahiya-bakur',
    ku: 'Ronahiya Bakur',
    en: 'Northern lights',
    // a winter night, light hanging in curtains over the snowbound peaks
    draw(cv, rnd) {
      sky(cv, [[0, '#030a17'], [0.6, '#0b2238'], [1, '#174052']]);
      stars(cv, rnd, { count: 260, bottom: 420, bright: 5 });
      aurora(cv, rnd, { y: 250, amp: 70, height: 220, colours: ['#47f0a2', '#58c8ff', '#b77cff'], opacity: 0.75 });
      range(cv, rnd, { base: 450, peaks: [{ x: 180, h: 200, s: 230 }, { x: 600, h: 250, s: 270 }, { x: 1040, h: 220, s: 250 }], fill: '#2a4a5e', foot: '#3b6276', shade: '#0b1a26', shadeOpacity: 0.45, snow: 270, snowLit: '#d8f4ec', snowShade: '#7fa8b2', light: 1, haze: '#3f7a80', hazeOpacity: 0.4 });
      const field = hills(cv, rnd, { base: 520, amp: 30, count: 2, fill: '#cfe2e8', foot: '#9fbcc8', scale: 400 });
      village(cv, rnd, { x: 760, y: heightAt(field, 860) + 18, w: 220, rows: 2, house: 24, wall: '#38505e', wallLit: '#425e6e', wallDark: '#24343e', roof: '#e6f2f5', door: '#0e1820', lights: '#ffcf7a', light: 1 });
      grove(cv, rnd, { pts: field, x0: 0, x1: 480, count: 9, size: 70, leaf: '#0f2026', leafLit: '#18303a', leafDark: '#0a161b', trunk: '#0a161b', light: 1 });
      hills(cv, rnd, { base: 650, amp: 40, count: 2, fill: '#b7d0d9', foot: '#8eabb8', scale: 300 });
    },
  },
  {
    key: 'bin-erxewanan',
    ku: 'Binê Erxewanan',
    en: 'Under the Judas trees',
    // spring in the valley, the Judas trees out in magenta, petals on the wind
    draw(cv, rnd) {
      sky(cv, [[0, '#7fb2e3'], [0.55, '#c9def2'], [1, '#f6e6ef']]);
      range(cv, rnd, { base: 420, peaks: [{ x: 300, h: 180, s: 260 }, { x: 860, h: 210, s: 300 }, { x: 1240, h: 150, s: 200 }], fill: '#8a9ec4', foot: '#c3cde2', shade: '#55678f', shadeOpacity: 0.32, snow: 270, snowShade: '#dfe6f2', haze: '#f2e6ef', hazeOpacity: 0.6 });
      const valley = hills(cv, rnd, { base: 470, amp: 40, count: 2, fill: '#9cc06a', foot: '#7aa552', scale: 320 });
      poplarRow(cv, rnd, { x0: 380, x1: 900, y: heightAt(valley, 640) + 22, h: 90, count: 12, leaf: '#4f7e3a', leafLit: '#8db85a' });
      const near = hills(cv, rnd, { base: 590, amp: 50, count: 2, fill: '#79a552', foot: '#5a8a40', scale: 260 });
      for (const [x, s] of [[140, 230], [1120, 250], [360, 150], [930, 140]]) {
        oak(cv, rnd, { x, y: heightAt(near, x) + 40, size: s, leaf: '#c63f8f', leafLit: '#f08cc4', leafDark: '#8e2a68', trunk: '#4a3028', blossom: '#d45ca0', blossomLit: '#ffc0e2' });
      }
      petals(cv, rnd, { count: 90, top: 120, bottom: 700, colours: ['#f08cc4', '#d45ca0', '#ffc0e2'], size: 5 });
      meadow(cv, rnd, { top: 620, bottom: 720, count: 120, colours: ['#ffffff', '#f7c6e0', '#ffe27a'] });
    },
  },
  {
    key: 'berbang',
    ku: 'Berbang',
    en: 'Daybreak',
    // first light: the sun lifting over ridge after ridge, mist still in the valleys
    draw(cv, rnd) {
      sky(cv, [[0, '#6b8fd0'], [0.4, '#d9b3d8'], [0.7, '#ffcf9f'], [1, '#fff0d6']]);
      orb(cv, 640, 380, 46, { core: '#fffaf0', rim: '#ffe2a8', halo: '#ffd59a', haloR: 520, haloOpacity: 0.7 });
      rays(cv, { x: 640, y: 380, colour: '#fff3d6', count: 13, spread: 3.2, opacity: 0.12, angle: -Math.PI / 2 });
      birds(cv, rnd, { x: 860, y: 230, count: 5, size: 9, colour: '#6a5a7a' });
      const layers = [
        [400, '#c4a2c6', '#e9c2c8', 120],
        [450, '#a688b6', '#d3aac0', 130],
        [510, '#86699f', '#b38fb0', 140],
        [580, '#644d84', '#8d6e9a', 150],
        [670, '#43325f', '#5d4878', 150],
      ];
      for (const [i, [base, fill, foot, amp]] of layers.entries()) {
        range(cv, rnd, { base, peaks: [{ x: 120 + i * 90, h: amp, s: 260 }, { x: 560 + i * 60, h: amp * 0.8, s: 240 }, { x: 1000 - i * 40, h: amp * 0.9, s: 260 }, { x: 1300, h: amp * 0.7, s: 240 }], rough: 0.14, fill, foot, shade: '#2a1a40', shadeOpacity: 0.12 + i * 0.05, light: 1, gullies: 0.2 });
        if (i < 4) drifts(cv, rnd, { y: base + 10, count: 6, colour: '#ffe9d2', opacity: 0.5 - i * 0.08, h: 22 });
      }
    },
  },
  {
    key: 'mija-gulan',
    ku: 'Mija Gulan',
    en: 'Rose mist',
    // ridges fading into a rose-coloured haze, poplars standing in the mist
    draw(cv, rnd) {
      sky(cv, [[0, '#e8b9c9'], [0.5, '#f6d4dc'], [1, '#fbe9ea']]);
      orb(cv, 900, 230, 60, { core: '#fff6f2', rim: '#ffe0e2', halo: '#ffffff', haloR: 420, haloOpacity: 0.55 });
      const tones = ['#e6b6c4', '#d89aae', '#c47e96', '#a8607c', '#874662'];
      for (const [i, fill] of tones.entries()) {
        const base = 380 + i * 70;
        const pts = range(cv, rnd, { base, peaks: [{ x: 80 + i * 230, h: 120 + i * 10, s: 240 }, { x: 620 - i * 50, h: 100, s: 280 }, { x: 1100 + i * 30, h: 130, s: 260 }], rough: 0.1, fill, foot: tint(fill, 0.15), shade: '#5a2440', shadeOpacity: 0.08 + i * 0.03, gullies: 0.1 });
        if (i === 3) poplarRow(cv, rnd, { x0: 120, x1: 560, y: heightAt(pts, 340) + 40, h: 110, count: 8, leaf: '#9a4f6e', leafLit: '#b86a88' });
        mist(cv, base + 30, 90, '#fbe9ea', 0.6);
      }
      birds(cv, rnd, { x: 420, y: 200, count: 4, size: 8, colour: '#9a5a74' });
    },
  },
  {
    key: 'evara-zerin',
    ku: 'Êvara Zêrîn',
    en: 'Golden evening',
    // harvest at golden hour: wheat to the hills, poplars, a village catching the last sun
    draw(cv, rnd) {
      sky(cv, [[0, '#3d6cb0'], [0.35, '#e6b06a'], [0.7, '#ffcf7a'], [1, '#ffe6b0']]);
      orb(cv, 980, 330, 50, { core: '#fff6d8', rim: '#ffd27a', halo: '#ffb347', haloR: 560, haloOpacity: 0.6 });
      rays(cv, { x: 980, y: 330, colour: '#fff1c4', count: 11, spread: 2.6, opacity: 0.1, angle: Math.PI });
      range(cv, rnd, { base: 420, peaks: [{ x: 200, h: 170, s: 260 }, { x: 640, h: 150, s: 280 }, { x: 1180, h: 120, s: 240 }], fill: '#a87a6e', foot: '#d8a77a', shade: '#5a3a46', shadeOpacity: 0.35, light: 1, haze: '#ffd9a0', hazeOpacity: 0.55 });
      const fields = hills(cv, rnd, { base: 470, amp: 30, count: 2, fill: '#d9a441', foot: '#c88a2e', crest: '#ffe08a', scale: 400 });
      poplarRow(cv, rnd, { x0: 120, x1: 700, y: heightAt(fields, 400) + 20, h: 120, count: 12, leaf: '#6e6a2a', leafLit: '#d6b04a', light: 1 });
      village(cv, rnd, { x: 720, y: heightAt(fields, 800) + 34, w: 220, rows: 2, house: 26, wall: '#d9a46a', wallLit: '#f2c88a', wallDark: '#9a6a44', roof: '#7a5434', light: 1 });
      const near = hills(cv, rnd, { base: 590, amp: 40, count: 2, fill: '#e2ae4a', foot: '#c08a30', scale: 300 });
      // sheaves standing in the stubble
      for (let i = 0; i < 9; i++) {
        const x = 90 + i * 135 + (rnd() - 0.5) * 50;
        const y = heightAt(near, x) + 50 + rnd() * 30;
        cv.add(`<path d="M${x - 12},${y} L${x - 4},${y - 34} L${x + 4},${y - 34} L${x + 12},${y} Z" fill="#b97a24"/><path d="M${x - 4},${y - 34} L${x},${y - 46} L${x + 4},${y - 34} Z" fill="#f2c45a"/><rect x="${x - 8}" y="${y - 20}" width="16" height="3" fill="#7a4a1a"/>`);
      }
      grass(cv, rnd, { y: 720, count: 200, h: 46, dark: '#b5802a', lit: '#f2c45a' });
    },
  },
  {
    key: 'agire-newroze',
    ku: 'Agirê Newrozê',
    en: 'Newroz fire',
    // the night before spring: fires on every hill, and a govend round the nearest
    draw(cv, rnd) {
      sky(cv, [[0, '#0d0a24'], [0.45, '#2a1440'], [0.75, '#6a2440'], [1, '#b2452f']]);
      stars(cv, rnd, { count: 220, bottom: 330, bright: 5 });
      const far = range(cv, rnd, { base: 400, peaks: [{ x: 200, h: 170, s: 220 }, { x: 640, h: 210, s: 260 }, { x: 1100, h: 180, s: 230 }], fill: '#3a1d3e', foot: '#5a2638', shade: '#1a0d22', shadeOpacity: 0.45 });
      hillFires(cv, rnd, { pts: far, count: 9, size: 4, below: [10, 70] });
      const mid = hills(cv, rnd, { base: 450, amp: 50, count: 2, fill: '#2a1428', foot: '#3a1a28', scale: 300 });
      hillFires(cv, rnd, { pts: mid, count: 5, size: 6, below: [6, 30] });
      const ground = hills(cv, rnd, { base: 520, amp: 20, count: 1, fill: '#1c0e1a', foot: '#120812', scale: 500 });
      const fy = heightAt(ground, 640) + 40;
      glow(cv, 640, fy - 40, 560, '#ff7a2a', 0.45);
      glow(cv, 640, fy - 30, 180, '#ffb347', 0.5);
      govend(cv, rnd, { x: 640, y: fy - 6, count: 17, size: 62, colour: '#12070f', step: 46, curve: 26 });
      bonfire(cv, rnd, { x: 640, y: fy + 14, size: 58, sparks: 50, light: false });
      vignette(cv, 0.35);
    },
  },
  {
    key: 'evara-sor',
    ku: 'Êvara Sor',
    en: 'Red evening',
    // the sun going down red behind the long mountain, an old oak on the hill
    draw(cv, rnd) {
      sky(cv, [[0, '#2a0f2e'], [0.35, '#8a1e3a'], [0.65, '#e8452c'], [1, '#ffb05a']]);
      orb(cv, 560, 410, 64, { core: '#fff0c8', rim: '#ffb35a', halo: '#ff8a3a', haloR: 600, haloOpacity: 0.65 });
      birds(cv, rnd, { x: 820, y: 250, count: 6, size: 10, colour: '#3a0e1e' });
      range(cv, rnd, { base: 450, peaks: [{ x: 160, h: 110, s: 300 }, { x: 760, h: 130, s: 420 }, { x: 1200, h: 100, s: 260 }], rough: 0.12, fill: '#7a1e34', foot: '#a8343a', shade: '#3a0a1e', shadeOpacity: 0.35, light: 1, haze: '#ff8a4a', hazeOpacity: 0.45 });
      const hill = hills(cv, rnd, { base: 540, amp: 70, count: 1, fill: '#3a0c1e', foot: '#24061a', scale: 520 });
      oak(cv, rnd, { x: 920, y: heightAt(hill, 920) + 10, size: 210, leaf: '#26061a', leafLit: '#3a0c22', leafDark: '#1a0412', trunk: '#1a0412', light: 1 });
      hills(cv, rnd, { base: 650, amp: 30, count: 2, fill: '#1a0412', foot: '#10020a', scale: 300 });
      grass(cv, rnd, { y: 720, count: 150, h: 40, dark: '#10020a', lit: '#2a0818' });
    },
  },
  {
    key: 'seva-sor',
    ku: 'Şeva Sor',
    en: 'Red night',
    // a great red moon rising over the oak woods
    draw(cv, rnd) {
      sky(cv, [[0, '#120612'], [0.55, '#3a0c1e'], [1, '#7a1a26']]);
      stars(cv, rnd, { count: 200, bottom: 360, colour: '#ffe3d0', bright: 4 });
      orb(cv, 640, 300, 84, { core: '#ffb070', rim: '#d8463a', halo: '#ff5a3a', haloR: 420, haloOpacity: 0.45 });
      cv.add('<g fill="#a8342e" fill-opacity="0.35"><circle cx="610" cy="280" r="20"/><circle cx="668" cy="318" r="26"/><circle cx="640" cy="250" r="12"/></g>');
      const ridge = range(cv, rnd, { base: 430, peaks: [{ x: 160, h: 130, s: 260 }, { x: 1100, h: 150, s: 260 }], fill: '#4a0e22', foot: '#5e1426', shade: '#22050f', shadeOpacity: 0.4 });
      void ridge;
      const near = hills(cv, rnd, { base: 470, amp: 60, count: 2, fill: '#2a0614', foot: '#1a030c', scale: 300 });
      grove(cv, rnd, { pts: near, count: 26, size: 90, leaf: '#1e0410', leafLit: '#2e0818', leafDark: '#14020a', trunk: '#14020a' });
      hills(cv, rnd, { base: 640, amp: 30, count: 2, fill: '#12020a', foot: '#0a0106', scale: 300 });
      fireflies(cv, rnd, { count: 14, top: 470, bottom: 640, colour: '#ffb070' });
    },
  },
  {
    key: 'lalezar',
    ku: 'Lalezar',
    en: 'Tulip field',
    // mountain tulips running up the slope to the snow
    draw(cv, rnd) {
      sky(cv, [[0, '#4a86d0'], [0.6, '#a6cdee'], [1, '#e2f0f8']]);
      cloud(cv, rnd, { x: 940, y: 130, w: 260, lit: '#ffffff', shade: '#d3e0f0' });
      range(cv, rnd, { base: 390, peaks: [{ x: 240, h: 200, s: 260 }, { x: 700, h: 230, s: 280 }, { x: 1150, h: 190, s: 250 }], fill: '#7d93bf', foot: '#a9bfd8', shade: '#3e5286', shadeOpacity: 0.38, snow: 240, snowShade: '#d3def0', haze: '#e2f0f8', hazeOpacity: 0.6 });
      const slope = hills(cv, rnd, { base: 430, amp: 40, count: 2, fill: '#8fbf5a', foot: '#5d9a45', crest: '#c2e08a', scale: 300 });
      void slope;
      tulips(cv, rnd, { top: 420, bottom: 690, count: 620, colours: [['#9e1b32', '#e0303c', '#ff7a7a'], ['#a3202c', '#d7263d', '#ff8a8a'], ['#c0302a', '#f0503a', '#ffa080']] });
      grass(cv, rnd, { y: 720, count: 180, h: 40, dark: '#3e7a34', lit: '#7cba5a' });
    },
  },
  {
    key: 'zozan',
    ku: 'Zozan',
    en: 'High pasture',
    // summer on the high pastures: black tents, the flock, snow still on the peaks
    draw(cv, rnd) {
      sky(cv, [[0, '#4f86d0'], [0.5, '#8fbde8'], [1, '#dcebf5']]);
      glow(cv, 240, 110, 460, '#fff6dc', 0.55);
      cloud(cv, rnd, { x: 820, y: 120, w: 280, lit: '#ffffff', shade: '#d0dcec' });
      cloud(cv, rnd, { x: 300, y: 190, w: 170, lit: '#ffffff', shade: '#d6e1ef', opacity: 0.85 });
      range(cv, rnd, { base: 410, peaks: [{ x: 160, h: 190, s: 210 }, { x: 520, h: 240, s: 230 }, { x: 900, h: 210, s: 200 }, { x: 1200, h: 230, s: 210 }], fill: '#7d93bf', foot: '#a9bfd8', shade: '#3e5286', shadeOpacity: 0.4, snow: 250, snowShade: '#d3def0', light: -1, haze: '#dcebf5', hazeOpacity: 0.6 });
      drifts(cv, rnd, { y: 408, count: 6, colour: '#eef5fb', opacity: 0.6, h: 28 });
      const slope = hills(cv, rnd, { base: 450, amp: 46, count: 2, fill: '#87b45a', foot: '#5f9a45', crest: '#b5d77a', scale: 280 });
      tent(cv, { x: 700, y: heightAt(slope, 700) + 34, w: 124 });
      tent(cv, { x: 865, y: heightAt(slope, 865) + 40, w: 94 });
      flock(cv, rnd, { x: 420, y: 500, w: 280, count: 24, size: 8, ground: '#3f7a32' });
      hills(cv, rnd, { base: 590, amp: 60, count: 2, fill: '#6aa64c', foot: '#4c8a3c', scale: 260 });
      meadow(cv, rnd, { top: 545, bottom: 720, count: 280, colours: ['#ffffff', '#ffd84d', '#f49ac1', '#b48cf0'] });
      grass(cv, rnd, { y: 720, count: 160, h: 34, dark: '#3e7a34', lit: '#7cba5a' });
    },
  },
  {
    key: 'bihar',
    ku: 'Bihar',
    en: 'Spring',
    // almonds in flower on the green hills, the river full with snowmelt
    draw(cv, rnd) {
      sky(cv, [[0, '#5a9ae0'], [0.55, '#a8d2f2'], [1, '#e6f4fa']]);
      cloud(cv, rnd, { x: 380, y: 140, w: 240, lit: '#ffffff', shade: '#d6e3f2' });
      range(cv, rnd, { base: 400, peaks: [{ x: 180, h: 160, s: 240 }, { x: 640, h: 200, s: 300 }, { x: 1120, h: 170, s: 250 }], fill: '#7f98c0', foot: '#b2c6de', shade: '#46598a', shadeOpacity: 0.35, snow: 270, snowShade: '#dae4f2', haze: '#e6f4fa', hazeOpacity: 0.55 });
      const valley = hills(cv, rnd, { base: 450, amp: 40, count: 3, fill: '#8cc45e', foot: '#6aa64c', crest: '#c6e88a', scale: 300 });
      river(cv, { x0: 650, y0: heightAt(valley, 650) + 6, x1: 560, y1: 730, w0: 10, w1: 190, colour: '#5fb3e0', edge: '#e6f6ff' });
      poplarRow(cv, rnd, { x0: 760, x1: 1040, y: heightAt(valley, 900) + 34, h: 110, count: 7, leaf: '#4f8a3a', leafLit: '#9ccc62' });
      for (const [x, s] of [[200, 170], [380, 120], [1000, 150], [1180, 190]]) {
        oak(cv, rnd, { x, y: heightAt(valley, x) + 70 + s * 0.2, size: s, leaf: '#f4d8e4', leafLit: '#ffffff', leafDark: '#d8a8bf', trunk: '#5a3a2c', blossom: '#f7b6cf', blossomLit: '#ffffff' });
      }
      meadow(cv, rnd, { top: 560, bottom: 720, count: 260, colours: ['#ffffff', '#ffe27a', '#f7a8c8', '#c8a6f0'] });
      grass(cv, rnd, { y: 720, count: 160, h: 34, dark: '#4f8a3a', lit: '#8ccc5e' });
    },
  },
  {
    key: 'daristana-seve',
    ku: 'Daristana Şevê',
    en: 'Forest at night',
    // the oak woods at night, fireflies in the clearing
    draw(cv, rnd) {
      sky(cv, [[0, '#04120f'], [0.55, '#0c2a26'], [1, '#1c4a40']]);
      stars(cv, rnd, { count: 160, bottom: 280, colour: '#e6fff4', bright: 3 });
      fullMoon(cv, 340, 215, 40, { core: '#f2f8e6', rim: '#cfd8c0', halo: '#bfe8d6', haloOpacity: 0.35 });
      range(cv, rnd, { base: 400, peaks: [{ x: 260, h: 90, s: 300 }, { x: 900, h: 110, s: 320 }], fill: '#1a4a42', foot: '#21584d', shade: '#0a2420', shadeOpacity: 0.35, light: -1, haze: '#3a7a68', hazeOpacity: 0.4 });
      const back = hills(cv, rnd, { base: 430, amp: 40, count: 3, fill: '#123a33', foot: '#103229', scale: 260 });
      grove(cv, rnd, { pts: back, count: 70, size: 42, leaf: '#14403a', leafLit: '#1f5a4e', leafDark: '#0e302a', trunk: '#0a2420', sink: 0.3 });
      drifts(cv, rnd, { y: 445, count: 6, colour: '#7fc4aa', opacity: 0.18, h: 26 });
      const mid = hills(cv, rnd, { base: 500, amp: 40, count: 2, fill: '#0b2a24', foot: '#08201c', scale: 300 });
      grove(cv, rnd, { pts: mid, x0: -40, x1: 420, count: 12, size: 90, leaf: '#0b2a24', leafLit: '#134238', leafDark: '#071c18', trunk: '#061714', sink: 0.25 });
      grove(cv, rnd, { pts: mid, x0: 860, x1: 1320, count: 12, size: 90, leaf: '#0b2a24', leafLit: '#134238', leafDark: '#071c18', trunk: '#061714', sink: 0.25 });
      const near = hills(cv, rnd, { base: 640, amp: 30, count: 2, fill: '#05120f', foot: '#030c0a', scale: 300 });
      oak(cv, rnd, { x: 60, y: heightAt(near, 60) + 40, size: 300, leaf: '#041210', leafLit: '#0a2420', leafDark: '#020a08', trunk: '#020a08' });
      oak(cv, rnd, { x: 1230, y: heightAt(near, 1230) + 40, size: 320, leaf: '#041210', leafLit: '#0a2420', leafDark: '#020a08', trunk: '#020a08', light: 1 });
      fireflies(cv, rnd, { count: 50, top: 380, bottom: 640, colour: '#d8ff7a' });
    },
  },
  {
    key: 'mij',
    ku: 'Mij',
    en: 'Mist',
    // a grey morning, the ranges coming and going in cloud
    draw(cv, rnd) {
      sky(cv, [[0, '#aeb8c2'], [0.6, '#d3d9de'], [1, '#e6eaec']]);
      const tones = ['#b4bec8', '#97a3ae', '#7a8894', '#5d6c78', '#41505c'];
      for (const [i, fill] of tones.entries()) {
        const base = 360 + i * 75;
        const pts = range(cv, rnd, { base, peaks: [{ x: 100 + i * 200, h: 140 - i * 6, s: 230 }, { x: 640 - i * 70, h: 120, s: 260 }, { x: 1150 + i * 20, h: 150, s: 240 }], rough: 0.16, fill, foot: tint(fill, 0.2), shade: '#2a3440', shadeOpacity: 0.12 + i * 0.04, gullies: 0.3 });
        if (i === 3) grove(cv, rnd, { pts, x0: 700, x1: 1280, count: 10, size: 50, leaf: '#4f5e6a', leafLit: '#5f6e7a', leafDark: '#3f4e5a', trunk: '#3a4650' });
        if (i === 4) poplarRow(cv, rnd, { x0: 80, x1: 420, y: heightAt(pts, 250) + 40, h: 130, count: 6, leaf: '#36444f', leafLit: '#46545f' });
        drifts(cv, rnd, { y: base + 20, count: 8, colour: '#eef1f2', opacity: 0.75, h: 36, spread: 24 });
      }
      birds(cv, rnd, { x: 820, y: 210, count: 3, size: 9, colour: '#5a6670' });
    },
  },
  {
    key: 'newroz',
    ku: 'Rengên Newrozê',
    en: 'The colours of Newroz',
    // the Newroz sun coming up red and gold over green hills, fires still burning on them
    draw(cv, rnd) {
      sky(cv, [[0, '#b0182c'], [0.42, '#ef4a2c'], [0.68, '#ffb14a'], [1, '#fff1cf']]);
      kurdishSun(cv, { x: 640, y: 400, r: 70, colour: '#ffc21a', halo: '#ffe08a', haloOpacity: 0.55 });
      birds(cv, rnd, { x: 330, y: 230, count: 5, size: 10, colour: '#7a0e1e' });
      const far = hills(cv, rnd, { base: 440, amp: 40, count: 3, fill: '#4a9a50', foot: '#3a8a44', crest: '#9ad06a', scale: 300 });
      hillFires(cv, rnd, { pts: far, count: 6, size: 4, below: [6, 24] });
      const mid = hills(cv, rnd, { base: 510, amp: 50, count: 2, fill: '#278e43', foot: '#1f7a3a', crest: '#7cc45e', scale: 300 });
      hillFires(cv, rnd, { pts: mid, count: 4, size: 6, below: [6, 20] });
      hills(cv, rnd, { base: 610, amp: 40, count: 2, fill: '#1f7a3a', foot: '#155c2a', scale: 300 });
      meadow(cv, rnd, { top: 600, bottom: 720, count: 200, colours: ['#ffffff', '#ffd23a', '#ff5a4a'] });
    },
  },
  ...KILIMS.map(([key, ku, en, layout, palette]) => ({
    key,
    ku,
    en,
    draw(cv, rnd) {
      kilim(cv, rnd, { ...palette, layout });
    },
  })),
];

/** A lit window in a lone house on the hill. */
function cvWindow(cv, x, y) {
  cv.add(`<rect x="${x - 16}" y="${y - 18}" width="32" height="22" fill="#0b0b20"/><rect x="${x - 18}" y="${y - 21}" width="36" height="4" fill="#14142c"/><rect x="${x - 4}" y="${y - 12}" width="7" height="8" fill="#ffcf7a"/>`);
}

void [fog, petals];
