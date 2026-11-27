import { blob, painter, strokes, within } from '../brush.mjs';
import { spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'rovi',
  ku: 'Rovîyê Şûrdar',
  en: 'Fox knight',
  // a fox standing proud, turned three-quarters to the left with its chin up, both front paws resting on the pommel of a
  // sword planted point-down before it; a short red cloak over its shoulders pinned with a small gold clasp, a white
  // chest and cheeks, dark stockings, and a bushy white-tipped tail curling round behind; painted oranges with deeper
  // shade and pale flecks, under a soft dark pencil line
  still(rnd) {
    const s = new Still(rnd).place([-54, -4], 0.94);
    const [FUR, FUR_LIT, SHADE, DEEP, FLECK] = ['#dc6a2c', '#ef9452', '#b24c22', '#873618', '#f8c993'];
    const [WHITE, WHITE_SHADE] = ['#f8f0e4', '#d9c7b6'];
    const [DARK, DARK_LIT] = ['#4b2b22', '#76493a'];
    const [CLOAK, CLOAK_LIT, CLOAK_DEEP] = ['#b8302a', '#da564a', '#7f1c22'];
    const [GOLD, GOLD_LIT, GOLD_DEEP] = ['#d9a43e', '#f6dc8e', '#9a6724'];
    const [STEEL, STEEL_LIT, STEEL_DEEP] = ['#b5bfcb', '#eef2f6', '#7a8698'];
    const GRIP = '#5c3527';
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);

    // A limb or a tail as a smooth outline round its middle line, `ws` wide at each point; its two edges kept for the line.
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

    const tail = limb([[296, 404], [336, 434], [388, 448], [434, 432], [457, 398], [458, 356], [442, 322], [420, 304]], [36, 54, 64, 66, 60, 50, 30, 6]);
    const tip = spline([[396, 332], [414, 300], [440, 284], [476, 296], [488, 340], [470, 354], [458, 344], [448, 358], [436, 346], [424, 354], [414, 340]]);
    const cloakBack = spline([[204, 226], [250, 214], [296, 214], [324, 230], [344, 262], [362, 302], [376, 342], [386, 376], [366, 382], [346, 374],
      [326, 386], [304, 378], [286, 390], [262, 382], [236, 390], [212, 380], [190, 388], [172, 380], [168, 340], [174, 294], [186, 254]]);
    const thighFar = blob(rnd, [216, 390], 23, 36, 6, 0.03);
    const thighNear = blob(rnd, [284, 388], 27, 42, -6, 0.03);
    const legFar = limb([[216, 408], [208, 446], [200, 476]], [26, 19, 17]);
    const legNear = limb([[286, 412], [292, 448], [296, 476]], [28, 21, 19]);
    const footFar = blob(rnd, [190, 481], 20, 8.5, 0, 0.04);
    const footNear = blob(rnd, [288, 483], 23, 9.5, 0, 0.04);
    const torso = spline([[214, 206], [280, 206], [300, 236], [306, 280], [306, 330], [302, 364], [292, 386], [258, 394], [220, 392], [202, 374], [194, 340],
      [194, 290], [198, 244]]);
    const bib = spline([[212, 210], [262, 212], [272, 250], [270, 300], [264, 344], [250, 374], [228, 380], [212, 358], [204, 312], [202, 260]]);
    const cloakNear = spline([[246, 226], [270, 216], [298, 214], [320, 230], [332, 262], [342, 300], [352, 340], [360, 374], [340, 370], [320, 378],
      [302, 364], [292, 330], [284, 294], [272, 262], [258, 240]]);
    const cloakFar = spline([[238, 228], [220, 225], [204, 230], [192, 242], [186, 258], [198, 258], [212, 248], [226, 238]]);
    const armFar = limb([[206, 244], [194, 268], [190, 292], [202, 308], [218, 314]], [28, 25, 22, 19, 17]);
    const armNear = limb([[282, 254], [294, 278], [293, 298], [274, 310], [250, 314]], [30, 27, 24, 20, 18]);
    const earFar = spline([[200, 128], [192, 98], [186, 66], [190, 42], [204, 50], [222, 72], [240, 102]]);
    const earNear = spline([[254, 106], [262, 76], [278, 48], [294, 32], [301, 52], [304, 84], [302, 120]]);
    const head = spline([[206, 112], [232, 98], [262, 98], [288, 110], [304, 132], [310, 156], [322, 170], [309, 179], [318, 194], [299, 198], [288, 212],
      [262, 220], [234, 218], [208, 210], [184, 200], [162, 192], [146, 186], [142, 176], [152, 166], [172, 156], [190, 140], [198, 124]]);
    const cheeks = spline([[148, 184], [176, 180], [202, 186], [228, 190], [256, 186], [282, 176], [304, 166], [322, 170], [309, 179], [318, 194],
      [299, 198], [288, 212], [262, 220], [234, 218], [208, 210], [184, 200], [162, 193]]);

    s.paint((cv) => {
      // the tail behind it all, deeper along its inside and lit along its outer curve, its white tip in tufts
      lay(cv, tail.d, FUR);
      cv.add(`<g clip-path="${within(cv, tail.d)}">`);
      brush(cv, [[300, 396], [340, 420], [390, 428], [426, 414], [438, 384], [436, 350]], 26, SHADE, 0.7, 'x');
      brush(cv, [[330, 452], [388, 470], [440, 450], [472, 404], [478, 362]], 22, FUR_LIT, 0.8, 'x');
      strokes(cv, rnd, tail.d, [296, 300, 490, 482],
        { count: 40, colours: [FLECK], flow: (x) => (x < 420 ? 10 : -70), spread: 30, length: 12, width: 2.2, opacity: [0.35, 0.7], bend: 0.3 });
      strokes(cv, rnd, tail.d, [296, 300, 490, 482],
        { count: 24, colours: [DEEP], flow: (x) => (x < 420 ? 10 : -70), spread: 30, length: 11, width: 2, opacity: [0.25, 0.5], bend: 0.3 });
      lay(cv, tip, WHITE, 2.4);
      brush(cv, [[412, 334], [426, 316], [440, 310]], 14, WHITE_SHADE, 0.7, 'x');
      cv.add('</g>');
      line(cv, tail.L.slice(1), 5.6, { start: 0.3, end: 0.4, count: 48 });
      line(cv, [[420, 304], ...tail.R.slice(3).reverse().slice(1)], 5, { start: 0.3, end: 0.4 });
      line(cv, [[454, 346], [448, 358], [440, 348], [430, 354]], 2.8, { start: 0.5, end: 0.4, peak: 0.5 });
      // the back of the cloak hanging behind it, flaring a little, folds brushed down it
      lay(cv, cloakBack, CLOAK);
      cv.add(`<g clip-path="${within(cv, cloakBack)}">`);
      brush(cv, [[330, 240], [352, 300], [372, 370]], 22, CLOAK_DEEP, 0.7, 'y');
      brush(cv, [[178, 270], [174, 330], [178, 384]], 18, CLOAK_DEEP, 0.75, 'y');
      brush(cv, [[340, 230], [366, 300], [384, 370]], 10, CLOAK_LIT, 0.7, 'y');
      strokes(cv, rnd, cloakBack, [300, 230, 390, 390],
        { count: 14, colours: ['#ec8274'], flow: () => 70, spread: 20, length: 14, width: 2, opacity: [0.3, 0.6] });
      cv.add('</g>');
      line(cv, [[322, 228], [344, 262], [362, 302], [376, 342], [386, 376], [366, 382], [346, 374], [326, 386],
        [306, 380]], 5.4, { start: 0.3, end: 0.4, count: 40 });
      line(cv, [[188, 252], [176, 294], [170, 340], [172, 380], [190, 388], [204, 384]], 5.4, { start: 0.3, end: 0.4 });
      // the legs: the far thigh and its dark stocking, then the near
      for (const [thigh, leg, foot, lit] of [[thighFar, legFar, footFar, 0], [thighNear, legNear, footNear, 1]]) {
        lay(cv, leg.d, DARK);
        cv.add(`<g clip-path="${within(cv, leg.d)}">`);
        brush(cv, leg.L, 6, DARK_LIT, 0.8, 'y');
        cv.add('</g>');
        lay(cv, foot, DARK);
        lay(cv, thigh, lit ? FUR : SHADE);
        line(cv, leg.L, 4.8, { start: 0.4, end: 0.5 });
        line(cv, leg.R, 4.8, { start: 0.4, end: 0.5 });
      }
      line(cv, [[176, 480], [180, 488], [196, 489], [210, 484]], 4.6, { start: 0.4, end: 0.4 });
      line(cv, [[270, 482], [272, 491], [292, 492], [310, 486]], 4.8, { start: 0.4, end: 0.4 });
      // the body: orange, its white front, the shade down its near side and under the chin
      lay(cv, torso, FUR);
      cv.add(`<g clip-path="${within(cv, torso)}">`);
      brush(cv, [[296, 240], [304, 300], [298, 370]], 22, SHADE, 0.7, 'y');
      lay(cv, bib, WHITE, 2.4);
      brush(cv, [[262, 220], [268, 280], [258, 340], [246, 376]], 14, WHITE_SHADE, 0.6, 'y');
      wash(cv, spline([[206, 210], [270, 212], [262, 236], [212, 236]]), WHITE_SHADE, 8, 0.8);
      strokes(cv, rnd, torso, [194, 230, 306, 390], { count: 18, colours: [FLECK], flow: () => 95, spread: 30, length: 10, width: 2, opacity: [0.35, 0.65] });
      strokes(cv, rnd, bib, [200, 230, 272, 380],
        { count: 14, colours: [WHITE_SHADE], flow: () => 95, spread: 30, length: 9, width: 1.8, opacity: [0.3, 0.6] });
      cv.add('</g>');
      cv.add(`<g clip-path="${within(cv, thighNear)}">`);
      brush(cv, [[266, 356], [272, 390], [272, 424]], 14, FUR_LIT, 0.6, 'y');
      brush(cv, [[304, 362], [312, 396], [302, 428]], 16, SHADE, 0.7, 'y');
      strokes(cv, rnd, thighNear, [256, 346, 312, 430],
        { count: 10, colours: [FLECK], flow: () => 80, spread: 30, length: 10, width: 2, opacity: [0.35, 0.65] });
      cv.add('</g>');
      line(cv, [[198, 290], [196, 340], [200, 366], [194, 384], [194, 410], [204, 424]], 5.2, { start: 0.3, end: 0.4 });
      line(cv, [[256, 368], [272, 350], [292, 350], [308, 370], [312, 398], [304, 424], [296, 432]], 5.2, { start: 0.4, end: 0.4 });
      line(cv, [[228, 384], [234, 398], [236, 410]], 4, { start: 0.3, end: 0.6 });
      // the front legs coming out from under the cloak, the far one in shade
      for (const arm of [armFar, armNear]) {
        lay(cv, arm.d, arm === armFar ? SHADE : FUR);
        cv.add(`<g clip-path="${within(cv, arm.d)}">`);
        brush(cv, arm.R, 10, arm === armFar ? DEEP : SHADE, 0.6, 'y');
        brush(cv, arm.L, 7, FUR_LIT, 0.7, 'y');
        cv.add('</g>');
        line(cv, arm.L, 4.8, { start: 0.3, end: 0.5 });
        line(cv, arm.R, 4.8, { start: 0.3, end: 0.5 });
      }
      // the cloak over the near shoulder, and a sliver of it over the far one
      lay(cv, cloakNear, CLOAK);
      lay(cv, cloakFar, CLOAK);
      cv.add(`<g clip-path="${within(cv, cloakNear)}">`);
      brush(cv, [[262, 230], [282, 280], [300, 340], [312, 376]], 18, CLOAK_DEEP, 0.75, 'y');
      brush(cv, [[300, 222], [322, 280], [340, 340], [352, 376]], 16, CLOAK_LIT, 0.75, 'y');
      brush(cv, [[318, 260], [332, 320], [344, 372]], 6, CLOAK_DEEP, 0.7, 'y');
      strokes(cv, rnd, cloakNear, [260, 220, 360, 380],
        { count: 18, colours: ['#ec8274'], flow: () => 70, spread: 20, length: 14, width: 2, opacity: [0.3, 0.6] });
      cv.add('</g>');
      cv.add(`<g clip-path="${within(cv, cloakFar)}">`);
      brush(cv, [[226, 230], [204, 250], [190, 290]], 14, CLOAK_DEEP, 0.7, 'y');
      cv.add('</g>');
      line(cv, [[256, 238], [272, 262], [284, 294], [292, 330], [302, 364], [320, 378], [340, 370], [360, 374], [352, 340], [342, 300], [332, 262],
        [320, 230]], 5.2, { start: 0.3, end: 0.4, count: 48 });
      line(cv, [[232, 229], [214, 228], [198, 238], [188, 256], [198, 258], [212, 248], [226, 238]], 4.6, { start: 0.3, end: 0.4 });
      // the sword planted before it: the blade, the crossguard and the grip; the pommel under its paws
      const blade = spline([[221, 360], [243, 360], [242, 430], [239, 466], [232, 492], [225, 466], [222, 430]]);
      lay(cv, blade, STEEL);
      cv.add(`<g clip-path="${within(cv, blade)}">`);
      brush(cv, [[226, 364], [226, 430], [230, 482]], 6, STEEL_LIT, 0.95, 'y');
      brush(cv, [[240, 364], [239, 430], [234, 482]], 6, STEEL_DEEP, 0.8, 'y');
      cv.add('</g>');
      line(cv, [[221, 362], [222, 430], [225, 466], [232, 492], [239, 466], [242, 430], [243, 362]], 4.4, { start: 0.4, end: 0.4, count: 40 });
      line(cv, [[232, 368], [232, 430], [232, 456]], 2.4, { start: 0.5, end: 0.2 });
      lay(cv, spline([[226, 326], [238, 326], [239, 356], [225, 356]]), GRIP);
      for (const y of [331, 339, 347]) line(cv, [[226, y], [238, y + 4]], 2, { start: 0.6, end: 0.6 });
      line(cv, [[225, 328], [225, 356]], 3.4);
      line(cv, [[239, 328], [239, 356]], 3.4);
      const guard = spline([[196, 354], [204, 350], [232, 352], [260, 350], [268, 354], [266, 362], [260, 364], [232, 362], [204, 364], [198, 362]]);
      lay(cv, guard, GOLD);
      brush(cv, [[202, 354], [232, 355], [262, 354]], 3.5, GOLD_LIT, 0.9, 'x');
      line(cv, [[198, 350], [204, 349], [232, 351], [260, 349], [268, 353], [266, 363], [260, 365], [232, 363], [204, 365], [196, 362],
        [196, 354]], 4, { start: 0.4, end: 0.4, count: 36 });
      lay(cv, blob(rnd, [232, 321], 11, 9, 0, 0.03), GOLD);
      lay(cv, blob(rnd, [228, 324], 4, 3, 0, 0.05), GOLD_LIT, 3);
      line(cv, [[221, 320], [224, 329], [240, 329], [243, 320]], 3.6, { start: 0.4, end: 0.4 });
      // the paws cupped over the pommel, one over the other
      lay(cv, blob(rnd, [222, 314], 14, 10, -14, 0.04), DARK);
      line(cv, [[226, 304], [212, 306], [208, 316], [218, 323], [230, 320]], 4.4, { start: 0.4, end: 0.4 });
      const paw = blob(rnd, [242, 312], 16, 11, 10, 0.04);
      lay(cv, paw, DARK);
      brush(cv, [[232, 306], [246, 304], [256, 308]], 5, DARK_LIT, 0.8, 'x');
      line(cv, [[256, 304], [244, 301], [230, 304], [226, 314], [236, 322], [250, 321], [258, 314]], 4.6, { start: 0.4, end: 0.4 });
      line(cv, [[238, 314], [240, 320]], 2.2, { start: 0.6, end: 0.4 });
      line(cv, [[246, 314], [248, 320]], 2.2, { start: 0.6, end: 0.4 });
      // the ears behind the head, dark at their backs and tips, cream inside; the head tipped back a little, chin up
      cv.add('<g transform="rotate(5 250 190)">');
      for (const [ear, inner, tipAt] of [
        [earFar, spline([[204, 118], [196, 88], [194, 60], [204, 64], [220, 84], [230, 104]]), [190, 44]],
        [earNear, spline([[264, 104], [270, 80], [284, 56], [294, 46], [296, 70], [296, 108]]), [294, 34]],
      ]) {
        lay(cv, ear, FUR);
        cv.add(`<g clip-path="${within(cv, ear)}">`);
        lay(cv, blob(rnd, tipAt, 18, 22, 0, 0.05), DARK);
        cv.add('</g>');
        lay(cv, inner, WHITE, 2.4);
        cv.add(`<g clip-path="${within(cv, inner)}">`);
        brush(cv, [[tipAt[0] + 6, tipAt[1] + 30], [tipAt[0] + 6, tipAt[1] + 70]], 12, WHITE_SHADE, 0.7, 'y');
        cv.add('</g>');
      }
      line(cv, [[200, 126], [192, 98], [186, 66], [190, 42], [204, 50], [222, 72], [238, 100]], 5.2, { start: 0.3, end: 0.4 });
      line(cv, [[256, 104], [262, 76], [278, 48], [294, 32], [301, 52], [304, 84], [303, 116]], 5.2, { start: 0.3, end: 0.4 });
      // the head: orange, its crown and muzzle lit, shaded at the back; white cheeks in a ruff
      lay(cv, head, FUR);
      cv.add(`<g clip-path="${within(cv, head)}">`);
      brush(cv, [[160, 168], [190, 144], [220, 112], [262, 104]], 22, FUR_LIT, 0.8, 'x');
      brush(cv, [[290, 116], [306, 146], [300, 176]], 20, SHADE, 0.7, 'y');
      strokes(cv, rnd, head, [150, 100, 310, 190],
        { count: 30, colours: [FLECK], flow: () => -20, spread: 40, length: 10, width: 2, opacity: [0.35, 0.7], bend: 0.3 });
      lay(cv, cheeks, WHITE, 2.4);
      brush(cv, [[196, 206], [240, 216], [290, 206]], 12, WHITE_SHADE, 0.6, 'x');
      cv.add('</g>');
      line(cv, [[206, 112], [232, 98], [262, 98], [288, 110], [304, 132], [310, 156], [322, 170], [309, 179], [318, 194], [299, 198], [288, 212], [262, 220],
        [234, 218]], 5.4, { start: 0.3, end: 0.4, count: 48 });
      line(cv, [[226, 216], [208, 210], [184, 200], [162, 192], [146, 186], [142, 176], [152, 166], [172, 156], [190, 140], [198, 124],
        [206, 112]], 5.4, { start: 0.4, end: 0.3, count: 40 });
      // the face: almond eyes under a calm lid, the dark nose, a small proud smile
      cv.add(`<g fill="${INK}"><path d="${blob(rnd, [236, 146], 8, 6.5, -12, 0.03)}"/><path d="${blob(rnd, [190, 148], 5.5, 6, -12, 0.03)}"/>`
        + `<path d="${blob(rnd, [148, 178], 7.5, 6.5, 0, 0.03)}"/></g>`);
      cv.add('<g fill="#fffaf2"><circle cx="234" cy="144" r="2.2"/><circle cx="146" cy="176" r="1.8"/></g>');
      line(cv, [[226, 141], [237, 137.5], [247, 140]], 3, { start: 0.5, end: 0.6, peak: 0.5 });
      line(cv, [[154, 186], [166, 194], [180, 196]], 3, { start: 0.6, end: 0.3 });
      // a tuft in its cheek ruff; the gold clasp pinning the cloak at its throat
      line(cv, [[300, 178], [308, 184]], 2.6, { start: 0.6, end: 0.3 });
      cv.add('</g>');
      const clasp = blob(rnd, [244, 230], 10, 9.5, 0, 0.03);
      lay(cv, clasp, GOLD);
      lay(cv, blob(rnd, [241, 227], 4.5, 4, 0, 0.05), GOLD_LIT, 3);
      wash(cv, blob(rnd, [249, 234], 5, 4, 0, 0.05), GOLD_DEEP, 2, 0.8);
      line(cv, [[244, 220], [234, 224], [234, 236], [244, 240], [254, 236], [254, 224], [246, 220]], 3.6, { start: 0.4, end: 0.4 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
