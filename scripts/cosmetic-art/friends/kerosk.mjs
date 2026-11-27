import { blob, painter, strokes, within } from '../brush.mjs';
import { n, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'kerosk',
  ku: 'Kêroşka Bihêz',
  en: 'Strong rabbit',
  // a small white rabbit turned three-quarters to the right, pressing a little red-plated barbell up over its head in
  // both paws, its ears standing up behind the bar; a hard little frown and a pink cheek, a puff of a tail, its feet set
  // apart; the white fur painted over with lilac-grey shade and warm cream light, under a soft dark pencil line
  still(rnd) {
    const s = new Still(rnd).place([2, -3], 0.96);
    const FUR = '#f3edee';
    const CREAM = '#fff6e6';
    const SHADE = '#c2b4cc';
    const DEEP = '#9c8fac';
    const PINK = '#f0a39e';
    const ROSE = '#e58784';
    const [PLATE, PLATE_LIT, PLATE_DEEP] = ['#c64f3e', '#e8846c', '#8c332c'];
    const [STEEL, STEEL_LIT, STEEL_DEEP] = ['#8e97a7', '#dde2ea', '#5f6879'];
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);

    // A limb as a smooth outline round its middle line, `ws` wide at each point; its two edges kept for the line.
    const limb = (pts, ws) => {
      const L = [];
      const R = [];
      pts.forEach((p, i) => {
        const [a, b] = [pts[Math.max(0, i - 1)], pts[Math.min(pts.length - 1, i + 1)]];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const [nx, ny] = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
        L.push([p[0] + (nx * ws[i]) / 2, p[1] + (ny * ws[i]) / 2]);
        R.push([p[0] - (nx * ws[i]) / 2, p[1] - (ny * ws[i]) / 2]);
      });
      return { d: spline([...L, ...[...R].reverse()]), L, R };
    };
    // The bar runs a little uphill into the distance, the far plates smaller than the near ones.
    const barY = (x) => 125 - ((x - 64) * 14) / 384;
    const band = (x0, x1, h0, h1) =>
      `M${n(x0)} ${n(barY(x0) - h0)} L${n(x1)} ${n(barY(x1) - h1)} L${n(x1)} ${n(barY(x1) + h1)} L${n(x0)} ${n(barY(x0) + h0)} Z`;
    // A plate seen at an angle: its face, and its thickness showing to the right of it.
    const plate = (cv, cx, rx, ry, depth) => {
      const cy = barY(cx);
      lay(cv, blob(rnd, [cx + depth, cy], rx, ry, 0, 0.012), PLATE_DEEP);
      lay(cv, `M${n(cx)} ${n(cy - ry)} L${n(cx + depth)} ${n(cy - ry)} L${n(cx + depth)} ${n(cy + ry)} L${n(cx)} ${n(cy + ry)} Z`, PLATE_DEEP);
      const face = blob(rnd, [cx, cy], rx, ry, 0, 0.012);
      lay(cv, face, PLATE);
      cv.add(`<g clip-path="${within(cv, face)}">`);
      brush(cv, [[cx - rx * 0.5, cy - ry * 0.8], [cx - rx * 0.7, cy - ry * 0.2], [cx - rx * 0.5, cy + ry * 0.4]], rx * 0.7, PLATE_LIT, 0.8, 'y');
      brush(cv, [[cx + rx * 0.6, cy - ry * 0.3], [cx + rx * 0.5, cy + ry * 0.5], [cx, cy + ry * 0.95]], rx * 0.8, PLATE_DEEP, 0.55, 'y');
      cv.add('</g>');
      line(cv, [[cx + depth, cy - ry], [cx + depth + rx * 0.85, cy - ry * 0.55], [cx + depth + rx, cy], [cx + depth + rx * 0.85, cy + ry * 0.55],
        [cx + depth, cy + ry], [cx, cy + ry]], 4.6, { start: 0.4, end: 0.5 });
      const ring = [];
      for (let i = 0; i <= 22; i++) {
        const a = -Math.PI / 2 - (i / 22) * Math.PI * 2;
        ring.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
      }
      line(cv, ring.slice(0, 20), 4.8, { start: 0.5, end: 0.3, count: 44 });
    };

    const earL = spline([[218, 182], [210, 150], [204, 110], [202, 72], [206, 46], [216, 34], [228, 40], [238, 70], [246, 110], [250, 150], [248, 182]]);
    const earLin = spline([[221, 160], [215, 124], [212, 86], [215, 58], [222, 50], [230, 76], [236, 116], [239, 156]]);
    const earR = spline([[256, 178], [258, 140], [264, 100], [272, 64], [284, 38], [296, 30], [304, 40], [304, 70], [298, 108], [290, 146], [284, 180]]);
    const earRin = spline([[267, 158], [271, 118], [279, 82], [288, 54], [296, 46], [297, 72], [292, 106], [284, 142], [278, 162]]);
    const armFar = limb([[312, 302], [342, 266], [360, 222], [361, 178], [351, 140]], [40, 34, 30, 28, 27]);
    const armNear = limb([[214, 306], [186, 272], [166, 228], [160, 184], [166, 146]], [46, 40, 35, 32, 31]);
    const head = spline([[258, 158], [292, 161], [322, 172], [344, 192], [356, 216], [362, 242], [357, 266], [341, 288], [314, 304], [280, 312], [244, 311],
      [212, 302], [188, 285], [174, 262], [170, 234], [175, 206], [190, 183], [212, 167], [234, 160]]);
    const body = spline([[210, 290], [306, 292], [332, 314], [346, 350], [350, 394], [340, 430], [316, 454], [278, 464], [236, 462], [204, 450], [182, 426],
      [174, 390], [178, 350], [192, 314]]);
    const tail = blob(rnd, [176, 414], 22, 20, 0, 0.08);
    const footFar = blob(rnd, [308, 466], 34, 12.5, -4, 0.04);
    const footNear = blob(rnd, [232, 470], 37, 14, 3, 0.04);

    s.paint((cv) => {
      // the ears behind everything, pink inside, the far edge of each in lilac
      for (const [ear, inner, x] of [[earL, earLin, 226], [earR, earRin, 284]]) {
        lay(cv, ear, FUR);
        cv.add(`<g clip-path="${within(cv, ear)}">`);
        brush(cv, [[x + 14, 50], [x + 18, 110], [x + 16, 180]], 16, SHADE, 0.7, 'y');
        brush(cv, [[x - 18, 60], [x - 20, 120], [x - 16, 170]], 10, CREAM, 0.9, 'y');
        cv.add('</g>');
        lay(cv, inner, PINK, 2.4);
        cv.add(`<g clip-path="${within(cv, inner)}">`);
        brush(cv, [[x + 4, 70], [x + 6, 120], [x + 8, 160]], 10, ROSE, 0.6, 'y');
        cv.add('</g>');
      }
      line(cv, [[212, 178], [206, 140], [202, 98], [203, 62], [210, 40], [219, 34], [228, 41], [238, 72], [245, 112],
        [249, 150]], 5.4, { start: 0.3, end: 0.4, count: 44 });
      line(cv, [[258, 170], [259, 136], [266, 96], [275, 60], [288, 36], [298, 30], [305, 42], [304, 74], [297, 112],
        [289, 150]], 5.4, { start: 0.3, end: 0.4, count: 44 });
      // the bar and its plates: the near ones over the bar, then the bar's near end; the far ones, then the bar running
      // into them and its collar
      lay(cv, band(66, 444, 5, 4.4), STEEL);
      brush(cv, [[70, barY(70) - 2], [250, barY(250) - 2], [440, barY(440) - 2]], 4, STEEL_LIT, 0.9, 'x');
      line(cv, [[150, barY(150) - 5], [330, barY(330) - 4.6]], 3.2, { start: 0.6, end: 0.6 });
      line(cv, [[150, barY(150) + 5.5], [330, barY(330) + 5]], 3.6, { start: 0.6, end: 0.6 });
      lay(cv, band(130, 142, 9, 9), STEEL_DEEP);
      line(cv, [[132, barY(132) - 9], [142, barY(142) - 9], [142, barY(142) + 9]], 3.2, { start: 0.5, end: 0.5 });
      plate(cv, 106, 17.5, 47, 10);
      plate(cv, 85, 13, 34, 8);
      lay(cv, band(66, 86, 5.2, 5.2), STEEL);
      line(cv, [[86, barY(86) - 5], [68, barY(68) - 5], [65, barY(68)], [68, barY(68) + 5], [86, barY(86) + 5]], 3.4, { start: 0.5, end: 0.5 });
      plate(cv, 424, 10.5, 28, 7);
      plate(cv, 399, 15, 41, 9);
      lay(cv, band(360, 402, 4.5, 4.4), STEEL);
      lay(cv, band(372, 382, 8, 8), STEEL_DEEP);
      line(cv, [[372, barY(372) - 8], [382, barY(382) - 8], [382, barY(382) + 8], [372, barY(372) + 8]], 3.2, { start: 0.5, end: 0.5 });
      // the far arm, in the head's shade, and its paw closed over the bar
      lay(cv, armFar.d, FUR);
      cv.add(`<g clip-path="${within(cv, armFar.d)}">`);
      brush(cv, [[346, 140], [356, 200], [344, 260], [316, 300]], 34, SHADE, 0.75, 'y');
      strokes(cv, rnd, armFar.d, [320, 130, 380, 300], { count: 12, colours: [DEEP], flow: () => 100, spread: 20, length: 9, width: 1.6, opacity: [0.2, 0.4] });
      cv.add('</g>');
      line(cv, armFar.R.slice(1), 5.2, { start: 0.5, end: 0.3 });
      line(cv, armFar.L.slice(2), 5, { start: 0.3, end: 0.4 });
      const pawFar = blob(rnd, [349, 120], 17, 15, 10, 0.05);
      lay(cv, pawFar, FUR);
      wash(cv, blob(rnd, [356, 125], 10, 8, 0, 0.05), SHADE, 4, 0.8);
      line(cv, [[336, 129], [333, 117], [340, 107], [354, 105], [364, 113], [365, 125], [358, 134]], 5, { start: 0.4, end: 0.4 });
      line(cv, [[342, 113], [346, 121]], 2.6, { start: 0.6, end: 0.4 });
      line(cv, [[351, 111], [355, 120]], 2.6, { start: 0.6, end: 0.4 });
      // the tail behind, a puff of cream; the far foot; then the body over them
      lay(cv, tail, FUR);
      wash(cv, blob(rnd, [170, 408], 12, 10, 0, 0.1), CREAM, 4, 0.9);
      wash(cv, blob(rnd, [184, 426], 12, 8, 0, 0.1), SHADE, 5, 0.7);
      strokes(cv, rnd, tail, [152, 392, 200, 438], { count: 14, colours: [DEEP], flow: () => 60, spread: 80, length: 7, width: 1.6, opacity: [0.2, 0.45] });
      line(cv, [[180, 396], [168, 394], [158, 401], [154, 412], [159, 425], [170, 433]], 4.2, { start: 0.3, end: 0.3, tremble: 0.3 });
      lay(cv, footFar, FUR);
      wash(cv, footFar, SHADE, 5, 0.7);
      line(cv, [[292, 472], [308, 478], [330, 476], [341, 468], [337, 458]], 4.8, { start: 0.4, end: 0.4 });
      lay(cv, body, FUR);
      cv.add(`<g clip-path="${within(cv, body)}">`);
      // the shadow the head throws on the chest, the far side and under the belly in lilac; the belly turned to the light
      wash(cv, spline([[196, 296], [250, 312], [306, 310], [344, 300], [340, 336], [300, 344], [250, 340], [200, 326]]), SHADE, 9, 0.8);
      brush(cv, [[334, 330], [346, 376], [336, 424], [312, 454]], 30, SHADE, 0.65, 'y');
      brush(cv, [[350, 350], [352, 400], [338, 440]], 14, DEEP, 0.35, 'y');
      brush(cv, [[196, 444], [250, 466], [316, 456]], 20, SHADE, 0.55, 'x');
      wash(cv, blob(rnd, [278, 390], 34, 46, -8, 0.05), '#fffaf0', 10, 0.95);
      brush(cv, [[188, 352], [184, 392], [192, 422]], 16, CREAM, 0.9, 'y');
      // the near haunch, round, with its shade under it
      brush(cv, [[212, 448], [244, 456], [268, 446]], 18, DEEP, 0.4, 'x');
      strokes(cv, rnd, body, [176, 320, 348, 462],
        { count: 30, colours: [DEEP], flow: () => 80, spread: 40, length: 9, width: 1.8, opacity: [0.15, 0.35], bend: 0.2 });
      strokes(cv, rnd, body, [176, 340, 320, 440],
        { count: 22, colours: ['#ffffff'], flow: () => 80, spread: 30, length: 10, width: 2.2, opacity: [0.5, 0.8], bend: 0.2 });
      cv.add('</g>');
      line(cv, [[184, 332], [176, 362], [174, 394], [182, 426], [202, 448], [226, 460]], 5.6, { start: 0.3, end: 0.4 });
      line(cv, [[334, 318], [346, 350], [350, 392], [341, 428], [318, 452], [294, 462]], 5.6, { start: 0.3, end: 0.4 });
      line(cv, [[204, 404], [222, 400], [240, 408], [252, 426], [254, 448]], 4.4, { start: 0.2, end: 0.6, peak: 0.6 });
      lay(cv, footNear, FUR);
      cv.add(`<g clip-path="${within(cv, footNear)}">`);
      brush(cv, [[200, 478], [234, 484], [266, 478]], 12, SHADE, 0.7, 'x');
      cv.add('</g>');
      line(cv, [[206, 464], [195, 470], [202, 480], [230, 486], [256, 482], [268, 472], [260, 463]], 5.2, { start: 0.4, end: 0.4 });
      line(cv, [[256, 474], [261, 480]], 2.6);
      line(cv, [[246, 476], [250, 483]], 2.6);
      // the head: cream where the light falls on its crown and near cheek, lilac down its far side, under its chin and
      // in the shadow of the near arm
      lay(cv, head, FUR);
      cv.add(`<g clip-path="${within(cv, head)}">`);
      brush(cv, [[350, 196], [364, 240], [348, 284], [312, 308]], 30, SHADE, 0.6, 'y');
      brush(cv, [[204, 302], [256, 314], [314, 304]], 22, SHADE, 0.5, 'x');
      brush(cv, [[192, 190], [180, 236], [192, 280]], 18, SHADE, 0.45, 'y');
      brush(cv, [[200, 206], [230, 178], [282, 168], [324, 180]], 34, CREAM, 0.9, 'x');
      brush(cv, [[206, 244], [214, 272], [232, 292]], 16, CREAM, 0.7, 'y');
      strokes(cv, rnd, head, [172, 164, 362, 310],
        { count: 30, colours: [DEEP], flow: () => 20, spread: 50, length: 8, width: 1.6, opacity: [0.12, 0.3], bend: 0.2 });
      strokes(cv, rnd, head, [190, 166, 330, 250],
        { count: 18, colours: ['#ffffff'], flow: () => -20, spread: 40, length: 10, width: 2.2, opacity: [0.5, 0.85], bend: 0.2 });
      cv.add('</g>');
      wash(cv, blob(rnd, [258, 264], 22, 15, -8, 0.05), PINK, 6, 0.95);
      wash(cv, blob(rnd, [352, 262], 6, 9, 0, 0.05), PINK, 4, 0.7);
      line(cv, [[228, 162], [206, 172], [188, 190], [176, 214], [171, 242], [178, 268], [196, 290], [226, 307], [262, 313],
        [300, 308]], 5.8, { start: 0.3, end: 0.3, count: 44 });
      line(cv, [[294, 162], [322, 174], [344, 194], [356, 218], [362, 242], [357, 266], [341, 288], [318, 302]], 5.6, { start: 0.3, end: 0.4 });
      // a hard little frown: the brows drawn down, the eyes dark with a catch of light, the nose and the mouth set
      line(cv, [[254, 203], [268, 205], [286, 213]], 4.6, { start: 0.5, end: 0.7, peak: 0.6 });
      line(cv, [[326, 211], [335, 205], [344, 201]], 4, { start: 0.7, end: 0.4, peak: 0.3 });
      cv.add(`<g fill="${INK}"><path d="${blob(rnd, [274, 229], 9.5, 11.5, 0, 0.03)}"/><path d="${blob(rnd, [336, 227], 6.5, 10.5, 0, 0.03)}"/></g>`);
      cv.add('<g fill="#fffaf2"><circle cx="271" cy="225" r="3"/><circle cx="334.5" cy="223" r="2.3"/></g>');
      lay(cv, spline([[319, 246], [334, 244], [330, 253], [325, 256]]), ROSE, 3);
      line(cv, [[318, 245], [334, 243], [327, 255], [318, 245]], 2.6, { start: 0.6, end: 0.6 });
      line(cv, [[326, 256], [326, 263]], 2.8);
      line(cv, [[316, 268], [321, 264], [326, 263], [332, 265], [336, 269]], 3, { start: 0.5, end: 0.5 });
      // the near arm, up past its cheek, and its paw closed over the bar
      lay(cv, armNear.d, FUR);
      cv.add(`<g clip-path="${within(cv, armNear.d)}">`);
      brush(cv, [[154, 150], [150, 210], [166, 270], [196, 312]], 18, CREAM, 0.95, 'y');
      brush(cv, [[180, 146], [178, 206], [194, 260], [222, 300]], 18, SHADE, 0.75, 'y');
      strokes(cv, rnd, armNear.d, [140, 130, 240, 320],
        { count: 14, colours: [DEEP], flow: () => 75, spread: 20, length: 9, width: 1.6, opacity: [0.15, 0.35] });
      cv.add('</g>');
      line(cv, armNear.L.slice(0, 4), 5.8, { start: 0.3, end: 0.4 });
      line(cv, armNear.R.slice(1, 4), 5.4, { start: 0.4, end: 0.4 });
      const pawNear = blob(rnd, [167, 125], 19.5, 17, -10, 0.05);
      lay(cv, pawNear, FUR);
      wash(cv, blob(rnd, [174, 132], 11, 8, 0, 0.05), SHADE, 4, 0.7);
      line(cv, [[154, 136], [149, 122], [156, 110], [171, 107], [183, 113], [186, 126], [179, 138]], 5.4, { start: 0.4, end: 0.4 });
      line(cv, [[160, 114], [163, 123]], 2.8, { start: 0.6, end: 0.4 });
      line(cv, [[170, 112], [173, 121]], 2.8, { start: 0.6, end: 0.4 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
