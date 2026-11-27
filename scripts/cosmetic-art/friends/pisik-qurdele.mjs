import { blob, crayon, painter, strokes, within } from '../brush.mjs';
import { along, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'pisik-qurdele',
  ku: 'Pisîka Bi Qurdele',
  en: 'Kitten with a bow',
  // a fluffy white kitten sitting side-on and looking back at us over its shoulder, its tail wrapped round its front
  // paws: its fur painted white with soft blue-grey shade and warm light, pink in its ears and on its nose, big dark
  // eyes, a red ribbon tied in a bow at its throat with two short ends, and inked over in a soft dark pencil line
  still(rnd) {
    const s = new Still(rnd).place([-3, -22], 0.96);
    const [FUR, SHADE, DEEP, WARM, LIGHT] = ['#f6f2ec', '#bfc8d7', '#97a3b8', '#f7e9d4', '#fffbf2'];
    const [PINK, NOSE] = ['#f1aeb0', '#e1878d'];
    const [RED, RED_DEEP, RED_LIT] = ['#c42f2f', '#8a1c22', '#e8604f'];
    const INK = '#2e2222';
    const { lay, wash, brush, line } = painter(rnd, INK);
    const clip = (cv, d, draw) => {
      cv.add(`<g clip-path="${within(cv, d)}">`);
      draw();
      cv.add('</g>');
    };
    const seg = (P, i, j) => Array.from({ length: ((j - i + P.length) % P.length) + 1 }, (_, k) => P[(i + k) % P.length]);
    const loop = (P) => [...P, P[0], P[1]];
    // Fur standing off an edge: between `from` and `to` most stretches of the outline get a tuft pushed out from them,
    // some bigger than others, so the paint and the line both run in soft uneven points. `side` is 1 for an outline drawn
    // clockwise, -1 for one drawn the other way.
    const fluffy = (P, amp, side, from = 0, to = P.length) => {
      const out = [];
      P.forEach((a, i) => {
        out.push(a);
        if (i < from || i >= to || rnd() < 0.25) return;
        const b = P[(i + 1) % P.length];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const k = amp * (0.3 + rnd() * 1.2);
        const t = 0.45 + rnd() * 0.2;
        out.push([a[0] + (b[0] - a[0]) * t + ((b[1] - a[1]) / l) * k * side, a[1] + (b[1] - a[1]) * t - ((b[0] - a[0]) / l) * k * side]);
      });
      return out;
    };
    // A tail along `pts`, `w0` wide at its root and `w1` at its tip: its two sides, to outline and to ink.
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
      return { L, R };
    };

    // The body is side-on, facing right, so the haunch can sit round and low behind and the head turn back over it.
    const back = fluffy([[236, 214], [206, 236], [172, 258], [142, 286], [118, 322], [106, 362]], 7, -1, 0, 5);
    const rump = fluffy([[106, 362], [108, 402], [120, 432], [142, 450], [176, 458]], 7, -1, 0, 4);
    const chest = fluffy([[350, 448], [354, 410], [356, 366], [354, 322], [346, 288], [332, 258]], 6, -1, 0, 5);
    const body = [...back, ...rump.slice(1), [230, 468], [290, 468], [332, 466], ...chest, [300, 238]];
    const legNear = [[300, 360], [334, 356], [340, 400], [342, 440], [346, 458], [314, 462], [306, 440], [302, 400]];
    const pawNear = [330, 455];
    const pawFar = [358, 451];
    // The tail runs from behind the haunch along the ground and round the front of the paws.
    const TAIL = [[142, 414], [134, 446], [154, 468], [206, 478], [268, 480], [324, 476], [364, 466], [390, 448], [402, 428]];
    const tail = tube(TAIL, 24, 22);
    const tailL = fluffy(tail.L.filter((_, i) => i % 2 === 0), 5, -1, 0, 10);
    const tailR = fluffy(tail.R.filter((_, i) => i % 2 === 0), 4, 1, 0, 10);
    const [end, before] = [TAIL.at(-1), TAIL.at(-2)];
    const toward = Math.atan2(end[1] - before[1], end[0] - before[0]);
    const tip = [70, 30, -8, -44, -76].map((deg) => toward + (deg * Math.PI) / 180).map((a) => [end[0] + Math.cos(a) * 13, end[1] + Math.sin(a) * 13]);
    const tailD = spline([...tailL, ...tip, ...[...tailR].reverse()]);
    const crown = [[204, 160], [214, 140], [236, 112], [270, 98], [306, 98], [340, 110], [364, 132], [376, 162], [376, 192]];
    const cheekNear = fluffy([[376, 192], [388, 214], [370, 222], [362, 240], [338, 256], [302, 264]], 4, 1, 0, 5);
    const cheekFar = fluffy([[302, 264], [266, 262], [236, 252], [214, 238], [194, 226], [206, 212], [200, 186], [204, 160]], 4, 1, 0, 7);
    const head = [...crown.slice(1), ...cheekNear.slice(1), ...cheekFar.slice(1)];
    const earFar = [[224, 132], [214, 98], [214, 70], [222, 58], [244, 70], [264, 92], [276, 104]];
    const earNear = [[306, 100], [330, 76], [352, 56], [364, 56], [370, 86], [372, 118], [366, 146]];
    const band = [[226, 252], [262, 266], [300, 272], [332, 266], [336, 278], [302, 286], [258, 280], [224, 264]];
    const KNOT = [326, 274];
    const loopL = [[318, 270], [298, 254], [282, 250], [276, 264], [282, 282], [300, 288], [318, 280]];
    const loopR = [[334, 270], [352, 252], [370, 248], [378, 262], [372, 282], [354, 290], [334, 280]];
    const endL = [[320, 282], [312, 300], [304, 318], [294, 322], [300, 310], [290, 312], [306, 286]];
    const endR = [[332, 282], [342, 302], [352, 318], [362, 316], [356, 306], [366, 304], [342, 284]];

    // Each part is inked as soon as it is painted, so the parts in front of it cover its line as they cover its paint.
    s.paint((cv) => {
      // The tail is painted twice: first under the haunch, which hides its root, and again over the paws, which it
      // wraps in front of.
      const tailOf = () => {
        lay(cv, tailD, FUR, 2.8);
        clip(cv, tailD, () => {
          brush(cv, tail.L.slice(2), 14, SHADE, 0.75, 'x');
          brush(cv, tail.R.slice(4, 17), 9, WARM, 0.6, 'x');
          brush(cv, tail.R.slice(15), 10, LIGHT, 0.9, 'y');
          strokes(cv, rnd, tailD, [100, 400, 420, 504], { count: 24, colours: [SHADE], flow: () => 10, spread: 30, length: 12, width: 2, opacity: [0.3, 0.6] });
        });
        const half = Math.floor(tailL.length / 2);
        line(cv, tailL.slice(1, half + 1), 6.2, { start: 0.3, end: 0.5, count: 40 });
        line(cv, tailL.slice(half), 6.2, { start: 0.5, end: 0.4, count: 40 });
        line(cv, tailR.slice(2), 5.4, { start: 0.2, end: 0.3, count: 60 });
        line(cv, [tail.L.at(-1), ...tip, tail.R.at(-1)], 5.8, { start: 0.4, end: 0.3 });
      };
      tailOf();
      // White fur takes its form from colour alone: warm where the light falls on the back and haunch, blue-grey under
      // the head, down the chest and round the haunch, with streaks brushed along the way the fur lies.
      const B = spline(body);
      lay(cv, B, FUR, 2.8);
      clip(cv, B, () => {
        wash(cv, blob(rnd, [300, 300], 50, 34, 10, 0.05), SHADE, 14, 0.9);
        wash(cv, spline([[150, 470], [300, 474], [356, 450], [350, 410], [300, 444], [200, 452]]), DEEP, 10, 0.7);
        brush(cv, [[344, 296], [352, 350], [348, 420]], 22, SHADE, 0.6, 'y');
        brush(cv, [[120, 360], [124, 410], [150, 452]], 22, SHADE, 0.5, 'y');
        brush(cv, [[206, 300], [252, 318], [278, 362], [284, 412], [270, 452]], 22, SHADE, 0.7, 'y');
        brush(cv, [[176, 262], [150, 286], [128, 322]], 18, WARM, 0.6, 'y');
        brush(cv, [[150, 304], [196, 296], [236, 310]], 22, WARM, 0.55, 'x');
        brush(cv, [[112, 372], [118, 420], [146, 456], [196, 468]], 20, SHADE, 0.75, 'y');
        brush(cv, [[136, 332], [134, 372], [146, 410]], 16, LIGHT, 0.9, 'y');
        for (const [pts, w, c] of [
          [[[300, 262], [312, 290], [318, 318]], 7, SHADE], [[[320, 266], [330, 294], [334, 326]], 6, SHADE], [[[160, 330], [168, 360], [166, 392]], 7, LIGHT],
          [[[190, 340], [198, 372], [194, 404]], 6, LIGHT], [[[230, 380], [244, 410], [242, 440]], 7, SHADE], [[[140, 300], [176, 290]], 6, LIGHT],
        ]) brush(cv, pts, w, c, 0.75, 'y');
        strokes(cv, rnd, B, [110, 240, 356, 466], { count: 56, colours: [SHADE, SHADE, LIGHT], flow: (x) => (x > 290 ? 95 : 60), spread: 30, length: 13, width: 2.2,
          opacity: [0.35, 0.7] });
      });
      line(cv, back, 6.2, { start: 0.3, end: 0.5, count: 40 });
      line(cv, rump, 6.4, { start: 0.5, end: 0.3, count: 40 });
      line(cv, chest.slice(0, 7), 6, { start: 0.3, end: 0.5, count: 30 });
      line(cv, chest.slice(6), 6, { start: 0.5, end: 0.3, count: 30 });
      line(cv, [[196, 300], [240, 306], [270, 340], [282, 390], [276, 434]], 5.4, { start: 0.2, end: 0.15, peak: 0.35 });
      lay(cv, spline(legNear), FUR, 2.8);
      clip(cv, spline(legNear), () => brush(cv, [[332, 362], [336, 410], [340, 456]], 14, SHADE, 0.6, 'y'));
      line(cv, seg(legNear, 1, 4), 5.4, { start: 0.3, end: 0.3 });
      line(cv, seg(legNear, 5, 7), 5, { start: 0.3, end: 0.1 });
      for (const [c, rx] of [[pawFar, 18], [pawNear, 22]]) {
        lay(cv, blob(rnd, c, rx, 13, -4, 0.05), FUR, 2.8);
        const [x, y] = c;
        clip(cv, blob(rnd, c, rx, 13, -4, 0.05), () => wash(cv, blob(rnd, [x + 8, y + 7], rx, 7, 0, 0.05), SHADE, 4, 0.8));
        line(cv, [[x - rx, y + 4], [x - rx * 0.7, y - 9], [x, y - 13], [x + rx * 0.8, y - 8], [x + rx, y + 4]], 5, { start: 0.3, end: 0.3 });
        line(cv, [[x + rx * 0.2, y - 6], [x + rx * 0.25, y + 2]], 2.6, { start: 0.6, end: 0.3 });
      }
      clip(cv, 'M176 380 L520 380 L520 520 L176 520 Z', tailOf);
      // The ribbon's band goes on before the head, so the chin sits over it.
      lay(cv, spline(band), RED, 2.8);
      clip(cv, spline(band), () => brush(cv, [[226, 266], [270, 280], [334, 276]], 8, RED_DEEP, 0.7, 'x'));
      line(cv, seg(band, 4, 7), 4.4, { start: 0.3, end: 0.3 });
      // The head tips toward its shoulder, as a kitten's does when it looks round.
      cv.add('<g transform="rotate(-7 290 190)">');
      const inners = [[[228, 124], [222, 92], [224, 72], [244, 84], [262, 104]], [[314, 102], [336, 82], [356, 66], [362, 92], [362, 128]]];
      for (const [ear, inner] of [[earFar, inners[0]], [earNear, inners[1]]]) {
        lay(cv, spline(ear), FUR, 2.8);
        lay(cv, spline(inner), PINK, 2.4);
        clip(cv, spline(inner), () => wash(cv, spline(inner.slice(1, 4)), '#d98a92', 6, 0.5));
        line(cv, ear, 6, { start: 0.3, end: 0.3 });
      }
      const H = spline(head);
      lay(cv, H, FUR, 2.8);
      clip(cv, H, () => {
        brush(cv, [[368, 150], [380, 196], [360, 240], [330, 258]], 26, SHADE, 0.75, 'y');
        brush(cv, [[226, 240], [280, 262], [340, 256]], 18, SHADE, 0.7, 'x');
        wash(cv, blob(rnd, [262, 126], 54, 22, -4, 0.05), WARM, 10, 0.9);
        brush(cv, [[206, 168], [204, 200], [218, 230]], 14, LIGHT, 0.9, 'y');
        wash(cv, blob(rnd, [228, 210], 16, 10, 0, 0.05), PINK, 7, 0.45);
        wash(cv, blob(rnd, [326, 208], 20, 10, 0, 0.05), PINK, 7, 0.45);
        strokes(cv, rnd, H, [196, 96, 388, 264], { count: 40, colours: [SHADE, WARM], flow: (x) => (x < 280 ? -115 : -65), spread: 30, length: 10, width: 1.8,
          opacity: [0.3, 0.6] });
      });
      line(cv, crown, 6.2, { start: 0.4, end: 0.3, count: 40 });
      line(cv, cheekNear, 6, { start: 0.3, end: 0.4, count: 30 });
      line(cv, cheekFar, 6, { start: 0.4, end: 0.3, count: 40 });
      // Big dark eyes with two glints each keep the face a kitten's even at the smallest size.
      for (const [c, rx, ry] of [[[242, 172], 14, 17.5], [[306, 170], 17, 20]]) {
        cv.add(`<path d="${blob(rnd, c, rx, ry, 0, 0.03)}" fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}"/>`);
        cv.add(`<path d="${blob(rnd, [c[0] + rx * 0.1, c[1] + ry * 0.35], rx * 0.7, ry * 0.45, 0, 0.03)}" fill="#5a4a5e" fill-opacity="0.7"/>`);
        cv.add(`<circle cx="${c[0] - rx * 0.32}" cy="${c[1] - ry * 0.36}" r="${rx * 0.34}" fill="#fffaf0"/>`);
        cv.add(`<circle cx="${c[0] + rx * 0.38}" cy="${c[1] + ry * 0.3}" r="${rx * 0.14}" fill="#fffaf0" fill-opacity="0.85"/>`);
      }
      const nose = spline([[263, 198], [272, 197], [281, 199], [277, 205], [272, 209], [267, 205]]);
      cv.add(`<path d="${nose}" fill="${NOSE}" filter="${crayon(cv, rnd, { keep: 3.4, tear: 1, grain: 1.2 })}"/>`);
      line(cv, [[272, 209], [272, 215]], 2.8, { start: 0.8, end: 0.6 });
      line(cv, [[262, 218], [267, 221], [272, 215]], 2.8, { start: 0.4, end: 0.8, peak: 0.6 });
      line(cv, [[272, 215], [277, 221], [282, 218]], 2.8, { start: 0.8, end: 0.4, peak: 0.4 });
      cv.add('</g>');
      // The bow goes on last, over the chin and chest: two loops, a knot and two short ends cut in a notch.
      for (const part of [endL, endR, loopL, loopR]) {
        lay(cv, spline(part), RED, 2.8);
        clip(cv, spline(part), () => {
          brush(cv, [part[0], part[3]], 9, RED_DEEP, 0.7, 'x');
          brush(cv, [part[1], part[2]], 6, RED_LIT, 0.7, 'x');
        });
        line(cv, loop(part), 3.8, { start: 0.3, end: 0.3, count: 40 });
      }
      lay(cv, blob(rnd, KNOT, 9, 10, 0, 0.05), RED_DEEP, 2.8);
      line(cv, [[KNOT[0] - 8, KNOT[1] - 8], [KNOT[0] - 9, KNOT[1] + 3], [KNOT[0] - 3, KNOT[1] + 10]], 3.6, { start: 0.3, end: 0.3 });
      line(cv, [[KNOT[0] + 8, KNOT[1] - 8], [KNOT[0] + 9, KNOT[1] + 3], [KNOT[0] + 3, KNOT[1] + 10]], 3.6, { start: 0.3, end: 0.3 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
