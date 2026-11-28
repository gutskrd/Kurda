import { blob, crayon, dry, mark, painter, softly, strokes, within } from '../brush.mjs';
import { along, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'pisik-cizme',
  ku: 'Pisîka Bi Çizme',
  en: 'Cat in boots',
  // a ginger tabby striding upright to our right, three-quarters on, leaning a little into its step with its chest out:
  // a soft felt hat with a curled brim tipped down over its eyes and a red feather in the band, a calm, confident face, a
  // paw swung forward, tall leather boots with folded cuffs, the back one planted and the front one striding out heel
  // first, and its tail rising behind in an S; stripes brushed round the body over warm oranges, a cream chest and muzzle,
  // light from the upper left, all in a soft dark pencil line
  still(rnd) {
    const s = new Still(rnd).place([-24, -8], 0.96);
    const [COAT, SHADE, DEEP, STRIPE, LIGHT, CREAM, PALE] = ['#d48b50', '#b16b3c', '#8f4f2c', '#9a5430', '#ecb57f', '#f5dfbb', '#fcefdc'];
    const [HAT, HAT_LIT, HAT_DEEP, BAND] = ['#86593c', '#ad7d55', '#5a3622', '#3b2318'];
    const [BOOT, BOOT_LIT, BOOT_DEEP, CUFF, CUFF_LIT, SOLE] = ['#6e3e26', '#9a633e', '#46261a', '#b98252', '#dcb07c', '#33201a'];
    const [RED, RED_DEEP, RED_LIT] = ['#c4473a', '#8f2a24', '#e57a5e'];
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);
    const clip = (cv, d, draw) => {
      cv.add(`<g clip-path="${within(cv, d)}">`);
      draw();
      cv.add('</g>');
    };
    const glaze = (cv, pts, colour, opacity, soft) => cv.add(`<path d="${spline(pts)}" fill="${colour}" fill-opacity="${opacity}" filter="${softly(cv, soft)}"/>`);
    // A tabby stripe, thick where it starts at the spine and thinning to nothing as it wraps round toward the chest.
    const stripe = (cv, pts, w, opacity = 0.85) =>
      cv.add(`<path d="${mark(rnd, pts, w, { start: 0.7, end: 0.02, peak: 0.25, tremble: 0.2 })}" fill="${STRIPE}" fill-opacity="${opacity}"`
        + ` filter="${dry(cv, rnd, { along: 'x', keep: 2.6, streak: 0.3 })}"/>`);
    const rot = (pts, deg, [cx, cy]) => {
      const [c, si] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
      return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * si, cy + (x - cx) * si + (y - cy) * c]);
    };
    // A limb, a tail or a feather along `pts`, as wide as `width(t)` at each point along it: its two sides.
    const tube = (pts, width, count = 20) => {
      const c = along(pts, count);
      const [L, R] = [[], []];
      c.forEach((p, i) => {
        const [a, b] = [c[Math.max(0, i - 1)], c[Math.min(c.length - 1, i + 1)]];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const w = width(i / (c.length - 1)) / 2;
        L.push([p[0] - ((b[1] - a[1]) / l) * w, p[1] + ((b[0] - a[0]) / l) * w]);
        R.push([p[0] + ((b[1] - a[1]) / l) * w, p[1] - ((b[0] - a[0]) / l) * w]);
      });
      return { L, R, d: spline([...L, ...[...R].reverse()]) };
    };
    // A boot drawn upright about the middle of its top with its toe to the right, then turned by `deg` and scaled by `k`
    // where it stands: the shaft and foot, the folded cuff, and the sole and heel.
    const boot = (at, deg, k) => {
      const T = (pts) => rot(pts.map(([x, y]) => [at[0] + x * k, at[1] + y * k]), deg, at);
      return {
        T,
        leg: T([[-22, -6], [22, -6], [24, 30], [25, 58], [36, 68], [58, 74], [82, 80], [96, 88], [92, 96], [68, 99], [24, 99], [-20, 99], [-26, 90],
          [-26, 60], [-24, 26]]),
        cuff: T([[-36, -34], [-12, -39], [14, -39], [36, -34], [34, -16], [30, 4], [10, 0], [-10, 0], [-30, 4], [-34, -16]]),
        sole: spline(T([[-60, 92], [120, 92], [120, 140], [-60, 140]])),
        heel: spline(T([[-60, 84], [-4, 84], [-4, 140], [-60, 140]])),
      };
    };

    const tail = tube([[236, 340], [202, 354], [166, 352], [138, 334], [124, 304], [124, 272], [114, 246], [96, 232]],
      (t) => 30 + 16 * Math.sin(Math.PI * t) - 10 * t);
    const [tEnd, tBefore] = [tail.L.length - 1, tail.L.length - 2].map((i) => [(tail.L[i][0] + tail.R[i][0]) / 2, (tail.L[i][1] + tail.R[i][1]) / 2]);
    const toward = Math.atan2(tEnd[1] - tBefore[1], tEnd[0] - tBefore[0]);
    const tailTip = [70, 35, 0, -35, -70].map((deg) => toward + (deg * Math.PI) / 180).map((a) => [tEnd[0] + Math.cos(a) * 11, tEnd[1] + Math.sin(a) * 11]);
    const tailD = spline([...tail.L, ...tailTip, ...[...tail.R].reverse()]);
    const legBack = tube([[250, 326], [244, 370], [238, 404]], (t) => 52 - 6 * t);
    const legFront = tube([[306, 326], [338, 364], [360, 394]], (t) => 50 - 6 * t);
    const T = [[250, 226], [298, 222], [332, 236], [354, 260], [360, 290], [346, 314], [330, 336], [306, 352], [276, 360], [246, 356], [226, 340], [216, 312],
      [218, 284], [226, 256], [236, 238]];
    const bib = [[302, 230], [336, 242], [358, 268], [362, 298], [346, 324], [328, 344], [314, 326], [306, 292], [300, 262]];
    const arm = tube([[302, 236], [296, 260], [294, 286], [300, 308], [324, 322], [348, 326]], (t) => 28 - 7 * t, 24);
    const PAW = [356, 326];
    const H = [[212, 150], [250, 136], [300, 134], [338, 146], [356, 164], [362, 182], [370, 198], [366, 214], [352, 226], [334, 236], [310, 242], [284, 244],
      [262, 240], [244, 236], [228, 228], [214, 214], [204, 196], [204, 172]];
    const muzzle = blob(rnd, [342, 210], 25, 17, -8, 0.05);
    const ear = [[214, 168], [200, 150], [186, 128], [190, 120], [206, 128], [228, 142], [240, 152]];
    const earIn = [[216, 158], [202, 140], [196, 130], [208, 136], [224, 148]];
    // The hat, tipped forward over the brow: its brim curled up at the sides, its crown pinched along the top.
    const HAT_AT = [278, 118];
    const tip = (pts) => rot(pts, 7, HAT_AT);
    const brim = tip([[126, 94], [148, 108], [186, 116], [236, 120], [286, 122], [336, 122], [382, 118], [412, 106], [430, 96], [432, 112], [418, 134],
      [390, 150], [348, 160], [300, 164], [252, 160], [206, 150], [168, 134], [140, 116]]);
    const crown = tip([[212, 120], [208, 92], [212, 66], [226, 46], [250, 38], [274, 48], [298, 38], [324, 44], [340, 62], [346, 92], [348, 120], [306, 126],
      [256, 126]]);
    const band = tip([[210, 100], [254, 106], [300, 106], [346, 100], [348, 118], [304, 124], [256, 124], [212, 118]]);
    const quill = tip([[230, 108], [210, 88], [188, 66], [164, 46], [146, 36]]);
    const feather = tube(quill, (t) => 4 + 26 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.8);
    const bootBack = boot([236, 408], 3, 0.88);
    const bootFront = boot([362, 398], -38, 0.88);
    const D = Object.fromEntries(Object.entries({ T, bib, H, brim, crown, band, ear, earIn }).map(([k, v]) => [k, spline(v)]));
    // The body and arm lean into the stride: drawn upright, then slanted forward about the hips.
    const LEAN = 'translate(0 300) skewX(-7) translate(0 -300)';
    const loop = (P) => [...P, P[0], P[1]];
    const seg = (P, i, j) => Array.from({ length: ((j - i + P.length) % P.length) + 1 }, (_, k) => P[(i + k) % P.length]);

    // Each part is inked as soon as it is painted, so the parts in front of it cover its line as they cover its paint.
    s.paint((cv) => {
      // The tail rises behind in an S: lit along its top, shaded beneath, its rings brushed round it and its tip darker.
      lay(cv, tailD, COAT);
      clip(cv, tailD, () => {
        brush(cv, tail.R.slice(2), 14, SHADE, 0.75, 'x');
        brush(cv, tail.L.slice(3, 18), 10, LIGHT, 0.7, 'x');
        for (const i of [3, 7, 11, 15]) {
          const [a, b] = [tail.L[i], tail.R[i]];
          const m = [(a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.12, (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.12];
          brush(cv, [a, m, b], 9, STRIPE, 0.85, 'y');
        }
        wash(cv, blob(rnd, tEnd, 16, 16, 0, 0.05), DEEP, 5, 0.85);
      });
      strokes(cv, rnd, tailD, [96, 220, 236, 366], { count: 18, colours: [LIGHT, PALE], flow: () => -60, spread: 40, length: 9, width: 1.6, opacity: [0.25, 0.5] });
      line(cv, tail.L.slice(2), 5, { start: 0.2, end: 0.4, count: 40 });
      line(cv, [tail.L.at(-1), ...tailTip, ...[...tail.R].reverse().slice(0, -3)], 4.8, { start: 0.4, end: 0.2, count: 50 });

      // The legs run down into the boots: the back one in the body's shade.
      for (const [leg, tone] of [[legBack, SHADE], [legFront, COAT]]) {
        lay(cv, leg.d, tone);
        clip(cv, leg.d, () => {
          brush(cv, leg.R, 14, DEEP, 0.45, 'y');
          brush(cv, [leg.L[6], leg.R[7]], 7, STRIPE, 0.8, 'x');
        });
        line(cv, leg.L, 4.6, { start: 0.2, end: 0.4 });
        line(cv, leg.R, 4.6, { start: 0.2, end: 0.4 });
      }

      // The body, leaning into the step: lit down its back, shaded under the arm and the belly, stripes wrapping round it
      // from the spine and thinning toward the cream chest.
      cv.add(`<g transform="${LEAN}">`);
      lay(cv, D.T, COAT);
      clip(cv, D.T, () => {
        glaze(cv, [[200, 240], [240, 234], [246, 300], [232, 362], [200, 350]], LIGHT, 0.6, 9);
        glaze(cv, [[282, 240], [300, 250], [302, 310], [314, 360], [280, 360], [276, 300]], SHADE, 0.55, 10);
        glaze(cv, [[226, 352], [300, 358], [350, 334], [360, 390], [220, 390]], DEEP, 0.45, 9);
        glaze(cv, [[244, 222], [322, 226], [316, 254], [250, 250]], DEEP, 0.45, 7);
        for (const [y, w] of [[258, 11], [282, 12], [306, 12], [330, 12], [352, 10]]) {
          const x0 = 214 + Math.abs(y - 300) * 0.12;
          stripe(cv, [[x0 - 4, y - 6], [x0 + 22, y - 2], [x0 + 46, y + 6], [x0 + 68, y + 18]], w);
          stripe(cv, [[x0 + 34, y + 9], [x0 + 52, y + 13], [x0 + 70, y + 22]], w * 0.6, 0.7);
        }
        brush(cv, [[226, 246], [218, 290], [220, 340]], 10, PALE, 0.35, 'y');
      });
      lay(cv, D.bib, CREAM, 2.4);
      clip(cv, D.bib, () => {
        glaze(cv, [[300, 230], [340, 236], [320, 264], [300, 262]], '#c99a6a', 0.6, 6);
        brush(cv, [[304, 256], [308, 296], [320, 340]], 12, '#e4c296', 0.7, 'y');
        brush(cv, [[332, 252], [348, 282], [348, 316]], 10, PALE, 0.8, 'y');
      });
      strokes(cv, rnd, D.T, [206, 228, 354, 368], { count: 34, colours: [LIGHT, PALE], flow: () => -100, spread: 30, length: 10, width: 1.8,
        opacity: [0.25, 0.55] });
      line(cv, seg(T, 10, 15), 5.2, { start: 0.3, end: 0.4, count: 40 });
      line(cv, [[236, 350], [270, 362], [306, 352]], 4.6, { start: 0.3, end: 0.2 });
      line(cv, seg(T, 2, 5), 5, { start: 0.2, end: 0.2, count: 40 });
      cv.add('</g>');

      // The boots: lit down the heel side, dark at the front, a shine along the toe, creases at the ankle; the folded
      // cuff paler, lit along its fold.
      for (const b of [bootBack, bootFront]) {
        const d = spline(b.leg);
        lay(cv, d, BOOT, 2.8);
        clip(cv, d, () => {
          brush(cv, b.T([[-15, 2], [-17, 44], [-15, 86]]), 13, BOOT_LIT, 0.7, 'y');
          brush(cv, b.T([[17, 2], [19, 44], [26, 66]]), 12, BOOT_DEEP, 0.65, 'y');
          brush(cv, b.T([[-26, 6], [0, 10], [26, 6]]), 12, BOOT_DEEP, 0.7, 'x');
          brush(cv, b.T([[46, 72], [68, 77], [88, 85]]), 7, '#c08458', 0.85, 'x');
          brush(cv, b.T([[-6, 16], [4, 28], [-4, 40], [6, 52], [-2, 62]]), 3, CUFF_LIT, 0.75, 'y');
          brush(cv, b.T([[-18, 20], [-12, 34], [-18, 48]]), 2.6, CUFF_LIT, 0.6, 'y');
          cv.add(`<path d="${b.sole}" fill="${SOLE}" filter="${crayon(cv, rnd, { keep: 2.8, tear: 1.5 })}"/>`);
          cv.add(`<path d="${b.heel}" fill="${SOLE}" filter="${crayon(cv, rnd, { keep: 2.8, tear: 1.5 })}"/>`);
        });
        line(cv, loop(b.leg).slice(1), 4.6, { start: 0.3, end: 0.3, count: 50 });
        for (const crease of [[[8, 52], [16, 55], [25, 60]], [[6, 62], [16, 65], [28, 68]]]) line(cv, b.T(crease), 2.2, { start: 0.2, end: 0.2 });
        const c = spline(b.cuff);
        lay(cv, c, CUFF, 2.8);
        clip(cv, c, () => {
          brush(cv, b.T([[-34, -30], [0, -34], [34, -30]]), 10, CUFF_LIT, 0.9, 'x');
          brush(cv, b.T([[-32, 0], [0, -2], [32, 0]]), 9, '#8e5a34', 0.55, 'x');
          brush(cv, b.T([[24, -30], [30, -12], [28, 2]]), 10, '#8e5a34', 0.45, 'y');
          brush(cv, b.T([[-26, -26], [-30, -10], [-26, 2]]), 7, CUFF_LIT, 0.5, 'y');
        });
        line(cv, loop(b.cuff), 4.2, { start: 0.3, end: 0.3, count: 40 });
        line(cv, b.T([[-30, -24], [0, -27], [30, -24]]), 2, { start: 0.2, end: 0.2 });
      }

      // The near arm swings forward, throwing a soft shadow on the chest, its paw curled in front of it.
      cv.add(`<g transform="${LEAN}">`);
      clip(cv, D.T, () => cv.add(`<path d="${arm.d}" transform="translate(5 9)" fill="${DEEP}" fill-opacity="0.4" filter="${softly(cv, 4)}"/>`));
      lay(cv, arm.d, COAT);
      clip(cv, arm.d, () => {
        brush(cv, arm.L.slice(4, 15), 9, LIGHT, 0.7, 'y');
        brush(cv, arm.R.slice(3, 13), 9, SHADE, 0.6, 'y');
        brush(cv, arm.L.slice(15), 9, SHADE, 0.7, 'x');
        brush(cv, arm.R.slice(16), 7, LIGHT, 0.6, 'x');
        brush(cv, [arm.L[9], arm.R[9]], 7, STRIPE, 0.8, 'x');
        brush(cv, [arm.L[18], arm.R[18]], 7, STRIPE, 0.8, 'y');
      });
      line(cv, arm.L.slice(7), 4.6, { start: 0.1, end: 0.3 });
      line(cv, arm.R.slice(8), 4.4, { start: 0.1, end: 0.3 });
      const paw = blob(rnd, PAW, 15, 12, -20, 0.06);
      lay(cv, paw, '#f2c895', 2.4);
      clip(cv, paw, () => brush(cv, [[348, 332], [360, 336], [372, 330]], 7, '#d9a06a', 0.7, 'x'));
      line(cv, rot([[-6, -12], [10, -10], [16, 0], [8, 11], [-8, 10]].map(([x, y]) => [PAW[0] + x, PAW[1] + y]), -20, PAW), 4.2, { start: 0.3, end: 0.3 });
      for (const [x, y] of [[364, 320], [367, 328]]) line(cv, [[x - 6, y + 1], [x, y]], 2, { start: 0.3, end: 0.8 });
      cv.add('</g>');

      // The head and the hat, drawn about the neck and set on the shoulders a little smaller and tipped into the stride.
      cv.add(`<g transform="translate(308 238) rotate(5) scale(0.9) translate(-290 -240)">`);
      // The near ear pokes out under the curl of the brim.
      lay(cv, D.ear, COAT);
      lay(cv, D.earIn, CREAM, 2.4);
      clip(cv, D.earIn, () => wash(cv, spline(earIn.slice(1, 4)), '#e7a98a', 5, 0.7));
      line(cv, ear.slice(0, 6), 4.6, { start: 0.3, end: 0.3 });

      // The head: lit on the near cheek, the brim's shadow across the brow, stripes on the brow and cheek.
      lay(cv, D.H, COAT);
      clip(cv, D.H, () => {
        glaze(cv, [[206, 176], [226, 160], [252, 168], [246, 210], [226, 230], [206, 214]], LIGHT, 0.65, 7);
        glaze(cv, [[230, 232], [290, 246], [340, 234], [350, 260], [230, 260]], DEEP, 0.5, 6);
        for (const [pts, w] of [
          [[[206, 188], [222, 192], [238, 200]], 7], [[[208, 208], [226, 210], [242, 218]], 6], [[[236, 160], [248, 168], [256, 180]], 6],
        ]) brush(cv, pts, w, STRIPE, 0.75, 'y');
        glaze(cv, tip([[180, 136], [280, 146], [380, 136], [400, 166], [300, 184], [200, 176]]), DEEP, 0.75, 7);
      });
      lay(cv, muzzle, CREAM, 2.4);
      clip(cv, muzzle, () => brush(cv, [[322, 220], [342, 226], [362, 220]], 8, '#e4c296', 0.7, 'x'));
      strokes(cv, rnd, D.H, [204, 150, 366, 244], { count: 24, colours: [LIGHT, PALE], flow: () => -110, spread: 30, length: 9, width: 1.8,
        opacity: [0.25, 0.5] });
      line(cv, seg(H, 5, 13), 5.2, { start: 0.3, end: 0.3, count: 50 });
      line(cv, seg(H, 15, 17).concat([[208, 156]]), 5, { start: 0.1, end: 0.3, count: 30 });

      // The hat: the brim lit along its top and dark underneath, the feather tucked into the band behind the crown.
      lay(cv, D.brim, HAT, 2.8);
      clip(cv, D.brim, () => {
        brush(cv, tip([[132, 100], [200, 116], [270, 122], [340, 122], [420, 104]]), 14, HAT_LIT, 0.7, 'x');
        brush(cv, tip([[150, 122], [220, 146], [300, 160], [388, 146], [424, 116]]), 14, HAT_DEEP, 0.8, 'x');
      });
      line(cv, brim.slice(9, 18), 4.8, { start: 0.2, end: 0.3, count: 50 });
      line(cv, [...brim.slice(17), ...brim.slice(0, 4)], 4.4, { start: 0.3, end: 0.1, count: 30 });
      line(cv, brim.slice(5, 10), 4.4, { start: 0.1, end: 0.4, count: 30 });
      lay(cv, feather.d, RED, 2.6);
      clip(cv, feather.d, () => {
        brush(cv, feather.R, 10, RED_DEEP, 0.7, 'y');
        brush(cv, feather.L.slice(3), 8, RED_LIT, 0.7, 'y');
        for (let i = 4; i < 19; i += 3) brush(cv, [feather.L[i], along(quill, 20)[i + 1], feather.R[i + 2]], 2.4, RED_DEEP, 0.6, 'x');
      });
      line(cv, feather.L, 3.8, { start: 0.3, end: 0.2 });
      line(cv, feather.R, 3.8, { start: 0.3, end: 0.2 });
      line(cv, quill, 2.4, { start: 0.6, end: 0.2 });
      lay(cv, D.crown, HAT, 2.8);
      clip(cv, D.crown, () => {
        brush(cv, tip([[222, 110], [218, 76], [232, 50]]), 20, HAT_LIT, 0.75, 'y');
        brush(cv, tip([[272, 56], [274, 84], [276, 110]]), 12, HAT_DEEP, 0.5, 'y');
        brush(cv, tip([[332, 64], [338, 90], [338, 116]]), 16, HAT_DEEP, 0.65, 'y');
      });
      lay(cv, D.band, BAND, 2.8);
      line(cv, crown.slice(0, 11), 4.6, { start: 0.3, end: 0.3, count: 40 });

      // A calm, confident face: eyes a little lowered under the brim, a pink nose, whiskers out past the cheek.
      for (const [x, y, rx, ry] of [[272, 188, 11, 8.5], [328, 182, 8, 7.5]]) {
        const eye = spline([[x - rx, y], [x - rx * 0.4, y - ry * 0.75], [x + rx * 0.5, y - ry * 0.8], [x + rx, y - ry * 0.1], [x + rx * 0.6, y + ry * 0.7],
          [x, y + ry * 0.9], [x - rx * 0.6, y + ry * 0.6]]);
        cv.add(`<path d="${eye}" fill="#c9963a" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}"/>`);
        clip(cv, eye, () => {
          const lid = spline([[x - rx, y - ry * 0.2], [x, y - ry * 1.1], [x + rx, y - ry * 0.2], [x, y - ry * 0.1]]);
          cv.add(`<path d="${lid}" fill="#6b4320" fill-opacity="0.7" filter="${softly(cv, 1.2)}"/>`);
          cv.add(`<ellipse cx="${x + rx * 0.05}" cy="${y + ry * 0.05}" rx="${rx * 0.5}" ry="${ry * 0.9}" fill="#2a1a12"/>`);
        });
        line(cv, [[x - rx, y], [x - rx * 0.6, y + ry * 0.6], [x, y + ry * 0.9], [x + rx * 0.6, y + ry * 0.7], [x + rx, y - ry * 0.1]], 1.8,
          { start: 0.3, end: 0.3 });
        cv.add(`<circle cx="${x - rx * 0.25}" cy="${y - ry * 0.2}" r="${rx * 0.28}" fill="#fff4e4"/>`);
        line(cv, [[x - rx * 1.2, y - ry * 0.3], [x - rx * 0.3, y - ry * 0.95], [x + rx * 0.6, y - ry * 0.95], [x + rx * 1.3, y - ry * 0.2]], 3,
          { start: 0.3, end: 0.5 });
      }
      wash(cv, blob(rnd, [294, 212], 14, 8, 0, 0.05), '#e98a74', 6, 0.45);
      const nose = spline([[350, 194], [360, 192], [368, 196], [363, 202], [358, 205], [353, 201]]);
      cv.add(`<path d="${nose}" fill="#d9736f" filter="${crayon(cv, rnd, { keep: 3.4, tear: 1, grain: 1.2 })}"/>`);
      line(cv, [[358, 205], [357, 212]], 2.6, { start: 0.8, end: 0.6 });
      line(cv, [[347, 214], [352, 218], [357, 212]], 2.6, { start: 0.4, end: 0.8, peak: 0.6 });
      line(cv, [[357, 212], [362, 217], [368, 215]], 2.6, { start: 0.8, end: 0.4, peak: 0.4 });
      for (const whisker of [[[366, 208], [410, 198]], [[366, 214], [408, 218]]]) line(cv, whisker, 1.8, { start: 0.8, end: 0.1 });
      cv.add('</g>');
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
