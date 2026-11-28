import { blob, crayon, mark, painter, strokes, within } from '../brush.mjs';
import { spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'celek',
  ku: 'Çêlek',
  en: 'Cow',
  // A round little cow: her body a cream ball with big soft black-brown patches, her small head low at the front right
  // with stubby horns, ears out at the sides and a pink muzzle, a brass bell on a blue strap, stubby legs and a tufted tail.
  still(rnd) {
    const s = new Still(rnd).place([7, 4], 1);
    const WHITE = '#f8f1e4';
    const LIGHT = '#fffaf1';
    const SHADE = '#ddcbb4';
    const DEEP = '#c4ab92';
    const [PATCH, PATCH_LIT, PATCH_DEEP] = ['#3b2b28', '#6a544c', '#271c1a'];
    const [PINK, PINK_SHADE, PINK_PALE] = ['#eea8a1', '#d6827d', '#f8cec4'];
    const [HORN, HORN_LIT, HORN_SHADE] = ['#eab66c', '#f6d79e', '#c98a48'];
    const [STRAP, STRAP_LIT] = ['#6d90ae', '#9db9d0'];
    const [BRASS, BRASS_LIT, BRASS_DEEP] = ['#d4a141', '#f3d47e', '#8d5d22'];
    const HOOF = '#4a3430';
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);
    // Small parts whose whole edge shows are drawn round in one pencil stroke.
    const ringed = (cv, d, w, room) => {
      const filter = crayon(cv, rnd, { keep: 3.4, tear: 1.4, grain: 1.1, room });
      cv.add(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" filter="${filter}"/>`);
    };
    const flecks = { spread: 20, length: 12, width: 2, bend: 0.2 };

    const BALL = [
      [250, 36], [330, 46], [398, 84], [444, 146], [462, 222], [452, 300], [416, 366], [356, 412], [276, 432], [196, 428], [122, 400], [66, 346],
      [40, 274], [42, 196], [74, 124], [132, 66], [190, 42],
    ];
    const ball = spline(BALL);
    const patches = [
      spline([[56, 150], [104, 84], [170, 46], [244, 36], [300, 54], [314, 96], [284, 140], [222, 162], [160, 184], [98, 198], [50, 196]]),
      blob(rnd, [372, 118], 30, 40, 24, 0.06),
      spline([[430, 176], [470, 150], [490, 250], [474, 340], [440, 352], [418, 300], [412, 236]]),
      spline([[20, 262], [62, 254], [100, 280], [110, 330], [88, 374], [40, 380], [16, 330]]),
    ];
    // A leg starts high inside the ball, which hides its top; `edge` is its outline, inked before the ball covers it.
    const leg = (x, foot, w, fill) => {
      const h = w / 2;
      const left = [[x - h, foot - 90], [x - h + 1, foot - 40], [x - h * 0.96, foot - 14], [x - h * 0.9, foot - 4], [x - h * 0.74, foot]];
      const right = left.map(([px, py]) => [2 * x - px, py]);
      const sole = [[x - 3, foot + 0.5], [x, foot - 3], [x + 3, foot + 0.5]];
      return { d: spline([...left, ...sole, ...[...right].reverse()]), edge: [...left.slice(1), ...sole, ...right.slice(1).reverse()], x, foot, fill };
    };
    const legs = [leg(212, 458, 36, SHADE), leg(304, 458, 36, SHADE), leg(150, 466, 40, WHITE), leg(352, 470, 40, WHITE)];
    const tail = [[70, 340], [54, 352], [46, 374], [48, 398]];
    const tuft = spline([[46, 394], [54, 396], [60, 410], [60, 426], [52, 434], [42, 432], [36, 420], [38, 404]]);
    const HEAD = [
      [300, 262], [346, 254], [390, 250], [408, 272], [412, 320], [408, 370], [396, 402], [350, 414], [302, 410], [282, 384], [276, 330], [280, 280],
    ];
    const head = spline(HEAD);
    const muzzle = blob(rnd, [346, 384], 58, 32, -4, 0.03);
    const ears = [
      spline([[284, 292], [262, 290], [238, 296], [226, 308], [234, 318], [256, 316], [282, 308]]),
      spline([[406, 284], [428, 278], [450, 280], [460, 290], [452, 300], [430, 302], [408, 300]]),
    ];
    const horns = [
      spline([[300, 268], [292, 250], [288, 232], [296, 224], [308, 234], [318, 256]]),
      spline([[376, 254], [382, 234], [390, 220], [400, 222], [404, 238], [396, 256]]),
    ];
    const strap = [[304, 266], [272, 280], [258, 316], [262, 356], [278, 390], [292, 404]];
    const BELL = [[284, 400], [292, 403], [296, 412], [299, 422], [306, 429], [284, 434], [262, 429], [269, 422], [272, 412], [276, 403]];

    s.paint((cv) => {
      // The legs and tail go first, inked as they are painted, so the ball's edge falls over their tops.
      for (const l of legs) {
        lay(cv, l.d, l.fill);
        cv.add(`<g clip-path="${within(cv, l.d)}">`);
        if (l.fill === WHITE) brush(cv, [[l.x + 14, l.foot - 60], [l.x + 13, l.foot - 34], [l.x + 14, l.foot - 12]], 14, SHADE, 0.8, 'y');
        else wash(cv, l.d, DEEP, 6, 0.35);
        const sole = `M${l.x - 30} ${l.foot - 15} L${l.x + 30} ${l.foot - 14} L${l.x + 30} ${l.foot + 10} L${l.x - 30} ${l.foot + 10} Z`;
        cv.add(`<path d="${sole}" fill="${HOOF}" filter="${crayon(cv, rnd, { keep: 2.8, tear: 1.5 })}"/>`);
        cv.add('</g>');
        line(cv, l.edge, l.fill === WHITE ? 5.2 : 4.6, { start: 0.4, end: 0.4, peak: 0.5, count: 60 });
        line(cv, [[l.x, l.foot - 3], [l.x + 0.4, l.foot - 10]], 2.2, { start: 0.9, end: 0.2 });
      }
      line(cv, tail, 12, { start: 0.9, end: 0.7, peak: 0.3 });
      lay(cv, mark(rnd, tail, 7, { start: 0.9, end: 0.7, peak: 0.3, tremble: 0.1 }), WHITE, 2.8);
      lay(cv, tuft, PATCH, 2.9);
      cv.add(`<g clip-path="${within(cv, tuft)}">`);
      brush(cv, [[44, 400], [42, 416], [40, 430]], 6, PATCH_LIT, 0.8, 'y');
      cv.add('</g>');

      // Light falls from the upper left: the ball's lower right turns into a warm shade, and each patch is lit on top.
      lay(cv, ball, WHITE);
      cv.add(`<g clip-path="${within(cv, ball)}">`);
      brush(cv, [[60, 380], [160, 432], [300, 440], [420, 380], [466, 270], [460, 160]], 44, SHADE, 0.85, 'x');
      brush(cv, [[90, 410], [200, 440], [330, 438], [440, 360], [470, 240]], 18, DEEP, 0.5, 'x');
      for (const d of patches) lay(cv, d, PATCH, 2.9);
      for (const [pts, w] of [[[[76, 150], [112, 110], [160, 84]], 10], [[[176, 70], [216, 60], [256, 62]], 9], [[[362, 98], [372, 92], [382, 96]], 7]]) {
        brush(cv, pts, w, PATCH_LIT, 0.55, 'x');
      }
      brush(cv, [[442, 184], [454, 176], [464, 190]], 8, PATCH_LIT, 0.5, 'x');
      brush(cv, [[42, 282], [64, 272], [86, 284]], 9, PATCH_LIT, 0.5, 'x');
      brush(cv, [[110, 190], [190, 170], [270, 140]], 16, PATCH_DEEP, 0.7, 'x');
      brush(cv, [[440, 240], [440, 300], [430, 340]], 20, PATCH_DEEP, 0.7, 'y');
      strokes(cv, rnd, ball, [90, 190, 300, 330], { ...flecks, count: 24, colours: [LIGHT], flow: () => -30, length: 16, width: 2.6, opacity: [0.5, 0.9] });
      // Strokes of warm shade run round the ball, as a brush follows a round form.
      const round = (x, y) => (Math.atan2(y - 236, x - 250) * 180) / Math.PI + 90;
      strokes(cv, rnd, ball, [70, 270, 440, 420], { ...flecks, count: 34, colours: [SHADE, DEEP], flow: round, length: 20, width: 2.6, opacity: [0.3, 0.6] });
      strokes(cv, rnd, patches.join(' '), [40, 40, 470, 380], { ...flecks, count: 30, colours: ['#7e6a61'], flow: () => -20, opacity: [0.25, 0.5] });
      cv.add('</g>');
      // The ball's line breaks open where the tail grows and on its lit top left; the head will cover its lower right.
      line(cv, [BALL[16], ...BALL.slice(0, 8)], 6, { start: 0.2, end: 0.4, peak: 0.4, count: 60 });
      line(cv, BALL.slice(7, 12), 6, { start: 0.4, end: 0.2, count: 40 });
      line(cv, BALL.slice(12, 16), 5.6, { start: 0.2, end: 0.1, peak: 0.5, count: 40 });

      // The blue strap rounds the back of her head, its bell peeping out under her cheek.
      line(cv, strap, 15, { start: 0.9, end: 0.9, peak: 0.5, tremble: 0.05 });
      lay(cv, mark(rnd, strap, 10, { start: 0.9, end: 0.9, peak: 0.5, tremble: 0.05 }), STRAP, 2.8);
      brush(cv, [[296, 270], [270, 290], [262, 330]], 3.5, STRAP_LIT, 0.9, 'y');
      const bell = spline(BELL);
      lay(cv, bell, BRASS, 2.9);
      cv.add(`<g clip-path="${within(cv, bell)}">`);
      brush(cv, [[276, 404], [272, 418], [266, 430]], 8, BRASS_LIT, 0.9, 'y');
      brush(cv, [[292, 404], [296, 418], [304, 430]], 8, BRASS_DEEP, 0.75, 'y');
      cv.add('</g>');
      ringed(cv, bell, 3.8, [240, 380, 90, 80]);

      // Ears and horns sit behind the head, so its paint covers their roots.
      for (const [i, ear] of ears.entries()) {
        lay(cv, ear, WHITE, 2.9);
        cv.add(`<g clip-path="${within(cv, ear)}">`);
        lay(cv, blob(rnd, i ? [436, 291] : [252, 306], 18, 6, i ? 4 : -10, 0.04), PINK, 2.6);
        brush(cv, i ? [[410, 298], [434, 302], [456, 296]] : [[282, 308], [256, 316], [230, 314]], 6, SHADE, 0.7, 'x');
        cv.add('</g>');
        ringed(cv, ear, 4.6, [200, 250, 290, 90]);
      }
      for (const [i, horn] of horns.entries()) {
        lay(cv, horn, HORN, 2.9);
        cv.add(`<g clip-path="${within(cv, horn)}">`);
        brush(cv, i ? [[384, 250], [388, 234], [394, 222]] : [[296, 254], [292, 238], [294, 226]], 6, HORN_LIT, 0.85, 'y');
        brush(cv, i ? [[400, 254], [402, 238], [400, 226]] : [[314, 254], [310, 240], [304, 230]], 6, HORN_SHADE, 0.75, 'y');
        cv.add('</g>');
        ringed(cv, horn, 4.2, [270, 200, 150, 80]);
      }

      lay(cv, head, WHITE);
      cv.add(`<g clip-path="${within(cv, head)}">`);
      brush(cv, [[404, 270], [412, 320], [404, 380]], 22, SHADE, 0.8, 'y');
      brush(cv, [[300, 260], [346, 254], [390, 256]], 12, LIGHT, 0.8, 'x');
      wash(cv, blob(rnd, [346, 352], 60, 12, -4, 0.04), SHADE, 8, 0.6);
      lay(cv, blob(rnd, [304, 352], 11, 7, 0, 0.05), '#f6bfb4', 2.2);
      lay(cv, blob(rnd, [392, 346], 10, 7, 0, 0.05), '#f6bfb4', 2.2);
      strokes(cv, rnd, head, [290, 262, 380, 340], { ...flecks, count: 10, colours: [LIGHT], flow: () => -80, length: 12, opacity: [0.5, 0.9] });
      cv.add('</g>');
      lay(cv, muzzle, PINK, 2.9);
      cv.add(`<g clip-path="${within(cv, muzzle)}">`);
      brush(cv, [[292, 364], [346, 354], [402, 362]], 14, PINK_PALE, 0.85, 'x');
      brush(cv, [[294, 404], [346, 418], [402, 402]], 14, PINK_SHADE, 0.8, 'x');
      cv.add('</g>');
    });

    s.paint((cv) => {
      // The face's pencil line goes on last and is left open at the top of the head, as a hand-drawn line is.
      line(cv, [HEAD[0], ...HEAD.slice(2).reverse()], 5.8, { start: 0.3, end: 0.3, count: 60 });
      line(cv, [[318, 257], [346, 254], [372, 252]], 4.6, { start: 0.3, end: 0.3 });
      ringed(cv, muzzle, 4.6, [270, 330, 160, 110]);
      const eyes = [blob(rnd, [318, 326], 8, 10, 4, 0.03), blob(rnd, [374, 322], 8, 10, -4, 0.03)];
      const dots = [...eyes, blob(rnd, [328, 384], 5, 7, 20, 0.04), blob(rnd, [364, 381], 5, 7, -20, 0.04)];
      cv.add(`<g fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}">${dots.map((d) => `<path d="${d}"/>`).join('')}</g>`);
      // A speck of light in each eye keeps them alive against the white face.
      cv.add('<g fill="#fbf6ee"><circle cx="315.5" cy="322" r="2.6"/><circle cx="371.5" cy="318" r="2.6"/></g>');
      line(cv, [[338, 400], [346, 404], [354, 400]], 2.8, { start: 0.4, end: 0.4, peak: 0.5 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
