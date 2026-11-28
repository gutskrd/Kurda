import { blob, crayon, painter, strokes, within } from '../brush.mjs';
import { along, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'pisik-qurdele',
  ku: 'Pisîka Bi Qurdele',
  en: 'Kitten with a bow',
  // a small fluffy cream kitten sitting square on to us, its big head on a little bell-shaped body, tufts of fur at its
  // cheeks, chest and tail, its plumed tail curling up at its side: soft toasted marks on its ears and brow, dot eyes
  // and a pink nose, and a red ribbon tied in a bow at its neck whose long tails trail and curl down beside it; painted
  // in warm creams with soft taupe shade and inked over in a soft dark pencil line that swells, thins and breaks
  still(rnd) {
    const s = new Still(rnd).place([12, 0], 1.15);
    const [FUR, SHADE, DEEP, WARM, LIGHT, MARK] = ['#fbf0e0', '#d8c0b2', '#b6998e', '#f1d9ba', '#fffaf2', '#b08a70'];
    const [PINK, NOSE] = ['#f2b0ae', '#e0837f'];
    const [RED, RED_DEEP, RED_LIT] = ['#c8352f', '#8e1f22', '#e8634f'];
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);
    const clip = (cv, d, draw) => {
      cv.add(`<g clip-path="${within(cv, d)}">`);
      draw();
      cv.add('</g>');
    };
    const seg = (P, i, j) => Array.from({ length: ((j - i + P.length) % P.length) + 1 }, (_, k) => P[(i + k) % P.length]);
    const loop = (P) => [...P, P[0], P[1]];
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
    // A tail or a ribbon along `pts`, as wide as `width(t)` at each point along it: its two sides.
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
      return { L, R, c };
    };
    // A ribbon's tail: it narrows where it twists and ends cut in a notch.
    const ribbon = (pts, w, twists) => {
      const t = tube(pts, (u) => w * (0.45 + 0.55 * Math.abs(Math.cos(u * Math.PI * twists))) * (1 - 0.1 * u));
      const notch = t.c.at(-3);
      return { ...t, d: spline([...t.L, notch, ...[...t.R].reverse()]), notch };
    };

    // The tail rises at the kitten's side from behind its haunch, a plume whose tip curls back toward the body.
    const TAIL = [[200, 424], [166, 430], [136, 416], [118, 388], [110, 356], [114, 326], [128, 304], [148, 296]];
    const tail = tube(TAIL, (u) => 30 + 22 * Math.sin(Math.PI * u) ** 0.7 - 6 * u);
    const tailIn = tufts(tail.L.filter((_, i) => i % 4 === 0), 6, -1, 2);
    const tailOut = tufts(tail.R.filter((_, i) => i % 4 === 0), 11, 1);
    const [tEnd, tBefore] = [20, 19].map((i) => [(tail.L[i][0] + tail.R[i][0]) / 2, (tail.L[i][1] + tail.R[i][1]) / 2]);
    const toward = Math.atan2(tEnd[1] - tBefore[1], tEnd[0] - tBefore[0]);
    const tailTip = [[75, 11], [35, 14], [0, 15], [-35, 14], [-75, 11]].map(([deg, r]) => [toward + (deg * Math.PI) / 180, r])
      .map(([a, r]) => [tEnd[0] + Math.cos(a) * r, tEnd[1] + Math.sin(a) * r]);
    const tailD = spline([...tailIn, ...tailTip, ...[...tailOut].reverse()]);
    // A little bell-shaped body under a big head: narrow at the neck, round at the haunches, flat where it sits.
    const SIDE = [[206, 256], [190, 282], [176, 312], [162, 346], [152, 380], [152, 410], [164, 432], [188, 442]];
    const sideL = tufts(SIDE, 6, -1, 1, 6);
    const sideR = tufts(SIDE.map(([x, y]) => [500 - x, y]), 6, 1, 1, 6);
    const body = [...sideL, [220, 446], [250, 448], [280, 446], ...[...sideR].reverse()];
    const bibL = tufts([[208, 262], [214, 290], [228, 314], [250, 336]], 7, -1);
    const bibR = tufts([[292, 262], [286, 290], [272, 314], [250, 336]], 7, 1);
    const bib = [...bibL, ...[...bibR].reverse().slice(1)];
    const legs = [[[232, 348], [230, 390], [228, 428]], [[268, 348], [270, 390], [272, 428]]];
    const haunches = [[[206, 350], [188, 384], [188, 414], [204, 436]], [[294, 350], [312, 384], [312, 414], [296, 436]]];
    const paws = [[222, 438], [278, 438]];
    // The head is a kitten's: wide at the cheeks, where the fur stands out in tufts, and round on top.
    const crown = tufts([[164, 176], [166, 146], [182, 120], [212, 104], [250, 100], [288, 104], [318, 120], [334, 146], [336, 176]], 5, 1, 3, 5);
    const cheekR = tufts([[336, 176], [352, 200], [350, 226], [332, 248], [300, 262], [272, 268]], 8, 1, 0, 4);
    const cheekL = tufts([[164, 176], [148, 200], [150, 226], [168, 248], [200, 262], [228, 268]], 8, -1, 0, 4);
    const head = [...crown, ...cheekR.slice(1), [250, 270], ...[...cheekL].reverse().slice(0, -1)];
    const earL = [[168, 164], [160, 122], [164, 86], [172, 62], [198, 78], [222, 96], [238, 110]];
    const earR = earL.map(([x, y]) => [500 - x, y]).reverse();
    const innerL = [[176, 142], [172, 110], [178, 82], [198, 94], [216, 108]];
    const innerR = innerL.map(([x, y]) => [500 - x, y]).reverse();
    // The ribbon: a band round the neck, a bow at the side of the chin, and two long tails trailing down.
    const band = [[196, 252], [236, 264], [272, 268], [304, 260], [308, 274], [272, 284], [234, 280], [194, 266]];
    const KNOT = [304, 266];
    const loopUp = [[302, 260], [318, 242], [340, 226], [364, 220], [380, 230], [374, 250], [350, 264], [318, 270]];
    const loopDown = [[306, 272], [326, 276], [350, 286], [366, 302], [354, 314], [330, 306], [310, 286]];
    const tailsOf = [ribbon([[298, 274], [290, 300], [294, 330], [306, 354], [320, 372]], 16, 1), ribbon([[312, 274], [338, 298], [356, 330], [364, 366],
      [360, 398], [364, 424], [380, 440], [398, 440], [406, 428]], 17, 1.5)];
    const D = Object.fromEntries(Object.entries({ body, bib, head, band, loopUp, loopDown }).map(([k, v]) => [k, spline(v)]));

    // Each part is inked as soon as it is painted, so the parts in front of it cover its line as they cover its paint.
    s.paint((cv) => {
      // The tail: warm on its lit side, taupe on the other, and toasted at its tip.
      lay(cv, tailD, FUR, 2.8);
      clip(cv, tailD, () => {
        brush(cv, tail.R.slice(2), 18, SHADE, 0.8, 'y');
        brush(cv, tail.L.slice(6, 18), 12, WARM, 0.7, 'y');
        wash(cv, blob(rnd, tEnd, 22, 20, 0, 0.05), MARK, 8, 0.65);
        strokes(cv, rnd, tailD, [76, 270, 210, 450], { count: 22, colours: [SHADE, LIGHT], flow: () => -80, spread: 40, length: 12, width: 2,
          opacity: [0.35, 0.7] });
      });
      line(cv, [...tailTip, ...[...tailOut].reverse()], 5, { start: 0.4, end: 0.3, count: 60 });
      line(cv, [...tailIn.slice(-12), tailTip[0]], 4.6, { start: 0.2, end: 0.4, count: 30 });
      // The body: taupe down the side away from the light, under the head and between the legs; warm light on the other side.
      lay(cv, D.body, FUR, 2.8);
      clip(cv, D.body, () => {
        brush(cv, [[314, 286], [342, 370], [334, 432]], 28, SHADE, 0.85, 'y');
        wash(cv, blob(rnd, [326, 420], 22, 30, 0, 0.05), DEEP, 10, 0.45);
        brush(cv, [[184, 300], [162, 370], [166, 420]], 20, WARM, 0.85, 'y');
        brush(cv, [[168, 434], [250, 448], [332, 434]], 14, SHADE, 0.7, 'x');
        wash(cv, spline([[238, 380], [262, 380], [262, 428], [250, 448], [238, 428]]), DEEP, 7, 0.55);
        wash(cv, spline([[200, 256], [250, 274], [300, 256], [296, 288], [250, 300], [204, 288]]), SHADE, 8, 0.8);
        for (const h of haunches) brush(cv, h, 12, SHADE, 0.55, 'y');
        strokes(cv, rnd, D.body, [150, 256, 350, 448], { count: 40, colours: [SHADE, SHADE, LIGHT], flow: (x) => (x < 250 ? 100 : 80), spread: 30, length: 12,
          width: 2, opacity: [0.35, 0.7] });
      });
      line(cv, sideL, 5.2, { start: 0.3, end: 0.5, count: 50 });
      line(cv, sideR, 5.2, { start: 0.3, end: 0.5, count: 50 });
      line(cv, [[176, 438], [220, 446], [240, 448]], 5, { start: 0.3, end: 0.2 });
      line(cv, [[260, 448], [280, 446], [324, 438]], 5, { start: 0.2, end: 0.3 });
      // The haunches and the front legs between them, down to two little paws.
      for (const h of haunches) line(cv, h, 4.4, { start: 0.1, end: 0.4, peak: 0.6 });
      for (const leg of legs) line(cv, leg, 4.6, { start: 0.1, end: 0.5, peak: 0.7 });
      for (const [x, y] of paws) {
        const paw = blob(rnd, [x, y], 18, 11, 0, 0.05);
        lay(cv, paw, FUR, 2.8);
        clip(cv, paw, () => wash(cv, blob(rnd, [x + 5, y + 6], 16, 6, 0, 0.05), SHADE, 4, 0.8));
        line(cv, [[x - 18, y + 4], [x - 13, y - 7], [x, y - 11], [x + 13, y - 7], [x + 18, y + 4]], 4.6, { start: 0.3, end: 0.3 });
        for (const dx of [-5, 5]) line(cv, [[x + dx, y - 1], [x + dx, y + 6]], 2.2, { start: 0.6, end: 0.3 });
      }
      // The chest fluff, light, in a soft point of tufts under the chin.
      lay(cv, D.bib, LIGHT, 2.4);
      clip(cv, D.bib, () => brush(cv, [[272, 270], [276, 300], [262, 326]], 12, SHADE, 0.45, 'y'));
      line(cv, bibL.slice(-6), 3.6, { start: 0.1, end: 0.4, count: 30 });
      line(cv, bibR.slice(-6), 3.6, { start: 0.1, end: 0.4, count: 30 });
      // The band goes on before the head, so the chin sits over it.
      lay(cv, D.band, RED, 2.8);
      clip(cv, D.band, () => brush(cv, [[196, 264], [250, 278], [310, 272]], 8, RED_DEEP, 0.7, 'x'));
      line(cv, seg(band, 4, 7), 4, { start: 0.3, end: 0.3 });
      // The ears, pink inside with pale tufts, and toasted at their tips.
      for (const [ear, inner, tip] of [[earL, innerL, earL[3]], [earR, innerR, earR[3]]]) {
        lay(cv, spline(ear), FUR, 2.8);
        clip(cv, spline(ear), () => wash(cv, blob(rnd, tip, 24, 24, 0, 0.05), MARK, 6, 0.85));
        lay(cv, spline(inner), PINK, 2.4);
        clip(cv, spline(inner), () => {
          wash(cv, spline(inner.slice(1, 4)), '#d98a92', 6, 0.5);
          const mid = [(inner[0][0] + inner[4][0]) / 2, (inner[0][1] + inner[4][1]) / 2];
          for (const k of [0, 4]) brush(cv, [inner[k], [mid[0], mid[1] - 22]], 4, LIGHT, 0.9, 'y');
        });
        line(cv, ear, 5, { start: 0.3, end: 0.3 });
      }
      // The head: taupe under the chin and down the far cheek, warm light over the brow, soft tabby marks on top.
      lay(cv, D.head, FUR, 2.8);
      clip(cv, D.head, () => {
        brush(cv, [[334, 150], [350, 204], [330, 246], [300, 262]], 26, SHADE, 0.85, 'y');
        brush(cv, [[200, 256], [250, 270], [300, 258]], 14, SHADE, 0.7, 'x');
        wash(cv, blob(rnd, [226, 128], 46, 20, -10, 0.05), WARM, 10, 0.9);
        brush(cv, [[166, 164], [156, 204], [172, 238]], 14, LIGHT, 0.9, 'y');
        for (const [pts, w] of [
          [[[234, 106], [238, 124]], 6], [[[250, 102], [250, 122]], 6.5], [[[266, 106], [262, 124]], 6],
          [[[160, 190], [174, 192]], 5], [[[158, 208], [172, 208]], 5], [[[340, 190], [326, 192]], 5], [[[342, 208], [328, 208]], 5],
        ]) brush(cv, pts, w, MARK, 0.6, 'y');
        wash(cv, blob(rnd, [198, 220], 16, 9, 0, 0.05), PINK, 6, 0.6);
        wash(cv, blob(rnd, [302, 220], 16, 9, 0, 0.05), PINK, 6, 0.6);
        strokes(cv, rnd, D.head, [148, 98, 352, 270], { count: 36, colours: [SHADE, WARM], flow: (x) => (x < 250 ? -115 : -65), spread: 30, length: 10, width: 1.8,
          opacity: [0.3, 0.6] });
      });
      line(cv, crown, 5.4, { start: 0.4, end: 0.3, count: 40 });
      line(cv, cheekR, 5, { start: 0.3, end: 0.4, count: 50 });
      line(cv, cheekL, 5, { start: 0.3, end: 0.4, count: 50 });
      // Dot eyes, a little glint in each, and a small pink nose over a soft mouth.
      for (const [x, y] of [[214, 194], [286, 194]]) {
        cv.add(`<path d="${blob(rnd, [x, y], 10, 11.5, 0, 0.04)}" fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}"/>`);
        cv.add(`<circle cx="${x - 3.4}" cy="${y - 3.8}" r="3.3" fill="#fffaf0"/>`);
        cv.add(`<circle cx="${x + 3.8}" cy="${y + 4}" r="1.4" fill="#fffaf0" fill-opacity="0.85"/>`);
      }
      const nose = spline([[241, 212], [250, 210], [259, 212], [255, 218], [250, 222], [245, 218]]);
      cv.add(`<path d="${nose}" fill="${NOSE}" filter="${crayon(cv, rnd, { keep: 3.4, tear: 1, grain: 1.2 })}"/>`);
      line(cv, [[250, 222], [250, 228]], 2.6, { start: 0.8, end: 0.6 });
      line(cv, [[240, 231], [245, 234], [250, 228]], 2.6, { start: 0.4, end: 0.8, peak: 0.6 });
      line(cv, [[250, 228], [255, 234], [260, 231]], 2.6, { start: 0.8, end: 0.4, peak: 0.4 });
      // The bow last, over the chin and chest: its tails first, then its loops and the knot that holds them.
      for (const r of tailsOf) {
        lay(cv, r.d, RED, 2.8);
        clip(cv, r.d, () => {
          brush(cv, r.R, 7, RED_DEEP, 0.7, 'y');
          brush(cv, r.L.slice(2, 14), 5, RED_LIT, 0.7, 'y');
        });
        line(cv, r.L, 3.6, { start: 0.3, end: 0.3, count: 40 });
        line(cv, [r.L.at(-1), r.notch, r.R.at(-1), ...[...r.R].reverse()], 3.6, { start: 0.3, end: 0.3, count: 40 });
      }
      for (const [P, d] of [[loopUp, D.loopUp], [loopDown, D.loopDown]]) {
        lay(cv, d, RED, 2.8);
        clip(cv, d, () => {
          brush(cv, P.slice(4), 10, RED_DEEP, 0.75, 'x');
          brush(cv, P.slice(1, 4), 6, RED_LIT, 0.75, 'x');
        });
        line(cv, loop(P), 3.6, { start: 0.3, end: 0.3, count: 40 });
      }
      lay(cv, blob(rnd, KNOT, 10, 11, 0, 0.05), RED_DEEP, 2.8);
      line(cv, [[KNOT[0] - 8, KNOT[1] - 9], [KNOT[0] - 10, KNOT[1] + 2], [KNOT[0] - 4, KNOT[1] + 11]], 3.2, { start: 0.3, end: 0.3 });
      line(cv, [[KNOT[0] + 8, KNOT[1] - 9], [KNOT[0] + 10, KNOT[1] + 2], [KNOT[0] + 4, KNOT[1] + 11]], 3.2, { start: 0.3, end: 0.3 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
