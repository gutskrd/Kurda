/**
 * The shop's animal friends: eight small characters, each drawn in a hand of its own as an illustrator would sign it.
 * A rabbit showing its muscles in brush and ink; a fox in a red cape holding up a sword, cut as a lino print; a kitten
 * in a hat and boots striding along, engraved in one red-brown ink; a kitten with a red ribbon in black and red crayon;
 * a pigeon in one blue crayon line; a bear in flat brown with nothing to say; a cow as round as a ball; and a plump hen.
 * Each is cut out with its paper behind it, so it reads over a dark profile picture as over a light one.
 */
import { n, pt } from './kit.mjs';
import { softly, specks, strokes, within } from './brush.mjs';
import { Still } from './still.mjs';

// ─────────────────────────────────────────────────────────────── a hand's tools

/** A smooth outline through the points (Catmull-Rom as cubic Béziers); open when `closed` is false. */
function smooth(points, closed = true) {
  const count = points.length;
  const at = (i) => (closed ? points[(i + count) % count] : points[Math.max(0, Math.min(count - 1, i))]);
  let d = `M${pt(points[0])}`;
  for (let i = 0; i < (closed ? count : count - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += ` C${pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${pt(p2)}`;
  }
  return closed ? `${d} Z` : d;
}

/** `count` + 1 points along the smooth curve through `points`. */
function along(points, count) {
  const out = [];
  const m = points.length - 1;
  for (let k = 0; k <= count; k++) {
    const t = (k / count) * m;
    const i = Math.min(m - 1, Math.floor(t));
    const f = t - i;
    const [p0, p1, p2, p3] = [points[Math.max(0, i - 1)], points[i], points[i + 1], points[Math.min(m, i + 2)]];
    const c = (j) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * f + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * f * f + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * f * f * f);
    out.push([c(0), c(1)]);
  }
  return out;
}

/**
 * A brush or pen mark along `points`, `width` at its fullest: thin where it touches down (`start`) and lifts (`end`),
 * its width trembling a little as a loaded brush's does.
 */
function mark(rnd, points, width, { start = 0.3, end = 0.2, peak = 0.4, tremble = 0.15, count = 24 } = {}) {
  const line = along(points, count);
  const left = [];
  const right = [];
  line.forEach((p, i) => {
    const t = i / count;
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(count, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [nx, ny] = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    const rise = t < peak ? start + (1 - start) * Math.sin(((t / peak) * Math.PI) / 2) : end + (1 - end) * Math.cos((((t - peak) / (1 - peak)) * Math.PI) / 2);
    const w = (width / 2) * rise * (1 - tremble / 2 + rnd() * tremble);
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
  });
  return `M${left.map(pt).join(' L')} L${right.reverse().map(pt).join(' L')} Z`;
}

/** A round shape, its radius a little uneven, as a hand draws one. */
function blob(rnd, [cx, cy], rx, ry, turn = 0, wobble = 0.03, count = 24) {
  const out = [];
  const [c, s] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)];
  const phase = rnd() * 6;
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const k = 1 + wobble * Math.sin(t * 3 + phase) + wobble * 0.6 * Math.sin(t * 5 + phase * 2);
    const [x, y] = [Math.cos(t) * rx * k, Math.sin(t) * ry * k];
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return smooth(out);
}

/** An edge torn a little, as ink takes on rough paper or a lino gouge leaves it: a filter's url. */
function torn(cv, rnd, scale = 3, freq = 0.06) {
  const f = cv.id('torn');
  cv.def(`<filter id="${f}" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${Math.floor(rnd() * 999)}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`);
  return `url(#${f})`;
}

/**
 * Crayon on rough paper: the mark's edge dragged a little and the tooth of the paper showing through it, more where
 * the hand pressed lightly (`keep` lower).
 */
function crayon(cv, rnd, { keep = 1.5, tear = 3, grain = 0.75 } = {}) {
  const f = cv.id('cray');
  cv.def(
    `<filter id="${f}" x="-20%" y="-20%" width="140%" height="140%">`
      + `<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${Math.floor(rnd() * 999)}" result="t"/>`
      + `<feDisplacementMap in="SourceGraphic" in2="t" scale="${tear}" xChannelSelector="R" yChannelSelector="G" result="d"/>`
      + `<feTurbulence type="fractalNoise" baseFrequency="${grain}" numOctaves="2" seed="${Math.floor(rnd() * 999)}" result="g"/>`
      + `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 ${n(keep)}" result="m"/>`
      + `<feComposite in="d" in2="m" operator="in"/></filter>`,
  );
  return `url(#${f})`;
}

const BOX = [24, 24, 488, 488];
const PLAIN = { finish: { paint: 0, grain: 0.012, contrast: 0, saturation: 1, warmth: 0 } };

// ─────────────────────────────────────────────────────────────── the friends

export const FRIENDS = [
  {
    key: 'kerosk',
    ku: 'Kêroşka Bihêz',
    en: 'Strong rabbit',
    // a white rabbit standing square and showing us both arms' muscles, brushed in ink that runs thick and thin and
    // leaves the line open here and there, pale pink in its ears and its cheek, a beige wash where it rounds away
    still(rnd) {
      const s = new Still(rnd).place([0, 4], 1);
      const INK = '#1d1a18';
      const PAPER = '#fcf7f1';
      const WASH = '#d9c2ad';
      const PINK = '#eeaa9a';
      const ink = (cv, pts, w, o = {}) => cv.add(`<path d="${mark(rnd, pts, w, o)}" fill="${INK}" filter="${torn(cv, rnd, 2.2, 0.08)}"/>`);
      // the parts, as filled shapes, before any line
      const head = blob(rnd, [258, 196], 66, 58, 0, 0.02);
      const torso = smooth([[198, 270], [258, 262], [318, 270], [330, 312], [312, 360], [304, 408], [282, 452], [262, 440], [256, 418], [248, 440], [226, 452], [208, 410], [200, 360], [186, 312]]);
      const armL = smooth([[204, 274], [160, 270], [126, 282], [112, 254], [116, 214], [140, 200], [160, 212], [158, 244], [182, 250], [214, 300]]);
      const armR = smooth(armL.match(/-?[\d.]+,-?[\d.]+/g).map((p) => p.split(',').map(Number)).map(([x, y]) => [516 - x, y]));
      const earL = blob(rnd, [232, 104], 20, 52, -10, 0.03);
      const earR = blob(rnd, [290, 106], 20, 54, 14, 0.03);
      s.paint((cv) => {
        // its shadow on the ground, a wash
        cv.add(`<ellipse cx="258" cy="458" rx="96" ry="12" fill="${WASH}" fill-opacity="0.55" filter="${softly(cv, 4)}"/>`);
        for (const d of [earL, earR, armL, armR, torso, head]) cv.add(`<path d="${d}" fill="${PAPER}"/>`);
        // the pink of its ears and cheek, and the wash where it rounds away from the light
        cv.add(`<g filter="${softly(cv, 2.5)}"><path d="${blob(rnd, [233, 110], 9, 40, -10, 0.04)}" fill="${PINK}"/><path d="${blob(rnd, [291, 112], 9, 42, 14, 0.04)}" fill="${PINK}"/></g>`);
        cv.add(`<ellipse cx="284" cy="214" rx="15" ry="11" fill="${PINK}" fill-opacity="0.7" filter="${softly(cv, 4)}"/>`);
        cv.add(`<g fill="${WASH}" fill-opacity="0.5" filter="${softly(cv, 6)}"><ellipse cx="262" cy="252" rx="46" ry="8"/><ellipse cx="148" cy="282" rx="22" ry="8"/><ellipse cx="368" cy="282" rx="22" ry="8"/><ellipse cx="300" cy="380" rx="10" ry="34"/><ellipse cx="256" cy="420" rx="22" ry="10"/></g>`);
        cv.add(`<path d="M300 300 Q322 330 304 372" fill="none" stroke="${PINK}" stroke-width="10" stroke-opacity="0.45" filter="${softly(cv, 4)}"/>`);
        // ears
        ink(cv, [[222, 150], [210, 106], [214, 62], [232, 52], [246, 70], [250, 112], [246, 146]], 7, { start: 0.5, end: 0.2 });
        ink(cv, [[276, 146], [276, 102], [286, 58], [302, 52], [312, 70], [306, 116], [300, 150]], 7, { start: 0.5, end: 0.3 });
        // head: a round line, open at the brow
        ink(cv, [[228, 152], [200, 170], [192, 204], [206, 236], [240, 252]], 9, { start: 0.3, end: 0.4 });
        ink(cv, [[294, 148], [318, 168], [324, 200], [314, 230], [290, 248]], 8, { start: 0.3, end: 0.3 });
        // the arms, bent up at the elbow, the fists and the bulge of the muscle
        ink(cv, [[200, 274], [162, 268], [130, 282], [114, 262], [112, 230], [126, 208], [146, 204]], 9, { start: 0.3, end: 0.4 });
        ink(cv, [[146, 204], [162, 214], [158, 236], [150, 244]], 7, { start: 0.6, end: 0.2 });
        ink(cv, [[156, 246], [176, 248], [196, 266]], 6, { start: 0.2, end: 0.3 });
        ink(cv, [[316, 274], [354, 268], [386, 282], [402, 262], [404, 230], [390, 208], [370, 204]], 9, { start: 0.3, end: 0.4 });
        ink(cv, [[370, 204], [354, 214], [358, 236], [366, 244]], 7, { start: 0.6, end: 0.2 });
        ink(cv, [[360, 246], [340, 248], [320, 266]], 6, { start: 0.2, end: 0.3 });
        // its chest and the line down its middle, the cross of its belly
        ink(cv, [[226, 300], [244, 316], [258, 312]], 5, { start: 0.3, end: 0.3 });
        ink(cv, [[262, 312], [276, 318], [294, 302]], 5, { start: 0.3, end: 0.3 });
        ink(cv, [[258, 282], [256, 300], [258, 318]], 4.5, { start: 0.2, end: 0.2 });
        ink(cv, [[258, 342], [258, 370]], 5, { start: 0.3, end: 0.3 });
        ink(cv, [[244, 354], [272, 354]], 5, { start: 0.3, end: 0.3 });
        cv.add(`<circle cx="258" cy="384" r="3.6" fill="${INK}"/>`);
        // the body's sides, down to its feet, and the tail
        ink(cv, [[200, 290], [198, 340], [208, 392], [218, 438], [232, 452], [250, 446], [256, 420]], 8, { start: 0.3, end: 0.3 });
        ink(cv, [[318, 290], [320, 340], [308, 392], [298, 436], [284, 452], [266, 446], [260, 424]], 8, { start: 0.3, end: 0.3 });
        ink(cv, [[322, 384], [342, 378], [348, 398], [332, 410], [318, 404]], 6, { start: 0.4, end: 0.2 });
        // its face: one eye, a cross for a mouth
        cv.add(`<ellipse cx="270" cy="196" rx="7.5" ry="8.5" fill="${INK}"/>`);
        ink(cv, [[214, 206], [224, 216]], 3.5, { start: 0.6, end: 0.6 });
        ink(cv, [[224, 206], [214, 216]], 3.5, { start: 0.6, end: 0.6 });
      });
      return s.done(PLAIN);
    },
  },
  {
    key: 'rovi',
    ku: 'Rovîyê Şûrdar',
    en: 'Fox knight',
    // a fox standing upright in a long red cloak, holding a sword up high, cut as a lino print: flat orange and white
    // and red, a heavy black line, the cloak's folds gouged in black, its legs and the paw on the sword black
    still(rnd) {
      const s = new Still(rnd).place([0, 2], 0.96);
      const INK = '#141110';
      const FUR = '#ee6a1e';
      const WHITE = '#fbf6ef';
      const RED = '#d9302a';
      const line = (cv, d, w = 9) => cv.add(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" filter="${torn(cv, rnd, 3.5, 0.09)}"/>`);
      const fill = (cv, d, c) => cv.add(`<path d="${d}" fill="${c}" filter="${torn(cv, rnd, 3, 0.09)}"/>`);
      const tail = smooth([[386, 404], [434, 410], [470, 430], [482, 452], [440, 458], [396, 452], [372, 434]]);
      const tailTip = smooth([[440, 422], [470, 430], [482, 452], [446, 458], [430, 444]]);
      const body = smooth([[262, 236], [312, 232], [330, 300], [334, 380], [330, 440], [276, 448], [232, 440], [228, 380], [236, 300]]);
      const chest = smooth([[268, 246], [302, 246], [306, 320], [298, 420], [276, 436], [258, 420], [254, 320]]);
      const cape = smooth([[276, 226], [336, 218], [366, 270], [396, 360], [430, 450], [372, 460], [318, 456], [326, 380], [318, 300], [300, 256]]);
      const capeBack = smooth([[244, 260], [226, 330], [208, 410], [196, 460], [244, 456], [240, 380], [250, 300]]);
      const head = smooth([[246, 126], [236, 74], [276, 104], [306, 102], [344, 72], [340, 128], [356, 158], [372, 186], [340, 204], [306, 214], [272, 206], [248, 180], [244, 150]]);
      const cheek = smooth([[290, 186], [320, 176], [356, 178], [372, 186], [344, 206], [306, 214], [282, 204]]);
      const earInL = smooth([[252, 118], [246, 90], [270, 108]]);
      const earInR = smooth([[322, 104], [338, 84], [334, 116]]);
      const arm = smooth([[244, 262], [222, 234], [206, 212], [218, 200], [236, 220], [262, 248]]);
      s.paint((cv) => {
        // the tail behind it, white at the tip, the cloak's back fold behind its legs
        fill(cv, tail, FUR);
        fill(cv, tailTip, WHITE);
        line(cv, tail);
        fill(cv, capeBack, RED);
        line(cv, capeBack);
        // its legs and feet, black; its body orange with a white front
        cv.add(`<path d="M244 430 L240 466 L226 474 L262 474 L262 440 Z M290 440 L292 470 L284 476 L318 476 L312 432 Z" fill="${INK}" filter="${torn(cv, rnd, 3, 0.1)}"/>`);
        fill(cv, body, FUR);
        fill(cv, chest, WHITE);
        line(cv, body);
        // the cloak over its shoulder and down its side, its folds gouged in
        fill(cv, cape, RED);
        for (const [x0, y0, x1, y1] of [[320, 250, 346, 350], [338, 262, 372, 380], [352, 300, 396, 440], [334, 300, 350, 440], [366, 330, 412, 448]]) {
          cv.add(`<path d="${mark(rnd, [[x0, y0], [(x0 + x1) / 2 + 4, (y0 + y1) / 2], [x1, y1]], 6, { start: 0.2, end: 0.6 })}" fill="${INK}" filter="${torn(cv, rnd, 2.5, 0.1)}"/>`);
        }
        line(cv, cape);
        // the sword held high: blade, guard and hilt
        cv.add(`<g fill="${INK}" filter="${torn(cv, rnd, 2.5, 0.08)}"><path d="M194 36 L206 36 L208 214 L192 214 Z"/><path d="M160 214 L240 212 L240 226 L160 228 Z"/><path d="M194 226 L206 226 L210 262 L198 270 L190 262 Z"/><circle cx="200" cy="274" r="9"/></g>`);
        // the raised arm, black to the paw that grips the hilt
        cv.add(`<path d="${arm}" fill="${INK}" filter="${torn(cv, rnd, 3, 0.1)}"/>`);
        cv.add(`<ellipse cx="210" cy="246" rx="17" ry="15" fill="${INK}" filter="${torn(cv, rnd, 3, 0.1)}"/>`);
        // its head: orange, white cheeks, the ears dark inside, two dots for eyes and a black nose
        fill(cv, head, FUR);
        fill(cv, cheek, WHITE);
        fill(cv, earInL, INK);
        fill(cv, earInR, INK);
        line(cv, head);
        cv.add(`<g fill="${INK}"><ellipse cx="282" cy="150" rx="7" ry="8"/><ellipse cx="326" cy="148" rx="7" ry="8"/><ellipse cx="372" cy="186" rx="9" ry="7"/></g>`);
        line(cv, 'M300 186 Q312 194 324 190', 5);
      });
      return s.done(PLAIN);
    },
  },
  {
    key: 'pisik-cizme',
    ku: 'Pisîka Bi Çizme',
    en: 'Cat in boots',
    // a kitten striding along on its hind legs in a wide hat and riding boots, engraved in one red-brown ink: its outline
    // in broken cuts, its fur laid in short strokes thick on its shaded side and thin in the light, the hat and boots
    // nearly solid with their stitching left pale, a scatter of ink for the ground
    still(rnd) {
      const s = new Still(rnd).place([0, 0], 1);
      const INK = '#5c1014';
      const PAPER = '#fbe8e4';
      const cut = (cv, d, box, count, flow, o = {}) =>
        strokes(cv, rnd, d, box, { count, colours: [INK], flow, length: o.length ?? 13, width: o.width ?? 2.8, opacity: o.opacity ?? [0.75, 1], spread: o.spread ?? 16, bend: 0.3 });
      const edge = (cv, pts, w = 6, o = {}) => cv.add(`<path d="${mark(rnd, pts, w, { tremble: 0.4, ...o })}" fill="${INK}" filter="${torn(cv, rnd, 2.4, 0.14)}"/>`);
      const head = smooth([[218, 176], [244, 160], [282, 158], [312, 172], [324, 198], [316, 226], [290, 242], [256, 244], [228, 232], [214, 208]]);
      const body = smooth([[230, 236], [284, 234], [312, 262], [320, 312], [308, 360], [296, 394], [254, 402], [224, 390], [214, 344], [216, 290]]);
      const tail = mark(rnd, [[226, 352], [178, 340], [132, 316], [106, 286], [100, 262]], 34, { start: 0.9, end: 0.45, peak: 0.25 });
      const bootL = smooth([[236, 384], [272, 384], [272, 432], [290, 450], [292, 470], [232, 472], [230, 440]]);
      const bootR = smooth([[284, 374], [314, 362], [336, 398], [372, 412], [384, 432], [352, 444], [312, 434], [292, 408]]);
      const brim = blob(rnd, [262, 166], 104, 19, -6, 0.04, 30);
      const crown = smooth([[208, 160], [212, 124], [234, 98], [268, 90], [300, 100], [312, 128], [314, 158], [262, 166]]);
      const paw = blob(rnd, [314, 306], 15, 12, 20, 0.08);
      const ear = smooth([[300, 168], [322, 144], [326, 180]]);
      s.paint((cv) => {
        cut(cv, 'M130 470 L410 470 L410 486 L130 486 Z', [130, 468, 410, 488], 90, () => 0, { length: 9, width: 3.4 });
        // the tail, body and head in pale paper, fur cut over them, thickest on the side away from the light
        for (const d of [tail, body, head, paw]) cv.add(`<path d="${d}" fill="${PAPER}"/>`);
        cut(cv, tail, [92, 250, 236, 362], 380, (x) => (x < 150 ? -58 : -22), { length: 16, width: 3.4 });
        edge(cv, [[224, 336], [180, 324], [138, 302], [112, 276], [104, 256]], 4.5, { start: 0.5, end: 0.2 });
        cut(cv, body, [218, 232, 314, 402], 120, () => 92, { length: 14, width: 2.4, opacity: [0.45, 0.85] });
        cut(cv, 'M216 232 L250 232 L250 402 L216 402 Z', [216, 232, 252, 402], 140, () => 96, { length: 15, width: 3.2 });
        cut(cv, head, [212, 156, 326, 246], 70, (x) => (x < 262 ? 150 : 30), { length: 10, width: 2.2, opacity: [0.4, 0.8] });
        cut(cv, 'M214 160 L246 160 L246 246 L214 246 Z', [212, 156, 248, 246], 60, () => 120, { length: 11, width: 2.6 });
        cut(cv, paw, [298, 292, 330, 320], 14, () => 70, { length: 7, width: 2 });
        // its outline, in broken cuts
        edge(cv, [[226, 238], [216, 290], [214, 344], [224, 390]], 6);
        edge(cv, [[290, 238], [312, 264], [320, 306]], 5);
        edge(cv, [[312, 332], [302, 372], [294, 394]], 5);
        edge(cv, [[218, 176], [212, 196], [218, 220]], 5);
        edge(cv, [[312, 172], [324, 196], [318, 218]], 4.5);
        cut(cv, head, [226, 226, 300, 246], 30, () => 100, { length: 9, width: 2.4 });
        edge(cv, [[300, 294], [314, 290], [328, 300], [326, 318], [312, 322]], 4.5);
        // an ear showing under the brim, then its face: eyes, nose, a cheek and whiskers
        cv.add(`<path d="${ear}" fill="${INK}" filter="${torn(cv, rnd, 1.6, 0.14)}"/>`);
        cv.add(`<g fill="${INK}"><path d="M246 200 Q256 190 266 198 Q256 206 246 200 Z"/><path d="M282 196 Q292 186 302 194 Q292 202 282 196 Z"/><path d="M300 210 L314 208 L306 218 Z"/></g>`);
        cv.add(`<g fill="${PAPER}"><circle cx="258" cy="198" r="1.8"/><circle cx="294" cy="194" r="1.8"/></g>`);
        cv.add(`<g stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"><path d="M306 222 Q300 228 292 226"/><path d="M314 214 Q336 210 352 214"/><path d="M314 218 Q334 220 350 228"/><path d="M312 222 Q326 230 336 242"/></g>`);
        // the boots, nearly solid, the stitching pale
        for (const d of [bootL, bootR]) cv.add(`<path d="${d}" fill="${INK}" filter="${torn(cv, rnd, 2.4, 0.12)}"/>`);
        cv.add(`<g fill="none" stroke="${PAPER}" stroke-width="2.4" stroke-linecap="round" stroke-opacity="0.85"><path d="M248 404 Q256 420 252 438"/><path d="M262 400 Q266 418 266 442"/><path d="M302 392 Q314 406 330 412"/><path d="M298 404 Q314 420 344 428"/><path d="M236 396 L272 394"/></g>`);
        // the hat set on its head: a broad brim and a dented crown, a band and the light along the brim left pale
        cv.add(`<path d="${brim}" fill="${INK}" filter="${torn(cv, rnd, 2.4, 0.12)}"/>`);
        cv.add(`<path d="${crown}" fill="${INK}" filter="${torn(cv, rnd, 2.4, 0.12)}"/>`);
        cut(cv, crown, [206, 88, 316, 166], 40, () => 80, { length: 12, width: 2.4, opacity: [0.25, 0.55] });
        cv.add(`<g fill="${PAPER}" fill-opacity="0.92"><path d="M212 142 Q262 132 312 142 L312 150 Q262 140 212 150 Z"/><path d="M236 108 Q250 96 266 98 Q252 106 244 120 Z"/><path d="M170 170 Q230 178 300 172 Q250 184 180 178 Z"/></g>`);
      });
      return s.done({ finish: { paint: 0, grain: 0.02, contrast: 0, saturation: 1, warmth: 0 } });
    },
  },
  {
    key: 'pisik-qurdele',
    ku: 'Pisîka Bi Qurdele',
    en: 'Kitten with a bow',
    // a fluffy white kitten sitting, sketched in broken strokes of black crayon, with a red crayon ribbon tied in a bow
    // at its neck, its ends trailing; the paper's white inside it
    still(rnd) {
      const s = new Still(rnd).place([0, 0], 1);
      const BLACK = '#161312';
      const RED = '#b51e1e';
      const PAPER = '#fbf8f1';
      const k = (cv, pts, w, colour = BLACK, o = {}) =>
        cv.add(`<path d="${mark(rnd, pts, w * 1.5, { tremble: 0.35, ...o })}" fill="${colour}" filter="${crayon(cv, rnd, { keep: 2.3, tear: 3.5, grain: 0.7 })}"/>`);
      const shape = smooth([[188, 168], [214, 132], [258, 146], [304, 134], [334, 166], [338, 214], [330, 256], [340, 320], [342, 380], [312, 412], [256, 418], [204, 410], [176, 380], [148, 392], [116, 360], [112, 300], [140, 296], [168, 316], [180, 280], [180, 220]]);
      s.paint((cv) => {
        cv.add(`<path d="${shape}" fill="${PAPER}" filter="${softly(cv, 1.5)}"/>`);
        cv.add(`<ellipse cx="250" cy="404" rx="70" ry="12" fill="#5a4a40" fill-opacity="0.12" filter="${softly(cv, 6)}"/>`);
        // ears, tufted
        k(cv, [[186, 210], [184, 168], [190, 132], [214, 150], [228, 162]], 9);
        k(cv, [[198, 150], [204, 166], [196, 176]], 6);
        k(cv, [[296, 158], [312, 134], [330, 142], [334, 180], [328, 212]], 9);
        k(cv, [[314, 156], [318, 170], [312, 178]], 6);
        k(cv, [[234, 150], [256, 144], [278, 150]], 5, BLACK, { start: 0.1, end: 0.1 });
        // cheeks, fluffy
        k(cv, [[188, 214], [194, 236], [210, 250]], 7);
        k(cv, [[330, 216], [326, 238], [312, 252]], 7);
        // eyes, nose and mouth
        cv.add(`<g fill="${BLACK}" filter="${crayon(cv, rnd, { keep: 2.2, tear: 1.5 })}"><ellipse cx="236" cy="204" rx="8" ry="8.5"/><ellipse cx="286" cy="204" rx="8" ry="8.5"/></g>`);
        k(cv, [[252, 226], [262, 232], [272, 226]], 5, BLACK, { start: 0.6, end: 0.6 });
        k(cv, [[262, 232], [262, 240]], 4);
        // the body sitting, its forelegs down the front
        k(cv, [[204, 264], [196, 320], [190, 372], [206, 404], [240, 412]], 8);
        k(cv, [[272, 412], [306, 406], [334, 388], [340, 340], [330, 290]], 8);
        k(cv, [[236, 316], [240, 366], [234, 404]], 6);
        k(cv, [[268, 300], [274, 350], [272, 400]], 6);
        k(cv, [[268, 352], [282, 372], [276, 400]], 5);
        // the tail, a fluffy curl beside it
        k(cv, [[190, 380], [150, 392], [120, 364], [116, 320], [136, 298], [152, 312]], 9, BLACK, { start: 0.4 });
        k(cv, [[128, 340], [144, 336]], 5);
        k(cv, [[124, 372], [142, 362]], 5);
        // the red ribbon round its neck and its bow, the ends trailing down
        k(cv, [[196, 254], [232, 266], [268, 264], [304, 250]], 12, RED, { start: 0.5, end: 0.8 });
        k(cv, [[304, 250], [334, 226], [366, 232], [356, 262], [306, 254]], 10, RED, { start: 0.6, end: 0.6 });
        k(cv, [[306, 256], [342, 288], [338, 318], [312, 296], [304, 260]], 10, RED, { start: 0.6, end: 0.6 });
        k(cv, [[304, 258], [316, 300], [338, 336], [346, 362], [332, 380]], 8, RED, { start: 0.9, end: 0.2 });
      });
      return s.done(PLAIN);
    },
  },
  {
    key: 'kevoka-sin',
    ku: 'Kevoka Şîn',
    en: 'Blue dove',
    // a pigeon sitting on a line, drawn in one blue crayon line on a cream ground: its round head and beak, the eye a
    // dot, the curve of its breast, the long wing with a scribble of feathers, two small feet
    still(rnd) {
      const s = new Still(rnd).place([4, 10], 1.05);
      const BLUE = '#1f5a78';
      const PAPER = '#f2eedd';
      const k = (cv, pts, w, o = {}) =>
        cv.add(`<path d="${mark(rnd, pts, w * 1.6, { tremble: 0.3, ...o })}" fill="${BLUE}" filter="${crayon(cv, rnd, { keep: 2.3, tear: 2.5, grain: 0.7 })}"/>`);
      const ground = smooth([[116, 326], [180, 300], [250, 268], [280, 220], [300, 176], [330, 158], [360, 166], [378, 196], [364, 210], [338, 220], [334, 260], [340, 304], [326, 334], [240, 340], [160, 334]]);
      s.paint((cv) => {
        cv.add(`<path d="${ground}" fill="${PAPER}" filter="${softly(cv, 1.5)}"/>`);
        // back and tail, in one line
        k(cv, [[300, 176], [282, 220], [264, 254], [220, 278], [160, 300], [112, 320]], 9, { start: 0.6, end: 0.3 });
        // head and beak
        k(cv, [[300, 176], [318, 160], [346, 158], [362, 172], [372, 190]], 9, { start: 0.4, end: 0.5 });
        k(cv, [[372, 190], [392, 202], [372, 206]], 8, { start: 0.6, end: 0.6 });
        cv.add(`<circle cx="344" cy="182" r="6.5" fill="${BLUE}" filter="${crayon(cv, rnd, { keep: 2.2, tear: 1 })}"/>`);
        // the breast, down to its feet
        k(cv, [[364, 206], [340, 214], [330, 240], [336, 270], [338, 304], [324, 326]], 9, { start: 0.5, end: 0.4 });
        // the wing: its lower edge, and a scribble for the feathers
        k(cv, [[118, 330], [180, 338], [236, 336], [266, 328]], 8, { start: 0.2, end: 0.6 });
        k(cv, [[196, 300], [216, 308], [226, 296], [238, 310], [250, 300], [262, 312]], 7, { start: 0.5, end: 0.5 });
        k(cv, [[212, 286], [256, 280]], 6, { start: 0.6, end: 0.4 });
        // the line it sits on, and its feet
        k(cv, [[220, 362], [300, 366], [380, 368]], 8, { start: 0.5, end: 0.5 });
        k(cv, [[330, 344], [338, 318], [350, 346]], 6, { start: 0.6, end: 0.6 });
        k(cv, [[356, 362], [364, 334], [376, 364]], 6, { start: 0.6, end: 0.6 });
      });
      return s.done(PLAIN);
    },
  },
  {
    key: 'hirc',
    ku: 'Hirç',
    en: 'Bear',
    // a big brown bear standing square and looking straight at us with nothing at all to say: one flat brown, a thin
    // black line round it, a pale muzzle, two dashes for eyes and one for its mouth, its arms only a line each
    still(rnd) {
      const s = new Still(rnd).place([0, 0], 1);
      const FUR = '#3d3128';
      const MUZZLE = '#bf9a78';
      const LINE = '#0d0b0a';
      const body = smooth([[160, 104], [196, 92], [222, 100], [256, 92], [292, 100], [318, 92], [352, 104], [346, 134], [372, 190], [400, 280], [418, 360], [420, 432], [396, 452], [364, 444], [322, 456], [256, 460], [190, 456], [148, 444], [116, 452], [92, 432], [94, 360], [112, 280], [140, 190], [166, 134]]);
      const muzzle = smooth([[256, 122], [276, 150], [292, 186], [290, 222], [266, 236], [244, 236], [222, 222], [220, 186], [236, 150]]);
      s.paint((cv) => {
        cv.add(`<path d="${body}" fill="${FUR}"/>`);
        cv.add(`<path d="${body}" fill="none" stroke="${LINE}" stroke-width="6" stroke-linejoin="round" filter="${torn(cv, rnd, 1.5, 0.2)}"/>`);
        // ears: a line where each meets the head
        cv.add(`<g fill="none" stroke="${LINE}" stroke-width="5" stroke-linecap="round"><path d="M176 122 Q188 112 204 118"/><path d="M310 118 Q326 112 336 122"/></g>`);
        cv.add(`<path d="${muzzle}" fill="${MUZZLE}"/>`);
        cv.add(`<g fill="none" stroke="${LINE}" stroke-width="6" stroke-linecap="round"><path d="M186 160 L216 160"/><path d="M296 160 L326 160"/><path d="M238 216 L270 214"/></g>`);
        cv.add(`<ellipse cx="256" cy="176" rx="15" ry="6.5" fill="${LINE}"/>`);
        // its arms, only the line of each, the left one's claws
        cv.add(`<g fill="none" stroke="${LINE}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M150 286 Q166 330 186 360"/><path d="M190 290 Q206 320 212 352 Q200 366 184 362"/><path d="M196 356 L190 368 M206 350 L208 362"/><path d="M350 310 Q358 348 344 362 Q328 364 316 352"/></g>`);
        cv.add(`<path d="M138 262 Q146 248 148 238" fill="none" stroke="${LINE}" stroke-width="4" stroke-linecap="round" stroke-opacity="0.8"/>`);
      });
      return s.done(PLAIN);
    },
  },
  {
    key: 'celek',
    ku: 'Çêlek',
    en: 'Cow',
    // a cow as round as a ball, white with big dark patches, in crayon with a soft black line: its small head in front
    // with orange horns and ears, a pink nose, a blue collar and a little gold bell, four stubby legs, a tufted tail
    still(rnd) {
      const s = new Still(rnd).place([0, 0], 1);
      const LINE = '#1d1a19';
      const WHITE = '#fdfbf7';
      const PATCH = '#2e1214';
      const ORANGE = '#e98a2c';
      const PINK = '#e58a8c';
      const BLUE = '#3c8fd6';
      const GOLD = '#f2c235';
      const crayoned = (cv, d, colour) => cv.add(`<path d="${d}" fill="${colour}" filter="${crayon(cv, rnd, { keep: 2.4, tear: 2, grain: 0.6 })}"/>`);
      const stroke = (cv, d, w = 6) => cv.add(`<path d="${d}" fill="none" stroke="${LINE}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" filter="${crayon(cv, rnd, { keep: 2.6, tear: 1.6 })}"/>`);
      const ball = blob(rnd, [246, 236], 178, 172, 0, 0.012, 40);
      const head = smooth([[302, 300], [348, 290], [372, 308], [376, 352], [384, 392], [364, 420], [316, 424], [292, 400], [290, 346]]);
      const nose = smooth([[300, 384], [342, 374], [380, 382], [384, 404], [360, 424], [316, 424], [298, 408]]);
      s.paint((cv) => {
        // legs under it, dark at the hoof
        for (const x of [170, 220, 274, 324]) {
          const leg = smooth([[x - 16, 380], [x + 16, 380], [x + 16, 440], [x, 448], [x - 16, 440]]);
          cv.add(`<path d="${leg}" fill="${WHITE}"/>`);
          crayoned(cv, smooth([[x - 16, 424], [x + 16, 424], [x + 16, 440], [x, 448], [x - 16, 440]]), PATCH);
          stroke(cv, leg, 5);
        }
        // the tail, tufted
        stroke(cv, 'M86 300 Q78 340 92 372', 5);
        crayoned(cv, 'M84 360 L104 362 L100 392 L86 394 L80 380 Z', ORANGE);
        // the round body and its patches
        cv.add(`<path d="${ball}" fill="${WHITE}"/>`);
        cv.add(`<g clip-path="${within(cv, ball)}">`);
        crayoned(cv, blob(rnd, [178, 110], 98, 70, -10, 0.05), PATCH);
        crayoned(cv, blob(rnd, [356, 120], 40, 46, 10, 0.05), PATCH);
        crayoned(cv, blob(rnd, [80, 300], 60, 70, 0, 0.05), PATCH);
        crayoned(cv, blob(rnd, [426, 260], 50, 90, 0, 0.05), PATCH);
        cv.add('</g>');
        stroke(cv, ball, 7);
        // its head: horns and ears, a blue collar behind with a gold bell, then the face
        crayoned(cv, blob(rnd, [292, 292], 22, 12, -30, 0.05), ORANGE);
        crayoned(cv, blob(rnd, [384, 296], 22, 12, 30, 0.05), ORANGE);
        stroke(cv, blob(rnd, [292, 292], 22, 12, -30, 0.05), 4.5);
        stroke(cv, blob(rnd, [384, 296], 22, 12, 30, 0.05), 4.5);
        cv.add(`<path d="M276 330 Q290 300 330 292 Q298 312 296 360 Z" fill="${BLUE}" filter="${crayon(cv, rnd, { keep: 2.4, tear: 2 })}"/>`);
        crayoned(cv, blob(rnd, [300, 404], 9, 10, 0, 0.05), GOLD);
        crayoned(cv, 'M314 286 L330 258 L346 286 Z', ORANGE);
        crayoned(cv, 'M356 286 L372 258 L388 290 Z', ORANGE);
        cv.add(`<path d="${head}" fill="${WHITE}"/>`);
        crayoned(cv, nose, PINK);
        stroke(cv, head, 6);
        cv.add(`<g fill="${LINE}"><ellipse cx="320" cy="344" rx="7" ry="7.5"/><ellipse cx="368" cy="342" rx="5" ry="6"/><ellipse cx="330" cy="404" rx="4" ry="6"/><ellipse cx="360" cy="402" rx="4" ry="6"/></g>`);
      });
      return s.done(PLAIN);
    },
  },
  {
    key: 'mirisk',
    ku: 'Mirîşk',
    en: 'Hen',
    // a plump hen turned to our right, drawn in a thick black line with a soft cream inside: her feathered back rising
    // to the tail, a red comb and wattle, two dots for eyes either side of a small beak, her wing in three strokes, thin
    // legs and toes
    still(rnd) {
      const s = new Still(rnd).place([0, 0], 1);
      const LINE = '#151312';
      const CREAM = '#f3e0c8';
      const RED = '#dd5a43';
      const line = (cv, d, w = 12) => cv.add(`<path d="${d}" fill="none" stroke="${LINE}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" filter="${torn(cv, rnd, 1.6, 0.12)}"/>`);
      const body = smooth([[186, 70], [210, 98], [234, 150], [270, 118], [312, 108], [346, 132], [364, 176], [384, 246], [400, 330], [398, 398], [358, 440], [290, 452], [200, 452], [120, 436], [84, 400], [80, 340], [96, 296], [104, 248], [122, 196], [146, 150], [160, 104]]);
      s.paint((cv) => {
        // legs and toes first, under her
        line(cv, 'M210 448 L216 480 M190 486 L240 482 M216 480 L224 494', 7);
        line(cv, 'M332 446 L342 484 M318 494 L364 488 M342 484 L356 498', 7);
        // the comb, then her body over its foot
        cv.add(`<path d="M312 112 L318 72 Q330 60 340 78 Q350 70 358 86 Q368 84 366 108 Z" fill="${RED}" filter="${torn(cv, rnd, 1.5, 0.12)}"/>`);
        line(cv, 'M312 112 L318 72 Q330 60 340 78 Q350 70 358 86 Q368 84 366 108', 9);
        cv.add(`<path d="${body}" fill="${CREAM}"/>`);
        line(cv, body);
        // the bumps of her tail feathers
        line(cv, 'M146 150 Q132 148 128 164 M122 196 Q104 194 102 212 M104 248 Q88 252 90 270', 9);
        // eyes, beak and wattle
        cv.add(`<g fill="${LINE}"><ellipse cx="300" cy="170" rx="11" ry="12"/><ellipse cx="368" cy="172" rx="9" ry="12"/></g>`);
        cv.add(`<path d="M322 166 Q338 160 350 172 Q340 184 326 182 Z" fill="${CREAM}" stroke="${LINE}" stroke-width="7" stroke-linejoin="round"/>`);
        cv.add(`<path d="M318 196 Q332 190 344 196 Q346 220 334 222 Q326 230 318 220 Q306 214 318 196 Z" fill="${RED}" stroke="${LINE}" stroke-width="7" stroke-linejoin="round"/>`);
        // her wing at her side: its leading edge and the ends of three feathers
        line(cv, 'M246 236 Q206 262 188 300 Q176 330 188 352', 10);
        line(cv, 'M196 304 Q212 302 222 290', 9);
        line(cv, 'M192 332 Q210 332 224 320', 9);
        line(cv, 'M196 356 Q216 360 232 348', 9);
      });
      return s.done(PLAIN);
    },
  },
];
