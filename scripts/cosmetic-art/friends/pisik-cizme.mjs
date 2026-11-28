import { blob, crayon, crescent, dry, mark, painter, softly, strokes } from '../brush.mjs';
import { along, pt, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'pisik-cizme',
  ku: 'Pisîka Bi Çizme',
  en: 'Cat in boots',
  // A ginger tabby walking upright to our right, three-quarters on: a big round head with bright eyes, a pink nose and a
  // white muzzle, its ears poking up through the brim of a soft felt hat cocked over its brow with a red feather in the
  // band; a cream chest, the near arm swinging with its paw forward, the back boot planted and the front one stepping out
  // heel first, and a thick striped tail rising behind in an S; light from the upper left, in a soft dark pencil line.
  still(rnd) {
    const s = new Still(rnd).place([-33, -1], 0.94);
    const [COAT, NEAR, LIGHT, SHADE, DEEP, STRIPE] = ['#e0975a', '#e9a76d', '#f4c18c', '#c07646', '#9a5634', '#a85a30'];
    const [CREAM, PALE, CREAM_SHADE] = ['#f8e8cc', '#fff6e8', '#e2c3a2'];
    const [PINK, NOSE, IRIS] = ['#f0aaa2', '#dc7f7a', '#d2a03c'];
    const [HAT, HAT_LIT, HAT_DEEP, BAND] = ['#7f5640', '#a77d5d', '#553629', '#3e2620'];
    const [BOOT, BOOT_LIT, BOOT_DEEP, SOLE] = ['#7a3e25', '#ab673e', '#4f2618', '#3a241c'];
    const [CUFF, CUFF_LIT, CUFF_DEEP] = ['#c08a56', '#e3b983', '#94613a'];
    const [RED, RED_DEEP, RED_LIT] = ['#c8473a', '#8f2a24', '#e57a5e'];
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);
    // A part's paint is its own outline and any fur standing off it, laid together and shaded together.
    const clip = (cv, ds, draw) => {
      const id = cv.id('in');
      cv.def(`<clipPath id="${id}">${[ds].flat().map((d) => `<path d="${d}"/>`).join('')}</clipPath>`);
      cv.add(`<g clip-path="url(#${id})">`);
      draw();
      cv.add('</g>');
    };
    const layAll = (cv, ds, fill, keep = 2.6) =>
      cv.add(`<g fill="${fill}" filter="${crayon(cv, rnd, { keep, tear: 2, grain: 0.9 })}">${ds.map((d) => `<path d="${d}"/>`).join('')}</g>`);
    const rot = (pts, deg, [cx, cy]) => {
      const [c, si] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
      return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * si, cy + (x - cx) * si + (y - cy) * c]);
    };
    // A limb or a tail along `pts`, `width(t)` across at each point along it: its two sides and its outline.
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
      return { L, R, c, d: spline([...L, ...[...R].reverse()]) };
    };
    // Fur at an edge through `P` is a fringe of soft locks curving out by about `amp` to fine points that lean along the
    // edge, as fur lies; each lock gets one pencil flick. `side` 1 puts the fringe to the left of the way `P` runs.
    const fur = (P, { side, amp, lean = 0.6, count = 5, taper = () => 1 }) => {
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
        inner.push(at(-12, 0));
        flicks.push([0, 0.2, 0.4, 0.6, 0.8, 1].map((u) => q(at(-1, 0), ctrl, tip, u)));
      }
      const [last, end] = [c.at(-1), c.at(-2)];
      const l = Math.hypot(last[0] - end[0], last[1] - end[1]) || 1;
      inner.push([last[0] - ((last[1] - end[1]) / l) * side * 12, last[1] + ((last[0] - end[0]) / l) * side * 12]);
      return { d: `${outer.join(' ')} L${[...inner].reverse().map(pt).join(' L')} Z`, flicks };
    };
    const flick = (cv, f, w) => line(cv, f, w, { start: 0.75, end: 0.03, peak: 0.3, tremble: 0.12, count: 16 });
    // A tabby stripe, thick where it leaves the spine and thinning to nothing as it wraps round toward the chest.
    const stripe = (cv, pts, w, opacity = 0.8) =>
      cv.add(`<path d="${mark(rnd, pts, w, { start: 0.75, end: 0.04, peak: 0.25, tremble: 0.2 })}" fill="${STRIPE}" fill-opacity="${opacity}"`
        + ` filter="${dry(cv, rnd, { along: 'x', keep: 2.6, streak: 0.3 })}"/>`);

    // The tail grows thick from the base of the spine and rises behind in an S, its tip turning back.
    const tail = tube([[252, 352], [216, 366], [180, 364], [150, 348], [133, 322], [128, 294], [131, 268], [124, 246], [108, 232]],
      (t) => 42 - 22 * t + 4 * Math.sin(Math.PI * t), 28);
    const tEnd = tail.c.at(-1);
    const tDir = Math.atan2(tEnd[1] - tail.c.at(-2)[1], tEnd[0] - tail.c.at(-2)[0]);
    const tailTip = [70, 35, 0, -35, -70].map((deg) => tDir + (deg * Math.PI) / 180).map((a) => [tEnd[0] + Math.cos(a) * 10, tEnd[1] + Math.sin(a) * 10]);
    const tailD = spline([...tail.L, ...tailTip, ...[...tail.R].reverse()]);
    const tailFur = fur(tail.R.slice(4, 22), { side: 1, amp: 6, lean: 0.8, count: 7 });

    // The body: a small round chest pushed forward over the hips, the back curving down to the rump.
    const BODY = [[272, 246], [252, 264], [240, 294], [234, 330], [238, 362], [256, 384], [290, 392], [324, 386], [346, 368], [360, 338], [364, 304],
      [360, 274], [344, 254], [314, 246]];
    const BIB = [[312, 248], [340, 254], [356, 272], [361, 296], [352, 316], [334, 322], [320, 308], [312, 284]];
    const bibFur = fur([[314, 256], [312, 284], [320, 306], [336, 320], [354, 314]], { side: -1, amp: 7, lean: 0.6, count: 5 });
    // The near arm swings forward from the shoulder, bent at the elbow, its paw held out in front of the chest.
    const arm = tube([[292, 268], [282, 296], [284, 320], [304, 332], [336, 328], [356, 320]], (t) => 34 - 10 * t, 24);
    // Its top is rounded into the shoulder, so it melts into the body rather than ending in a cut.
    const [c0, c1, l0] = [arm.c[0], arm.c[1], arm.L[0]];
    const k = Math.hypot(l0[0] - c0[0], l0[1] - c0[1]) / Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
    const cap = [[-0.7, 0.7], [0, 1], [0.7, 0.7]].map(([u, v]) => [0, 1].map((j) => c0[j] + (l0[j] - c0[j]) * u + (c0[j] - c1[j]) * k * v));
    const armD = spline([...arm.L, ...[...arm.R].reverse(), ...cap]);
    const PAW = [368, 317];
    // The far arm swings back behind the body, only its paw and wrist showing past the back.
    const armFar = tube([[262, 280], [242, 306], [220, 322]], (t) => 26 - 4 * t, 16);
    // The short legs run down into the boots.
    const legNear = tube([[262, 364], [256, 392], [250, 412]], () => 42, 12);
    const legFar = tube([[314, 368], [334, 390], [354, 404]], () => 38, 12);

    // A boot drawn upright about the middle of its shaft's top with its toe to the right, then turned by `deg` and scaled
    // by `k` where it stands: the shaft and foot, the folded cuff, and the sole and heel.
    const boot = (at, deg, k) => {
      const T = (pts) => rot(pts.map(([x, y]) => [at[0] + x * k, at[1] + y * k]), deg, at);
      return {
        T,
        leg: T([[-22, -4], [22, -4], [23, 30], [25, 54], [36, 66], [54, 72], [70, 77], [82, 82], [80, 93], [56, 97], [20, 97], [-22, 97], [-29, 90],
          [-28, 62], [-24, 30]]),
        cuff: T([[-32, -34], [-10, -37], [12, -37], [32, -34], [33, -14], [32, 6], [10, 9], [-10, 9], [-32, 6], [-33, -14]]),
        sole: spline(T([[-60, 88], [140, 88], [140, 140], [-60, 140]])),
        heel: spline(T([[-60, 80], [-8, 80], [-8, 140], [-60, 140]])),
      };
    };
    const bootNear = boot([252, 424], 6, 0.76);
    const bootFar = boot([360, 414], -20, 0.72);

    // The head, three-quarters on: round at the crown, the near cheek full and fluffy, the muzzle turned toward the right.
    const HEAD = [[230, 150], [256, 128], [292, 118], [330, 120], [362, 134], [380, 156], [386, 180], [392, 200], [388, 220], [372, 238], [346, 250],
      [314, 256], [282, 254], [254, 246], [234, 230], [224, 206], [224, 176]];
    const cheekNear = fur([[224, 186], [226, 210], [238, 232], [256, 246], [278, 254]], { side: -1, amp: 12, lean: 0.6, count: 5,
      taper: (u) => 0.4 + Math.sin(Math.PI * u) * 0.8 });
    const cheekFar = fur([[388, 220], [376, 236], [358, 248]], { side: 1, amp: 8, lean: 0.6, count: 3 });
    const MUZZLE = [[326, 216], [338, 208], [350, 211], [362, 207], [376, 212], [384, 224], [378, 238], [362, 246], [344, 248], [330, 242], [322, 230]];
    const EYES = [[300, 186, 12, 13.5], [356, 182, 10, 12.5]];
    // The hat is drawn about the middle of its brim and cocked toward the face.
    const HAT_AT = [306, 136];
    const hat = (pts) => rot(pts.map(([x, y]) => [HAT_AT[0] + x, HAT_AT[1] + y]), 8, HAT_AT);
    const brim = hat([[-134, -22], [-110, -14], [-70, -12], [0, -10], [70, -14], [108, -20], [130, -34], [128, -22], [112, -6], [70, 10], [0, 18], [-70, 12],
      [-112, 0], [-130, -12]]);
    const crown = hat([[-46, -8], [-50, -34], [-46, -58], [-34, -74], [-16, -80], [0, -72], [16, -80], [34, -74], [46, -58], [50, -34], [48, -8], [0, -4]]);
    const band = hat([[-47, -8], [-49, -22], [-20, -19], [20, -19], [50, -22], [48, -8], [0, -4]]);
    const earNear = hat([[-84, -8], [-88, -34], [-82, -58], [-73, -66], [-62, -58], [-46, -40], [-36, -12]]);
    const earNearIn = hat([[-77, -12], [-79, -36], [-74, -54], [-66, -48], [-54, -32], [-46, -12]]);
    const earFar = hat([[40, -12], [50, -38], [62, -56], [70, -60], [77, -50], [82, -30], [82, -10]]);
    const earFarIn = hat([[52, -14], [60, -38], [68, -50], [74, -40], [76, -16]]);
    const quill = hat([[-20, -36], [-40, -62], [-66, -80], [-96, -88], [-122, -86]]);
    const feather = tube(quill, (t) => 4 + 22 * Math.sin(Math.PI * Math.min(1, t * 1.08)) ** 0.8, 20);

    // Everything above the hips leans a little into the stride.
    const LEAN = 'rotate(4 290 386)';

    s.paint((cv) => {
      // A faint warm shadow on the ground keeps the boots standing on something.
      wash(cv, blob(rnd, [300, 488], 118, 9, 0, 0.04), '#8c7c70', 8, 0.22);

      cv.add(`<g transform="${LEAN}">`);
      // The tail: lit along its top, shaded beneath, its rings brushed round it and its tip darker.
      const tailAll = [tailD, tailFur.d];
      layAll(cv, tailAll, COAT);
      clip(cv, tailAll, () => {
        crescent(cv, tailD, [-10, -12], { colour: SHADE, opacity: 0.8, soft: 7 });
        brush(cv, tail.L.slice(3, 22), 10, LIGHT, 0.65, 'x');
        for (const i of [4, 8, 12, 16, 20]) {
          const [a, b] = [tail.L[i], tail.R[i]];
          const m = [(a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.15, (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.15];
          brush(cv, [a, m, b], 10 - i * 0.2, STRIPE, 0.85, 'y');
        }
        wash(cv, blob(rnd, tEnd, 16, 16, 0, 0.05), DEEP, 6, 0.85);
      });
      for (const k of tailFur.flicks) flick(cv, k, 3.2);
      line(cv, tail.L.slice(4, 24), 4.6, { start: 0.2, end: 0.4, count: 40 });
      line(cv, [...tail.L.slice(24), ...tailTip, ...[...tail.R].reverse().slice(0, 6)], 4.6, { start: 0.4, end: 0.3, count: 30 });

      // The far arm, in the body's shade behind it.
      const pawFar = blob(rnd, [214, 326], 13, 11, 30, 0.06);
      layAll(cv, [armFar.d, pawFar], SHADE);
      clip(cv, [armFar.d, pawFar], () => {
        brush(cv, armFar.R, 10, DEEP, 0.6, 'y');
        brush(cv, [armFar.L[8], armFar.R[9]], 6, STRIPE, 0.8, 'x');
      });
      line(cv, armFar.L.slice(8), 4.2, { start: 0.2, end: 0.4 });
      line(cv, rot([[-6, -11], [-13, -2], [-10, 8], [2, 11], [10, 6]].map(([x, y]) => [214 + x, 326 + y]), 30, [214, 326]), 3.8, { start: 0.3, end: 0.3 });
      cv.add('</g>');

      // The legs run into the boots: the far one in the body's shade.
      for (const [leg, tone] of [[legFar, SHADE], [legNear, COAT]]) {
        lay(cv, leg.d, tone);
        clip(cv, leg.d, () => {
          brush(cv, leg.R, 14, DEEP, 0.45, 'y');
          brush(cv, [leg.L[5], leg.R[6]], 7, STRIPE, 0.8, 'x');
        });
        line(cv, leg.L, 4.4, { start: 0.2, end: 0.4 });
        line(cv, leg.R, 4.4, { start: 0.2, end: 0.4 });
      }

      // The boots: lit down the heel side, dark at the front, a shine along the toe and creases at the ankle; the folded
      // cuff paler and lit along its fold. The far boot is a little darker.
      for (const [b, far] of [[bootFar, true], [bootNear, false]]) {
        const d = spline(b.leg);
        lay(cv, d, BOOT, 2.8);
        clip(cv, d, () => {
          brush(cv, b.T([[-14, 4], [-16, 44], [-14, 84]]), 13, BOOT_LIT, 0.7, 'y');
          brush(cv, b.T([[16, 4], [19, 44], [26, 66]]), 12, BOOT_DEEP, 0.6, 'y');
          brush(cv, b.T([[44, 72], [62, 76], [78, 82]]), 7, '#c58a5c', 0.85, 'x');
          brush(cv, b.T([[-26, 8], [0, 12], [26, 8]]), 12, BOOT_DEEP, 0.6, 'x');
          brush(cv, b.T([[-13, 44], [-8, 26], [0, 18], [8, 26], [13, 44]]), 2.4, CUFF_LIT, 0.6, 'y');
          cv.add(`<path d="${b.sole}" fill="${SOLE}" filter="${crayon(cv, rnd, { keep: 2.8, tear: 1.5 })}"/>`);
          cv.add(`<path d="${b.heel}" fill="${SOLE}" filter="${crayon(cv, rnd, { keep: 2.8, tear: 1.5 })}"/>`);
          if (far) wash(cv, d, BOOT_DEEP, 6, 0.3);
        });
        line(cv, [...b.leg.slice(1), b.leg[0]], 4.4, { start: 0.3, end: 0.3, count: 50 });
        for (const crease of [[[6, 54], [16, 57], [25, 62]], [[4, 64], [14, 66], [26, 70]]]) line(cv, b.T(crease), 2.2, { start: 0.2, end: 0.2 });
        const c = spline(b.cuff);
        lay(cv, c, CUFF, 2.8);
        clip(cv, c, () => {
          brush(cv, b.T([[-32, -30], [0, -34], [32, -30]]), 10, CUFF_LIT, 0.9, 'x');
          brush(cv, b.T([[-32, 2], [0, 4], [32, 2]]), 9, CUFF_DEEP, 0.55, 'x');
          brush(cv, b.T([[24, -30], [30, -12], [28, 4]]), 10, CUFF_DEEP, 0.45, 'y');
          if (far) wash(cv, c, CUFF_DEEP, 6, 0.3);
        });
        line(cv, [...b.cuff, b.cuff[0], b.cuff[1]], 4, { start: 0.3, end: 0.3, count: 40 });
        line(cv, b.T([[-28, -24], [0, -27], [28, -24]]), 2, { start: 0.2, end: 0.2 });
      }

      cv.add(`<g transform="${LEAN}">`);
      // The body: lit down its back, shaded under the chest and the belly, its stripes wrapping round from the spine.
      const body = spline(BODY);
      lay(cv, body, COAT);
      clip(cv, body, () => {
        crescent(cv, body, [-16, -14], { colour: SHADE, opacity: 0.8, soft: 9 });
        wash(cv, blob(rnd, [256, 290], 22, 46, 10, 0.05), LIGHT, 10, 0.8);
        wash(cv, spline([[250, 246], [320, 246], [330, 272], [256, 272]]), DEEP, 8, 0.5);
        brush(cv, [[244, 380], [290, 392], [340, 374]], 18, DEEP, 0.5, 'x');
        for (const [y, w] of [[282, 11], [306, 12], [330, 12], [354, 11], [374, 9]]) {
          const x0 = 232 + Math.abs(y - 320) * 0.1;
          stripe(cv, [[x0 - 6, y - 6], [x0 + 20, y - 2], [x0 + 44, y + 5], [x0 + 70, y + 16]], w);
        }
        strokes(cv, rnd, body, [232, 250, 360, 390], { count: 34, colours: [LIGHT, PALE, SHADE], flow: () => 100, spread: 30, length: 10, width: 1.8,
          opacity: [0.25, 0.5] });
      });
      // The cream chest, fluffy at its edge and shaded a little under the chin.
      const bib = [spline(BIB), bibFur.d];
      layAll(cv, bib, CREAM, 2.4);
      clip(cv, bib, () => {
        wash(cv, spline([[312, 246], [346, 252], [350, 270], [316, 270]]), CREAM_SHADE, 6, 0.9);
        brush(cv, [[350, 280], [360, 310], [348, 350]], 12, CREAM_SHADE, 0.7, 'y');
        brush(cv, [[324, 282], [322, 312], [330, 340]], 10, PALE, 0.8, 'y');
      });
      for (const k of bibFur.flicks) flick(cv, k, 2.6);
      line(cv, [[238, 290], [233, 326], [238, 362], [256, 382]], 5, { start: 0.1, end: 0.4, count: 30 });
      line(cv, [[256, 383], [290, 390], [322, 384], [342, 366], [354, 336], [361, 300], [356, 272]], 5, { start: 0.3, end: 0.3, count: 40 });

      // The near arm swings forward, throwing a soft shadow on the chest; its paw curls in front.
      clip(cv, [body, ...bib], () => cv.add(`<path d="${armD}" transform="translate(6 8)" fill="${DEEP}" fill-opacity="0.4" filter="${softly(cv, 4)}"/>`));
      lay(cv, armD, COAT);
      clip(cv, armD, () => {
        brush(cv, arm.c.slice(3), 24, NEAR, 0.85, 'y');
        crescent(cv, armD, [-8, -8], { colour: SHADE, opacity: 0.8, soft: 5 });
        brush(cv, arm.L.slice(3, 14), 8, LIGHT, 0.7, 'y');
        brush(cv, [arm.L[8], arm.R[8]], 7, STRIPE, 0.8, 'x');
        brush(cv, [arm.L[15], arm.R[15]], 7, STRIPE, 0.8, 'y');
      });
      line(cv, arm.L.slice(4), 4.4, { start: 0.1, end: 0.3 });
      line(cv, arm.R.slice(2, 20), 4.2, { start: 0.1, end: 0.3 });
      const paw = blob(rnd, PAW, 15, 12, -15, 0.06);
      lay(cv, paw, CREAM, 2.4);
      clip(cv, paw, () => wash(cv, blob(rnd, [PAW[0] + 3, PAW[1] + 7], 13, 6, -15, 0.05), CREAM_SHADE, 3, 0.9));
      line(cv, rot([[-6, -12], [8, -11], [15, -2], [10, 9], [-4, 12], [-12, 10]].map(([x, y]) => [PAW[0] + x, PAW[1] + y]), -15, PAW), 4,
        { start: 0.3, end: 0.3 });
      for (const [x, y] of [[378, 310], [381, 318]]) line(cv, [[x - 6, y + 2], [x, y]], 2, { start: 0.3, end: 0.8 });

      // The head: lit on the near cheek and the brow, shaded under the brim and down the far side, the near cheek fluffy.
      const head = [spline(HEAD), cheekNear.d, cheekFar.d];
      layAll(cv, head, COAT);
      clip(cv, head, () => {
        crescent(cv, head[0], [-18, -16], { colour: SHADE, opacity: 0.85, soft: 9 });
        wash(cv, blob(rnd, [262, 186], 30, 36, 0, 0.05), LIGHT, 10, 0.8);
        wash(cv, spline([[226, 236], [262, 252], [300, 256], [270, 266], [230, 256]]), CREAM, 5, 0.9);
        for (const [pts, w] of [[[[318, 152], [320, 166]], 6], [[[330, 150], [331, 166]], 6.5], [[[342, 152], [340, 166]], 6]]) {
          brush(cv, pts, w, STRIPE, 0.75, 'y');
        }
        stripe(cv, [[226, 190], [246, 188], [262, 192], [274, 196]], 9, 0.75);
        stripe(cv, [[228, 214], [248, 209], [264, 210], [276, 213]], 8, 0.7);
        wash(cv, spline(hat([[-110, 6], [0, 20], [110, -4], [110, 26], [0, 44], [-110, 30]])), DEEP, 7, 0.8);
        strokes(cv, rnd, head[0], [224, 140, 390, 256], { count: 30, colours: [LIGHT, PALE], flow: () => -110, spread: 30, length: 9, width: 1.6,
          opacity: [0.25, 0.5] });
      });
      lay(cv, spline(MUZZLE), CREAM, 2.4);
      clip(cv, spline(MUZZLE), () => {
        wash(cv, blob(rnd, [356, 244], 20, 8, 0, 0.05), CREAM_SHADE, 5, 0.9);
        wash(cv, blob(rnd, [336, 218], 10, 6, 0, 0.05), PALE, 3, 0.9);
      });
      for (const k of [...cheekNear.flicks, ...cheekFar.flicks]) flick(cv, k, 3.8);
      line(cv, [[224, 184], [224, 172], [230, 152]], 4.6, { start: 0.3, end: 0.1 });
      line(cv, [[380, 158], [386, 180], [392, 200], [388, 220]], 4.8, { start: 0.2, end: 0.4 });

      // The face: big bright eyes with a glint in each, a pink nose over a soft mouth, a warm cheek and the whiskers.
      for (const [x, y, rx, ry] of EYES) {
        cv.add(`<path d="${blob(rnd, [x, y], rx, ry, 0, 0.03)}" fill="${IRIS}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1, grain: 1.2 })}"/>`);
        const pupil = blob(rnd, [x + rx * 0.12, y + ry * 0.05], rx * 0.72, ry * 0.8, 0, 0.03);
        cv.add(`<path d="${pupil}" fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1, grain: 1.2 })}"/>`);
        line(cv, [[x - rx * 1.05, y - ry * 0.2], [x - rx * 0.5, y - ry * 0.95], [x + rx * 0.4, y - ry * 1.02], [x + rx * 1.05, y - ry * 0.35]], 3,
          { start: 0.3, end: 0.4 });
        cv.add(`<circle cx="${x - rx * 0.3}" cy="${y - ry * 0.35}" r="${rx * 0.34}" fill="#fffaf0"/>`);
        cv.add(`<circle cx="${x + rx * 0.35}" cy="${y + ry * 0.35}" r="${rx * 0.14}" fill="#fffaf0" fill-opacity="0.85"/>`);
      }
      wash(cv, blob(rnd, [292, 216], 14, 8, 0, 0.05), '#ee8f7c', 6, 0.5);
      const nose = spline([[340, 204], [350, 202], [359, 205], [355, 211], [349, 215], [343, 211]]);
      cv.add(`<path d="${nose}" fill="${NOSE}" filter="${crayon(cv, rnd, { keep: 3.4, tear: 1, grain: 1.2 })}"/>`);
      line(cv, [[349, 215], [349, 222]], 2.4, { start: 0.8, end: 0.6 });
      line(cv, [[338, 224], [343, 228], [349, 222]], 2.4, { start: 0.4, end: 0.8, peak: 0.6 });
      line(cv, [[349, 222], [355, 228], [361, 225]], 2.4, { start: 0.8, end: 0.4, peak: 0.4 });
      for (const w of [[[378, 216], [420, 204]], [[380, 224], [422, 224]], [[378, 232], [416, 240]]]) line(cv, w, 1.6, { start: 0.8, end: 0.1 });

      // The hat: the brim lit along its top and dark underneath, the ears poking up through it beside the crown, the
      // feather tucked into the band behind.
      lay(cv, spline(brim), HAT, 2.8);
      clip(cv, spline(brim), () => {
        brush(cv, hat([[-130, -18], [-90, -12], [0, -8], [90, -14], [126, -28]]), 10, HAT_LIT, 0.75, 'x');
        brush(cv, hat([[-120, -4], [-60, 12], [0, 16], [60, 12], [118, -10]]), 10, HAT_DEEP, 0.8, 'x');
      });
      line(cv, [...brim.slice(6), brim[0]], 4.6, { start: 0.3, end: 0.3, count: 60 });
      line(cv, brim.slice(0, 7), 3.4, { start: 0.1, end: 0.3, count: 30 });
      lay(cv, feather.d, RED, 2.6);
      clip(cv, feather.d, () => {
        brush(cv, feather.R, 9, RED_DEEP, 0.7, 'y');
        brush(cv, feather.L.slice(3), 7, RED_LIT, 0.7, 'y');
        const mid = along(quill, 20);
        for (let i = 4; i < 19; i += 3) brush(cv, [feather.L[i], mid[i + 1], feather.R[i + 2]], 2.2, RED_DEEP, 0.6, 'x');
      });
      line(cv, feather.L, 3.6, { start: 0.3, end: 0.2 });
      line(cv, feather.R, 3.6, { start: 0.3, end: 0.2 });
      line(cv, quill, 2.2, { start: 0.6, end: 0.2 });
      for (const [ear, inner, base] of [[earNear, earNearIn, [-60, -10]], [earFar, earFarIn, [62, -12]]]) {
        wash(cv, blob(rnd, hat([base])[0], 26, 6, 8, 0.05), HAT_DEEP, 4, 0.8);
        lay(cv, spline(ear), COAT, 2.8);
        clip(cv, spline(ear), () => crescent(cv, spline(ear), [-6, -8], { colour: SHADE, opacity: 0.7, soft: 4 }));
        lay(cv, spline(inner), PINK, 2.4);
        clip(cv, spline(inner), () => {
          wash(cv, spline(inner.slice(1, 5)), '#d98a92', 5, 0.5);
          for (const u of [0.25, 0.5, 0.75]) {
            const [a, b] = [inner[0], inner.at(-1)];
            const foot = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
            brush(cv, [foot, [foot[0] + (inner[3][0] - foot[0]) * 0.5, foot[1] + (inner[3][1] - foot[1]) * 0.5]], 3.4, PALE, 0.9, 'y');
          }
        });
        line(cv, ear, 4.4, { start: 0.3, end: 0.3 });
      }
      lay(cv, spline(crown), HAT, 2.8);
      clip(cv, spline(crown), () => {
        brush(cv, hat([[-38, -10], [-42, -40], [-30, -68]]), 18, HAT_LIT, 0.75, 'y');
        brush(cv, hat([[0, -68], [2, -38], [2, -10]]), 10, HAT_DEEP, 0.45, 'y');
        brush(cv, hat([[40, -64], [46, -36], [44, -10]]), 14, HAT_DEEP, 0.65, 'y');
      });
      lay(cv, spline(band), BAND, 2.8);
      line(cv, crown.slice(0, 11), 4.4, { start: 0.3, end: 0.3, count: 40 });
      line(cv, hat([[0, -70], [0, -54]]), 2.4, { start: 0.6, end: 0.2 });
      cv.add('</g>');
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
