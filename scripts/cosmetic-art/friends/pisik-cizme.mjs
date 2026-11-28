import { blob, crayon, painter, strokes, within } from '../brush.mjs';
import { along, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'pisik-cizme',
  ku: 'Pisîka Bi Çizme',
  en: 'Cat in boots',
  // a fluffy ginger tabby walking upright, three-quarters on and facing right, mid-stride: a soft brown felt hat with a
  // wide brim tipped down over its brow and a red feather in its band, tall leather boots with folded cuffs, the back
  // one planted and the front one stepping out toe up, a paw swung forward and its tail curving up behind; stripes
  // brushed over warm oranges, a cream chest and muzzle, calm dark eyes, all inked in a soft dark pencil line
  still(rnd) {
    const s = new Still(rnd).place([0, 0], 1);
    const [COAT, SHADE, DEEP, STRIPE, LIGHT, CREAM, PALE] = ['#d48a4c', '#b66a38', '#94502c', '#a65a30', '#eeb57c', '#f4ddb9', '#fbeedb'];
    const [HAT, HAT_LIT, HAT_DEEP, BAND] = ['#86593c', '#ab7a52', '#5e3824', '#3e2418'];
    const [BOOT, BOOT_LIT, BOOT_DEEP, CUFF, CUFF_LIT, SOLE] = ['#6e3e26', '#98613c', '#472616', '#bf8752', '#ddb27e', '#33201a'];
    const [RED, RED_DEEP, RED_LIT] = ['#c4473a', '#8f2a24', '#e57a5e'];
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);
    const clip = (cv, d, draw) => {
      cv.add(`<g clip-path="${within(cv, d)}">`);
      draw();
      cv.add('</g>');
    };
    const rot = (pts, deg, [cx, cy]) => {
      const [c, si] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
      return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * si, cy + (x - cx) * si + (y - cy) * c]);
    };
    const seg = (P, i, j) => Array.from({ length: ((j - i + P.length) % P.length) + 1 }, (_, k) => P[(i + k) % P.length]);
    // Fur standing off an open edge: each stretch from `from` to `to` gets a tuft that rises gently and drops back
    // short, so it leans the way the edge runs, as fur lies. `side` 1 pushes it to the left of the way the edge runs.
    const tufts = (P, amp, side, from = 0, to = P.length - 1) => {
      const out = [];
      P.forEach((a, i) => {
        out.push(a);
        if (i < from || i >= to) return;
        const b = P[i + 1];
        const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
        const l = Math.hypot(dx, dy) || 1;
        const [nx, ny] = [(dy / l) * side, (-dx / l) * side];
        const k = amp * (0.5 + rnd() * 0.9);
        const at = (t, o) => [a[0] + dx * t + nx * o, a[1] + dy * t + ny * o];
        out.push(at(0.25, k * 0.3), at(0.58, k), at(0.8, k * 0.25));
      });
      return out;
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
    // A boot drawn upright about the middle of its top, its toe to the right, then turned by `deg` and scaled by `k`
    // where it stands: the leather, its folded cuff, and the band where the sole and heel go.
    const boot = (at, deg, k) => {
      const T = (pts) => rot(pts.map(([x, y]) => [at[0] + x * k, at[1] + y * k]), deg, at);
      return {
        T,
        leg: T([[-25, -6], [25, -6], [27, 28], [29, 52], [38, 61], [58, 66], [76, 71], [87, 79], [84, 88], [64, 92], [24, 92], [-22, 92], [-27, 84], [-27, 56],
          [-26, 26]]),
        cuff: T([[-38, -30], [-12, -34], [14, -34], [38, -30], [35, -12], [31, 6], [10, 3], [-10, 3], [-31, 6], [-35, -12]]),
        sole: spline(T([[-60, 85], [120, 85], [120, 130], [-60, 130]])),
      };
    };

    const tail = tube([[216, 330], [184, 346], [148, 346], [120, 330], [102, 304], [98, 276], [108, 250]], (t) => 30 + 16 * Math.sin(Math.PI * t) ** 0.7 - 8 * t);
    const tailL = tufts(tail.L.filter((_, i) => i % 3 === 2), 5, -1, 1);
    const tailR = tufts(tail.R.filter((_, i) => i % 3 === 2), 8, 1);
    // A round tip: from the end of one side, over the end, to the end of the other.
    const [tEnd, tBefore] = [tail.L.length - 1, tail.L.length - 2].map((i) => [(tail.L[i][0] + tail.R[i][0]) / 2, (tail.L[i][1] + tail.R[i][1]) / 2]);
    const toward = Math.atan2(tEnd[1] - tBefore[1], tEnd[0] - tBefore[0]);
    const tailTip = [60, 25, -10, -45, -75].map((deg) => toward + (deg * Math.PI) / 180).map((a) => [tEnd[0] + Math.cos(a) * 11, tEnd[1] + Math.sin(a) * 11]);
    const tailD = spline([...tailL, ...tailTip, ...[...tailR].reverse()]);
    const legFar = tube([[232, 340], [234, 372], [236, 392]], () => 50);
    const legNear = tube([[280, 340], [300, 364], [318, 384]], () => 50);
    const back = tufts([[218, 226], [204, 250], [194, 280], [192, 312], [198, 342], [214, 364]], 6, -1, 0, 4);
    const front = [[312, 362], [332, 340], [340, 310], [336, 280], [322, 256], [302, 240]];
    const torso = [...back, [246, 374], [282, 372], ...front];
    const bib = tufts([[344, 306], [338, 272], [320, 246], [292, 232], [282, 262], [286, 300], [298, 334], [326, 350]], 5, -1, 0, 3);
    const armNear = tube([[294, 252], [302, 278], [306, 302], [324, 304], [342, 294]], (t) => 30 - 6 * t);
    const PAW = [344, 293];
    const head = [[200, 150], [224, 128], [258, 118], [294, 120], [326, 134], [346, 152], [352, 166], [360, 178], [370, 188], [368, 200], [358, 208], [352, 218],
      [340, 228], [318, 238], [290, 244], [262, 244], [238, 238], [222, 240], [210, 232], [200, 234], [196, 222], [186, 214], [190, 200], [180, 188], [188, 174],
      [186, 160]];
    const muzzle = blob(rnd, [350, 208], 24, 16, -10, 0.05);
    const HAT_AT = [268, 106];
    const brim = [[130, 86], [150, 84], [188, 92], [230, 100], [272, 106], [314, 114], [352, 124], [386, 134], [408, 132], [404, 146], [380, 156], [340, 160],
      [296, 156], [252, 148], [210, 138], [172, 124], [146, 108], [130, 96]];
    const crown = rot([[212, 106], [208, 80], [212, 58], [222, 42], [244, 36], [262, 46], [282, 36], [304, 40], [318, 56], [324, 80], [326, 108], [300, 114],
      [268, 114], [236, 112]], 9, HAT_AT);
    const band = rot([[210, 94], [240, 100], [270, 102], [300, 102], [326, 98], [328, 112], [300, 118], [268, 118], [236, 116], [210, 108]], 9, HAT_AT);
    const quill = [[224, 104], [204, 86], [184, 66], [162, 46], [146, 36]];
    const feather = tube(quill, (t) => 4 + 26 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.8);
    const bootFar = boot([236, 398], 2, 0.86);
    const bootNear = boot([322, 386], -28, 0.86);
    const D = Object.fromEntries(Object.entries({ torso, bib, head, brim, crown, band }).map(([k, v]) => [k, spline(v)]));
    const loop = (P) => [...P, P[0], P[1]];

    // Each part is inked as soon as it is painted, so the parts in front of it cover its line as they cover its paint.
    s.paint((cv) => {
      // The tail goes first, curving up behind, its rings brushed across it and its tip darker.
      lay(cv, tailD, COAT);
      clip(cv, tailD, () => {
        brush(cv, tail.R.slice(2), 12, SHADE, 0.7, 'x');
        brush(cv, tail.L.slice(4, 18), 10, LIGHT, 0.6, 'x');
        for (const i of [4, 8, 12, 16]) {
          const [a, b] = [tail.L[i], tail.R[i]];
          brush(cv, [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b], 8, STRIPE, 0.8, 'y');
        }
        wash(cv, blob(rnd, tEnd, 16, 16, 0, 0.05), DEEP, 5, 0.9);
      });
      line(cv, tailL, 5.4, { start: 0.2, end: 0.4, count: 50 });
      line(cv, [tailL.at(-1), ...tailTip, ...[...tailR].reverse().slice(0, -3)], 5, { start: 0.4, end: 0.2, count: 50 });
      // The legs, the far one in shade, run down into the boots.
      for (const [leg, tone] of [[legFar, SHADE], [legNear, COAT]]) {
        lay(cv, leg.d, tone);
        clip(cv, leg.d, () => {
          brush(cv, leg.R, 14, DEEP, 0.4, 'y');
          brush(cv, [leg.L[4], leg.R[6]], 7, STRIPE, 0.8, 'x');
          brush(cv, [leg.L[12], leg.R[14]], 7, STRIPE, 0.8, 'x');
        });
        line(cv, leg.L, 5, { start: 0.2, end: 0.4 });
        line(cv, leg.R, 5, { start: 0.2, end: 0.4 });
      }
      // The body: lit down its back, shaded under the head, the arm and the belly, a cream chest in front.
      lay(cv, D.torso, COAT);
      clip(cv, D.torso, () => {
        brush(cv, [[212, 244], [202, 290], [206, 346]], 14, LIGHT, 0.6, 'y');
        brush(cv, [[318, 252], [328, 300], [318, 352]], 18, SHADE, 0.55, 'y');
        brush(cv, [[226, 240], [270, 252], [312, 246]], 14, SHADE, 0.5, 'x');
        brush(cv, [[216, 370], [262, 380], [306, 364]], 16, SHADE, 0.6, 'x');
        for (const [pts, w] of [
          [[[196, 270], [214, 274], [232, 282]], 8], [[[194, 300], [214, 304], [236, 312]], 9], [[[198, 330], [220, 334], [244, 342]], 8],
          [[[226, 252], [242, 258], [256, 270]], 6], [[[260, 300], [272, 312], [278, 328]], 6],
        ]) brush(cv, pts, w, STRIPE, 0.75, 'x');
      });
      lay(cv, D.bib, CREAM, 2.4);
      clip(cv, D.bib, () => brush(cv, [[296, 250], [300, 290], [316, 330]], 10, '#e6c39a', 0.6, 'y'));
      strokes(cv, rnd, D.torso, [190, 226, 334, 376], { count: 34, colours: [LIGHT, PALE], flow: () => -100, spread: 30, length: 10, width: 1.8,
        opacity: [0.25, 0.55] });
      line(cv, back, 5.6, { start: 0.3, end: 0.3, count: 40 });
      line(cv, [[208, 360], [246, 376], [284, 374]], 5, { start: 0.3, end: 0.2 });
      line(cv, front.slice(0, 5), 5.4, { start: 0.2, end: 0.4 });
      // The boots, lit down the heel side and dark at the front, a shine on each toe and a curl of stitching.
      for (const b of [bootFar, bootNear]) {
        const d = spline(b.leg);
        lay(cv, d, BOOT, 2.8);
        clip(cv, d, () => {
          brush(cv, b.T([[-16, 4], [-18, 40], [-16, 80]]), 14, BOOT_LIT, 0.7, 'y');
          brush(cv, b.T([[20, 4], [22, 44], [30, 62]]), 12, BOOT_DEEP, 0.6, 'y');
          brush(cv, b.T([[40, 66], [62, 70], [80, 78]]), 8, BOOT_LIT, 0.75, 'x');
          brush(cv, b.T([[-2, 18], [6, 30], [0, 42], [-6, 52], [2, 62]]), 3, CUFF_LIT, 0.7, 'y');
          cv.add(`<path d="${b.sole}" fill="${SOLE}" filter="${crayon(cv, rnd, { keep: 2.8, tear: 1.5 })}"/>`);
        });
        line(cv, loop(b.leg).slice(1), 5, { start: 0.3, end: 0.3, count: 50 });
        const c = spline(b.cuff);
        lay(cv, c, CUFF, 2.8);
        clip(cv, c, () => {
          brush(cv, b.T([[-32, -26], [0, -30], [34, -26]]), 9, CUFF_LIT, 0.8, 'x');
          brush(cv, b.T([[-28, 2], [0, 0], [30, 2]]), 8, BOOT, 0.5, 'x');
        });
        line(cv, loop(b.cuff), 4.6, { start: 0.3, end: 0.3, count: 40 });
      }
      // The near arm swings forward, its paw paler.
      lay(cv, armNear.d, COAT);
      clip(cv, armNear.d, () => {
        brush(cv, armNear.R.slice(6), 10, SHADE, 0.6, 'x');
        brush(cv, [armNear.L[5], armNear.R[6]], 7, STRIPE, 0.8, 'x');
        brush(cv, [armNear.L[10], armNear.R[10]], 7, STRIPE, 0.8, 'y');
      });
      line(cv, armNear.L, 5, { start: 0.2, end: 0.3 });
      line(cv, armNear.R, 5, { start: 0.2, end: 0.3 });
      lay(cv, blob(rnd, PAW, 15, 12, -20, 0.06), '#f0c890', 2.4);
      line(cv, rot([[-6, -12], [10, -10], [16, 0], [8, 11], [-8, 10]].map(([x, y]) => [PAW[0] + x, PAW[1] + y]), -20, PAW), 4.4, { start: 0.3, end: 0.3 });
      // The near ear pokes out under the back of the brim, which the hat tipped forward leaves room for.
      const ear = [[196, 172], [186, 150], [174, 126], [178, 116], [196, 126], [216, 140], [226, 150]];
      const inner = [[198, 160], [188, 140], [182, 126], [196, 134], [210, 146]];
      lay(cv, spline(ear), COAT);
      lay(cv, spline(inner), CREAM, 2.4);
      clip(cv, spline(inner), () => wash(cv, spline(inner.slice(1, 4)), '#e7a98a', 5, 0.7));
      line(cv, ear.slice(0, 6), 5, { start: 0.3, end: 0.3 });
      // The head, a tabby's stripes on its brow and cheeks, its cheek fur fluffed out behind.
      lay(cv, D.head, COAT);
      clip(cv, D.head, () => {
        brush(cv, [[220, 230], [270, 246], [320, 236]], 16, SHADE, 0.55, 'x');
        brush(cv, [[200, 160], [194, 196], [210, 228]], 14, LIGHT, 0.6, 'y');
        for (const [pts, w] of [
          [[[262, 142], [266, 158]], 7], [[[282, 140], [284, 158]], 7], [[[302, 144], [300, 160]], 7],
          [[[200, 190], [220, 194], [236, 202]], 7], [[[202, 212], [222, 214], [238, 220]], 6], [[[226, 160], [240, 166], [250, 176]], 6],
        ]) brush(cv, pts, w, STRIPE, 0.75, 'y');
        wash(cv, spline([[180, 124], [300, 140], [390, 160], [380, 176], [300, 164], [200, 156]]), DEEP, 8, 0.55);
      });
      lay(cv, muzzle, CREAM, 2.4);
      strokes(cv, rnd, D.head, [186, 140, 366, 246], { count: 26, colours: [LIGHT, PALE], flow: () => -110, spread: 30, length: 9, width: 1.8,
        opacity: [0.25, 0.55] });
      line(cv, seg(head, 4, 14), 5.6, { start: 0.3, end: 0.3, count: 50 });
      line(cv, seg(head, 14, 25), 5.4, { start: 0.3, end: 0.3, count: 50 });
      // The hat: the brim lit along its top and dark underneath, the feather tucked into the band behind the crown.
      lay(cv, D.brim, HAT, 2.8);
      clip(cv, D.brim, () => {
        brush(cv, [[136, 90], [200, 100], [270, 110], [340, 124], [400, 136]], 14, HAT_LIT, 0.7, 'x');
        brush(cv, [[150, 112], [220, 140], [300, 156], [384, 154]], 14, HAT_DEEP, 0.8, 'x');
      });
      line(cv, loop(brim), 5, { start: 0.4, end: 0.4, count: 70 });
      lay(cv, feather.d, RED, 2.6);
      clip(cv, feather.d, () => {
        brush(cv, feather.R, 10, RED_DEEP, 0.7, 'y');
        brush(cv, feather.L.slice(3), 8, RED_LIT, 0.7, 'y');
        for (let i = 4; i < 19; i += 3) brush(cv, [feather.L[i], along(quill, 20)[i + 1], feather.R[i + 2]], 2.4, RED_DEEP, 0.6, 'x');
      });
      line(cv, feather.L, 4, { start: 0.3, end: 0.2 });
      line(cv, feather.R, 4, { start: 0.3, end: 0.2 });
      line(cv, quill, 2.4, { start: 0.6, end: 0.2 });
      lay(cv, D.crown, HAT, 2.8);
      clip(cv, D.crown, () => {
        brush(cv, rot([[220, 100], [216, 70], [228, 46]], 9, HAT_AT), 18, HAT_LIT, 0.75, 'y');
        brush(cv, rot([[262, 50], [264, 76], [266, 104]], 9, HAT_AT), 12, HAT_DEEP, 0.5, 'y');
        brush(cv, rot([[314, 56], [318, 80], [318, 106]], 9, HAT_AT), 14, HAT_DEEP, 0.6, 'y');
      });
      lay(cv, D.band, BAND, 2.8);
      line(cv, seg(crown, 0, 10), 4.8, { start: 0.3, end: 0.3, count: 40 });
      // Calm eyes, a little lowered under the brim, a pink nose on the muzzle, whiskers out past the cheek.
      for (const [x, y, rx, ry] of [[268, 180, 11.5, 13], [326, 174, 8.5, 12]]) {
        const eye = spline([[x - rx, y - 2], [x - rx * 0.4, y - ry * 0.55], [x + rx * 0.4, y - ry * 0.55], [x + rx, y - 2], [x + rx * 0.7, y + ry * 0.6],
          [x, y + ry * 0.8], [x - rx * 0.7, y + ry * 0.6]]);
        cv.add(`<path d="${eye}" fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}"/>`);
        cv.add(`<circle cx="${x - rx * 0.3}" cy="${y - ry * 0.15}" r="${rx * 0.3}" fill="#fff4e4"/>`);
        cv.add(`<circle cx="${x + rx * 0.35}" cy="${y + ry * 0.35}" r="${rx * 0.12}" fill="#fff4e4" fill-opacity="0.8"/>`);
      }
      wash(cv, blob(rnd, [292, 210], 16, 9, 0, 0.05), '#e98a74', 6, 0.5);
      const nose = spline([[353, 188], [363, 186], [370, 190], [365, 196], [360, 199], [355, 195]]);
      cv.add(`<path d="${nose}" fill="#d9736f" filter="${crayon(cv, rnd, { keep: 3.4, tear: 1, grain: 1.2 })}"/>`);
      line(cv, [[360, 199], [359, 206]], 2.8, { start: 0.8, end: 0.6 });
      line(cv, [[349, 208], [354, 212], [359, 206]], 2.8, { start: 0.4, end: 0.8, peak: 0.6 });
      line(cv, [[359, 206], [364, 211], [370, 209]], 2.8, { start: 0.8, end: 0.4, peak: 0.4 });
      for (const whisker of [[[368, 204], [410, 194]], [[368, 210], [408, 214]]]) line(cv, whisker, 1.8, { start: 0.8, end: 0.1 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
