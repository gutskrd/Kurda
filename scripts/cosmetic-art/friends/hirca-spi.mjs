import { blob, crayon, crescent, painter, softly, strokes, within } from '../brush.mjs';
import { along, pt, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'hirca-spi',
  ku: 'Hirça Spî',
  en: 'White bear',
  // A round, chunky white bear walking to our left, its head carried low and forward and turned a little toward us so
  // that it grows out of the shoulders: small round ears, kind dark eyes, a long soft muzzle with a dark nose and a small
  // smile. A hump over the shoulders, the back sloping to a round rump, soft fur hanging at the chest and belly, and
  // short thick legs mid-step, the near hind paw lifting at the heel and the far legs in shade behind. Creamy fur, warm
  // where the light falls on the back and brow and soft blue-grey underneath.
  still(rnd) {
    const s = new Still(rnd).place([-10, -6], 0.92);
    const [CREAM, LIGHT, WARM, GLOW] = ['#f6eddc', '#fffaf0', '#e4cfae', '#f6e6c8'];
    const [SHADE, DEEP] = ['#a8b0c9', '#7f8daa'];
    const [PAD, NOSE, BLUSH] = ['#cdb4a8', '#2e211c', '#f2a796'];
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);
    const clip = (cv, d, draw) => {
      cv.add(`<g clip-path="${within(cv, d)}">`);
      draw();
      cv.add('</g>');
    };
    // Broad light and shade go on as smooth glazes; the brush and the flecks give them their texture.
    const glaze = (cv, d, colour, opacity, soft, move = '') =>
      cv.add(`<path d="${d}" fill="${colour}" fill-opacity="${opacity}" filter="${softly(cv, soft)}"${move ? ` transform="translate(${move})"` : ''}/>`);

    // The bear in one outline, head, body and near legs together: from the nose up the muzzle and over the brow and
    // crown, along the nape and over the hump, down round the rump to the near hind paw, under the belly, round the near
    // fore paw and up the chest to the throat and under the jaw to the chin.
    const P = [[34, 232], [42, 214], [60, 204], [84, 194], [104, 184], [114, 168], [124, 152], [142, 138], [168, 128], [196, 122], [220, 116], [242, 100],
      [268, 80], [300, 64], [338, 58], [378, 62], [416, 80], [448, 110], [468, 150], [478, 200], [476, 252], [466, 298], [456, 332], [458, 362], [464, 392],
      [466, 414], [458, 430], [444, 444], [428, 456], [408, 462], [392, 460], [386, 450], [392, 440], [404, 432], [408, 414], [404, 396], [392, 384],
      [358, 396], [320, 404], [280, 406], [244, 402], [214, 394], [202, 406], [196, 428], [198, 448], [190, 460], [158, 463], [124, 462], [100, 459],
      [90, 450], [90, 438], [98, 427], [110, 420], [112, 400], [110, 376], [104, 348], [102, 320], [114, 292], [106, 278], [86, 272], [64, 266], [46, 256],
      [36, 246]];
    // Fur at an edge through `pts`, followed the way its outline runs: soft locks that curve out about `amp` to fine
    // points leaning on along the edge or, with `back`, the other way; each lock gives a pencil flick out to its point.
    const ruff = (pts, { amp, count, taper = () => 1, back = false }) => {
      const c = along(pts, count);
      const flicks = [];
      let d = `L${pt(c[0])}`;
      for (let i = 0; i < count; i++) {
        const [a, b] = [c[i], c[i + 1]];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const [tx, ty] = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
        const k = amp * taper(i / Math.max(1, count - 1)) * (0.6 + rnd() * 0.7);
        const at = (o, g) => [a[0] + ty * o + tx * g, a[1] - tx * o + ty * g];
        // A lock leaning back is the forward one seen from its other end.
        const [c1, tip, c2] = back
          ? [at(k * 0.45, -l * 0.02), at(k, -l * 0.1), at(k * 1.05, l * 0.7)]
          : [at(k * 1.05, l * 0.3), at(k, l * 1.1), at(k * 0.45, l * 1.02)];
        d += ` Q${pt(c1)} ${pt(tip)} Q${pt(c2)} ${pt(b)}`;
        const [root, bend] = back ? [at(-1, l), c2] : [at(-1, 0), c1];
        flicks.push([0, 0.25, 0.5, 0.75, 1].map((u) => [0, 1].map((j) => (1 - u) ** 2 * root[j] + 2 * u * (1 - u) * bend[j] + u * u * tip[j])));
      }
      return { d, flicks };
    };
    // Soft fur hangs from the belly between the legs and from the chest under the throat.
    const belly = ruff(P.slice(36, 42), { amp: 9, count: 7, taper: (u) => 0.4 + Math.sin(Math.PI * u) * 0.7, back: true });
    const chest = ruff(P.slice(54, 58), { amp: 7, count: 4, taper: (u) => 0.5 + Math.sin(Math.PI * u) * 0.6, back: true });
    const bear = `${spline(P.slice(41, 55), false)} ${chest.d} ${spline([...P.slice(57), ...P.slice(0, 37)], false).replace('M', 'L')} ${belly.d} Z`;
    // The head is painted over the neck as a form of its own, its back edge left without a line: the muzzle, brow and
    // crown along the outline, the cheek rounding down behind the eyes to the throat in soft locks of fur.
    const HEAD = [[118, 296], [96, 290], [78, 282], [56, 274], [36, 262], [22, 248], [24, 232], [32, 208], [54, 196], [78, 186], [98, 176], [106, 162],
      [116, 144], [136, 130], [164, 118], [196, 112], [224, 108], [242, 128]];
    const CHEEK = [[242, 128], [252, 162], [250, 198], [238, 230], [216, 258], [184, 278], [148, 290], [118, 296]];
    const head = `${spline(HEAD, false)} ${ruff(CHEEK, { amp: 10, count: 9, taper: (u) => 0.2 + Math.sin(Math.PI * Math.min(1, u * 1.3)) * 0.9 }).d} Z`;
    // The far legs behind: the foreleg stepping back, the hind leg set forward under the belly.
    const FF = [[204, 360], [256, 362], [258, 398], [260, 424], [264, 440], [260, 450], [234, 452], [210, 452], [201, 445], [202, 432], [208, 420], [206, 398]];
    const FH = [[290, 362], [350, 364], [352, 400], [350, 426], [348, 442], [340, 450], [310, 451], [290, 448], [286, 436], [292, 418], [294, 396]];
    const [farFore, farHind] = [FF, FH].map((Q) => spline(Q));
    const earFar = blob(rnd, [128, 138], 14, 13, -20, 0.05);
    const earNear = blob(rnd, [206, 118], 17, 15, 10, 0.05);
    const about = ([cx, cy]) => (x, y) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90;
    // Short dry-brush dabs of fur over the box, each lying along `flow` with a slight curve.
    const dabs = (cv, [x0, y0, x1, y1], count, colours, flow, [o0, o1], width) => {
      for (let i = 0; i < count; i++) {
        const [x, y] = [x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)];
        const a = ((flow(x, y) + (rnd() - 0.5) * 20) * Math.PI) / 180;
        const l = 12 + rnd() * 12;
        const [ux, uy] = [Math.cos(a), Math.sin(a)];
        const b = (rnd() - 0.5) * 8;
        const pts = [[x - ux * l, y - uy * l], [x - uy * b, y + ux * b], [x + ux * l, y + uy * l]];
        brush(cv, pts, width * (0.8 + rnd() * 0.4), colours[Math.floor(rnd() * colours.length)], o0 + rnd() * (o1 - o0), Math.abs(ux) > 0.7 ? 'x' : 'y');
      }
    };

    s.paint((cv) => {
      // A faint warm shadow on the ground under the paws.
      wash(cv, blob(rnd, [280, 461], 196, 9, 0, 0.04), '#8c7c70', 8, 0.2);
      // The far legs, in the shade of the body: darker the higher they go under it, a little light on their fronts.
      for (const [d, x0, x1] of [[farFore, 204, 264], [farHind, 286, 352]]) {
        lay(cv, d, '#c8ccd8', 2.8);
        clip(cv, d, () => {
          glaze(cv, spline([[x0 - 20, 340], [x1 + 20, 340], [x1 + 20, 414], [x0 - 20, 420]]), DEEP, 0.55, 12);
          brush(cv, [[x1 - 8, 400], [x1 - 6, 424], [x1 - 4, 448]], 12, DEEP, 0.45, 'y');
          brush(cv, [[x0 + 10, 414], [x0 + 8, 432], [x0 + 6, 448]], 12, '#e2e2e6', 0.6, 'y');
          strokes(cv, rnd, d, [x0, 396, x1, 452], { count: 8, colours: [DEEP, '#e2e2e6'], flow: () => 92, spread: 12, length: 10, width: 1.8,
            opacity: [0.3, 0.55] });
        });
      }
      lay(cv, earFar, CREAM, 2.8);
      clip(cv, earFar, () => glaze(cv, spline([[124, 136], [134, 132], [140, 142], [130, 148]]), PAD, 0.8, 3));

      // The body, a ball lit from the upper left: warm cream light over the hump and the back, a broad blue-grey turning
      // to the lower right, deeper near its edge and under the belly, and the shadow the head throws on the neck.
      lay(cv, bear, CREAM, 3);
      clip(cv, bear, () => {
        glaze(cv, spline([[200, 120], [250, 96], [330, 60], [420, 82], [452, 130], [400, 124], [320, 116], [240, 144]]), GLOW, 0.8, 12);
        crescent(cv, bear, [-70, -80], { colour: SHADE, opacity: 0.4, soft: 30 });
        crescent(cv, bear, [-24, -28], { colour: SHADE, opacity: 0.7, soft: 12 });
        glaze(cv, spline([[196, 350], [300, 344], [410, 326], [400, 410], [200, 410]]), SHADE, 0.5, 14);
        clip(cv, 'M0 196 L300 150 L300 512 L0 512 Z', () => glaze(cv, head, SHADE, 0.6, 9, '14 18'));
        // Dry-brush strokes laid round the ball as the fur lies on it: warm over the back, cool round the rump and belly.
        for (const [pts, w, c, o, way] of [
          [[[250, 110], [300, 86], [360, 80], [420, 106]], 20, WARM, 0.3, 'x'],
          [[[256, 150], [316, 124], [384, 122], [440, 156]], 18, WARM, 0.22, 'x'],
          [[[300, 186], [360, 166], [420, 184]], 16, WARM, 0.16, 'x'],
          [[[452, 186], [462, 236], [454, 286], [434, 328]], 20, SHADE, 0.35, 'y'],
          [[[418, 222], [424, 268], [408, 314]], 16, SHADE, 0.22, 'y'],
          [[[226, 384], [292, 394], [360, 388], [404, 372]], 14, SHADE, 0.4, 'x'],
        ]) brush(cv, pts, w, c, o, way);
        // The near legs lit softly down their fronts and cool behind, a little light on the tops of the paws.
        for (const [x0, x1] of [[106, 196], [396, 462]]) {
          glaze(cv, spline([[x0 + 4, 380], [x0 + 26, 380], [x0 + 22, 430], [x0 + 6, 436]]), LIGHT, 0.6, 7);
          brush(cv, [[x1 - 12, 384], [x1 - 10, 416], [x1 - 8, 450]], 16, SHADE, 0.5, 'y');
          glaze(cv, blob(rnd, [x0 - 2, 438], 16, 8, -20, 0.05), LIGHT, 0.6, 4);
        }
        dabs(cv, [230, 70, 460, 200], 16, [WARM, WARM, WARM, LIGHT], about([300, 440]), [0.22, 0.4], 9);
        strokes(cv, rnd, bear, [220, 60, 470, 200], { count: 40, colours: [WARM], flow: about([300, 440]), spread: 16, length: 16, width: 2,
          opacity: [0.25, 0.5], bend: 0.25 });
        strokes(cv, rnd, bear, [180, 200, 476, 400], { count: 80, colours: [SHADE, SHADE, LIGHT], flow: about([300, 440]), spread: 22, length: 14, width: 1.9,
          opacity: [0.3, 0.55], bend: 0.25 });
        strokes(cv, rnd, bear, [96, 380, 456, 460], { count: 24, colours: [SHADE, LIGHT], flow: () => 92, spread: 14, length: 12, width: 2,
          opacity: [0.3, 0.55], bend: 0.2 });

        // The head over it, lit on the brow and the bridge of the muzzle, the near side of the muzzle in half-shade, cool
        // under the jaw where it softens into the throat.
        lay(cv, head, CREAM, 3);
        clip(cv, head, () => {
          glaze(cv, spline([[60, 200], [110, 160], [170, 124], [226, 118], [210, 150], [150, 170], [100, 200]]), GLOW, 0.8, 9);
          crescent(cv, head, [-16, -20], { colour: SHADE, opacity: 0.45, soft: 9 });
          glaze(cv, spline([[56, 248], [84, 240], [118, 226], [140, 214], [150, 234], [120, 256], [84, 268], [58, 262]]), SHADE, 0.25, 7);
          brush(cv, [[46, 222], [74, 204], [104, 192]], 12, LIGHT, 0.9, 'x');
          glaze(cv, spline([[156, 214], [170, 208], [184, 214], [178, 224], [160, 224]]), BLUSH, 0.45, 4);
          strokes(cv, rnd, head, [40, 110, 250, 296], { count: 34, colours: [WARM, SHADE], flow: about([150, 200]), spread: 18, length: 11, width: 1.8,
            opacity: [0.25, 0.45], bend: 0.25 });
        });
        glaze(cv, spline([[96, 284], [150, 286], [196, 270], [206, 300], [146, 318], [100, 312]]), SHADE, 0.3, 8);
      });
      lay(cv, earNear, CREAM, 2.8);
      clip(cv, earNear, () => {
        glaze(cv, spline([[198, 120], [210, 114], [220, 122], [210, 130]]), PAD, 0.85, 3);
        brush(cv, [[190, 112], [204, 104], [220, 108]], 7, LIGHT, 0.8, 'x');
      });
    });

    s.paint((cv) => {
      // The pencil line, open where the light falls and where the fur runs on from the head into the body.
      line(cv, [[116, 142], [116, 130], [126, 124], [138, 126], [142, 136]], 3.8, { start: 0.3, end: 0.3 });
      line(cv, P.slice(0, 7), 4.8, { start: 0.3, end: 0.3 });
      line(cv, P.slice(7, 10), 4, { start: 0.2, end: 0.3 });
      line(cv, [[192, 120], [192, 108], [204, 102], [218, 104], [224, 114]], 4.2, { start: 0.3, end: 0.3 });
      line(cv, P.slice(10, 14), 4.4, { start: 0.2, end: 0.2 });
      line(cv, P.slice(15, 28), 5.6, { start: 0.2, end: 0.4, count: 40 });
      line(cv, P.slice(27, 37), 5, { start: 0.4, end: 0.3 });
      for (const f of belly.flicks) line(cv, f, 3.6, { start: 0.75, end: 0.03, peak: 0.3, tremble: 0.12, count: 16 });
      line(cv, P.slice(41, 53), 5, { start: 0.3, end: 0.3, count: 40 });
      line(cv, P.slice(52, 55), 4.2, { start: 0.3, end: 0.2 });
      for (const f of chest.flicks) line(cv, f, 3.6, { start: 0.75, end: 0.03, peak: 0.3, tremble: 0.12, count: 16 });
      line(cv, [...P.slice(57), P[0]], 4.8, { start: 0.2, end: 0.4 });
      line(cv, FF.slice(2, 10), 3.6, { start: 0.3, end: 0.3 });
      line(cv, FH.slice(2, 10), 3.6, { start: 0.3, end: 0.3 });
      // The front of the thigh, drawn only in part.
      line(cv, [[396, 378], [404, 350], [416, 328]], 3.2, { start: 0.2, end: 0.1 });
      // Toes at the front of each paw.
      for (const [x, y, l] of [[104, 461, 12], [116, 462, 12], [128, 463, 11], [400, 461, 12], [412, 460, 12], [424, 457, 11], [214, 451, 9], [224, 452, 9],
        [296, 449, 9], [306, 450, 9]]) {
        line(cv, [[x + 2, y - l], [x, y]], 2.8, { start: 0.3, end: 0.8 });
      }
      // The face: kind dark eyes with a glint, the dark nose at the tip of the muzzle, a small smile.
      cv.add(`<g fill="${NOSE}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}">`
        + `<path d="${blob(rnd, [128, 186], 8, 10.2, 0, 0.04)}"/><path d="${blob(rnd, [172, 180], 10, 11.5, 0, 0.04)}"/>`
        + `<path d="${spline([[28, 230], [38, 216], [56, 218], [62, 233], [51, 245], [33, 244]])}"/></g>`);
      for (const [x, y, r] of [[125.2, 181.6, 2.9], [168.4, 175, 3.6], [38, 223.5, 2.8]]) cv.add(`<circle cx="${x}" cy="${y}" r="${r}" fill="#fff8ec"/>`);
      line(cv, [[50, 245], [52, 255]], 2.6, { start: 0.8, end: 0.6 });
      line(cv, [[52, 255], [61, 261], [73, 260]], 2.6, { start: 0.8, end: 0.3, peak: 0.4 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
