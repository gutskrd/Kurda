/**
 * Frames with a living thing in them (see frames.mjs): a fawn curled into a
 * ring, a fox asleep on one, the snake that holds its own tail,
 * and a pair of wings folded round the face, in white and in black.
 *
 * The fawn, the fox and the snake are drawn as a person draws: the line
 * wanders, a ring is not quite round, colour is brushed on and goes a little
 * over the line (`hand`, `drawnRound`, `dabs`). The fawn is pen and paint, the
 * fox pencil and wash, the snake pale ink stippled on black. The wings are
 * painted as the icons are.
 */
import { crescent, rim, specks, within } from './brush.mjs';
import { blade, linear, spline } from './icons.mjs';
import { n, pt, tint } from './kit.mjs';
import { C, P, RI, ring } from './ring.mjs';
import { Still } from './still.mjs';

const rad = (deg) => (deg * Math.PI) / 180;
const off = ([x, y], deg, len) => [x + Math.cos(rad(deg)) * len, y + Math.sin(rad(deg)) * len];

/**
 * The hand that drew it. What is drawn through this wanders a little off the true line, as a pen does over the
 * length of a stroke (`wander`, pixels), and its edge is roughened as ink is by the tooth of the paper
 * (`rough`). A filter's url; `seed` makes one hand differ from the next.
 */
function hand(cv, seed, wander = 5, rough = 1.5) {
  const f = cv.id('hand');
  cv.def(
    `<filter id="${f}" filterUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="2" seed="${seed}" result="slow"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="slow" scale="${wander}" xChannelSelector="R" yChannelSelector="G" result="wandered"/>` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="2" seed="${seed + 7}" result="tooth"/>` +
      `<feDisplacementMap in="wandered" in2="tooth" scale="${rough}" xChannelSelector="R" yChannelSelector="G"/></filter>`,
  );
  return `url(#${f})`;
}

/**
 * A circle as a hand draws one round the opening: its radius wandering by `by` pixels in a few slow waves. With
 * `within`, it wanders only inward from `r`, so that a ring's inner edge still covers the edge of the picture.
 */
function drawnRound(rnd, r, by, within = false) {
  const waves = [2, 3, 5].map((k, i) => [k, rnd() * Math.PI * 2, [1, 0.6, 0.35][i]]);
  const points = [];
  for (let a = 0; a < 360; a += 6) {
    let w = 0;
    for (const [k, phase, amp] of waves) w += Math.sin(rad(a) * k + phase) * amp;
    w /= 1.95;
    points.push(P(a, r + (within ? (w - 1) * by * 0.5 : w * by * 0.5)));
  }
  return spline(points);
}

/**
 * Paint on a ring, laid on in short strokes that follow it round, between `ri` and `ro`: `count` of them in
 * `colours`, each `length` long and `width` wide. What makes a flat colour a painted one.
 */
function dabs(rnd, count, [ri, ro], colours, { length = 16, width = 4, opacity = [0.12, 0.3] } = {}) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = rnd() * 360;
    const r = ri + rnd() * (ro - ri);
    const span = ((length * (0.6 + rnd() * 0.8)) / r) * (180 / Math.PI);
    out += `<path d="${blade(P(a, r), P(a + span, r + (rnd() - 0.5) * 3), width * (0.6 + rnd() * 0.8), { at: 0.5, point: 0.5, count: 6 })}" fill="${colours[Math.floor(rnd() * colours.length)]}" fill-opacity="${n(opacity[0] + rnd() * (opacity[1] - opacity[0]))}"/>`;
  }
  return out;
}

/**
 * A pair of wings folded down either side of the opening: on each, three rows of feathers lying the one way, as
 * a folded wing's do — the long flight feathers behind, starting low on the side and hanging to the corner, the
 * shorter rows over their roots up to the shoulder at the top. `tones` are the rows' colours, back to front,
 * each [root, tip]; `edge` the line round a feather, `shade` the line down its middle, `rim` the hoop they are
 * set on.
 */
function wings(rnd, { tones, edge, rim, shade, ink }) {
  const s = new Still(rnd);
  // a row on the left side, from its lowest feather up to its highest, so that each lies over the one below it:
  // `from` and `to` are where on the hoop they grow, `lengths` and `turns` what the lowest and the highest come to
  const row = (cv, count, [from, to], reach, lengths, turns, wide, [root, tip]) => {
    let out = '';
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const base = P(from + (to - from) * t, reach);
      const dir = turns[0] + (turns[1] - turns[0]) * t;
      const end = off(base, dir, lengths[0] + (lengths[1] - lengths[0]) * t);
      const d = blade(base, end, wide, { at: 0.56, point: 0.25, bend: 0.06 });
      out += `<path d="${d}" fill="${linear(cv, [[0, root], [0.75, tip]], ...base, ...end)}" stroke="${edge}" stroke-width="1.7" stroke-linejoin="round"/>`;
      out += `<path d="M${pt(off(base, dir, 8))} L${pt(off(end, dir + 180, 8))}" stroke="${shade}" stroke-width="1.3" stroke-opacity="0.7" stroke-linecap="round"/>`;
    }
    return out;
  };
  s.paint((cv) => {
    const side =
      row(cv, 9, [150, 222], 190, [150, 92], [98, 146], 36, tones[0]) +
      row(cv, 9, [158, 238], 186, [106, 66], [110, 162], 34, tones[1]) +
      row(cv, 9, [168, 250], 182, [64, 44], [122, 174], 30, tones[2]) +
      row(cv, 5, [236, 262], 180, [30, 20], [170, 196], 24, tones[2]);
    cv.add(`<g>${side}</g><g transform="translate(512 0) scale(-1 1)">${side}</g>`);
    // the hoop they are set on, round the face
    const hoop = ring(181, RI);
    cv.add(`<path d="${hoop}" fill="${linear(cv, [[0, rim[0]], [1, rim[1]]], 90, 90, 420, 420)}" stroke="${edge}" stroke-width="1.8"/>`);
    crescent(cv, hoop, [3, 4], { colour: rim[2], opacity: 0.8, soft: 2 });
  });
  return s.done({ finish: { paint: 0.8, grain: 0.008, contrast: 0.05, saturation: 1, ink } });
}

export const CREATURES = [
  {
    key: 'ask',
    ku: 'Xeleka Askê',
    en: 'Fawn',
    // a fawn curled into a ring, drawn with a pen and coloured with a brush: the ring is its body, tan, the
    // paint laid on in strokes that go round with it and a few pale spots dabbed on low down; its head rises out
    // of the top and looks down over the face, a little to one side — two small eyes far apart, a pale muzzle,
    // a scribble of pink in each cheek, its ears out to the sides and long fine antlers above them; at the
    // lower right its tail, a tuft tipped with cream. The line is brown and not quite steady, the ring not quite
    // round, and here and there the colour has gone over the line
    still(rnd) {
      const s = new Still(rnd);
      const line = '#6f4a30';
      const TAN = '#c6a47f';
      const PALE = '#f6ecde';
      const outer = drawnRound(rnd, 204, 6);
      const inner = drawnRound(rnd, RI, 4, true);
      // (everything of its head is turned a little, as a head is held)
      const turn = (points) => points.map(([x, y]) => [C + (x - C) * Math.cos(rad(-4)) - (y - 80) * Math.sin(rad(-4)), 80 + (x - C) * Math.sin(rad(-4)) + (y - 80) * Math.cos(rad(-4))]);
      const head = spline(turn([[256, 34], [292, 38], [318, 58], [326, 84], [312, 108], [284, 120], [256, 123], [228, 120], [200, 108], [186, 84], [194, 58], [220, 38]]));
      const ear = (side, droop = 0) => {
        const [from, to] = turn([[C + side * 58, 70], [C + side * 120, 54 + droop]]);
        return blade(from, to, 31, { at: 0.42, point: 0.55, bend: -side * 0.12 });
      };
      const earInside = (side, droop = 0) => {
        const [from, to] = turn([[C + side * 68, 68], [C + side * 108, 58 + droop]]);
        return blade(from, to, 15, { at: 0.42, point: 0.55, bend: -side * 0.12 });
      };
      const tail = `M${pt(P(61, 198))} Q${pt(P(62, 226))} ${pt(P(58, 246))} L${pt(P(54, 234))} L${pt(P(51, 252))} L${pt(P(47, 236))} L${pt(P(42, 246))} Q${pt(P(40, 222))} ${pt(P(45, 198))} Z`;
      const tip = `M${pt(P(60.4, 228))} L${pt(P(58, 246))} L${pt(P(54, 234))} L${pt(P(51, 252))} L${pt(P(47, 236))} L${pt(P(42, 246))} L${pt(P(41.6, 228))} Q${pt(P(51, 236))} ${pt(P(60.4, 228))} Z`;
      const antler = (side) => {
        const at = (v, y) => pt(turn([[C + side * v, y]])[0]);
        return `M${at(28, 46)} Q${at(52, 38)} ${at(80, 20)} Q${at(92, 13)} ${at(100, 6)} M${at(42, 41)} Q${at(38, 24)} ${at(41, 8)} M${at(60, 32)} Q${at(58, 18)} ${at(63, 5)} M${at(80, 20)} Q${at(92, 22)} ${at(104, 19)}`;
      };
      const seeds = [s.seed() % 900, s.seed() % 900];
      // the colour, laid in first and a little out of true with the line that will go over it
      s.paint((cv) => {
        cv.add(`<g filter="${hand(cv, seeds[0], 6, 2.2)}" transform="translate(2 1.6)">`);
        cv.add(`<path d="${tail}" fill="${TAN}"/><path d="${ear(-1, 3)}" fill="${TAN}"/><path d="${ear(1)}" fill="${TAN}"/>`);
        cv.add(`<path d="${outer} ${inner}" fill-rule="evenodd" fill="${TAN}"/><path d="${head}" fill="${TAN}"/>`);
        cv.add('</g>');
      });
      // then the drawing itself: each part with its colour and its line, the nearer over the farther
      s.paint((cv) => {
        cv.add(`<g filter="${hand(cv, seeds[1], 5, 1.5)}" stroke="${line}" stroke-width="3.1" stroke-linejoin="round" stroke-linecap="round">`);
        for (const side of [-1, 1]) cv.add(`<path d="${antler(side)}" fill="none" stroke-width="5.4"/>`);
        cv.add(`<path d="${tail}" fill="${TAN}"/><path d="${tip}" fill="${PALE}" stroke="none"/>`);
        cv.add(`<path d="${ear(-1, 3)}" fill="${TAN}"/><path d="${earInside(-1, 3)}" fill="#ab8a68" stroke="none"/><path d="${ear(1)}" fill="${TAN}"/><path d="${earInside(1)}" fill="#ab8a68" stroke="none"/>`);
        cv.add(`<path d="${outer} ${inner}" fill-rule="evenodd" fill="${TAN}"/>`);
        // (the paint on the ring: strokes of lighter and darker tan going round with it, and its spots)
        cv.add(`<g stroke="none">${dabs(rnd, 150, [176, 199], ['#d8bd9c', '#b08e6a', '#cfb08c', '#ddc6a8'], { length: 22, width: 5, opacity: [0.2, 0.5] })}</g>`);
        for (const [a, r] of [[96, 190], [118, 184], [132, 196], [152, 188], [74, 196], [168, 194]]) cv.add(`<path d="${blade(P(a, r), P(a + 3.4, r + 1), 9, { at: 0.5, point: 0.2, count: 6 })}" fill="${PALE}" stroke="none" fill-opacity="0.9"/>`);
        cv.add(`<path d="${head}" fill="${TAN}"/>`);
        cv.add('</g>');
      });
      s.paint((cv) => {
        // its face, in the same hand: the muzzle, the pink scribbled into its cheeks, the eyes, the nose
        cv.add(`<g filter="${hand(cv, seeds[1] + 3, 2.4, 1.2)}">`);
        const at = (x, y) => turn([[x, y]])[0];
        cv.add(`<path d="${spline(turn([[256, 86], [272, 90], [280, 102], [270, 114], [256, 117], [242, 114], [232, 102], [240, 90]]))}" fill="${PALE}"/>`);
        for (const x of [214, 298]) {
          let scribble = '';
          for (let k = -2; k <= 2; k++) scribble += `M${pt(at(x - 8 + k * 0.8, 98 + k * 3.4))} L${pt(at(x + 8 + k * 0.8, 95.6 + k * 3.4))} `;
          cv.add(`<path d="${scribble}" fill="none" stroke="#ee9f96" stroke-width="2.6" stroke-linecap="round" stroke-opacity="0.85"/>`);
        }
        for (const x of [232, 280]) cv.add(`<ellipse cx="${n(at(x, 78)[0])}" cy="${n(at(x, 78)[1])}" rx="4.4" ry="5.2" fill="#3a2418"/><circle cx="${n(at(x - 1.4, 76.2)[0])}" cy="${n(at(x - 1.4, 76.2)[1])}" r="1.4" fill="#ffffff"/>`);
        cv.add(`<path d="${spline(turn([[250.5, 94], [256, 91.6], [261.5, 94], [260, 99], [256, 101], [252, 99]]))}" fill="#3a2418"/>`);
        cv.add(`<path d="M${pt(at(256, 101))} L${pt(at(256, 105))} M${pt(at(250, 107.4))} Q${pt(at(253, 109.8))} ${pt(at(256, 105))} Q${pt(at(259, 109.8))} ${pt(at(262, 107.4))}" fill="none" stroke="${line}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
        cv.add('</g>');
      });
      return s.done({ finish: { paint: 0, grain: 0.03, contrast: 0.03, saturation: 1 } });
    },
  },
  {
    key: 'rovi',
    ku: 'Xeleka Rovî',
    en: 'Sleeping fox',
    // a soft ring with a fox asleep on it, as a page out of a sketchbook of stickers: a broad hoop washed in
    // apricot and a fine sage one inside it, neither quite round; at the lower left the fox, curled up with its
    // tail brought round and its chin on it, its ears still up; a mushroom and a sprig of clover beside it; two
    // leaves at the upper right, a mauve flower at the left, a small plant in its pot at the right, and here
    // and there a scrap of paper tape. Each piece is drawn in pencil, washed with colour that gathers at its
    // edges, cut out with a white margin and laid down with a little shadow under it
    still(rnd) {
      const s = new Still(rnd);
      const line = '#7c5636';
      const SHADOW = '#8fae90';
      const BOX = [0, 0, 512, 512];
      const seeds = [s.seed() % 900, s.seed() % 900, s.seed() % 900];
      // (a sticker: its shadow, down and to the right, its white margin, then its pieces — each a wash of colour,
      // darker where it has gathered at the edge and grained by the paper, with a pencil line round it)
      const sticker = (cv, shapes, { edge = 9 } = {}) => {
        const all = shapes.map(([d]) => d);
        cv.add(`<g transform="translate(3.2 4.4)" opacity="0.7">${all.map((d) => `<path d="${d}" fill="${SHADOW}" stroke="${SHADOW}" stroke-width="${edge}" stroke-linejoin="round"/>`).join('')}</g>`);
        cv.add(all.map((d) => `<path d="${d}" fill="#fffdf8" stroke="#fffdf8" stroke-width="${edge}" stroke-linejoin="round"/>`).join(''));
        for (const [d, fill] of shapes) {
          cv.add(`<path d="${d}" fill="${fill}"/>`);
          rim(cv, d, { colour: tint(fill, -0.22), width: 3.4, opacity: 0.5, soft: 2 });
          specks(cv, rnd, d, BOX, { count: 2600, colours: ['#ffffff', tint(fill, -0.2)], size: [0.6, 1.5], opacity: [0.1, 0.3] });
          cv.add(`<path d="${d}" fill="none" stroke="${line}" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>`);
        }
      };
      const tape = (cv, a, r, turn, fill) => {
        const [x, y] = P(a, r);
        cv.add(`<rect x="${n(x - 15)}" y="${n(y - 5)}" width="30" height="10" rx="1.5" fill="${fill}" fill-opacity="0.9" transform="rotate(${turn} ${n(x)} ${n(y)})"/>`);
      };
      s.paint((cv) => {
        // the hoops: the broad one washed in, the fine one drawn twice round
        cv.add(`<g filter="${hand(cv, seeds[0], 5, 1.6)}">`);
        cv.add(`<path d="${drawnRound(rnd, 209, 4)} ${drawnRound(rnd, 195, 4)}" fill-rule="evenodd" fill="#fadfb8"/>`);
        cv.add(dabs(rnd, 120, [197, 207], ['#fdeed2', '#f4cf9e', '#fbe4c2'], { length: 26, width: 5, opacity: [0.3, 0.7] }));
        cv.add(`<path d="${drawnRound(rnd, 209.6, 4)}" fill="none" stroke="#cdb4dc" stroke-width="1.6" stroke-opacity="0.9"/>`);
        const fine = drawnRound(rnd, 182, 3, true);
        cv.add(`<path d="${fine}" fill="none" stroke="#a9bfa4" stroke-width="5"/><path d="${fine}" fill="none" stroke="#f1f7ec" stroke-width="1.8"/>`);
        // scraps of tape across the broad hoop, and a bead where the fine one is tied
        tape(cv, 206, 202, 4, '#f3d596');
        tape(cv, 199, 206, -3, '#6aa25e');
        tape(cv, 24, 202, -5, '#e6d2f0');
        tape(cv, 30, 206, 3, '#f3d596');
        for (const a of [-58, 92]) cv.add(`<circle cx="${n(P(a, 181)[0] + 2)}" cy="${n(P(a, 181)[1] + 3)}" r="7" fill="${SHADOW}" fill-opacity="0.6"/><circle cx="${n(P(a, 181)[0])}" cy="${n(P(a, 181)[1])}" r="7" fill="#fffdf8" stroke="#b9c9b4" stroke-width="1.5"/>`);
        cv.add('</g>');
      });
      s.paint((cv) => {
        cv.add(`<g filter="${hand(cv, seeds[1], 3.4, 1.4)}">`);
        // the two leaves at the upper right
        const twig = P(-40, 206);
        sticker(cv, [
          [blade(off(twig, -150, 6), off(twig, -74, 34), 19, { at: 0.5, point: 0.75 }), '#a9b866'],
          [blade(off(twig, 60, 8), off(twig, 34, 50), 24, { at: 0.48, point: 0.75 }), '#6aa052'],
        ]);
        cv.add(`<path d="M${pt(off(twig, -150, 2))} L${pt(off(twig, -76, 28))} M${pt(off(twig, 58, 12))} L${pt(off(twig, 35, 44))}" stroke="#3f6e34" stroke-width="1.4" stroke-linecap="round" stroke-opacity="0.7"/>`);
        // the mauve flower at the left, and its leaf
        const bloom = P(190, 204);
        const petals = [];
        for (let i = 0; i < 5; i++) petals.push([blade(off(bloom, i * 72 - 90, 2), off(bloom, i * 72 - 90, 18), 17, { at: 0.62, point: 0.02 }), '#cbb8e4']);
        sticker(cv, [[blade(off(bloom, 96, 16), off(bloom, 112, 46), 19, { at: 0.5, point: 0.75 }), '#85b068'], ...petals]);
        cv.add(`<circle cx="${n(bloom[0])}" cy="${n(bloom[1])}" r="5.6" fill="#f6dc8a" stroke="${line}" stroke-width="1.5"/>`);
        // the plant in its pot at the right
        const [px, py] = P(14, 206);
        const pot = `M${n(px - 15)} ${n(py + 2)} H${n(px + 15)} L${n(px + 11)} ${n(py + 26)} H${n(px - 11)} Z`;
        const fronds = [-64, -32, 0, 32, 64].map((turn, i) => [blade([px + turn * 0.08, py + 4], off([px, py + 4], turn - 90, 22 + (i % 2) * 6), 14, { at: 0.55, point: 0.35 }), i % 2 ? '#84b76e' : '#9dc888']);
        sticker(cv, [...fronds, [pot, '#cb9d70']]);
        cv.add(`<path d="M${n(px - 15)} ${n(py + 2)} H${n(px + 15)} V${n(py + 8)} H${n(px - 15)} Z" fill="#b98a5e" stroke="${line}" stroke-width="1.7" stroke-linejoin="round"/>`);
        cv.add('</g>');
      });
      s.paint((cv) => {
        cv.add(`<g filter="${hand(cv, seeds[2], 3.6, 1.4)}">`);
        // beside the fox: a mushroom, and three leaves of clover
        const stalk = 'M213 458 Q210 444 215 434 L229 434 Q234 444 231 458 Q222 463 213 458 Z';
        const cap = 'M196 438 Q198 410 222 408 Q246 410 248 438 Q222 446 196 438 Z';
        const clover = [0, 120, 240].map((turn) => [blade([196, 462], off([196, 462], turn - 100, 13), 13, { at: 0.62, point: 0.02 }), '#6aa052']);
        sticker(cv, [[stalk, '#fff5e2'], [cap, '#e6aa52'], ...clover]);
        cv.add('<circle cx="212" cy="424" r="4" fill="#fff6e4"/><circle cx="230" cy="420" r="3.2" fill="#fff6e4"/><circle cx="236" cy="432" r="2.6" fill="#fff6e4"/>');
        // the fox: its tail brought round in front of it, its body, its ears, its head laid down on the tail
        const TAN = '#e9c490';
        const DEEP = '#dcae72';
        const CREAM = '#fff7ea';
        const body = spline([[92, 404], [110, 372], [150, 362], [184, 380], [190, 414], [166, 438], [120, 440], [94, 428]]);
        const tail = spline([[192, 398], [190, 430], [168, 452], [130, 460], [96, 454], [72, 438], [62, 418], [86, 426], [112, 432], [138, 430], [158, 420], [168, 400]]);
        const tip = spline([[62, 418], [72, 438], [96, 454], [110, 457], [108, 444], [112, 432], [86, 426]]);
        const ear = (x, y, lean, k = 1) => `M${n(x - 15 * k)} ${n(y + 14 * k)} Q${n(x + (lean - 10) * k)} ${n(y - 12 * k)} ${n(x + lean * 1.6 * k)} ${n(y - 26 * k)} Q${n(x + (14 + lean * 0.4) * k)} ${n(y - 8 * k)} ${n(x + 16 * k)} ${n(y + 12 * k)} Z`;
        const head = spline([[100, 352], [126, 358], [140, 376], [150, 396], [130, 412], [100, 420], [70, 412], [50, 396], [60, 376], [74, 358]]);
        sticker(cv, [[body, TAN], [tail, TAN], [tip, CREAM], [ear(74, 360, -6), DEEP], [ear(124, 358, 6), DEEP], [head, TAN]]);
        cv.add(`<path d="${ear(73, 362, -6, 0.52)}" fill="${CREAM}"/><path d="${ear(125, 360, 6, 0.52)}" fill="${CREAM}"/>`);
        // its face: pale from the cheeks down, pink scribbled into them, asleep
        cv.add(`<g clip-path="${within(cv, head)}"><path d="${spline([[100, 386], [128, 390], [152, 396], [132, 414], [100, 422], [68, 414], [48, 396], [72, 390]])}" fill="${CREAM}"/></g>`);
        for (const x of [68, 132]) cv.add(`<path d="M${x - 6} 399 L${x + 6} 397.4 M${x - 6} 402.4 L${x + 6} 400.8 M${x - 5} 405.6 L${x + 5} 404.2" fill="none" stroke="#f0a096" stroke-width="2" stroke-linecap="round" stroke-opacity="0.8"/>`);
        cv.add(`<path d="${head}" fill="none" stroke="${line}" stroke-width="1.9" stroke-linejoin="round"/>`);
        cv.add(`<path d="M74 387 Q81 393 88 387 M112 387 Q119 393 126 387" fill="none" stroke="#5a3a26" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="100" cy="399" rx="3.8" ry="2.7" fill="#5a3a26"/><path d="M100 401.6 V404.4 M95.6 406.4 Q98 408 100 404.4 Q102 408 104.4 406.4" fill="none" stroke="#5a3a26" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);
        // (the line of its haunch, and the fur of its tail)
        cv.add(`<path d="M152 372 Q168 382 170 402" fill="none" stroke="${line}" stroke-width="1.6" stroke-linecap="round" stroke-opacity="0.7"/><path d="M150 444 q4 -8 12 -10 M130 448 q3 -8 10 -11 M96 438 q2 -6 8 -8" fill="none" stroke="${line}" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.6"/>`);
        cv.add('</g>');
      });
      return s.done({ finish: { paint: 0, grain: 0.03, contrast: 0.03, saturation: 1 } });
    },
  },
  {
    key: 'mar',
    ku: 'Xeleka Marî',
    en: 'Serpent',
    // the snake that holds its own tail, drawn in pale ink on black as an engraver would, dot by dot: a thick
    // body once round the face, thinning to the tail; its scales small pale strokes, its roundness all in the
    // stippling, thick along its back and thinning to its sides. Its head is at the upper right, and a gentle
    // one: round at the snout, the mouth closed on the end of the tail in a quiet line, a round eye half shut
    still(rnd) {
      const s = new Still(rnd);
      const R = 194;
      const DARK = '#17191f';
      const BONE = '#f3efe4';
      const NECK = -66;
      const SWEEP = 346;
      const ease = (t) => t * t * (3 - 2 * t);
      // its body by `t`, 0 behind the head to 1 at the tip of the tail: where its middle runs, and how thick it
      // is, which is never quite even. The last of the tail turns in a little, to come to the mouth
      const wave = [rnd() * 6, rnd() * 6];
      const angleAt = (t) => NECK - SWEEP * t;
      const midAt = (t) => R - 6 * ease(Math.max(0, (t - 0.88) / 0.12)) + 1.4 * Math.sin(t * 19 + wave[0]);
      const halfAt = (t) => (t < 0.58 ? 21.5 : 21.5 - 16.5 * ((t - 0.58) / 0.42) ** 1.15) * (1 + 0.035 * Math.sin(t * 31 + wave[1]));
      const on = (t, f) => P(angleAt(t), midAt(t) + f * halfAt(t));
      const side = (f) => {
        const out = [];
        for (let i = 0; i <= 120; i++) out.push(on(i / 120, f));
        return out;
      };
      const body = `M${[...side(1), ...side(-1).reverse()].map(pt).join(' L')} Z`;
      // (how much light a place on it takes, by how far across it lies: most a little to the outside of the middle)
      const lit = (f) => Math.max(0, 1 - Math.abs(f - 0.28) * 1.2);
      // the head is drawn flat — `u` forward from the neck, `v` out from the ring — and laid along the ring
      const BIG = 1.16;
      const lay = ([u, v]) => P(NECK + ((u * BIG) / R) * (180 / Math.PI), R + v * BIG);
      const laid = (points, closed = true) => spline(points.map(lay), closed);
      // (it swells out of the neck, with no line where the one becomes the other)
      // (its back end is narrower than the neck and lies inside it; where the neck ends it is a little the wider)
      const skull = [[-10, 13], [0, 21], [10, 23], [22, 24.6], [38, 25], [54, 21], [68, 13], [77, 3], [76, -7], [64, -14.5], [42, -19.5], [22, -22], [10, -22], [0, -21], [-10, -13]];
      const head = laid(skull);
      const seeds = [s.seed() % 900];
      s.paint((cv) => {
        cv.add(`<g filter="${hand(cv, seeds[0], 3.4, 1.6)}">`);
        cv.add(`<path d="${body}" fill="${DARK}" stroke="${DARK}" stroke-width="2.4" stroke-linejoin="round"/>`);
        cv.add(`<path d="M${side(0.92).map(pt).join(' L')}" fill="none" stroke="${BONE}" stroke-width="1.4" stroke-opacity="0.8"/><path d="M${side(-0.92).map(pt).join(' L')}" fill="none" stroke="${BONE}" stroke-width="1.2" stroke-opacity="0.55"/>`);
        cv.add(`<g clip-path="${within(cv, body)}">`);
        // its scales: rows of small strokes, each a hook open toward the head, the rows set between one
        // another; no two quite alike, and fainter where the body turns away
        let scales = '';
        const columns = 118;
        for (let i = 1; i < columns; i++) {
          const t = i / columns;
          const half = halfAt(t);
          const rows = half > 13 ? 5 : half > 8 ? 4 : 3;
          for (let k = 0; k < rows; k++) {
            const f = -0.32 + ((k + (i % 2) * 0.5) / rows) * 1.22 + (rnd() - 0.5) * 0.05;
            if (f > 0.88) continue;
            const reach = (0.62 + rnd() * 0.3) / rows;
            const from = on(t - 0.3 / columns, f - reach);
            const to = on(t - 0.3 / columns, f + reach);
            const tip = on(t + (0.9 + rnd() * 0.5) / columns, f + (rnd() - 0.5) * 0.06);
            scales += `<path d="M${pt(from)} Q${pt(tip)} ${pt(to)}" stroke-width="${n(0.9 + rnd() * 0.7)}" stroke-opacity="${n(0.25 + lit(f) * 0.6)}"/>`;
          }
          // the plates of its belly, along the inside of the ring
          if (i % 2 === 0) scales += `<path d="M${pt(on(t, -0.9))} L${pt(on(t + 0.5 / columns, -0.46 + (rnd() - 0.5) * 0.08))}" stroke-width="${n(1 + rnd() * 0.6)}" stroke-opacity="0.5"/>`;
        }
        cv.add(`<g fill="none" stroke="${BONE}" stroke-linecap="round">${scales}</g>`);
        // the stippling: thousands of dots, thick where the light is and thin where it is not
        let dots = '';
        for (let i = 0; i < 6400; i++) {
          const t = rnd() ** 0.9;
          const f = rnd() * 1.9 - 0.95;
          if (rnd() > lit(f) ** 1.5) continue;
          const [x, y] = on(t, f);
          dots += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(0.5 + rnd() * 0.75)}"/>`;
        }
        cv.add(`<g fill="${BONE}" fill-opacity="0.85">${dots}</g>`);
        cv.add('</g></g>');
      });
      s.paint((cv) => {
        // its head, over the end of its tail: drawn by the same hand as its body, so that the two wander together
        // and the neck runs into the head without a step
        cv.add(`<g filter="${hand(cv, seeds[0], 3.4, 1.6)}">`);
        cv.add(`<path d="${head}" fill="${DARK}" stroke="${DARK}" stroke-width="2.4" stroke-linejoin="round"/>`);
        cv.add(`<path d="${laid(skull.slice(1, -1).map(([u, v]) => [u, v * 0.93]), false)}" fill="none" stroke="${BONE}" stroke-width="1.4" stroke-opacity="0.85" stroke-linejoin="round" stroke-linecap="round"/>`);
        // stippled as the body is: light along the top of it, and round the eye
        let dots = '';
        for (let i = 0; i < 900; i++) {
          const [u, v] = [-6 + rnd() * 82, -18 + rnd() * 42];
          const d = Math.hypot(u - 52, v - 9);
          if (d < 9 || rnd() > Math.max(0, (v + 10) / 34) ** 1.3) continue;
          const [x, y] = lay([u, v]);
          dots += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(0.5 + rnd() * 0.75)}"/>`;
        }
        cv.add(`<g fill="${BONE}" fill-opacity="0.85" clip-path="${within(cv, head)}">${dots}</g>`);
        // a few of the large scales of its crown
        let crown = '';
        for (const [u, v, w] of [[-2, 9, 5], [10, 12, 7], [24, 15, 8], [38, 16, 7], [2, -1, 5], [16, 3, 6], [30, 5, 6], [8, -10, 5], [24, -9, 5]]) crown += `M${pt(lay([u - w, v - 3]))} Q${pt(lay([u, v + 5]))} ${pt(lay([u + w, v - 3]))} `;
        cv.add(`<path d="${crown}" fill="none" stroke="${BONE}" stroke-width="1.3" stroke-opacity="0.75" stroke-linecap="round"/>`);
        // its mouth, closed on the tail: one quiet line from the snout back, turning up a little at its end
        cv.add(`<path d="${laid([[76, -4], [62, -7.5], [46, -8], [36, -4.5]], false)}" fill="none" stroke="${BONE}" stroke-width="1.8" stroke-linecap="round" stroke-opacity="0.9"/>`);
        // its eye: round, with a round dark middle and a point of light, the lid half down over it
        const eye = lay([52, 9]);
        cv.add(`<circle cx="${n(eye[0])}" cy="${n(eye[1])}" r="7.4" fill="${BONE}"/><circle cx="${n(eye[0] + 0.6)}" cy="${n(eye[1] + 0.8)}" r="4.2" fill="${DARK}"/><circle cx="${n(eye[0] - 0.8)}" cy="${n(eye[1] - 0.8)}" r="1.4" fill="${BONE}"/>`);
        cv.add(`<path d="${laid([[43, 13.5], [52, 17.5], [61, 12.5]], false)}" fill="none" stroke="${DARK}" stroke-width="5" stroke-linecap="round"/><path d="${laid([[42, 15.5], [52, 20], [62, 14.5]], false)}" fill="none" stroke="${BONE}" stroke-width="1.5" stroke-linecap="round"/>`);
        cv.add(`<circle cx="${n(lay([70, 2])[0])}" cy="${n(lay([70, 2])[1])}" r="1.3" fill="${BONE}" fill-opacity="0.9"/>`);
        cv.add('</g>');
      });
      return s.done({ finish: { paint: 0, grain: 0.02, contrast: 0.04, saturation: 1, ink: { colour: '#f3efe4', width: 1.1, opacity: 0.7 } } });
    },
  },
  {
    key: 'bask-spi',
    ku: 'Baskên Spî',
    en: 'White wings',
    // a pair of white wings folded round the face from the top, their long feathers hanging below it
    still(rnd) {
      return wings(rnd, {
        tones: [['#c9d2e4', '#f4f6fb'], ['#dbe2ef', '#ffffff'], ['#eef1f7', '#ffffff']],
        edge: '#8e9ab4',
        shade: '#b4bfd6',
        rim: ['#ffffff', '#cfd7e6', '#ffffff'],
        ink: { colour: '#3a4460', width: 2.6 },
      });
    },
  },
  {
    key: 'bask-res',
    ku: 'Baskên Reş',
    en: 'Black wings',
    // the same wings in black, as a raven's: each feather with a little of the sky's blue along it
    still(rnd) {
      return wings(rnd, {
        tones: [['#0c0d14', '#24283a'], ['#12141e', '#2e3348'], ['#191c28', '#3a4058']],
        edge: '#5a6384',
        shade: '#6a7498',
        rim: ['#3a4058', '#0c0d14', '#6a7498'],
        ink: { colour: '#7a86ac', width: 1.6, opacity: 0.8 },
      });
    },
  },
];
