import { blob, crayon, painter, strokes, within } from '../brush.mjs';
import { along, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'pisik-cizme',
  ku: 'Pisîka Bi Çizme',
  en: 'Cat in boots',
  // a ginger tabby standing up on its hind legs, three-quarters on to us, its paws on its hips: a brown wide-brimmed hat
  // pushed back behind its ears, a red neckerchief round its neck and tall brown boots with turned-down tops; painted
  // in warm oranges with soft stripes brushed on, a cream muzzle and chest and green eyes, and inked over in a soft
  // dark pencil line that swells, thins and breaks
  still(rnd) {
    const s = new Still(rnd).place([-2, -6], 0.96);
    const [COAT, SHADE, DEEP, STRIPE, LIGHT, CREAM, PALE] = ['#d8843e', '#b9652d', '#9a4b24', '#a5502a', '#efad66', '#f2d9b4', '#f9ebd3'];
    const [HAT, HAT_LIT, HAT_DEEP, BAND] = ['#7b4d2e', '#a06a42', '#55311d', '#3d2417'];
    const [BOOT, BOOT_LIT, BOOT_DEEP, CUFF, CUFF_LIT, SOLE] = ['#74432a', '#a06840', '#4a2918', '#b88250', '#d6a670', '#3b2418'];
    const [RED, RED_DEEP, RED_LIT] = ['#c43a2c', '#8f2420', '#e2654c'];
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
    const oval = ([cx, cy], rx, ry, deg = 0, count = 24) =>
      rot(Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2).map((t) => [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]), deg, [cx, cy]);
    // A stretch of a closed outline from point `i` to point `j`, running on past its start where it must, to ink.
    const seg = (P, i, j) => Array.from({ length: ((j - i + P.length) % P.length) + 1 }, (_, k) => P[(i + k) % P.length]);
    // A limb or a tail along `pts`, `w0` wide where it starts and `w1` where it ends: its outline and its two sides.
    const tube = (pts, w0, w1) => {
      const c = along(pts, 20);
      const [L, R] = [[], []];
      c.forEach((p, i) => {
        const [a, b] = [c[Math.max(0, i - 1)], c[Math.min(c.length - 1, i + 1)]];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const w = (w0 + ((w1 - w0) * i) / (c.length - 1)) / 2;
        L.push([p[0] - ((b[1] - a[1]) / l) * w, p[1] + ((b[0] - a[0]) / l) * w]);
        R.push([p[0] + ((b[1] - a[1]) / l) * w, p[1] - ((b[0] - a[0]) / l) * w]);
      });
      return { d: spline([...L, ...[...R].reverse()]), L, R };
    };

    // The hat sits behind the ears, pushed back and tilted, so the whole face shows under it.
    const HAT_AT = [246, 104];
    const brim = oval(HAT_AT, 134, 30, -10, 32);
    const crown = rot([[198, 108], [196, 80], [199, 56], [212, 40], [232, 34], [248, 44], [264, 34], [286, 37], [299, 52], [303, 80], [302, 108], [276, 114],
      [248, 116], [222, 114]], -10, HAT_AT);
    const earFar = [[166, 146], [160, 112], [163, 84], [170, 70], [186, 80], [206, 96], [222, 112]];
    const earNear = [[262, 108], [284, 88], [304, 72], [316, 64], [322, 80], [322, 104], [316, 124]];
    const head = [[172, 120], [202, 104], [240, 98], [280, 102], [314, 118], [332, 146], [338, 178], [336, 204], [346, 222], [330, 228], [322, 244], [298, 258],
      [262, 266], [226, 266], [196, 258], [176, 244], [164, 234], [146, 226], [158, 212], [154, 188], [156, 156]];
    const torso = [[184, 262], [226, 270], [272, 268], [306, 260], [322, 282], [332, 316], [336, 350], [332, 380], [312, 396], [280, 402], [240, 402], [204, 398],
      [182, 384], [172, 354], [170, 320], [174, 290]];
    const band = [[180, 246], [214, 258], [256, 262], [296, 256], [318, 246], [322, 262], [306, 280], [270, 290], [232, 292], [200, 286], [180, 270]];
    const bib = [[192, 278], [228, 286], [262, 282], [244, 302], [226, 328], [212, 302]];
    const armFar = tube([[192, 282], [160, 296], [138, 316], [142, 336], [164, 346], [184, 352]], 36, 28);
    const armNear = tube([[304, 280], [336, 292], [360, 314], [356, 336], [336, 346], [318, 352]], 38, 30);
    const paws = [[186, 352], [316, 352]];
    const tail = tube([[326, 374], [368, 384], [404, 370], [426, 338], [428, 304], [418, 282], [404, 272]], 28, 14);
    const TIP = [404, 272];
    const bootFar = [[186, 396], [226, 396], [228, 430], [230, 462], [234, 472], [232, 484], [196, 486], [164, 486], [150, 482], [152, 472], [166, 466], [184, 460],
      [186, 430]];
    const bootNear = [[264, 394], [308, 394], [310, 430], [312, 462], [316, 474], [314, 490], [276, 492], [240, 492], [226, 486], [230, 476], [246, 470], [264, 464],
      [264, 430]];
    const cuffFar = [[172, 380], [206, 376], [240, 380], [236, 394], [232, 408], [208, 404], [186, 408], [180, 394]];
    const cuffNear = [[252, 378], [288, 374], [322, 378], [318, 392], [314, 406], [288, 402], [262, 406], [256, 392]];
    const D = Object.fromEntries(Object.entries({ brim, crown, head, torso, band, bib }).map(([k, v]) => [k, spline(v)]));
    const loop = (P) => [...P, P[0], P[1]];

    // Each part is inked as soon as it is painted, so the parts in front of it cover its line as they cover its paint.
    s.paint((cv) => {
      // The tail goes first, behind everything, its rings brushed across it.
      lay(cv, tail.d, COAT);
      lay(cv, blob(rnd, TIP, 7, 7, 0, 0.05), DEEP);
      clip(cv, tail.d, () => {
        for (const [x, y, deg] of [[352, 382, 90], [380, 382, 70], [404, 368, 40], [422, 342, 10]]) {
          const [c, si] = [Math.cos((deg * Math.PI) / 180) * 18, Math.sin((deg * Math.PI) / 180) * 18];
          brush(cv, [[x - c, y - si], [x, y], [x + c, y + si]], 8, STRIPE, 0.8, 'x');
        }
        brush(cv, [[336, 388], [378, 394], [416, 374]], 12, SHADE, 0.6, 'x');
        brush(cv, [[428, 304], [418, 282], [402, 272]], 16, DEEP, 0.9, 'y');
      });
      line(cv, tail.L, 5, { start: 0.2, end: 0.3 });
      line(cv, tail.R, 5, { start: 0.2, end: 0.3 });
      line(cv, oval(TIP, 7, 7, -40, 12).slice(2, 9), 4.4, { start: 0.3, end: 0.3 });
      // The light comes from the upper left, as on the deer: the brim is lit along its top and dark at its edge, and the
      // crown is pinched in the middle with a dark band round it.
      lay(cv, D.brim, HAT, 2.8);
      clip(cv, D.brim, () => {
        brush(cv, rot([[120, 104], [180, 88], [246, 84], [312, 88], [372, 102]], -10, HAT_AT), 22, HAT_LIT, 0.7, 'x');
        brush(cv, rot([[116, 112], [180, 128], [246, 134], [312, 128], [376, 110]], -10, HAT_AT), 16, HAT_DEEP, 0.8, 'x');
      });
      line(cv, loop(brim), 5, { start: 0.4, end: 0.4, count: 60 });
      lay(cv, D.crown, HAT, 2.8);
      clip(cv, D.crown, () => {
        brush(cv, rot([[206, 100], [204, 70], [214, 46]], -10, HAT_AT), 20, HAT_LIT, 0.75, 'y');
        brush(cv, rot([[248, 46], [250, 70], [252, 100]], -10, HAT_AT), 16, HAT_DEEP, 0.55, 'y');
        brush(cv, rot([[294, 54], [298, 80], [298, 104]], -10, HAT_AT), 16, HAT_DEEP, 0.6, 'y');
        brush(cv, rot([[192, 100], [248, 106], [306, 98]], -10, HAT_AT), 16, BAND, 0.95, 'x', 2.8);
      });
      line(cv, seg(crown, 0, 10), 4.6, { start: 0.3, end: 0.3, count: 40 });
      // The ears stand in front of the hat, which is what shows it is pushed back.
      const inners = [[[172, 130], [170, 100], [174, 86], [190, 98], [206, 112]], [[280, 108], [298, 90], [314, 80], [320, 100], [324, 128]]];
      for (const [ear, inner] of [[earFar, inners[0]], [earNear, inners[1]]]) {
        lay(cv, spline(ear), COAT);
        lay(cv, spline(inner), CREAM, 2.4);
        clip(cv, spline(inner), () => wash(cv, spline(inner.slice(-3)), '#e7a98a', 6, 0.6));
        line(cv, ear, 5, { start: 0.3, end: 0.3 });
      }
      // The body is shaded on the side away from the light and under the head, with stripes only on its flanks so the
      // cream chest stays clear.
      lay(cv, D.torso, COAT);
      clip(cv, D.torso, () => {
        brush(cv, [[330, 290], [336, 336], [326, 390]], 30, SHADE, 0.7, 'y');
        brush(cv, [[190, 276], [250, 290], [314, 278]], 24, SHADE, 0.6, 'x');
        brush(cv, [[196, 396], [260, 402], [320, 392]], 16, SHADE, 0.5, 'x');
        brush(cv, [[178, 296], [176, 330], [184, 366]], 12, LIGHT, 0.55, 'y');
        for (const [pts, w] of [
          [[[342, 300], [318, 306], [302, 316]], 9], [[[342, 330], [318, 336], [300, 344]], 9], [[[338, 362], [314, 366], [298, 374]], 8],
          [[[166, 330], [184, 334], [194, 342]], 8], [[[168, 360], [186, 364], [196, 372]], 8],
        ]) brush(cv, pts, w, STRIPE, 0.75, 'x');
      });
      lay(cv, blob(rnd, [236, 340], 38, 54, -6, 0.05), CREAM, 2.4);
      strokes(cv, rnd, D.torso, [170, 270, 340, 400], { count: 40, colours: [LIGHT], flow: () => -80, spread: 30, length: 11, width: 2, opacity: [0.3, 0.6] });
      line(cv, seg(torso, 3, 12), 5.6, { start: 0.3, end: 0.3, count: 40 });
      line(cv, seg(torso, 12, 15), 5.2, { start: 0.3, end: 0.2 });
      // The neckerchief's point goes on before its band, so the band's fold lies over it.
      lay(cv, D.bib, RED, 2.8);
      clip(cv, D.bib, () => {
        brush(cv, [[244, 290], [236, 308], [228, 324]], 14, RED_DEEP, 0.6, 'y');
        brush(cv, [[204, 286], [214, 300], [222, 318]], 8, RED_LIT, 0.55, 'y');
      });
      line(cv, seg(bib, 2, 5), 4.4, { start: 0.3, end: 0.3 });
      lay(cv, D.band, RED, 2.8);
      clip(cv, D.band, () => {
        brush(cv, [[182, 258], [240, 270], [318, 256]], 14, RED_DEEP, 0.7, 'x');
        brush(cv, [[192, 282], [240, 290], [300, 280]], 8, RED_LIT, 0.6, 'x');
      });
      line(cv, seg(band, 3, 10), 4.6, { start: 0.3, end: 0.3, count: 36 });
      // The head comes after the neckerchief so the chin sits over its band; a tabby's stripes go on the brow and cheeks.
      lay(cv, D.head, COAT);
      clip(cv, D.head, () => {
        brush(cv, [[322, 140], [336, 190], [318, 240], [288, 262]], 26, SHADE, 0.6, 'y');
        brush(cv, [[190, 252], [236, 266], [290, 258]], 16, SHADE, 0.5, 'x');
        for (const [pts, w] of [
          [[[214, 106], [218, 124], [220, 144]], 9], [[[236, 100], [236, 124], [234, 150]], 10], [[[258, 104], [254, 124], [248, 144]], 9],
          [[[152, 194], [168, 196], [180, 202]], 7], [[[152, 214], [168, 214], [180, 218]], 7],
          [[[340, 186], [318, 190], [298, 198]], 8], [[[344, 210], [322, 212], [304, 218]], 8],
          [[[176, 168], [168, 162], [160, 156]], 5], [[[290, 166], [304, 160], [318, 156]], 6],
        ]) brush(cv, pts, w, STRIPE, 0.75, 'y');
        brush(cv, [[178, 116], [212, 104], [250, 102], [300, 112]], 16, LIGHT, 0.5, 'x');
        brush(cv, [[166, 140], [158, 176], [166, 206]], 12, LIGHT, 0.5, 'y');
      });
      lay(cv, blob(rnd, [228, 228], 30, 22, 0, 0.04), CREAM, 2.4);
      lay(cv, blob(rnd, [228, 252], 22, 12, 0, 0.04), CREAM, 2.4);
      strokes(cv, rnd, D.head, [150, 100, 340, 260], { count: 34, colours: [LIGHT, PALE], flow: () => -100, spread: 30, length: 10, width: 1.8,
        opacity: [0.25, 0.55] });
      line(cv, seg(head, 0, 9), 5.6, { start: 0.4, end: 0.3, count: 40 });
      line(cv, seg(head, 9, 14), 5.6, { start: 0.3, end: 0.2 });
      line(cv, seg(head, 15, 1), 5.4, { start: 0.2, end: 0.4, count: 36 });
      // The arms go over the body, bent out at the elbows with the paws on the hips, so the pose reads at a glance.
      for (const [arm, paw, rings] of [[armFar, paws[0], [[154, 298], [138, 320]]], [armNear, paws[1], [[344, 296], [360, 318]]]]) {
        lay(cv, arm.d, COAT);
        clip(cv, arm.d, () => {
          brush(cv, arm.R.slice(4), 12, SHADE, 0.6, 'x');
          for (const [x, y] of rings) brush(cv, [[x - 12, y - 10], [x, y], [x + 12, y + 10]], 7, STRIPE, 0.7, 'y');
        });
        line(cv, arm.L, 5.4, { start: 0.3, end: 0.3 });
        line(cv, arm.R.slice(5), 4.6, { start: 0.2, end: 0.4 });
        lay(cv, blob(rnd, paw, 16, 13, 0, 0.06), '#f0c08a', 2.4);
        line(cv, oval(paw, 16, 13, 0, 16).slice(1, 12), 4.2, { start: 0.3, end: 0.3 });
      }
      // The boots go on last of the body, lit down their fronts and dark at the heel, with a shine on each toe.
      for (const [boot, cuff, x, sole] of [[bootFar, cuffFar, 200, 478], [bootNear, cuffNear, 280, 484]]) {
        lay(cv, spline(boot), BOOT, 2.8);
        clip(cv, spline(boot), () => {
          brush(cv, [[x - 6, 404], [x - 8, 440], [x - 14, 472]], 12, BOOT_LIT, 0.7, 'y');
          brush(cv, [[x + 28, 400], [x + 30, 440], [x + 32, 480]], 14, BOOT_DEEP, 0.7, 'y');
          cv.add(`<path d="M100 ${sole} L360 ${sole} L360 520 L100 520 Z" fill="${SOLE}" filter="${crayon(cv, rnd, { keep: 2.8, tear: 1.5 })}"/>`);
        });
        line(cv, seg(boot, 1, 9), 5, { start: 0.3, end: 0.3, count: 40 });
        line(cv, seg(boot, 9, 12), 4.6, { start: 0.3, end: 0.3 });
        clip(cv, spline(boot), () => brush(cv, [[x - 40, 476], [x - 26, 470], [x - 12, 470]], 7, CUFF_LIT, 0.8, 'x'));
        lay(cv, spline(cuff), CUFF, 2.8);
        clip(cv, spline(cuff), () => {
          brush(cv, [[x - 30, 382], [x + 4, 380], [x + 40, 384]], 9, CUFF_LIT, 0.8, 'x');
          brush(cv, [[x - 24, 406], [x + 4, 402], [x + 36, 406]], 8, BOOT, 0.6, 'x');
        });
        line(cv, loop(cuff), 4.4, { start: 0.3, end: 0.3, count: 40 });
      }
      // Green eyes need a dark rim round them to hold their colour against the orange coat.
      for (const [c, rx, ry] of [[[196, 184], 11, 13.5], [[260, 182], 13.5, 15]]) {
        cv.add(`<path d="${blob(rnd, c, rx + 3, ry + 3, 0, 0.03)}" fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}"/>`);
        cv.add(`<path d="${blob(rnd, c, rx, ry, 0, 0.03)}" fill="#7aa848"/>`);
        cv.add(`<path d="${blob(rnd, [c[0], c[1] + ry * 0.35], rx * 0.9, ry * 0.55, 0, 0.03)}" fill="#a8c860" fill-opacity="0.6"/>`);
        cv.add(`<path d="${blob(rnd, c, rx * 0.42, ry * 0.78, 0, 0.03)}" fill="${INK}"/>`);
        cv.add(`<circle cx="${c[0] - rx * 0.35}" cy="${c[1] - ry * 0.4}" r="${rx * 0.26}" fill="#fffaf0"/>`);
      }
      const nose = spline([[216, 208], [228, 207], [238, 209], [232, 217], [227, 221], [221, 217]]);
      cv.add(`<path d="${nose}" fill="#d9736f" filter="${crayon(cv, rnd, { keep: 3.4, tear: 1, grain: 1.2 })}"/>`);
      line(cv, [[216, 208], [228, 206], [238, 209]], 2.6, { start: 0.5, end: 0.5 });
      line(cv, [[227, 221], [227, 229]], 3, { start: 0.8, end: 0.6 });
      line(cv, [[214, 232], [220, 236], [227, 229]], 3, { start: 0.4, end: 0.8, peak: 0.6 });
      line(cv, [[227, 229], [234, 236], [240, 232]], 3, { start: 0.8, end: 0.4, peak: 0.4 });
      for (const whisker of [[[198, 224], [158, 220]], [[198, 232], [162, 238]], [[258, 222], [306, 214]], [[258, 230], [302, 234]]]) {
        line(cv, whisker, 1.8, { start: 0.8, end: 0.1 });
      }
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
