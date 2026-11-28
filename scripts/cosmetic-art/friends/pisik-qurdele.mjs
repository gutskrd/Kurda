import { blob, crayon, crescent, painter, strokes } from '../brush.mjs';
import { along, pt, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'pisik-qurdele',
  ku: 'Pisîka Bi Qurdele',
  en: 'Kitten with a bow',
  // A small fluffy cream kitten sitting square on to us, fur feathering out at its cheeks, chest and sides and its
  // plumed tail curled round in front of its paws, with a red ribbon tied in a bow at its neck whose long tails trail
  // and curl down beside it.
  still(rnd) {
    const s = new Still(rnd).place([2, -20], 0.97);
    const [FUR, LIGHT, WARM, SHADE, DEEP, MARK] = ['#f9eedc', '#fffaf1', '#f3dfc2', '#d6bdac', '#b39586', '#c49b7c'];
    const [PINK, NOSE] = ['#f2b3ad', '#dc827d'];
    const [RED, RED_DEEP, RED_LIT, RED_HI] = ['#c8372f', '#8a2124', '#e2584a', '#f39581'];
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);
    const mirror = (P) => P.map(([x, y]) => [492 - x, y]);
    // A part's paint is its own outline and the fur standing off it, laid together and shaded together.
    const clipAll = (cv, ds, draw) => {
      const id = cv.id('in');
      cv.def(`<clipPath id="${id}">${ds.map((d) => `<path d="${d}"/>`).join('')}</clipPath>`);
      cv.add(`<g clip-path="url(#${id})">`);
      draw();
      cv.add('</g>');
    };
    const layAll = (cv, ds, fill, keep = 2.6) =>
      cv.add(`<g fill="${fill}" filter="${crayon(cv, rnd, { keep, tear: 2, grain: 0.9 })}">${ds.map((d) => `<path d="${d}"/>`).join('')}</g>`);
    // Fur at an edge through `P` is a fringe of locks that curve out by about `amp` to fine points leaning along the edge
    // by `lean`, as fur lies; each lock gets one pencil flick out to its point. `side` 1 puts the fringe to the left.
    const fur = (P, { side, amp, lean = 0.6, count = 6, taper = () => 1 }) => {
      const c = along(P, count);
      const [outer, inner, flicks] = [[], [], []];
      const q = (a, m, b, u) => [0, 1].map((j) => (1 - u) * (1 - u) * a[j] + 2 * u * (1 - u) * m[j] + u * u * b[j]);
      for (let i = 0; i < c.length - 1; i++) {
        const [a, b] = [c[i], c[i + 1]];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const [tx, ty] = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
        const [nx, ny] = [ty * side, -tx * side];
        const k = amp * taper(i / Math.max(1, c.length - 2)) * (0.6 + rnd() * 0.7);
        const at = (o, g) => [a[0] + nx * o + tx * g, a[1] + ny * o + ty * g];
        const [ctrl, tip, under] = [at(k * 1.05, l * 0.3), at(k, l * (0.8 + 0.35 * lean)), at(k * 0.45, l * 1.02)];
        if (i === 0) outer.push(`M${pt(at(-1, 0))}`);
        outer.push(`Q${pt(ctrl)} ${pt(tip)} Q${pt(under)} ${pt([b[0] - nx, b[1] - ny])}`);
        inner.push(at(-14, 0));
        flicks.push([0, 0.2, 0.4, 0.6, 0.8, 1].map((u) => q(at(-1, 0), ctrl, tip, u)));
      }
      const last = c.at(-1);
      const end = c.at(-2);
      const l = Math.hypot(last[0] - end[0], last[1] - end[1]) || 1;
      inner.push([last[0] - ((last[1] - end[1]) / l) * side * 14, last[1] + ((last[0] - end[0]) / l) * side * 14]);
      const d = `${outer.join(' ')} L${[...inner].reverse().map(pt).join(' L')} Z`;
      return { locks: [d], flicks };
    };
    const flick = (cv, f, w) => line(cv, f, w, { start: 0.75, end: 0.03, peak: 0.3, tremble: 0.12, count: 16 });
    // A tail or a ribbon along `pts` is drawn from its two sides, `width(t)` apart at each point along it.
    const tube = (pts, width, count = 24) => {
      const c = along(pts, count);
      const [L, R] = [[], []];
      c.forEach((p, i) => {
        const [a, b] = [c[Math.max(0, i - 1)], c[Math.min(c.length - 1, i + 1)]];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const w = width(i / (c.length - 1)) / 2;
        L.push([p[0] - ((b[1] - a[1]) / l) * w, p[1] + ((b[0] - a[0]) / l) * w]);
        R.push([p[0] + ((b[1] - a[1]) / l) * w, p[1] - ((b[0] - a[0]) / l) * w]);
      });
      return { L, R, c };
    };

    // The head is round on top and widest at the cheeks, where the fur stands out in soft locks.
    const HEAD = [[166, 250], [149, 228], [143, 198], [146, 168], [158, 142], [180, 118], [210, 101], [246, 95], [282, 101], [312, 118], [334, 142], [346, 168],
      [349, 198], [343, 228], [326, 250], [294, 266], [246, 272], [198, 266]];
    const CHEEK = [[148, 162], [143, 190], [145, 216], [154, 236], [170, 252]];
    const cheeks = [fur(CHEEK, { side: -1, amp: 11, lean: 0.6, count: 4, taper: (u) => 0.35 + Math.sin(Math.PI * u) * 0.85 }),
      fur(mirror(CHEEK), { side: 1, amp: 11, lean: 0.6, count: 4, taper: (u) => 0.35 + Math.sin(Math.PI * u) * 0.85 })];
    const crownTuft = fur([[236, 97], [246, 95], [256, 97]], { side: 1, amp: 7, lean: 0.3, count: 2 });
    const EAR = [[160, 160], [152, 124], [154, 90], [161, 64], [169, 52], [180, 55], [204, 72], [226, 92], [238, 108]];
    const EAR_IN = [[171, 140], [167, 108], [170, 80], [177, 68], [196, 84], [216, 102]];
    // The little body sits under the big head, widest at the haunches, with fur feathering its sides.
    const BODY = [[188, 248], [170, 280], [155, 316], [143, 356], [135, 394], [137, 424], [156, 446], [204, 458], [246, 460], [288, 458], [336, 446],
      [355, 424], [357, 394], [349, 356], [337, 316], [322, 280], [304, 248], [246, 240]];
    const SIDE = [[178, 268], [163, 300], [150, 336], [139, 372], [135, 402]];
    const sides = [fur(SIDE, { side: -1, amp: 6, lean: 0.7, count: 4 }), fur(mirror(SIDE), { side: 1, amp: 6, lean: 0.7, count: 4 })];
    // The paler chest fluff comes down to a soft point under the chin.
    const BIB = [[198, 258], [246, 264], [294, 258], [292, 282], [278, 304], [262, 324], [246, 342], [230, 324], [214, 304], [200, 282]];
    const BIB_EDGE = [[200, 280], [214, 304], [230, 324], [246, 344]];
    const bib = [fur(BIB_EDGE, { side: -1, amp: 7, lean: 0.6, count: 3 }), fur(mirror(BIB_EDGE), { side: 1, amp: 7, lean: 0.6, count: 3 })];
    const paws = [[220, 444], [272, 444]];
    // The tail comes round from behind the left haunch and lies along the ground in front of the paws, its tip turned up.
    const TAIL = [[176, 410], [146, 418], [122, 434], [114, 454], [130, 468], [170, 474], [218, 474], [264, 471], [304, 464], [334, 454], [352, 440]];
    const tail = tube(TAIL, (u) => 32 + 12 * Math.sin(Math.PI * u) - 4 * u);
    const tailOut = fur(tail.L.slice(3), { side: -1, amp: 6, lean: 0.8, count: 9 });
    const tEnd = tail.c.at(-1);
    const tailTip = fur([tail.L.at(-1), [tEnd[0] + 12, tEnd[1] - 8], [tEnd[0] + 6, tEnd[1] - 20], tail.R.at(-1)], { side: -1, amp: 7, lean: 0.8, count: 4 });
    const tailD = spline([...tail.L, [tEnd[0] + 12, tEnd[1] - 8], [tEnd[0] + 6, tEnd[1] - 20], ...[...tail.R].reverse()]);
    // The ribbon is a band round the neck, a bow at its side with two folded loops, and two long tails.
    const KNOT = [302, 272];
    const BAND = [[180, 248], [246, 270], [300, 264], [304, 280], [246, 290], [170, 270]];
    const LOOP_UP = [[300, 262], [320, 246], [346, 226], [370, 213], [390, 214], [400, 230], [394, 250], [370, 262], [338, 272], [312, 278]];
    const LOOP_UP_IN = [[326, 268], [352, 257], [378, 246], [393, 240], [392, 251], [378, 259], [350, 267]];
    const LOOP_DOWN = [[308, 280], [334, 286], [358, 298], [376, 314], [378, 332], [364, 340], [342, 330], [320, 306], [306, 290]];
    const LOOP_DOWN_IN = [[322, 290], [344, 299], [364, 312], [375, 326], [366, 322], [346, 308]];
    const ribbon = (pts, w, twists) => {
      const t = tube(pts, (u) => w * (0.4 + 0.6 * Math.abs(Math.cos(u * Math.PI * twists))) * (1 - 0.1 * u), 28);
      const notch = t.c.at(-3);
      return { ...t, d: spline([...t.L, notch, ...[...t.R].reverse()]), notch };
    };
    const tails = [
      ribbon([[296, 284], [288, 314], [294, 344], [308, 366], [322, 378]], 18, 1),
      ribbon([[312, 286], [336, 316], [354, 350], [364, 382], [374, 406], [390, 420], [406, 418], [412, 404], [404, 394]], 19, 1.5),
    ];

    s.paint((cv) => {
      // The body is taupe down the side away from the light, under the head and between the legs, and lit on the other side.
      const body = [spline(BODY), ...sides.flatMap((f) => f.locks)];
      layAll(cv, body, FUR);
      clipAll(cv, body, () => {
        crescent(cv, body[0], [-16, -14], { colour: SHADE, opacity: 0.75, soft: 9 });
        brush(cv, [[320, 280], [354, 360], [346, 440]], 38, SHADE, 0.85, 'y');
        wash(cv, blob(rnd, [336, 418], 24, 34, 0, 0.05), DEEP, 12, 0.4);
        brush(cv, [[174, 296], [150, 360], [152, 420]], 24, LIGHT, 0.8, 'y');
        wash(cv, spline([[176, 250], [246, 264], [300, 250], [304, 296], [246, 306], [172, 292]]), SHADE, 10, 0.75);
        wash(cv, spline([[236, 384], [256, 384], [258, 440], [246, 456], [234, 440]]), DEEP, 8, 0.5);
        for (const [pts, o] of [[[[184, 362], [164, 396], [168, 436]], 0.4], [[[308, 362], [328, 396], [324, 436]], 0.6]]) brush(cv, pts, 16, SHADE, o, 'y');
        strokes(cv, rnd, body[0], [138, 260, 356, 456], { count: 36, colours: [SHADE, SHADE, LIGHT], flow: (x) => (x < 246 ? 100 : 80), spread: 24, length: 12,
          width: 1.8, opacity: [0.3, 0.6] });
      });
      for (const f of sides) for (const k of f.flicks) flick(cv, k, 3.6);
      line(cv, [[357, 398], [352, 424], [334, 446], [300, 458]], 5, { start: 0.3, end: 0.2 });
      line(cv, [[135, 398], [138, 424], [150, 440]], 4.8, { start: 0.3, end: 0.3 });
      // The round haunches frame the front legs, which come down to two little paws.
      line(cv, [[186, 360], [166, 388], [162, 414], [170, 438]], 3.8, { start: 0.1, end: 0.4, peak: 0.6 });
      line(cv, mirror([[186, 360], [166, 388], [162, 414], [170, 438]]), 4, { start: 0.1, end: 0.4, peak: 0.6 });
      line(cv, [[203, 382], [200, 408], [201, 432]], 3.6, { start: 0.1, end: 0.5, peak: 0.7 });
      line(cv, [[289, 382], [292, 408], [291, 432]], 3.6, { start: 0.1, end: 0.5, peak: 0.7 });
      line(cv, [[246, 392], [246, 414], [245, 434]], 3.4, { start: 0.1, end: 0.6, peak: 0.7 });
      for (const [x, y] of paws) {
        const paw = blob(rnd, [x, y], 22, 12, 0, 0.04);
        lay(cv, paw, FUR, 2.8);
        clipAll(cv, [paw], () => {
          wash(cv, blob(rnd, [x + 6, y + 6], 18, 6, 0, 0.05), SHADE, 4, 0.8);
          wash(cv, blob(rnd, [x - 6, y - 5], 12, 4, 0, 0.05), LIGHT, 3, 0.9);
        });
        line(cv, [[x - 22, y + 4], [x - 16, y - 8], [x, y - 12], [x + 16, y - 8], [x + 22, y + 4]], 4.2, { start: 0.3, end: 0.3 });
        for (const dx of [-6, 6]) line(cv, [[x + dx, y - 1], [x + dx * 0.9, y + 7]], 2.2, { start: 0.7, end: 0.2 });
      }
      // The chest fluff is shaded a little on the far side.
      const bibD = [spline(BIB), ...bib.flatMap((f) => f.locks)];
      layAll(cv, bibD, LIGHT, 2.4);
      clipAll(cv, bibD, () => {
        brush(cv, [[276, 270], [280, 300], [262, 330]], 12, SHADE, 0.4, 'y');
        strokes(cv, rnd, bibD[0], [200, 262, 292, 344], { count: 14, colours: [SHADE], flow: (x) => (x < 246 ? 70 : 110), spread: 20, length: 10, width: 1.6,
          opacity: [0.3, 0.5] });
      });
      for (const f of bib) for (const k of f.flicks) flick(cv, k, 2.5);
      // The tail is kept out of the haunch it comes round from behind; it is shaded beneath, lit on top and toasted at the tip.
      const hole = spline([[136, 372], [134, 404], [138, 426], [150, 440], [180, 446], [214, 428], [204, 372]]);
      const away = cv.id('away');
      cv.def(`<clipPath id="${away}"><path clip-rule="evenodd" d="M-200 -200 H712 V712 H-200 Z ${hole}"/></clipPath>`);
      cv.add(`<g clip-path="url(#${away})">`);
      const tailAll = [tailD, ...tailOut.locks, ...tailTip.locks];
      layAll(cv, tailAll, FUR);
      clipAll(cv, tailAll, () => {
        brush(cv, tail.L.slice(2), 20, SHADE, 0.8, 'x');
        brush(cv, tail.R.slice(6, 22), 12, LIGHT, 0.7, 'x');
        wash(cv, blob(rnd, tEnd, 22, 20, 0, 0.05), MARK, 9, 0.5);
        strokes(cv, rnd, tailD, [104, 400, 350, 504], { count: 28, colours: [SHADE, LIGHT], flow: (x) => (x < 150 ? 100 : x > 310 ? -60 : 0), spread: 20,
          length: 12, width: 1.6, opacity: [0.35, 0.6] });
      });
      for (const k of [...tailOut.flicks, ...tailTip.flicks]) flick(cv, k, 3.8);
      line(cv, tail.R.slice(8, 15), 4, { start: 0.2, end: 0.2 });
      line(cv, tail.R.slice(16), 4.2, { start: 0.2, end: 0.5 });
      cv.add('</g>');
      // The band goes on before the head so the chin sits over it, and is kept to the neck so it turns out of sight.
      clipAll(cv, [spline(BODY)], () => {
        lay(cv, spline(BAND), RED, 2.8);
        clipAll(cv, [spline(BAND)], () => brush(cv, [[172, 268], [246, 288], [304, 280]], 7, RED_DEEP, 0.7, 'x'));
        line(cv, [[172, 270], [246, 290], [296, 282]], 3.4, { start: 0.6, end: 0.3 });
      });
      // The ears are pink inside with pale locks, and toasted at their tips and down their backs.
      for (const X of [(P) => P, mirror]) {
        const ear = spline(X(EAR));
        lay(cv, ear, FUR, 2.8);
        clipAll(cv, [ear], () => {
          wash(cv, blob(rnd, X([[168, 60]])[0], 22, 26, 0, 0.05), MARK, 7, 0.75);
          brush(cv, X([[158, 120], [156, 92], [162, 66]]), 8, MARK, 0.5, 'y');
        });
        const inner = spline(X(EAR_IN));
        lay(cv, inner, PINK, 2.4);
        clipAll(cv, [inner], () => {
          wash(cv, spline(X(EAR_IN.slice(1, 5))), '#d98a92', 7, 0.45);
          for (const [a, b] of [[[172, 142], [180, 106]], [[184, 140], [186, 112]], [[204, 118], [192, 100]]]) brush(cv, X([a, b]), 4, LIGHT, 0.9, 'y');
        });
        line(cv, X([[160, 156], [152, 122], [155, 88], [162, 62], [170, 52]]), 5, { start: 0.3, end: 0.5 });
        line(cv, X([[172, 53], [186, 58], [206, 74], [228, 96]]), 4.6, { start: 0.5, end: 0.2 });
      }
      // The head is taupe under the chin and down the far cheek, lit over the brow, with soft toasted marks on top.
      const head = [spline(HEAD), ...cheeks.flatMap((f) => f.locks), ...crownTuft.locks];
      layAll(cv, head, FUR);
      clipAll(cv, head, () => {
        wash(cv, spline([[150, 226], [196, 258], [246, 268], [300, 258], [344, 226], [350, 270], [246, 292], [144, 270]]), SHADE, 8, 0.65);
        brush(cv, [[336, 146], [354, 204], [334, 250], [300, 268]], 30, SHADE, 0.8, 'y');
        wash(cv, spline([[200, 258], [246, 268], [294, 258], [290, 274], [246, 282], [202, 274]]), SHADE, 6, 0.6);
        wash(cv, blob(rnd, [222, 130], 52, 24, -10, 0.05), LIGHT, 10, 0.95);
        brush(cv, [[162, 160], [154, 204], [170, 240]], 14, WARM, 0.5, 'y');
        for (const [pts, w] of [
          [[[234, 104], [237, 124]], 6], [[[246, 101], [246, 124]], 6.5], [[[258, 104], [255, 124]], 6],
          [[[160, 186], [172, 188]], 4.5], [[[158, 200], [170, 200]], 4.5], [[[332, 186], [320, 188]], 4.5], [[[334, 200], [322, 200]], 4.5],
        ]) brush(cv, pts, w, MARK, 0.5, 'y');
        wash(cv, blob(rnd, [194, 224], 16, 9, 0, 0.05), PINK, 6, 0.6);
        wash(cv, blob(rnd, [298, 224], 16, 9, 0, 0.05), PINK, 6, 0.6);
        strokes(cv, rnd, head[0], [142, 94, 350, 272], { count: 36, colours: [SHADE, LIGHT], flow: (x) => (x < 246 ? -110 : -70), spread: 30, length: 10,
          width: 1.6, opacity: [0.3, 0.55] });
      });
      line(cv, [[148, 168], [156, 144], [176, 120], [208, 102], [234, 97]], 5, { start: 0.3, end: 0.1 });
      line(cv, [[166, 250], [188, 262], [214, 269]], 3.6, { start: 0.6, end: 0.1 });
      line(cv, [[262, 98], [286, 103], [314, 120], [334, 144], [344, 168]], 5.2, { start: 0.2, end: 0.3 });
      for (const f of cheeks) for (const k of f.flicks) flick(cv, k, 4.2);
      for (const k of crownTuft.flicks) flick(cv, k, 3);
      // The face is dark eyes with a glint in each, and a small pink nose over a soft mouth.
      for (const [x, y] of [[210, 196], [282, 196]]) {
        cv.add(`<path d="${blob(rnd, [x, y], 11, 12.5, 0, 0.04)}" fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}"/>`);
        cv.add(`<circle cx="${x - 3.6}" cy="${y - 4.2}" r="3.6" fill="#fffaf0"/>`);
        cv.add(`<circle cx="${x + 4}" cy="${y + 4.4}" r="1.5" fill="#fffaf0" fill-opacity="0.85"/>`);
      }
      const nose = spline([[237, 214], [246, 212], [255, 214], [251, 220], [246, 224], [241, 220]]);
      cv.add(`<path d="${nose}" fill="${NOSE}" filter="${crayon(cv, rnd, { keep: 3.4, tear: 1, grain: 1.2 })}"/>`);
      line(cv, [[246, 224], [246, 230]], 2.4, { start: 0.8, end: 0.6 });
      line(cv, [[236, 232], [241, 235.5], [246, 230]], 2.4, { start: 0.4, end: 0.8, peak: 0.6 });
      line(cv, [[246, 230], [251, 235.5], [256, 232]], 2.4, { start: 0.8, end: 0.4, peak: 0.4 });
      // The bow goes last, over the chin and chest: its tails, then its loops, each lit on top and dark inside where it
      // turns over, then the knot that holds them.
      lay(cv, blob(rnd, [303, 282], 10, 8, 0, 0.05), RED_DEEP, 2.8);
      for (const r of tails) {
        lay(cv, r.d, RED, 2.8);
        clipAll(cv, [r.d], () => {
          brush(cv, r.R, 7, RED_DEEP, 0.7, 'y');
          brush(cv, r.L.slice(2, 16), 5, RED_LIT, 0.8, 'y');
        });
        line(cv, r.L, 3.6, { start: 0.3, end: 0.3, count: 40 });
        line(cv, [r.L.at(-1), r.notch, r.R.at(-1), ...[...r.R].reverse()], 3.6, { start: 0.3, end: 0.3, count: 40 });
      }
      for (const [P, IN, fold] of [[LOOP_UP, LOOP_UP_IN, LOOP_UP_IN.slice(0, 4)], [LOOP_DOWN, LOOP_DOWN_IN, LOOP_DOWN_IN.slice(3).reverse()]]) {
        const d = spline(P);
        lay(cv, d, RED, 2.8);
        clipAll(cv, [d], () => {
          brush(cv, P.slice(-4), 12, RED_DEEP, 0.6, 'x');
          wash(cv, blob(rnd, P[0], 18, 14, 0, 0.05), RED_DEEP, 7, 0.75);
          brush(cv, P.slice(1, 5), 9, RED_LIT, 0.85, 'x');
          brush(cv, P.slice(2, 4), 4, RED_HI, 0.85, 'x');
          lay(cv, spline(IN), RED_DEEP, 2.6);
          wash(cv, spline(IN), '#6e1719', 4, 0.5);
        });
        line(cv, [...P, P[0]], 3.8, { start: 0.3, end: 0.3, count: 44 });
        line(cv, fold, 2.4, { start: 0.1, end: 0.5 });
      }
      const knot = blob(rnd, KNOT, 11, 12, 0, 0.05);
      lay(cv, knot, RED, 2.8);
      clipAll(cv, [knot], () => {
        wash(cv, blob(rnd, [KNOT[0] + 4, KNOT[1] + 5], 9, 8, 0, 0.05), RED_DEEP, 4, 0.8);
        wash(cv, blob(rnd, [KNOT[0] - 4, KNOT[1] - 5], 5, 4, 0, 0.05), RED_HI, 3, 0.8);
      });
      line(cv, [[KNOT[0] - 8, KNOT[1] - 10], [KNOT[0] - 11, KNOT[1] + 2], [KNOT[0] - 4, KNOT[1] + 12]], 3.4, { start: 0.3, end: 0.3 });
      line(cv, [[KNOT[0] + 8, KNOT[1] - 10], [KNOT[0] + 11, KNOT[1] + 2], [KNOT[0] + 4, KNOT[1] + 12]], 3.4, { start: 0.3, end: 0.3 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
