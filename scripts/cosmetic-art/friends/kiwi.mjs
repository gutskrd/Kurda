import { blob, crayon, dry, mark, painter, softly, strokes, within } from '../brush.mjs';
import { along, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'kiwi',
  ku: 'Kîwî',
  en: 'Kiwi',
  // a round kiwi facing right on a little patch of ground, its long pale beak bent down to probe the earth: painted in
  // warm browns with fine hair-like feathers brushed over it, darker along its back and lighter beneath, a small dark
  // eye and a few bristles at the root of the beak, and sturdy pale legs with long toes spread on the ground
  still(rnd) {
    const s = new Still(rnd).place([-20, -24], 1.04);
    const COAT = '#a8703f';
    const BACK = '#7a4526';
    const DEEP = '#52301b';
    const UNDER = '#d2a473';
    const PALE = '#ecca98';
    const [BEAK, BEAK_SHADE] = ['#eadbbb', '#c4a77c'];
    const [LEG, LEG_SHADE, CLAW] = ['#dcc7a6', '#b09676', '#5e4836'];
    const [EARTH, EARTH_DEEP, MOSS] = ['#7d6241', '#5a4329', '#8c9a52'];
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);

    const body = spline([[376, 170], [398, 182], [412, 202], [414, 226], [402, 244], [388, 258], [390, 292], [382, 336], [360, 376], [316, 404], [256, 416],
      [192, 410], [134, 386], [90, 346], [66, 292], [62, 236], [76, 180], [110, 132], [160, 100], [220, 86], [278, 92], [322, 116], [342, 140], [354, 162]]);
    const ground = blob(rnd, [300, 458], 190, 21, 0, 0.06, 32);
    // the beak, broad at its root and bent down to a fine tip in the earth; its two edges, for the line
    const bill = [[404, 216], [430, 246], [448, 290], [459, 340], [466, 392], [471, 452]];
    const beak = mark(rnd, bill, 26, { start: 1, end: 0.24, peak: 0.02, tremble: 0.03, count: 40 });
    const middle = along(bill, 30);
    const edge = (k) => middle.map((q, i) => {
      const [a, b] = [middle[Math.max(0, i - 1)], middle[Math.min(30, i + 1)]];
      const w = (k * 13 * (1 - 0.76 * (i / 30))) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
      return [q[0] - (b[1] - a[1]) * w, q[1] + (b[0] - a[0]) * w];
    });
    // a sturdy leg from the feathers down to the ground, and its toes: three long ones spread forward, a short one back
    const leg = (top, ankle, ends) => ({
      top,
      ankle,
      shank: mark(rnd, [top, [(top[0] + ankle[0]) / 2, (top[1] + ankle[1]) / 2], ankle], 38, { start: 1, end: 0.7, peak: 0.1, tremble: 0.05 }),
      toes: ends.map(([dx, dy]) => [ankle, [ankle[0] + dx * 0.5, ankle[1] + dy * 0.4], [ankle[0] + dx, ankle[1] + dy]]),
    });
    const legs = [
      leg([246, 398], [242, 438], [[52, 6], [40, 17], [10, 19], [-16, 6]]),
      leg([312, 392], [320, 440], [[64, 7], [50, 22], [16, 27], [-20, 8]]),
    ];

    s.paint((cv) => {
      // the patch of ground: earth, darker under the bird, a little moss at its edges, and a hollow where the beak probes
      lay(cv, ground, EARTH, 2.4);
      cv.add(`<g clip-path="${within(cv, ground)}">`);
      wash(cv, blob(rnd, [280, 452], 120, 14, 0, 0.05), EARTH_DEEP, 8, 0.7);
      for (const [pts, w] of [[[[120, 466], [150, 470], [180, 472]], 12], [[[424, 456], [452, 460], [484, 462]], 10], [[[340, 476], [380, 476]], 8]]) {
        brush(cv, pts, w, MOSS, 0.7, 'x');
      }
      const crumbs = { count: 36, colours: ['#c9a878', EARTH_DEEP], spread: 40, length: 8, width: 2.2, opacity: [0.3, 0.7], bend: 0.3 };
      strokes(cv, rnd, ground, [106, 436, 494, 480], crumbs);
      wash(cv, blob(rnd, [470, 456], 16, 6, 0, 0.05), DEEP, 3, 0.85);
      cv.add('</g>');

      // the legs, their tops hidden in the feathers, shaded down their backs and creased across above the foot, the far
      // one in shade; the toes spread on the earth
      for (const [i, l] of legs.entries()) {
        const [tone, shade] = i === 0 ? [LEG_SHADE, '#927759'] : [LEG, LEG_SHADE];
        const [ax, ay] = l.ankle;
        lay(cv, l.shank, tone, 2.5);
        cv.add(`<g clip-path="${within(cv, l.shank)}">`);
        brush(cv, [[l.top[0] - 12, l.top[1]], [ax - 12, ay]], 14, shade, 0.6, 'y');
        for (const up of [18, 8]) brush(cv, [[ax - 16, ay - up], [ax + 16, ay - up + 2]], 3, shade, 0.6, 'x');
        cv.add('</g>');
        for (const toe of l.toes) lay(cv, mark(rnd, toe, 14, { start: 1, end: 0.4, peak: 0.1, tremble: 0.08 }), tone, 2.5);
      }

      // the body: its back darker, its underside lighter, its rump and belly in shade, the head a little darker
      lay(cv, body, COAT);
      cv.add(`<g clip-path="${within(cv, body)}">`);
      // (each tone dragged on with a dry brush in streaks that run down with the hair, fading out over `fade` where it
      // gives way to the next; the paint reaches `reach` past its edge, down or up, so that only the fade ends it)
      const dragged = (d, colour, opacity, fade, reach = fade) => {
        const m = cv.id('fade');
        const streaked = dry(cv, rnd, { along: 'y', keep: 2.3, tear: 4, streak: 0.22 });
        cv.def(`<mask id="${m}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">`
          + `<path d="${d}" fill="#fff" filter="${softly(cv, fade)}"/></mask>`);
        cv.add(`<g mask="url(#${m})"><path d="${d}" fill="${colour}" fill-opacity="${opacity}" transform="translate(0 ${reach})" filter="${streaked}"/></g>`);
      };
      const backEdge = [[50, 300], [96, 236], [150, 192], [214, 170], [282, 164], [340, 176], [372, 200], [420, 214]];
      dragged(spline([...backEdge, [440, 50], [40, 50]]), BACK, 0.95, 16);
      dragged(spline([...backEdge.map(([x, y]) => [x + 14, y - 64]), [440, 50], [40, 50]]), DEEP, 0.4, 20);
      wash(cv, blob(rnd, [384, 212], 32, 36, 0, 0.05), BACK, 8, 0.4);
      const underEdge = [[150, 424], [206, 380], [262, 344], [320, 314], [372, 294], [416, 286]];
      dragged(spline([...underEdge, [440, 440], [150, 440]]), UNDER, 0.95, 14, -20);
      brush(cv, [[70, 300], [100, 370], [170, 410], [250, 420], [330, 404]], 34, DEEP, 0.4, 'x');
      brush(cv, [[392, 248], [392, 294], [380, 340]], 16, COAT, 0.4, 'y');
      // the hair-like feathers: fine strokes hanging down and back from the head over the whole body, darker on the back
      const flow = (x, y) => 100 + 60 * Math.max(0, Math.min(1, (250 - y) / 150)) + (x > 340 && y < 250 ? 24 : 0);
      const hair = { flow, spread: 16, length: 22, width: 1.8, opacity: [0.25, 0.6], bend: 0.35 };
      strokes(cv, rnd, body, [56, 84, 416, 420], { ...hair, count: 170, colour: (x, y) => (rnd() < (y < 250 ? 0.65 : 0.3) ? DEEP : PALE) });
      strokes(cv, rnd, body, [220, 270, 400, 420], { ...hair, count: 50, colours: [PALE, '#f4e0bc'], spread: 14, length: 18, width: 1.6, opacity: [0.3, 0.6] });
      cv.add('</g>');
    });

    s.paint((cv) => {
      // the beak: pale, darker along its underside and toward its tip
      lay(cv, beak, BEAK, 2.6);
      cv.add(`<g clip-path="${within(cv, beak)}">`);
      brush(cv, [[400, 230], [436, 266], [452, 330], [462, 400], [469, 452]], 12, BEAK_SHADE, 0.7, 'y');
      brush(cv, [[462, 400], [471, 454]], 10, '#a3865f', 0.6, 'y');
      cv.add('</g>');
      // (its tip pushed into the earth, a few crumbs thrown up round it)
      lay(cv, blob(rnd, [471, 456], 13, 5.5, 0, 0.1), EARTH, 2.4);
      for (const [x, y, r] of [[456, 451, 2.6], [486, 452, 2.2], [462, 446, 1.8], [481, 446, 1.6]]) {
        lay(cv, blob(rnd, [x, y], r, r * 0.8, 0, 0.1), EARTH_DEEP, 2.6);
      }

      // the line: over the back and down the rump, under the belly, round the head, and down the chest; the beak's
      // edges, the legs and the toes
      line(cv, [[330, 124], [278, 92], [220, 86], [160, 100], [110, 132]], 5.6, { start: 0.3, end: 0.4 });
      line(cv, [[92, 152], [70, 200], [62, 246], [70, 300], [96, 352], [140, 390], [190, 410]], 6, { start: 0.4, end: 0.3 });
      line(cv, [[218, 415], [256, 416], [300, 408]], 5, { start: 0.3, end: 0.4 });
      line(cv, [[338, 132], [352, 156], [362, 168], [376, 170], [398, 182], [410, 198]], 5.4, { start: 0.3, end: 0.5 });
      line(cv, [[404, 240], [388, 258], [390, 292], [382, 336], [362, 372], [334, 394]], 5.6, { start: 0.4, end: 0.3 });
      line(cv, edge(1), 3.6, { start: 0.6, end: 0.5, peak: 0.4, count: 40 });
      line(cv, edge(-1), 3.4, { start: 0.6, end: 0.5, peak: 0.5, count: 40 });
      for (const l of legs) {
        line(cv, [[l.top[0] - 17, l.top[1] + 8], [l.ankle[0] - 14, l.ankle[1] - 2]], 4, { start: 0.4, end: 0.6 });
        line(cv, [[l.top[0] + 17, l.top[1] + 10], [l.ankle[0] + 14, l.ankle[1] - 6]], 4, { start: 0.4, end: 0.6 });
        for (const toe of l.toes) line(cv, toe, 2.8, { start: 0.6, end: 0.3, count: 14 });
        cv.add(`<g fill="${CLAW}">${l.toes.map((t) => `<circle cx="${t[2][0]}" cy="${t[2][1]}" r="2.6"/>`).join('')}</g>`);
      }

      // the face: a small dark eye, and bristles fanned out round the root of the beak
      const eye = blob(rnd, [380, 200], 7.4, 7.8, 0, 0.03);
      cv.add(`<g fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}"><path d="${eye}"/></g>`);
      cv.add('<circle cx="378" cy="197.4" r="2" fill="#fff" fill-opacity="0.85"/>');
      for (const [a, b] of [[[404, 204], [432, 194]], [[408, 212], [438, 210]], [[408, 222], [436, 230]], [[402, 228], [424, 244]]]) {
        line(cv, [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 2], b], 1.8, { start: 0.8, end: 0.1, count: 12 });
      }
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
