import { blob, crayon, crescent, painter, softly, strokes, within } from '../brush.mjs';
import { spline } from '../kit.mjs';
import { Still } from '../still.mjs';

/** Points along an oval round `c`, from `a0` to `a1` degrees (0 to the right, 90 straight down), the oval turned by `turn` degrees. */
function arc([cx, cy], rx, ry, a0, a1, { count = 12, turn = 0 } = {}) {
  const [c, s] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)];
  const out = [];
  for (let i = 0; i <= count; i++) {
    const t = ((a0 + ((a1 - a0) * i) / count) * Math.PI) / 180;
    const [x, y] = [Math.cos(t) * rx, Math.sin(t) * ry];
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}

/** A closed outline through `pts`, turned clockwise so that shapes laid together fill as one. */
function shape(pts) {
  const area = pts.reduce((sum, [x, y], i) => {
    const [u, v] = pts[(i + 1) % pts.length];
    return sum + x * v - u * y;
  }, 0);
  return spline(area < 0 ? [...pts].reverse() : pts);
}

export const piece = {
  key: 'hirca-spi',
  ku: 'Hirça Spî',
  en: 'White bear',
  // A big round white bear walking to our left on four sturdy legs, its small head carried low at the front of the
  // body and turned toward us: little round ears, kind dark eyes, a short soft snout with a dark nose and a small
  // smile. The back rises in a hump behind the head; the far legs stand in shade, the far hind leg stepping back. Warm
  // white fur, creamy where the light falls on the back and brow, lilac-grey underneath, under a soft pencil line.
  still(rnd) {
    const s = new Still(rnd).place([-6, -34], 1.04);
    const [FUR, LIGHT, WARM] = ['#f8f2e8', '#fffbf4', '#f2e2c6'];
    const [SHADE, DEEP, FAR] = ['#d3c9d0', '#aa9fb0', '#ddd3d8'];
    const [EAR, NOSE, BLUSH] = ['#e7c9c2', '#2c1f1a', '#f2a796'];
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);
    const clip = (cv, d, draw) => {
      cv.add(`<g clip-path="${within(cv, d)}">`);
      draw();
      cv.add('</g>');
    };

    // The body: one big round mass, its top rising behind the head into the shoulders' hump.
    const BODY = [[318, 250], 156, 138];
    const [[bx, by], brx, bry] = BODY;
    const body = shape(arc(...BODY, 0, 360, { count: 36 }).slice(0, -1));
    /** Where the underside of the body is at `x`. */
    const under = (x) => by + bry * Math.sqrt(Math.max(0, 1 - ((x - bx) / brx) ** 2));
    // The head, low at the front, and the snout reaching out of it toward us and to the left.
    const HEAD = [[168, 208], 74, 66];
    const SNOUT = [[110, 244], 46, 30];
    const head = `${shape(arc(...HEAD, 0, 360, { count: 28 }).slice(0, -1))} ${shape(arc(...SNOUT, 0, 360, { count: 20, turn: -14 }).slice(0, -1))}`;
    // The head and its face are drawn at these points and carried `LOW` lower, as a bear carries its head.
    const LOW = 18;
    const lowered = (cv, draw) => {
      cv.add(`<g transform="translate(0 ${LOW})">`);
      draw();
      cv.add('</g>');
    };
    // The back's line starts where it comes out from behind the head.
    const inHead = ([x, y]) => ((x - HEAD[0][0]) / HEAD[1]) ** 2 + ((y - LOW - HEAD[0][1]) / HEAD[2]) ** 2 < 1.04;
    let from = -175;
    while (inHead(arc(...BODY, from, from, { count: 1 })[0])) from += 1;

    // A leg from `f` (its front) to `b` (its back), from inside the body down to a round paw with its toes forward,
    // thick at the top and a little narrower at the wrist; a leg that `lean`s steps back, its paw further back than its top.
    const PAW = 446;
    const profile = (f, b, bottom, lean, yb, yf) => {
      const at = (x, y) => [x + (lean * (y - by)) / (bottom - by), y];
      const back = [at(b, yb), ...(bottom - 84 > yb + 12 ? [at(b + 1, bottom - 84)] : []), at(b - 4, bottom - 30), at(b + 1, bottom - 10), at(b - 5, bottom - 1)];
      const sole = [at((f + b) / 2, bottom + 1), at(f - 6, bottom), at(f - 13, bottom - 8), at(f - 12, bottom - 20), at(f + 3, bottom - 34)];
      const front = yf === null ? [] : [...(bottom - 88 > yf + 12 ? [at(f - 2, bottom - 88)] : []), at(f, yf)];
      return [...back, ...sole, ...front];
    };
    const legAt = (f, b, bottom = PAW, lean = 0) => [[f + 2, by - 20], [b - 2, by - 20], ...profile(f, b, bottom, lean, by, by)];
    // Its pencil line, from where its back comes out from under the body round the paw to where its front goes in, or only
    // to the wrist where a nearer leg hides the rest.
    const legLine = (f, b, bottom = PAW, lean = 0, yb = under(b), yf = under(f)) => profile(f, b, bottom, lean, yb, yf);
    /** How far down a leaning leg's back stays hidden behind the body. */
    const emerges = (b, bottom, lean) => {
      let y = by;
      while (y < bottom && b + (lean * (y - by)) / (bottom - by) < bx + brx * Math.sqrt(Math.max(0, 1 - ((y - by) / bry) ** 2))) y += 1;
      return y;
    };
    const LEGS = { nearFore: [120, 202, PAW, 0], farFore: [214, 262, 438, 0], nearHind: [334, 416, PAW, 0], farHind: [402, 446, 436, 24] };
    const [nearFore, farFore, nearHind, farHind] = Object.values(LEGS).map(([f, b, bottom, lean]) => shape(legAt(f, b, bottom, lean)));
    const earFar = blob(rnd, [116, 158], 15, 14, -20, 0.04);
    const earNear = blob(rnd, [202, 143], 17, 16, 10, 0.04);

    // A near leg fades in from the body above it, so it grows out of the body rather than sitting on it.
    const fadeIn = (cv, top, draw) => {
      const [g, m] = [cv.id('fade'), cv.id('fadem')];
      cv.def(`<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="${top - 34}" x2="0" y2="${top + 4}">`
        + `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient>`
        + `<mask id="${m}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="url(#${g})"/></mask>`);
      cv.add(`<g mask="url(#${m})">`);
      draw();
      cv.add('</g>');
    };
    // A leg's light and shade: lit down its front, shaded down its back and under the belly.
    const shadeLeg = (cv, d, [f, b], top, colour) => {
      clip(cv, d, () => {
        wash(cv, blob(rnd, [b - 10, top + 60], 16, 90, 0, 0.05), colour, 10, 0.8);
        wash(cv, blob(rnd, [(f + b) / 2, top + 6], (b - f) * 0.7, 20, 0, 0.05), colour, 12, 0.6);
        brush(cv, [[f + 12, top + 30], [f + 10, top + 90], [f + 12, PAW - 20]], 12, LIGHT, 0.7, 'y');
        strokes(cv, rnd, d, [f, top + 20, b, PAW], { count: 12, colours: [SHADE, '#ffffff'], flow: () => 92, spread: 16, length: 11, width: 2,
          opacity: [0.3, 0.6], bend: 0.2 });
      });
    };
    // Toes: three short creases at the front of a paw.
    const toes = (cv, f, bottom = PAW) => {
      for (const k of [0, 1, 2]) line(cv, [[f - 6 + k * 11, bottom - 10], [f - 5 + k * 11, bottom - 1]], 2.6, { start: 0.3, end: 0.7 });
    };

    s.paint((cv) => {
      // The far legs, a step back in the shade of the body.
      for (const [d, [f, b]] of [[farFore, LEGS.farFore], [farHind, LEGS.farHind]]) {
        lay(cv, d, FAR, 3);
        shadeLeg(cv, d, [f, b], under((f + b) / 2) - 10, DEEP);
      }
      // The body: creamy where the light falls on the hump and back, lilac-grey round the far side and underneath, and
      // the shade the head throws on the shoulder so the head stands in front of it.
      lay(cv, body, FUR, 3);
      clip(cv, body, () => {
        crescent(cv, body, [-34, -30], { colour: SHADE, opacity: 0.85, soft: 22 });
        crescent(cv, body, [-14, -16], { colour: DEEP, opacity: 0.4, soft: 14 });
        cv.add(`<path d="${blob(rnd, [292, 168], 118, 46, -8, 0.05)}" fill="${LIGHT}" fill-opacity="0.9" filter="${softly(cv, 18)}"/>`);
        wash(cv, blob(rnd, [286, 138], 96, 26, -10, 0.06), WARM, 14, 0.6);
        wash(cv, blob(rnd, [222, 262], 46, 64, 10, 0.05), SHADE, 16, 0.75);
        for (const [pts, w, colour, opacity] of [
          [[[380, 330], [330, 366], [270, 372], [214, 356]], 26, SHADE, 0.75],
          [[[214, 160], [262, 128], [320, 116], [380, 124]], 26, LIGHT, 0.85],
        ]) brush(cv, pts, w, colour, opacity, 'x');
        strokes(cv, rnd, body, [210, 110, 430, 240], { count: 40, colours: ['#ffffff'], flow: (x) => 170 - (x - 300) * 0.15, spread: 26, length: 13,
          width: 2.4, opacity: [0.5, 0.9], bend: 0.25 });
        strokes(cv, rnd, body, [280, 210, 476, 390], { count: 46, colours: [DEEP, SHADE], flow: (x, y) => 100 + (x - 380) * 0.3 - (y - 300) * 0.1,
          spread: 24, length: 12, width: 2, opacity: [0.25, 0.55], bend: 0.25 });
      });
      // The near legs, in front of the body.
      for (const [d, [f, b]] of [[nearHind, LEGS.nearHind], [nearFore, LEGS.nearFore]]) {
        const top = under((f + b) / 2);
        fadeIn(cv, top, () => {
          lay(cv, d, FUR, 3);
          shadeLeg(cv, d, [f, b], top, SHADE);
        });
      }
      lowered(cv, () => {
      // The ears, warm inside.
      for (const [ear, [x, y]] of [[earFar, [116, 160]], [earNear, [202, 145]]]) {
        lay(cv, ear, FUR, 3);
        lay(cv, blob(rnd, [x, y + 2], 8, 7, 0, 0.06), EAR, 2.4);
      }
      // The head: light on the crown and brow and down the bridge of the snout, lilac under the jaw and round the near
      // cheek, so the head reads round and in front of the body.
      lay(cv, head, FUR, 3);
      clip(cv, head, () => {
        crescent(cv, head, [-20, -24], { colour: SHADE, opacity: 0.8, soft: 14 });
        cv.add(`<path d="${blob(rnd, [140, 182], 56, 30, -18, 0.05)}" fill="${LIGHT}" fill-opacity="0.95" filter="${softly(cv, 12)}"/>`);
        wash(cv, blob(rnd, [98, 234], 30, 12, -16, 0.05), LIGHT, 6, 0.9);
        wash(cv, blob(rnd, [150, 160], 44, 16, -14, 0.06), WARM, 10, 0.5);
        strokes(cv, rnd, head, [100, 148, 230, 212], { count: 18, colours: ['#ffffff'], flow: () => 160, spread: 30, length: 10, width: 2.2,
          opacity: [0.5, 0.9], bend: 0.2 });
        strokes(cv, rnd, head, [150, 212, 240, 278], { count: 16, colours: [SHADE, DEEP], flow: () => 120, spread: 30, length: 9, width: 1.8,
          opacity: [0.25, 0.5], bend: 0.2 });
      });
      wash(cv, blob(rnd, [176, 230], 13, 8, -6, 0.05), BLUSH, 5, 0.85);
      });
    });
    s.paint((cv) => {
      // The pencil line, open in places, round what faces us: the back from behind the near ear over the hump to the
      // rump, each leg and paw, the belly between them, and the head round its crown, snout and chin.
      const [fF, fB, fBottom] = LEGS.farFore;
      const [hF, hB] = LEGS.nearHind;
      const [rF, rB, rBottom, rLean] = LEGS.farHind;
      const out = emerges(rB, rBottom, rLean);
      line(cv, arc(...BODY, from, (Math.asin((out - by) / bry) * 180) / Math.PI, { count: 30 }), 5.6, { start: 0.3, end: 0.3, count: 44 });
      line(cv, arc(...BODY, (Math.acos((hF - bx) / brx) * 180) / Math.PI, (Math.acos((fB - bx) / brx) * 180) / Math.PI, { count: 6 }), 4.4,
        { start: 0.3, end: 0.3 });
      line(cv, legLine(rF, rB, rBottom, rLean, out, null), 5, { start: 0.3, end: 0.2 });
      line(cv, legLine(hF, hB), 5.4, { start: 0.3, end: 0.3 });
      line(cv, legLine(fF, fB, fBottom, 0, under(fB), null), 5, { start: 0.3, end: 0.2 });
      const [nF, nB] = LEGS.nearFore;
      line(cv, [...legLine(nF, nB, PAW, 0, under(nB), 312), [nF, 300]], 5.4, { start: 0.3, end: 0.3, count: 40 });
      toes(cv, nF);
      toes(cv, fF, fBottom);
      toes(cv, hF);
      toes(cv, rF + rLean, rBottom);
      lowered(cv, () => {
      // The ears: the far one whole above the brow, the near one meeting the line of the back.
      line(cv, arc([116, 158], 15, 14, 150, 390, { count: 12, turn: -20 }), 4.2, { start: 0.3, end: 0.3 });
      line(cv, arc([202, 143], 17, 16, 170, 400, { count: 12, turn: 10 }), 4.4, { start: 0.3, end: 0.3 });
      // The head: over the crown from the near ear, down the brow and the snout to the nose, under the snout to the chin
      // and down the chest; the jaw a lighter line back under the cheek.
      line(cv, [[188, 143], [164, 142], [140, 148], [124, 158]], 4.8, { start: 0.3, end: 0.4 });
      line(cv, [[104, 172], [96, 190], [90, 208], [80, 220], [68, 230], [60, 242], [62, 256], [74, 268], [94, 274], [116, 276], [124, 282]],
        5.4, { start: 0.3, end: 0.3, count: 40 });
      line(cv, [[128, 278], [152, 282], [178, 278], [198, 266]], 3.4, { start: 0.2, end: 0.6, peak: 0.4 });
      // The face: a dark nose with a catch of light, eyes with their own catch of light, a small smile.
      cv.add(`<g fill="${NOSE}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}">`
        + `<path d="${spline([[56, 238], [64, 232], [76, 234], [80, 242], [74, 250], [64, 252], [57, 247]])}"/>`
        + `<path d="${blob(rnd, [118, 206], 7.5, 9.5, 0, 0.03)}"/><path d="${blob(rnd, [162, 202], 8.5, 10.5, 0, 0.03)}"/></g>`);
      cv.add('<g fill="#fffaf2"><circle cx="66" cy="237" r="2.6"/><circle cx="116" cy="202" r="2.4"/><circle cx="159.5" cy="197.5" r="2.8"/></g>');
      line(cv, [[70, 252], [72, 260]], 2.6, { start: 0.6, end: 0.5 });
      line(cv, [[62, 262], [72, 264], [82, 260], [90, 262]], 3, { start: 0.4, end: 0.4, peak: 0.5 });
      });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
