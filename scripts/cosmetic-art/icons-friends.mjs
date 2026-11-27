/**
 * The shop's animal friends: ten small characters, each drawn in a hand of its own as an illustrator would sign it.
 * A rabbit showing its muscles in brush and ink; a fox in a red cape holding up a sword, cut as a lino print; a kitten
 * in a hat and boots striding along, engraved in one red-brown ink; a kitten with a red ribbon in black and red crayon;
 * a pigeon in one blue crayon line; a bear in flat brown with nothing to say; a white bear in black marker; a cow as
 * round as a ball; a plump hen; and a kiwi in a rough black line. The larger ones live in friends/, one to a file, each
 * with its own pen. Each is cut out with its paper behind it, so it reads over a dark profile picture as over a light one.
 */
import { blob, mark, strokes, torn } from './brush.mjs';
import { spline } from './kit.mjs';
import { Still } from './still.mjs';
import { piece as celek } from './friends/celek.mjs';
import { piece as hirc } from './friends/hirc.mjs';
import { piece as kerosk } from './friends/kerosk.mjs';
import { piece as hircaSpi } from './friends/hirca-spi.mjs';
import { piece as kevokaSin } from './friends/kevoka-sin.mjs';
import { piece as kiwi } from './friends/kiwi.mjs';
import { piece as mirisk } from './friends/mirisk.mjs';
import { piece as pisikQurdele } from './friends/pisik-qurdele.mjs';

const PLAIN = { finish: { paint: 0, grain: 0.012, contrast: 0, saturation: 1, warmth: 0 } };

// ─────────────────────────────────────────────────────────────── the friends

export const FRIENDS = [
  kerosk,
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
      const tail = spline([[386, 404], [434, 410], [470, 430], [482, 452], [440, 458], [396, 452], [372, 434]]);
      const tailTip = spline([[440, 422], [470, 430], [482, 452], [446, 458], [430, 444]]);
      const body = spline([[262, 236], [312, 232], [330, 300], [334, 380], [330, 440], [276, 448], [232, 440], [228, 380], [236, 300]]);
      const chest = spline([[268, 246], [302, 246], [306, 320], [298, 420], [276, 436], [258, 420], [254, 320]]);
      const cape = spline([[276, 226], [336, 218], [366, 270], [396, 360], [430, 450], [372, 460], [318, 456], [326, 380], [318, 300], [300, 256]]);
      const capeBack = spline([[244, 260], [226, 330], [208, 410], [196, 460], [244, 456], [240, 380], [250, 300]]);
      const head = spline([[246, 126], [236, 74], [276, 104], [306, 102], [344, 72], [340, 128], [356, 158], [372, 186], [340, 204], [306, 214], [272, 206], [248, 180], [244, 150]]);
      const cheek = spline([[290, 186], [320, 176], [356, 178], [372, 186], [344, 206], [306, 214], [282, 204]]);
      const earInL = spline([[252, 118], [246, 90], [270, 108]]);
      const earInR = spline([[322, 104], [338, 84], [334, 116]]);
      const arm = spline([[244, 262], [222, 234], [206, 212], [218, 200], [236, 220], [262, 248]]);
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
      const head = spline([[218, 176], [244, 160], [282, 158], [312, 172], [324, 198], [316, 226], [290, 242], [256, 244], [228, 232], [214, 208]]);
      const body = spline([[230, 236], [284, 234], [312, 262], [320, 312], [308, 360], [296, 394], [254, 402], [224, 390], [214, 344], [216, 290]]);
      const tail = mark(rnd, [[226, 352], [178, 340], [132, 316], [106, 286], [100, 262]], 34, { start: 0.9, end: 0.45, peak: 0.25 });
      const bootL = spline([[236, 384], [272, 384], [272, 432], [290, 450], [292, 470], [232, 472], [230, 440]]);
      const bootR = spline([[284, 374], [314, 362], [336, 398], [372, 412], [384, 432], [352, 444], [312, 434], [292, 408]]);
      const brim = blob(rnd, [262, 166], 104, 19, -6, 0.04, 30);
      const crown = spline([[208, 160], [212, 124], [234, 98], [268, 90], [300, 100], [312, 128], [314, 158], [262, 166]]);
      const paw = blob(rnd, [314, 306], 15, 12, 20, 0.08);
      const ear = spline([[300, 168], [322, 144], [326, 180]]);
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
  pisikQurdele,
  kevokaSin,
  hirc,
  hircaSpi,
  celek,
  mirisk,
  kiwi,
];
