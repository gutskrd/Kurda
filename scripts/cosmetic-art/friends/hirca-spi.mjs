import { blob, crayon, painter, softly, strokes, within } from '../brush.mjs';
import { n, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'hirca-spi',
  ku: 'Hirça Spî',
  en: 'White bear',
  // a round, chunky white bear plodding off to our left, seen from its side with its face turned a little toward us: a
  // big soft ball of a body, a small round head at the front of it with a little ear over the brow and another on the
  // crown, a soft snout with a dark nose, bright eyes and a small smile; short sturdy legs mid-step, the far ones set back
  // in shade; creamy white fur warm where the light falls on its back and brow, soft blue-grey underneath, and a soft
  // pencil line over it all
  still(rnd) {
    const s = new Still(rnd).place([-16, -2], 1.06);
    const [WHITE, LIGHT, CREAM, WARM] = ['#f8f2e7', '#fffcf5', '#f2e0bf', '#e0cbab'];
    const [COOL, SHADE, DEEP] = ['#cfd5df', '#aab4c4', '#8d97ab'];
    const [MUZZLE, PAD, NOSE, BLUSH] = ['#f4e6cc', '#d8c4ba', '#2b1d18', '#eeb4a4'];
    const INK = '#2a1c16';
    const { lay, brush, line } = painter(rnd, INK);
    const clip = (cv, d, draw) => {
      cv.add(`<g clip-path="${within(cv, d)}">`);
      draw();
      cv.add('</g>');
    };
    // Light and shade laid on as thin glazes with soft edges; the dry brush and the flecks give them their texture.
    const glaze = (cv, pts, colour, opacity, soft) => cv.add(`<path d="${spline(pts)}" fill="${colour}" fill-opacity="${opacity}" filter="${softly(cv, soft)}"/>`);
    // Dry-brush strokes laid round a ball as fur lies on it: `count` short arcs between angles `a0` and `a1` (degrees, 90
    // straight down), between `k0` and `k1` of the way out to its edge, each streaked the way it runs.
    const round = (cv, [cx, cy], rx, ry, [a0, a1], [k0, k1], count, colour, opacity, width) => {
      for (let i = 0; i < count; i++) {
        const a = ((a0 + (a1 - a0) * ((i + rnd()) / count)) * Math.PI) / 180;
        const k = k0 + (k1 - k0) * rnd();
        const da = (40 + rnd() * 30) / (k * (rx + ry) / 2);
        const pts = [-0.5, -0.17, 0.17, 0.5].map((f) => [cx + Math.cos(a + da * f) * rx * k, cy + Math.sin(a + da * f) * ry * k]);
        const way = Math.abs(Math.sin(a)) > 0.6 ? 'x' : 'y';
        brush(cv, pts, width * (0.8 + rnd() * 0.4), colour, n(opacity * (0.75 + rnd() * 0.5)), way);
      }
    };

    // The bear in one outline with its near legs: from behind the head over the back, round the rump and down to the
    // hind paw, under the round of the belly, and down the near foreleg and up the chest to under the chin.
    const P = [[196, 118], [240, 86], [298, 66], [358, 66], [414, 86], [454, 128], [474, 184], [476, 244], [466, 298], [450, 340], [452, 380], [458, 412],
      [466, 436], [470, 450], [456, 457], [424, 457], [396, 456], [382, 450], [386, 436], [392, 414], [390, 394], [380, 382], [344, 386], [300, 390],
      [262, 391], [222, 386], [188, 378], [184, 402], [178, 426], [188, 444], [184, 455], [150, 457], [116, 456], [98, 451], [102, 438], [114, 422], [112, 392],
      [106, 360], [100, 326], [97, 292], [104, 262]];
    const H = [[148, 124], [190, 130], [218, 156], [226, 192], [218, 228], [196, 254], [164, 268], [128, 270], [96, 260], [74, 236], [66, 204], [72, 170],
      [92, 142], [118, 128]];
    // The far legs behind: the foreleg stepping back, the hind leg lifted forward mid-stride.
    const FF = [[180, 340], [236, 340], [240, 380], [246, 410], [254, 430], [258, 442], [246, 449], [218, 450], [198, 448], [192, 438], [196, 420], [192, 380]];
    const FH = [[300, 350], [358, 352], [356, 384], [346, 408], [336, 424], [326, 436], [302, 440], [282, 437], [280, 426], [294, 408], [302, 384]];
    const [bear, head, farFore, farHind] = [P, H, FF, FH].map((Q) => spline(Q));
    const muzzle = blob(rnd, [92, 230], 33, 24, -12, 0.04);
    const earFar = blob(rnd, [84, 138], 17, 16, -20, 0.05);
    const earNear = blob(rnd, [184, 124], 20, 17, 10, 0.05);

    s.paint((cv) => {
      // The far legs, in the shade of the body, cooler and darker the higher they go under it.
      for (const [d, x0, x1] of [[farFore, 192, 256], [farHind, 282, 358]]) {
        lay(cv, d, '#dde1e8', 3);
        clip(cv, d, () => {
          glaze(cv, [[x0 - 20, 330], [x1 + 20, 330], [x1 + 20, 396], [x0 - 20, 404]], SHADE, 0.85, 8);
          brush(cv, [[x1 - 12, 360], [x1 - 8, 404], [x1 - 4, 444]], 16, DEEP, 0.4, 'y');
          brush(cv, [[x0 - 4, 446], [(x0 + x1) / 2, 452], [x1 + 4, 444]], 10, SHADE, 0.6, 'x');
        });
      }
      lay(cv, earFar, WHITE, 3);
      clip(cv, earFar, () => brush(cv, [[80, 146], [86, 136], [96, 134]], 8, PAD, 0.9, 'y'));

      // The body: warm cream light over the back, blue-grey shade brushed round the underside of the ball and the far
      // side of the rump, the shadow the head throws on the shoulder, and the belly shading the tops of the legs.
      lay(cv, bear, WHITE, 3.2);
      clip(cv, bear, () => {
        glaze(cv, [[150, 160], [220, 96], [310, 70], [404, 92], [440, 140], [370, 150], [280, 156], [200, 190]], CREAM, 0.7, 10);
        glaze(cv, [[100, 330], [220, 318], [340, 296], [430, 236], [470, 180], [520, 240], [500, 480], [80, 480]], COOL, 0.55, 14);
        glaze(cv, [[96, 262], [180, 252], [238, 246], [258, 292], [232, 330], [150, 336], [100, 320]], COOL, 0.6, 10);
        const ball = [[296, 236], 180, 162];
        round(cv, ...ball, [10, 150], [0.72, 0.98], 16, COOL, 0.6, 16);
        round(cv, ...ball, [10, 130], [0.86, 1], 12, SHADE, 0.6, 14);
        round(cv, ...ball, [-50, 20], [0.78, 0.98], 8, COOL, 0.55, 16);
        round(cv, ...ball, [200, 320], [0.72, 0.96], 14, LIGHT, 0.85, 16);
        round(cv, ...ball, [220, 300], [0.5, 0.75], 8, CREAM, 0.5, 14);
        brush(cv, [[200, 250], [214, 290], [236, 318]], 20, SHADE, 0.3, 'y');
        // The near legs lit down their fronts and cool behind, their tops in the shade of the belly, warm at the paw.
        for (const [x0, x1, foot] of [[108, 182, 456], [388, 466, 456]]) {
          brush(cv, [[x0 + 8, 384], [x0 + 6, 416], [x0 + 2, 448]], 16, LIGHT, 0.85, 'y');
          brush(cv, [[x1 - 10, 380], [x1 - 8, 414], [x1 - 4, 448]], 16, SHADE, 0.55, 'y');
          brush(cv, [[x0 - 4, foot - 5], [(x0 + x1) / 2, foot + 2], [x1 + 6, foot - 5]], 10, WARM, 0.7, 'x');
        }
        const about = (x, y) => (Math.atan2(y - 236, x - 300) * 180) / Math.PI + 90;
        strokes(cv, rnd, bear, [180, 70, 460, 190], { count: 40, colours: [LIGHT, '#ead4ab'], flow: about, spread: 18, length: 15, width: 2.2,
          opacity: [0.4, 0.8], bend: 0.25 });
        strokes(cv, rnd, bear, [190, 190, 474, 380], { count: 40, colours: [SHADE, LIGHT, COOL], flow: about, spread: 18, length: 14, width: 2,
          opacity: [0.3, 0.6], bend: 0.25 });
        strokes(cv, rnd, bear, [96, 370, 470, 452], { count: 18, colours: [SHADE, LIGHT], flow: () => 92, spread: 14, length: 11, width: 2,
          opacity: [0.3, 0.6], bend: 0.2 });
      });

      // The head turns out of the body: lit over the brow, cool under the jaw, a warm blush on the cheek.
      lay(cv, head, WHITE, 3.2);
      clip(cv, head, () => {
        glaze(cv, [[70, 170], [100, 130], [160, 122], [210, 146], [190, 170], [130, 172], [90, 196]], CREAM, 0.7, 8);
        glaze(cv, [[90, 268], [170, 252], [222, 204], [240, 220], [230, 290], [90, 300]], COOL, 0.7, 8);
        round(cv, [148, 198], 80, 74, [-30, 130], [0.75, 0.98], 9, COOL, 0.6, 12);
        round(cv, [148, 198], 80, 74, [190, 300], [0.7, 0.95], 7, LIGHT, 0.9, 12);
        glaze(cv, [[150, 220], [166, 214], [182, 220], [176, 230], [156, 230]], BLUSH, 0.35, 4);
        const face = (x, y) => (Math.atan2(y - 200, x - 150) * 180) / Math.PI + 90;
        strokes(cv, rnd, head, [70, 124, 226, 270], { count: 24, colours: [LIGHT, '#e6d2ae', COOL], flow: face, spread: 18, length: 11, width: 1.9,
          opacity: [0.35, 0.65], bend: 0.25 });
      });
      lay(cv, earNear, WHITE, 3);
      clip(cv, earNear, () => {
        brush(cv, [[176, 130], [186, 124], [196, 130]], 9, PAD, 0.9, 'x');
        brush(cv, [[168, 116], [182, 108], [198, 112]], 8, LIGHT, 0.8, 'x');
      });
      // The soft snout, lit along its bridge and warm underneath.
      lay(cv, muzzle, MUZZLE, 2.6);
      clip(cv, muzzle, () => {
        brush(cv, [[64, 220], [90, 208], [120, 214]], 12, LIGHT, 0.9, 'x');
        brush(cv, [[64, 246], [96, 256], [126, 240]], 12, WARM, 0.75, 'x');
      });
    });

    s.paint((cv) => {
      // The pencil line, open where the fur runs on: the far ear, the brow, the near ear, over the back and round the
      // rump to the hind paw, the belly, the far legs, the near foreleg up into the chest, the jaw and the snout.
      line(cv, [[74, 146], [68, 132], [76, 122], [90, 120], [100, 128]], 4.2, { start: 0.3, end: 0.4 });
      line(cv, [[68, 206], [68, 186], [74, 164], [88, 146], [108, 132], [130, 126]], 4.8, { start: 0.2, end: 0.5 });
      line(cv, [[166, 118], [170, 108], [184, 104], [198, 108], [204, 120]], 4.4, { start: 0.3, end: 0.4 });
      line(cv, [[202, 112], ...P.slice(1, 4)], 5, { start: 0.3, end: 0.15 });
      line(cv, [[344, 64], ...P.slice(4, 9)], 5.6, { start: 0.15, end: 0.3 });
      line(cv, [[468, 290], ...P.slice(9, 18)], 5.2, { start: 0.3, end: 0.3, count: 40 });
      line(cv, P.slice(18, 22), 4.4, { start: 0.3, end: 0.4 });
      line(cv, P.slice(21, 27), 4.2, { start: 0.4, end: 0.3, peak: 0.6 });
      line(cv, [[302, 392], [294, 408], [280, 426], [282, 437], [302, 440], [326, 436], [336, 424], [346, 408], [352, 394]], 3.8,
        { start: 0.3, end: 0.3, peak: 0.5 });
      line(cv, [[240, 388], [246, 410], [254, 430], [258, 442], [246, 449], [218, 450], [198, 448]], 3.8, { start: 0.3, end: 0.3 });
      line(cv, P.slice(26, 36), 5.2, { start: 0.3, end: 0.4, count: 40 });
      line(cv, P.slice(35, 41), 4.8, { start: 0.4, end: 0.1 });
      line(cv, [[104, 268], [128, 272], [164, 268], [196, 254], [214, 234]], 4.2, { start: 0.3, end: 0.1, peak: 0.3 });
      line(cv, [[106, 210], [86, 206], [64, 214], [58, 232], [66, 248], [88, 255], [108, 253]], 4.2, { start: 0.2, end: 0.3 });
      // Toes at the front of each paw.
      for (const [x, y] of [[110, 455], [122, 456], [134, 457], [396, 455], [408, 456], [420, 457], [204, 448], [214, 449], [290, 437], [300, 439]]) {
        line(cv, [[x, y - 9], [x + 1, y]], 2.4, { start: 0.3, end: 0.7 });
      }
      // The face: bright eyes, the dark nose at the tip of the snout, a small smile.
      cv.add(`<g fill="${NOSE}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}">`
        + `<path d="${blob(rnd, [100, 186], 7.5, 8.5, 0, 0.04)}"/><path d="${blob(rnd, [160, 182], 8.5, 9.5, 0, 0.04)}"/>`
        + `<path d="${spline([[62, 222], [72, 216], [84, 218], [85, 228], [77, 234], [65, 232]])}"/></g>`);
      for (const [x, y, r] of [[98, 183, 2.6], [158, 179, 3], [70, 221, 2.4]]) cv.add(`<circle cx="${x}" cy="${y}" r="${r}" fill="#fff8ec"/>`);
      line(cv, [[76, 234], [77, 242]], 2.8, { start: 0.8, end: 0.6 });
      line(cv, [[68, 243], [72, 247.5], [77, 242]], 2.8, { start: 0.4, end: 0.8, peak: 0.6 });
      line(cv, [[77, 242], [82, 247.5], [88, 243]], 2.8, { start: 0.8, end: 0.4, peak: 0.4 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
