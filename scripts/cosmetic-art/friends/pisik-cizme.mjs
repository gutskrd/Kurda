import { mark, specks, torn, within } from '../brush.mjs';
import { n, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'pisik-cizme',
  ku: 'Pisîka Bi Çizme',
  en: 'Cat in boots',
  // a fluffy kitten walking upright to the right in a big dented hat and pointed riding boots, engraved in one
  // maroon ink on pink paper: its fur cut in short strokes, solid in the shade and thinning to bare paper in the
  // light, the hat's brim pulled low over its face, the boots stitched, a scatter of dirt underfoot
  still(rnd) {
    const s = new Still(rnd).place([-5, -10], 1.1);
    const INK = '#560d11';
    const PAPER = '#fae6e2';
    const wob = (pts, a = 1) => pts.map(([x, y]) => [x + (rnd() - 0.5) * 2 * a, y + (rnd() - 0.5) * 2 * a]);
    const shape = (pts, a = 1) => spline(wob(pts, a));
    const smooth = (a, b, v) => {
      const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const near = (x, y, cx, cy, rx, ry) => smooth(1, 0.3, Math.hypot((x - cx) / rx, (y - cy) / ry));
    const solid = (cv, d, rough = 2.4) => cv.add(`<path d="${d}" fill="${INK}" filter="${torn(cv, rnd, rough, 0.12)}"/>`);
    const line = (cv, pts, w, c = INK, o = {}) =>
      cv.add(`<path d="${mark(rnd, pts, w, { start: 0.3, end: 0.3, peak: 0.5, tremble: 0.5, count: 20, ...o })}" fill="${c}"`
        + ` filter="${torn(cv, rnd, 1.2, 0.15)}"/>`);
    // A tuft of fur as an engraver cuts it: blunt where it starts, running out to a point, a little bent.
    const tuft = ([x, y], deg, l, w) => {
      const a = (deg * Math.PI) / 180;
      const [ux, uy] = [Math.cos(a), Math.sin(a)];
      const b = (rnd() - 0.5) * l * 0.45;
      return mark(rnd, [[x - (ux * l) / 2, y - (uy * l) / 2], [x - uy * b, y + ux * b], [x + (ux * l) / 2, y + (uy * l) / 2]],
        w, { start: 0.7, end: 0.05, peak: 0.3, tremble: 0.5, count: 8 });
    };
    // Tufts over the box, kept to `d`, landing where `tone` (0..1) beats a throw, so the shade builds up cut by cut.
    const fur = (cv, d, [x0, y0, x1, y1], count, flow, tone, o = {}) => {
      let out = '';
      for (let i = 0; i < count; i++) {
        const [x, y] = [x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)];
        if (rnd() >= tone(x, y)) continue;
        const tilt = flow(x, y) + (rnd() - 0.5) * (o.spread ?? 26);
        out += `<path d="${tuft([x, y], tilt, (o.length ?? 12) * (0.5 + rnd()), (o.width ?? 4.4) * (0.6 + rnd() * 0.8))}"/>`;
      }
      cv.add(`<g clip-path="${within(cv, d)}"><g fill="${o.colour ?? INK}" filter="${torn(cv, rnd, 1.4, 0.2)}">${out}</g></g>`);
    };
    // Fur standing off an edge: tufts rooted along `pts`, pointing out along `deg`.
    const fringe = (cv, pts, deg, count, l = 9, w = 3.2) => {
      let out = '';
      const path = pts.length > 1 ? pts : [pts[0], pts[0]];
      for (let i = 0; i < count; i++) {
        const t = (i + rnd() * 0.8) / count;
        const k = Math.min(path.length - 2, Math.floor(t * (path.length - 1)));
        const f = t * (path.length - 1) - k;
        const [x, y] = [path[k][0] + (path[k + 1][0] - path[k][0]) * f, path[k][1] + (path[k + 1][1] - path[k][1]) * f];
        const a = ((deg + (rnd() - 0.5) * 40) * Math.PI) / 180;
        const len = l * (0.5 + rnd());
        const root = [x + Math.cos(a) * (len / 2 - 2), y + Math.sin(a) * (len / 2 - 2)];
        out += `<path d="${tuft(root, (a * 180) / Math.PI, len, w * (0.7 + rnd() * 0.6))}"/>`;
      }
      cv.add(`<g fill="${INK}" filter="${torn(cv, rnd, 1.4, 0.2)}">${out}</g>`);
    };

    const brim = shape([[164, 137], [168, 122], [178, 112], [194, 106], [212, 102], [232, 104], [256, 112], [282, 119], [306, 123], [328, 123], [346, 127],
      [358, 137], [363, 150], [357, 161], [340, 165], [318, 163], [298, 160], [276, 158], [252, 158], [228, 160], [206, 163], [186, 162], [172, 155]], 0.8);
    const crown = shape([[214, 112], [215, 94], [218, 80], [224, 70], [236, 65], [254, 62], [272, 64], [290, 67], [306, 70], [314, 75], [317, 90], [319, 106],
      [320, 122], [290, 124], [250, 115]], 0.6);
    const body = shape([[206, 168], [240, 166], [290, 164], [314, 166], [322, 178], [326, 192], [324, 206], [316, 217], [304, 227], [300, 244], [300, 262],
      [299, 282], [300, 300], [305, 316], [316, 330], [328, 340], [338, 349], [318, 354], [300, 360], [290, 360], [282, 352], [276, 356], [272, 366],
      [271, 374], [214, 374], [206, 360], [196, 350], [190, 334], [188, 310], [188, 280], [189, 250], [192, 228], [195, 206], [199, 188]], 0.8);
    const tail = shape([[196, 311], [180, 317], [162, 317], [148, 310], [137, 299], [129, 289], [123, 282], [117, 283], [114, 291], [117, 300], [123, 310],
      [131, 322], [143, 335], [158, 345], [175, 351], [192, 355], [208, 357]], 0.8);
    const paw = shape([[288, 238], [298, 236], [302, 250], [307, 262], [316, 272], [326, 276], [334, 274], [340, 280], [337, 291], [326, 295], [312, 292],
      [300, 284], [292, 270], [288, 254]], 0.5);
    const bootL = shape([[215, 369], [228, 367], [240, 371], [252, 373], [262, 370], [270, 373], [268, 386], [265, 400], [262, 412], [265, 422], [273, 431],
      [283, 437], [292, 442], [298, 447], [293, 452], [278, 454], [258, 455], [241, 454], [239, 457], [226, 457], [214, 456], [213, 438], [213, 410],
      [214, 388]], 0.5);
    const bootR = shape([[292, 360], [304, 354], [318, 349], [330, 346], [338, 347], [340, 362], [343, 376], [347, 388], [360, 391], [374, 390], [386, 388],
      [396, 388], [401, 391], [396, 396], [384, 402], [368, 411], [354, 418], [346, 422], [347, 436], [333, 437], [330, 428], [322, 416], [312, 398],
      [302, 380], [295, 368]], 0.5);

    s.paint((cv) => {
      // dirt kicked along the ground, a dark smear under the boots thinning out to specks
      solid(cv, shape([[150, 440], [180, 437], [210, 438], [244, 439], [280, 440], [316, 441], [324, 444], [290, 447], [250, 449], [210, 448], [180, 446],
        [156, 445]], 1.2), 4.5);
      let dirt = '';
      for (let i = 0; i < 130; i++) {
        const x = 110 + rnd() * 302;
        const y = 443 + (rnd() - 0.45) * (x < 300 ? 16 : 9) + (x > 330 ? -3 : 0) - (x < 170 ? 4 : 0);
        const r = 0.8 + rnd() * rnd() * 2.6;
        dirt += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r * (1.2 + rnd()))}" ry="${n(r)}"/>`;
      }
      for (let i = 0; i < 16; i++) {
        dirt += `<ellipse cx="${n(140 + rnd() * 250)}" cy="${n(452 + rnd() * 14)}" rx="${n(1.5 + rnd() * 3)}" ry="${n(1 + rnd() * 1.4)}"/>`;
      }
      cv.add(`<g fill="${INK}" filter="${torn(cv, rnd, 1.6, 0.2)}">${dirt}</g>`);

      // the paper of the figure, so it reads over any picture
      for (const d of [tail, body, paw, brim, crown, bootL, bootR]) cv.add(`<path d="${d}" fill="${PAPER}"/>`);

      // the tail sweeping out behind, nearly solid, frayed all along its underside
      solid(cv, tail, 3);
      fur(cv, tail, [116, 282, 208, 356], 70, (x) => (x < 140 ? -62 : -18), (x) => 0.1 + 0.25 * smooth(190, 150, x), { colour: PAPER, length: 8, width: 2 });
      fringe(cv, [[118, 302], [128, 318], [142, 334], [158, 346], [176, 352], [198, 357]], 72, 34, 9, 3.4);
      fringe(cv, [[120, 282], [132, 294], [146, 308], [162, 315], [182, 316]], -95, 8, 4, 2.4);

      // the body's fur: solid down the back and in the haunch, in tabby bands across the middle, bare paper on the belly
      const bands = (x, y) => Math.pow(0.5 + 0.5 * Math.cos(((y - (x - 240) * 0.3 + 6 * Math.sin(x / 17)) / 11) * Math.PI * 2), 2);
      const shade = (x, y) => Math.min(1, Math.max(
        0.4 * smooth(198, 206, x) * smooth(232, 218, x),
        (0.03 + 0.5 * bands(x, y)) * smooth(280, 226, x),
        0.85 * near(x, y, 216, 330, 36, 24),
        0.6 * near(x, y, 236, 252, 14, 10),
        0.35 * smooth(8, 0, Math.abs(x - 297)) * smooth(220, 230, y) * smooth(320, 300, y),
        0.3 * smooth(334, 352, y) * smooth(270, 250, x),
        0.05 + 0.08 * smooth(290, 330, y) * smooth(250, 270, x),
      ));
      solid(cv, shape([[199, 236], [205, 240], [209, 252], [210, 268], [207, 284], [210, 296], [220, 304], [236, 312], [248, 324], [252, 340], [244, 354],
        [230, 362], [216, 364], [200, 354], [192, 336], [190, 306], [193, 280], [197, 258]], 1.4), 3);
      fur(cv, body, [188, 224, 304, 372], 1150, (x, y) => 14 + (x - 246) * 0.3 + (y > 336 ? 16 : 0), (x, y) => shade(x, y) * smooth(224, 244, y),
        { length: 13, width: 3.4, spread: 16 });
      fur(cv, body, [186, 226, 256, 368],
        340, (x) => 70 + (x - 200) * 0.8, (x, y) => smooth(224, 200, x) * 0.75 + near(x, y, 220, 334, 40, 26) * 0.5, { colour: PAPER, length: 9, width: 2.6 });
      fringe(cv, [[200, 186], [196, 206], [193, 228], [190, 252], [188, 280], [188, 308]], 168, 40, 9, 3);
      // the near arm folded at its side, the far paw held up in front of it
      line(cv, [[222, 236], [232, 244], [238, 256], [238, 268], [232, 278]], 5, INK, { start: 0.4, end: 0.3 });
      line(cv, [[291, 236], [293, 250], [297, 264], [303, 276], [312, 285], [323, 290], [332, 289], [336, 283], [336, 276]],
        8.4, INK, { start: 0.5, end: 0.3, peak: 0.45 });
      line(cv, [[296, 238], [306, 242], [312, 244]], 5, INK, { start: 0.8, end: 0.1 });
      fur(cv, paw, [286, 236, 338, 294], 30, (x) => (x < 306 ? 75 : 10), () => 0.6, { colour: PAPER, length: 6, width: 2 });
      fringe(cv, [[300, 262], [308, 270], [318, 278], [328, 282]], -60, 6, 5, 2.6);
      for (const [x, y] of [[310, 258], [322, 268], [340, 278]]) cv.add(`<ellipse cx="${x}" cy="${y}" rx="2.4" ry="1.6" fill="${INK}"/>`);
      // the front of the belly drawn in only by a few broken cuts
      for (const pts of [[[301, 232], [299, 244]], [[300, 254], [299, 264]], [[298, 294], [300, 304]], [[306, 318], [311, 325]], [[320, 333],
        [326, 339]]]) line(cv, pts, 3);

      // the head: deep in the brim's shade and down its far side, the face lit, peeking out and looking down
      const open = (x, y, cx, cy, rx, ry) => smooth(1.15, 0.7, Math.hypot((x - cx) / rx, (y - cy) / ry));
      const face = (x, y) => Math.max(open(x, y, 284, 195, 19, 10), open(x, y, 314, 208, 15, 24), open(x, y, 308, 177, 13, 15), open(x, y, 262, 174, 14, 5));
      const headShade = (x, y) => smooth(246, 226, y) * Math.max(0.08, Math.min(1, Math.max(
        smooth(222, 208, x) * 0.8,
        (0.05 + 0.6 * (0.5 + 0.5 * Math.cos(((y - (x - 220) * 0.15 - 170) / 8) * Math.PI * 2))) * smooth(186, 176, y) * smooth(296, 266, x),
        0.5 * near(x, y, 250, 196, 44, 20),
        0.25 * smooth(214, 224, y) * smooth(250, 220, x),
      ) - 1.3 * Math.max(face(x, y), open(x, y, 270, 176, 19, 11))));
      solid(cv, shape([[206, 161], [230, 158], [252, 156], [276, 156], [298, 158], [316, 161], [310, 164], [298, 163], [288, 167], [280, 164], [266, 166],
        [254, 164], [242, 166], [228, 164], [216, 167], [208, 169]], 0.6), 2.2);
      solid(cv, shape([[206, 184], [218, 188], [232, 191], [246, 192], [256, 195], [264, 199], [270, 204], [282, 207], [292, 209], [290, 215], [278, 219],
        [262, 222], [246, 222], [230, 220], [216, 222], [204, 224], [200, 212]], 1.4), 3.4);
      fur(cv, body, [194, 166, 326, 246], 600, (x, y) => (x > 298 ? 70 : x > 262 && y > 198 ? 150 : 4 + (y - 190) * 0.25),
        headShade, { length: 12, width: 4.2 });
      fur(cv, body, [200, 186, 270, 222], 40, (x) => (x < 214 ? 100 : 176), () => 0.5, { colour: PAPER, length: 8, width: 2.2 });
      for (const pts of [[[214, 174], [232, 174], [250, 177]], [[230, 180], [246, 180], [258, 184]], [[284, 170], [292, 176], [298, 182]], [[290, 166],
        [298, 170]]]) line(cv, pts, 3.6);
      fringe(cv, [[318, 184], [323, 196], [320, 208], [312, 219]], 20, 6, 5, 2.4);
      // its eyes: the near one a dark heavy-lidded almond under a lit brow, the far one in the shade of its brow, lit below
      solid(cv, shape([[284, 164], [296, 162], [304, 164], [300, 170], [298, 178], [294, 184], [288, 180], [286, 172]], 0.5), 2.4);
      line(cv, [[248, 177], [258, 172], [268, 169]], 3.6, PAPER, { start: 0.3, end: 0.2 });
      line(cv, [[260, 183], [270, 187], [282, 188]], 3.4, PAPER, { start: 0.2, end: 0.3 });
      cv.add(`<g fill="${INK}" filter="${torn(cv, rnd, 1, 0.2)}"><path d="M257 170 Q273 164 283 178 Q285 185 279 184 Q269 181 257 170 Z"/>`
        + '<path d="M257 170 Q265 182 279 184 Q267 186 260 178 Z"/>'
        + '<path d="M298 168 Q306 160 315 165 Q321 175 317 187 Q311 193 304 188 Q297 180 298 168 Z"/>'
        + `<path d="M306 176 Q310 171 314 173 Q317 180 314 186 Q309 188 307 183 Z" fill="${PAPER}"/>`
        + '<ellipse cx="310" cy="180" rx="2.4" ry="4" transform="rotate(-12 310 180)"/>'
        + '<path d="M286 186 Q295 183 303 188 Q299 196 295 201 Q290 193 286 186 Z"/></g>');
      line(cv, [[280, 181], [288, 186]], 2.6);
      line(cv, [[295, 200], [290, 204], [282, 205]], 2.6);
      for (const [x, y] of [[275, 197], [280, 198]]) cv.add(`<circle cx="${x}" cy="${y}" r="1.6" fill="${INK}"/>`);
      // whiskers: light ones cut into the dark cheek, dark ones drawn out over the paper
      for (const [x, y] of [[250, 212], [254, 218], [261, 222], [269, 224], [277, 223]]) {
        line(cv, [[284, 203], [(284 + x) / 2, (203 + y) / 2 - 1.5], [x, y]], 1.9, PAPER, { start: 0.9, end: 0.15, peak: 0.1 });
      }
      const whiskers = [[[308, 190], [316, 192], [323, 196]], [[306, 197], [316, 205], [324, 215]], [[304, 201], [309, 207], [313, 213]],
        [[314, 216], [316, 220], [317, 225]]];
      for (const pts of whiskers) line(cv, pts, 1.8, INK, { start: 0.7, end: 0.2, peak: 0.3 });
      for (const pts of [[[286, 210], [292, 214]], [[289, 219], [293, 225]], [[291, 230], [295, 236]]]) line(cv, pts, 3.4);

      // the legs going down into the boots, then the boots: nearly solid, their stitching and the light along them left as paper
      fur(cv, body, [206, 330, 336, 372], 90, (x) => (x < 270 ? 30 : -12), (x, y) => (x < 250 ? 0.35 : 0.08) * smooth(372, 350, y), { length: 11, width: 4 });
      const legs = [[[268, 328], [271, 342], [272, 356]], [[282, 346], [288, 354]], [[318, 334], [326, 340]], [[330, 342], [336, 346]],
        [[252, 352], [260, 360]], [[292, 330], [300, 333]], [[308, 338], [313, 344]]];
      for (const pts of legs) line(cv, pts, 2.6);
      solid(cv, bootL, 2.2);
      solid(cv, bootR, 2.2);

      const stitches = [
        [[[222, 372], [223, 388], [226, 402], [232, 412]], 3], [[[232, 370], [234, 384], [240, 396], [250, 404]], 3.2],
        [[[244, 372], [250, 380], [260, 382]], 2.6], [[[240, 386], [246, 393], [254, 395]], 2], [[[256, 388], [258, 398], [262, 402]], 2],
        [[[226, 392], [229, 404]], 2], [[[234, 420], [246, 416], [256, 420], [264, 428], [274, 436], [288, 443]], 3.2],
        [[[262, 372], [262, 390], [258, 406]], 2.4], [[[248, 428], [256, 432], [262, 440]], 2], [[[236, 430], [242, 438]], 1.8],
        [[[216, 446], [240, 447], [258, 449], [280, 449], [294, 449]], 2], [[[240, 448], [238, 456]], 2.2], [[[280, 442], [291, 446]], 2.6],
        [[[216, 372], [216, 420]], 2],
        [[[286, 354], [294, 368], [302, 384], [310, 398], [320, 410]], 2.6], [[[296, 352], [306, 366], [316, 382], [326, 396]], 2.6],
        [[[308, 350], [318, 362], [328, 368]], 2.2], [[[300, 378], [306, 390]], 2], [[[318, 388], [326, 398], [332, 402]], 2],
        [[[316, 404], [326, 410], [336, 418]], 2], [[[346, 393], [360, 396], [376, 394], [388, 392]], 2.4], [[[352, 401], [366, 402], [376, 399]], 1.8],
        [[[330, 428], [348, 420], [366, 412], [386, 401]], 2], [[[330, 426], [344, 424]], 2.4],
        [[[244, 384], [252, 380], [257, 386], [252, 392], [246, 389]], 1.8], [[[312, 372], [320, 370], [324, 377], [318, 382], [313, 378]], 1.8],
      ];
      for (const [pts, w] of stitches) line(cv, pts, w, PAPER, { start: 0.4, end: 0.3 });
      line(cv, [[332, 352], [335, 364], [338, 376], [342, 386]], 3, PAPER, { start: 0.2, end: 0.2, peak: 0.4 });
      fringe(cv, [[216, 370], [240, 372], [266, 373]], 95, 12, 8, 3.4);
      fringe(cv, [[294, 362], [312, 352], [334, 348]], 105, 10, 8, 3.2);

      // the hat: a wide brim, dark beneath, its top lit in a broad sweep from the crown out to the curled-up tip; a dented crown
      solid(cv, brim, 2.4);
      line(cv, [[226, 109], [250, 116], [276, 124], [300, 130], [322, 135], [342, 140], [355, 147], [357, 154]],
        13, PAPER, { start: 0.12, end: 0.35, peak: 0.72, tremble: 0.35 });
      line(cv, [[296, 141], [320, 147], [340, 151], [354, 157]], 2.4, INK, { start: 0.2, end: 0.6 });
      fur(cv, brim, [222, 104, 360, 160], 120, () => 20, (x, y) => 0.6 * smooth(7, 0, Math.abs(y - (109 + (x - 226) * 0.3))), { length: 6, width: 2.2 });
      fur(cv, brim, [166, 104, 330, 168], 170, (x) => 72 + (x - 200) * 0.3, (x, y) => 0.08 + smooth(160, 112, y) * 0.5, { colour: PAPER, length: 8, width: 2 });
      solid(cv, shape([[216, 110], [216, 94], [219, 80], [225, 71], [236, 66], [254, 63], [270, 65], [274, 74], [266, 86], [258, 96], [246, 104], [232, 109]],
        0.6));
      solid(cv, shape([[290, 68], [306, 71], [314, 77], [316, 88], [306, 80], [294, 76]], 0.5));
      fur(cv, crown, [214, 62, 272, 112], 110, () => 80, () => 0.55, { colour: PAPER, length: 7, width: 2.2 });
      line(cv, [[260, 66], [284, 68], [304, 71], [314, 78], [317, 92], [319, 108], [320, 122]], 5, INK, { start: 0.8, end: 0.7, peak: 0.25 });
      line(cv, [[222, 90], [236, 83], [250, 85], [264, 92]], 4.4, PAPER, { start: 0.2, end: 0.2 });
      let dots = '';
      for (let i = 0; i < 20; i++) {
        const r = 0.8 + rnd() * rnd() * 2.4;
        dots += `<ellipse cx="${n(268 + rnd() * 40)}" cy="${n(80 + rnd() * 32)}" rx="${n(r * 1.3)}" ry="${n(r)}"/>`;
      }
      cv.add(`<g fill="${INK}" filter="${torn(cv, rnd, 1.6, 0.2)}">${dots}</g>`);
      line(cv, [[214, 107], [240, 110], [266, 116], [292, 122], [320, 125]], 5, INK, { start: 0.7, end: 0.8 });

      // the grain of a worn block: pin-holes of paper in the solid ink, stray specks of ink in the light
      for (const [d, box, count] of [[brim, [164, 102, 364, 168], 260], [bootL, [212, 362, 300, 458], 160], [bootR, [276, 342, 402, 440], 150],
        [tail, [114, 280, 210, 358], 120], [body, [188, 226, 260, 368], 200]]) {
        specks(cv, rnd, d, box, { count, colours: [PAPER], size: [0.35, 0.85], opacity: [0.8, 1] });
      }
      specks(cv, rnd, body, [196, 166, 330, 372], { count: 160, colours: [INK], size: [0.4, 1.1], opacity: [0.9, 1] });
      specks(cv, rnd, crown, [262, 66, 318, 120], { count: 30, colours: [INK], size: [0.4, 1], opacity: [0.9, 1] });
    });
    return s.done({ finish: { paint: 0, grain: 0.012, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
