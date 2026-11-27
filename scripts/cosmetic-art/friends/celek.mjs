import { blob, crayon, mark, painter, strokes, within } from '../brush.mjs';
import { spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'celek',
  ku: 'Çêlek',
  en: 'Cow',
  // A chubby black-and-white cow standing side-on to the right, her head turned to look at us. She has floppy ears,
  // small cream horns, a pink muzzle and a brass bell on a leather strap, with a tufted tail and short legs on dark hooves.
  still(rnd) {
    const s = new Still(rnd).place([4, -20], 0.95);
    const WHITE = '#f7f1e7';
    const SHADE = '#d4cabf';
    const DEEP = '#b3a69a';
    const PATCH = '#302728';
    const PATCH_LIT = '#5d5150';
    const PINK = '#eba3a0';
    const PINK_SHADE = '#d27a7b';
    const PINK_PALE = '#f7c6bd';
    const [HORN, HORN_SHADE] = ['#f0e3c4', '#cdb68a'];
    const [BRASS, BRASS_LIT, BRASS_DEEP] = ['#cf9b3b', '#f3d47e', '#8d5d22'];
    const [STRAP, STRAP_LIT] = ['#7b4a2c', '#a46a42'];
    const HOOF = '#3b2c29';
    const INK = '#2a1c16';
    const mirror = (pts) => pts.map(([x, y]) => [704 - x, y]);
    const { lay, wash, brush, line } = painter(rnd, INK);
    // Small parts whose whole edge shows are drawn round in one pencil stroke.
    const ringed = (cv, d, w, room) => {
      const filter = crayon(cv, rnd, { keep: 3.4, tear: 1.4, grain: 1.1, room });
      cv.add(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" filter="${filter}"/>`);
    };

    const body = spline([
      [78, 228], [122, 204], [182, 194], [242, 192], [302, 197], [352, 212], [390, 242], [406, 286], [402, 330], [386, 366], [352, 392], [292, 404],
      [222, 406], [152, 400], [102, 384], [70, 350], [56, 300], [60, 260],
    ]);
    const head = spline([[306, 128], [352, 116], [398, 128], [420, 160], [424, 200], [416, 236], [408, 262], [296, 262], [288, 236], [280, 200], [284, 160]]);
    const muzzle = blob(rnd, [352, 284], 63, 40, 0, 0.02);
    const earL = [[290, 154], [262, 154], [236, 164], [218, 181], [221, 195], [242, 200], [268, 196], [290, 186]];
    const hornL = [[312, 130], [306, 112], [302, 96], [312, 100], [322, 114], [332, 126]];
    // A leg starts inside the body so the body hides its top; `edge` is only the part below the body, for the line.
    const leg = (x, top, foot, w, fill) => {
      const h = w / 2;
      const left = [[x - h, top], [x - h + 2, (top + foot) / 2], [x - h * 0.92, foot - 16], [x - h * 0.98, foot - 6], [x - h * 0.86, foot]];
      const right = left.map(([px, py]) => [2 * x - px, py]);
      const sole = [[x - 3, foot + 0.5], [x, foot - 4], [x + 3, foot + 0.5]];
      const edge = [...left.slice(1), ...sole, ...right.slice(1).reverse()];
      return { d: spline([...left, ...sole, ...[...right].reverse()]), edge, x, foot, fill };
    };
    const hoof = (cv, l, lift) => {
      const filter = crayon(cv, rnd, { keep: 2.8, tear: 1.5 });
      cv.add(`<path d="M0 ${l.foot - lift} L512 ${l.foot - lift + 1} L512 520 L0 520 Z" fill="${HOOF}" filter="${filter}"/>`);
    };
    const far = [leg(166, 372, 458, 38, SHADE), leg(306, 368, 456, 38, SHADE)];
    const near = [leg(122, 376, 468, 44, WHITE), leg(352, 360, 470, 44, WHITE)];
    const tail = [[70, 238], [50, 234], [34, 250], [30, 280], [38, 310]];
    const patches = [
      spline([[128, 176], [196, 168], [252, 182], [266, 220], [250, 256], [212, 272], [174, 262], [146, 238], [118, 212]]),
      spline([[30, 256], [70, 246], [98, 266], [108, 306], [96, 346], [62, 362], [26, 344]]),
      spline([[222, 314], [246, 300], [270, 308], [294, 300], [308, 322], [298, 350], [274, 362], [252, 354], [230, 362], [216, 340]]),
    ];
    const BELL = [[352, 348], [365, 352], [371, 366], [375, 382], [386, 392], [352, 399], [318, 392], [329, 382], [333, 366], [339, 352]];
    const headPatch = spline([[270, 104], [342, 104], [352, 128], [342, 150], [320, 162], [298, 174], [274, 172]]);

    s.paint((cv) => {
      // The far legs stand in the body's shadow, so they are laid in a shade darker than the near ones.
      for (const l of far) {
        lay(cv, l.d, l.fill);
        wash(cv, l.d, DEEP, 8, 0.4);
        cv.add(`<g clip-path="${within(cv, l.d)}">`);
        hoof(cv, l, 15);
        cv.add('</g>');
      }
      // The pencil goes under the tail a little wider than its paint, so the thin tail gets an outline without seams.
      line(cv, tail, 13, { start: 0.9, end: 0.7, peak: 0.3 });
      lay(cv, mark(rnd, tail, 8, { start: 0.9, end: 0.7, peak: 0.3, tremble: 0.1 }), WHITE, 2.8);
      const tuft = spline([[35, 302], [43, 304], [50, 320], [54, 342], [46, 354], [34, 355], [26, 342], [28, 320]]);
      lay(cv, tuft, PATCH, 2.9);
      cv.add(`<g clip-path="${within(cv, tuft)}">`);
      brush(cv, [[34, 306], [32, 330], [30, 352]], 7, PATCH_LIT, 0.8, 'y');
      cv.add('</g>');

      // Shade is brushed over the white under the belly and where her head shades the shoulder, so she reads as round.
      lay(cv, body, WHITE);
      cv.add(`<g clip-path="${within(cv, body)}">`);
      for (const d of patches) lay(cv, d, PATCH, 2.9);
      brush(cv, [[60, 372], [150, 404], [260, 412], [360, 392]], 34, SHADE, 0.85, 'x');
      brush(cv, [[90, 360], [180, 384], [290, 388], [370, 366]], 18, SHADE, 0.5, 'x');
      wash(cv, spline([[260, 230], [330, 214], [392, 250], [398, 320], [360, 372], [300, 360], [272, 300]]), SHADE, 14, 0.55);
      brush(cv, [[80, 330], [170, 352], [270, 356], [350, 336]], 22, SHADE, 0.35, 'x');
      brush(cv, [[110, 300], [200, 296], [300, 286]], 14, SHADE, 0.2, 'x');
      wash(cv, blob(rnd, [362, 300], 40, 70, 0, 0.04), DEEP, 16, 0.35);
      // The patches are painted too, lighter on top and darker underneath, rather than left flat black.
      brush(cv, [[136, 196], [190, 184], [246, 196]], 16, PATCH_LIT, 0.8, 'x');
      brush(cv, [[44, 270], [74, 262], [96, 282]], 12, PATCH_LIT, 0.7, 'x');
      brush(cv, [[240, 316], [266, 308], [288, 318]], 10, PATCH_LIT, 0.7, 'x');
      brush(cv, [[160, 256], [210, 266], [250, 248]], 14, '#1c1516', 0.7, 'x');
      const flecks = { spread: 20, length: 12, width: 2, bend: 0.2 };
      strokes(cv, rnd, body, [80, 196, 320, 250], { ...flecks, count: 22, colours: ['#ffffff'], flow: () => -4, length: 16, width: 2.6, opacity: [0.5, 0.9] });
      strokes(cv, rnd, patches.join(' '), [30, 170, 300, 366], { ...flecks, count: 34, colours: ['#7a6c69'], flow: () => -10, opacity: [0.25, 0.5] });
      strokes(cv, rnd, body, [60, 300, 400, 404], { ...flecks, count: 26, colours: [DEEP], flow: () => 4, opacity: [0.2, 0.4] });
      cv.add('</g>');

      for (const l of near) {
        lay(cv, l.d, l.fill);
        cv.add(`<g clip-path="${within(cv, l.d)}">`);
        brush(cv, [[l.x + 16, l.foot - 100], [l.x + 14, l.foot - 50], [l.x + 16, l.foot - 14]], 16, SHADE, 0.8, 'y');
        hoof(cv, l, 16);
        brush(cv, [[l.x - 14, l.foot - 12], [l.x - 4, l.foot - 13], [l.x + 6, l.foot - 12]], 5, '#6a5550', 0.9, 'x');
        cv.add('</g>');
      }
      lay(cv, blob(rnd, [124, 392], 24, 14, 10, 0.05), PATCH, 2.9);

      // The strap and bell sit under her chin, where they stay clear of the face at small sizes.
      const strap = [[292, 306], [318, 336], [352, 348], [388, 336], [414, 306]];
      line(cv, strap, 14, { start: 0.9, end: 0.9, peak: 0.5, tremble: 0.05 });
      lay(cv, mark(rnd, strap, 9, { start: 0.9, end: 0.9, peak: 0.5, tremble: 0.05 }), STRAP, 2.8);
      brush(cv, [[298, 312], [320, 334], [350, 343]], 3.5, STRAP_LIT, 0.9, 'x');
      const bell = spline(BELL);
      lay(cv, bell, BRASS, 2.9);
      cv.add(`<g clip-path="${within(cv, bell)}">`);
      brush(cv, [[340, 356], [336, 374], [328, 392]], 12, BRASS_LIT, 0.9, 'y');
      brush(cv, [[366, 356], [370, 376], [380, 394]], 12, BRASS_DEEP, 0.75, 'y');
      brush(cv, [[318, 392], [352, 396], [386, 392]], 6, BRASS_DEEP, 0.6, 'x');
      cv.add('</g>');

      // One ear is black and one white, so the face is not a mirror image and reads as hers.
      for (const side of [-1, 1]) {
        const X = (pts) => (side < 0 ? pts : mirror(pts));
        const horn = spline(X(hornL));
        lay(cv, horn, HORN, 2.9);
        cv.add(`<g clip-path="${within(cv, horn)}">`);
        brush(cv, X([[326, 126], [316, 112], [308, 100]]), 7, HORN_SHADE, 0.8, 'y');
        cv.add('</g>');
        ringed(cv, horn, 4.2, [200, 60, 300, 120]);
        const ear = spline(X(earL));
        lay(cv, ear, side < 0 ? PATCH : WHITE, 2.9);
        if (side < 0) brush(cv, [[284, 162], [258, 166], [234, 180]], 10, PATCH_LIT, 0.8, 'x');
        else {
          lay(cv, blob(rnd, X([[256, 182]])[0], 26, 9, 172, 0.04), PINK, 2.6);
          brush(cv, X([[286, 192], [262, 194], [236, 192]]), 8, SHADE, 0.7, 'x');
        }
      }

      lay(cv, head, WHITE);
      cv.add(`<g clip-path="${within(cv, head)}">`);
      lay(cv, headPatch, PATCH, 2.9);
      brush(cv, [[292, 128], [320, 118], [346, 122]], 12, PATCH_LIT, 0.75, 'x');
      brush(cv, [[412, 150], [416, 200], [408, 250]], 22, SHADE, 0.85, 'y');
      brush(cv, [[404, 136], [398, 180], [404, 232]], 10, SHADE, 0.4, 'y');
      wash(cv, blob(rnd, [352, 238], 54, 14, 0, 0.04), SHADE, 8, 0.6);
      brush(cv, [[300, 250], [352, 258], [404, 250]], 16, SHADE, 0.7, 'x');
      strokes(cv, rnd, head, [340, 120, 410, 240], { ...flecks, count: 14, colours: ['#ffffff'], flow: () => -90, length: 14, opacity: [0.5, 0.9] });
      cv.add('</g>');
      lay(cv, muzzle, PINK, 2.9);
      cv.add(`<g clip-path="${within(cv, muzzle)}">`);
      brush(cv, [[300, 262], [352, 252], [404, 262]], 16, PINK_PALE, 0.85, 'x');
      brush(cv, [[300, 308], [352, 322], [404, 308]], 16, PINK_SHADE, 0.8, 'x');
      strokes(cv, rnd, muzzle, [290, 244, 416, 324], { ...flecks, count: 18, colours: [PINK_PALE, PINK_SHADE], flow: () => 0, opacity: [0.3, 0.6] });
      cv.add('</g>');
    });

    s.paint((cv) => {
      // The pencil line goes on last and is left open in places, as a hand-drawn line is.
      line(cv, [[226, 193], [182, 195], [122, 205], [78, 229], [60, 260], [56, 300], [70, 350], [100, 382]], 6, { start: 0.3, end: 0.4, count: 40 });
      line(cv, [[404, 296], [402, 330], [386, 364], [374, 376]], 5.6, { start: 0.4, end: 0.3 });
      line(cv, [[144, 400], [190, 405], [240, 406], [292, 403], [330, 396]], 5.4, { start: 0.3, end: 0.3, peak: 0.5 });
      for (const l of [...far, ...near]) {
        line(cv, l.edge, l.fill === SHADE ? 4.6 : 5.4, { start: 0.4, end: 0.4, peak: 0.5, count: 60 });
        line(cv, [[l.x, l.foot - 4], [l.x + 0.4, l.foot - 12]], 2.2, { start: 0.9, end: 0.2 });
      }
      for (const [pts, w] of [
        [[[36, 312], [30, 334], [26, 352], [24, 362]], 6],
        [[[40, 318], [40, 342], [42, 366]], 7],
        [[[42, 312], [50, 334], [54, 350], [58, 360]], 6],
        [[[46, 340], [50, 354], [52, 362]], 4],
        [[[32, 340], [32, 356], [34, 364]], 4],
      ]) line(cv, pts, w, { start: 0.9, end: 0.15, peak: 0.25 });
      line(cv, [...BELL, BELL[0]], 4.2, { start: 0.6, end: 0.6, peak: 0.5, count: 48 });
      const dots = (list) => {
        const filter = crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 });
        cv.add(`<g fill="${INK}" filter="${filter}">${list.map((d) => `<path d="${d}"/>`).join('')}</g>`);
      };
      dots([blob(rnd, [352, 402], 6, 5, 0, 0.03)]);
      for (const side of [-1, 1]) {
        const X = (pts) => (side < 0 ? pts : mirror(pts));
        line(cv, X([[290, 152], [262, 152], [236, 162], [218, 181], [221, 196], [242, 201], [268, 197], [290, 187]]), 5.4, { start: 0.5, end: 0.4 });
      }
      const crown = [[290, 238], [281, 200], [285, 158], [306, 128], [352, 116], [398, 128], [419, 158], [423, 200], [414, 240]];
      line(cv, crown, 6, { start: 0.35, end: 0.35, count: 48 });
      const chin = [[318, 246], [294, 264], [290, 290], [306, 314], [352, 325], [398, 314], [414, 290], [408, 262], [386, 246]];
      line(cv, chin, 5.8, { start: 0.3, end: 0.3, count: 48 });
      dots([blob(rnd, [324, 198], 9.5, 12, 4, 0.03), blob(rnd, [380, 198], 9.5, 12, -4, 0.03)]);
      dots([blob(rnd, [330, 282], 6, 9, 20, 0.04), blob(rnd, [374, 282], 6, 9, -20, 0.04)]);
      // A speck of light in each eye keeps them alive against the white face.
      cv.add('<g fill="#fbf6ee"><circle cx="321" cy="193" r="3"/><circle cx="377" cy="193" r="3"/></g>');
      line(cv, [[338, 306], [352, 311], [366, 306]], 3.2, { start: 0.4, end: 0.4, peak: 0.5 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
