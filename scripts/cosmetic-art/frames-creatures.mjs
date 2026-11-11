/**
 * Frames with a living thing in them (see frames.mjs): a fawn curled into a
 * ring, a fox asleep on one, the snake that holds its own tail,
 * and a pair of wings folded round the face, in white and in black.
 *
 * The fawn and the fox are drawn in flat, quiet colour with one fine line;
 * the snake is cut pale on black, as an engraving is; the wings are painted
 * as the icons are.
 */
import { crescent, softly, within } from './brush.mjs';
import { blade, linear, spline, tube } from './icons.mjs';
import { n, pt } from './kit.mjs';
import { C, P, RI, ring, round } from './ring.mjs';
import { Still } from './still.mjs';

const rad = (deg) => (deg * Math.PI) / 180;
const off = ([x, y], deg, len) => [x + Math.cos(rad(deg)) * len, y + Math.sin(rad(deg)) * len];

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
    // a fawn curled into a ring: the ring is its body, a quiet tan, and its head rises out of the top of it and
    // looks down over the face — wide, low, two small eyes far apart, a pale muzzle, pink in its cheeks, its
    // ears laid out to the sides and above them long fine antlers, three tines to each; at the lower right its
    // tail, a tuft tipped with cream. Flat colour and one fine brown line, nothing more
    still(rnd) {
      const s = new Still(rnd);
      const line = '#7a4d30';
      const TAN = '#c2a07c';
      const SHADE = '#ab8a68';
      const PALE = '#f4e8d8';
      const body = ring(204, RI);
      // its head: a low dome on the top of the ring, its cheeks a little full, coming down over the ring's inner edge
      const head = spline([[256, 34], [292, 38], [318, 58], [326, 84], [312, 108], [284, 120], [256, 123], [228, 120], [200, 108], [186, 84], [194, 58], [220, 38]]);
      const ear = (side) => blade([C + side * 58, 70], [C + side * 118, 54], 30, { at: 0.42, point: 0.55, bend: -side * 0.12 });
      const tail = `M${pt(P(61, 198))} Q${pt(P(62, 226))} ${pt(P(58, 246))} L${pt(P(54, 234))} L${pt(P(51, 252))} L${pt(P(47, 236))} L${pt(P(42, 246))} Q${pt(P(40, 222))} ${pt(P(45, 198))} Z`;
      s.paint((cv) => {
        // the antlers behind everything: a beam going up and out, and three tines standing on it
        for (const side of [-1, 1]) {
          const x = (v) => C + side * v;
          const d = `M${x(28)} 46 Q${x(52)} 38 ${x(80)} 20 Q${x(92)} 13 ${x(100)} 6 M${x(42)} 41 Q${x(38)} 24 ${x(41)} 8 M${x(60)} 32 Q${x(58)} 18 ${x(63)} 5 M${x(80)} 20 Q${x(92)} 22 ${x(104)} 19`;
          cv.add(`<path d="${d}" fill="none" stroke="${line}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`);
          cv.add(`<path d="${d}" fill="none" stroke="#9a6a44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.9"/>`);
        }
        // the tail, the ears, the ring and the head: one line round all of them where they join
        const whole = [tail, ear(-1), ear(1), body, head];
        cv.add(whole.map((d) => `<path d="${d}" fill="${line}" stroke="${line}" stroke-width="5.4" stroke-linejoin="round"/>`).join(''));
        cv.add(`<path d="${tail}" fill="${TAN}"/>`);
        cv.add(`<path d="M${pt(P(60.4, 228))} L${pt(P(58, 246))} L${pt(P(54, 234))} L${pt(P(51, 252))} L${pt(P(47, 236))} L${pt(P(42, 246))} L${pt(P(41.6, 228))} Q${pt(P(51, 236))} ${pt(P(60.4, 228))} Z" fill="${PALE}"/>`);
        for (const side of [-1, 1]) {
          cv.add(`<path d="${ear(side)}" fill="${TAN}"/>`);
          cv.add(`<path d="${blade([C + side * 68, 68], [C + side * 108, 57], 15, { at: 0.42, point: 0.55, bend: -side * 0.12 })}" fill="${SHADE}"/>`);
        }
        cv.add(`<path d="${body}" fill="${TAN}"/>`);
        // (the ring a little darker along the side away from the light, and a fine line just inside its inner edge)
        crescent(cv, body, [-5, -6], { colour: SHADE, opacity: 0.55, soft: 5 });
        cv.add(`<path d="${round(RI + 5.5)}" fill="none" stroke="${line}" stroke-width="1.6" stroke-opacity="0.55"/>`);
        cv.add(`<path d="${head}" fill="${TAN}"/>`);
      });
      s.paint((cv) => {
        // its face
        const muzzle = spline([[256, 86], [272, 90], [280, 102], [270, 114], [256, 117], [242, 114], [232, 102], [240, 90]]);
        cv.add(`<path d="${muzzle}" fill="${PALE}" stroke="${line}" stroke-width="1.4" stroke-opacity="0.45"/>`);
        cv.add(`<circle cx="216" cy="98" r="10" fill="#f2b0a6" fill-opacity="0.85"/><circle cx="296" cy="98" r="10" fill="#f2b0a6" fill-opacity="0.85"/>`);
        cv.add('<circle cx="232" cy="78" r="4.6" fill="#3a2418"/><circle cx="280" cy="78" r="4.6" fill="#3a2418"/><circle cx="230.6" cy="76.4" r="1.4" fill="#ffffff"/><circle cx="278.6" cy="76.4" r="1.4" fill="#ffffff"/>');
        cv.add('<path d="M250.5 94 Q256 91.4 261.5 94 Q261.5 98.6 256 101 Q250.5 98.6 250.5 94 Z" fill="#3a2418"/>');
        cv.add(`<path d="M256 101 V105 M250 107.4 Q253 109.6 256 105 Q259 109.6 262 107.4" fill="none" stroke="${line}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`);
      });
      return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0.03, saturation: 1 } });
    },
  },
  {
    key: 'rovi',
    ku: 'Xeleka Rovî',
    en: 'Sleeping fox',
    // a soft ring with a fox asleep on it, as a page of stickers is laid out: a broad hoop the colour of apricots
    // and a fine sage one inside it; at the lower left the fox, curled up with its tail brought round and its
    // chin on it, its ears still up; a mushroom and a sprig of clover beside it; two leaves at the upper right,
    // a mauve flower at the left, a small plant in its pot at the right, and here and there a scrap of paper
    // tape. Every piece has a white edge and a little shadow under it
    still(rnd) {
      const s = new Still(rnd);
      const line = '#8a5f3c';
      const SHADOW = '#8fae90';
      // (a sticker: its shadow, down and to the right, its white edge, then its pieces with a fine line)
      const sticker = (cv, shapes, { edge = 9 } = {}) => {
        const all = shapes.map(([d]) => d);
        cv.add(`<g transform="translate(3.2 4.2)" opacity="0.75">${all.map((d) => `<path d="${d}" fill="${SHADOW}" stroke="${SHADOW}" stroke-width="${edge}" stroke-linejoin="round"/>`).join('')}</g>`);
        cv.add(all.map((d) => `<path d="${d}" fill="#ffffff" stroke="#ffffff" stroke-width="${edge}" stroke-linejoin="round"/>`).join(''));
        cv.add(shapes.map(([d, fill]) => `<path d="${d}" fill="${fill}" stroke="${line}" stroke-width="1.8" stroke-linejoin="round"/>`).join(''));
      };
      const tape = (cv, a, r, turn, fill) => {
        const [x, y] = P(a, r);
        cv.add(`<rect x="${n(x - 15)}" y="${n(y - 5)}" width="30" height="10" rx="1.5" fill="${fill}" fill-opacity="0.92" transform="rotate(${turn} ${n(x)} ${n(y)})"/>`);
      };
      s.paint((cv) => {
        // the hoops
        const broad = ring(209, 195);
        cv.add(`<path d="${broad}" fill="${linear(cv, [[0, '#fdebcb'], [0.5, '#f9d9ac'], [1, '#fbe6c0']], 90, 90, 420, 420)}" stroke="#dcc6e6" stroke-width="1.6"/>`);
        cv.add(`<path d="${round(205.5)}" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.75"/>`);
        cv.add(`<path d="${round(181)}" fill="none" stroke="#b9cbb4" stroke-width="5"/><path d="${round(181)}" fill="none" stroke="#f1f7ec" stroke-width="2"/>`);
        // scraps of tape across the broad hoop, and a bead where the fine one is tied
        tape(cv, 206, 202, 0, '#f6dba0');
        tape(cv, 199, 206, 0, '#6aa25e');
        tape(cv, 24, 202, 0, '#ecd9f4');
        tape(cv, 30, 206, 0, '#f6dba0');
        for (const a of [-58, 92]) cv.add(`<circle cx="${n(P(a, 181)[0] + 2)}" cy="${n(P(a, 181)[1] + 3)}" r="7" fill="${SHADOW}" fill-opacity="0.6"/><circle cx="${n(P(a, 181)[0])}" cy="${n(P(a, 181)[1])}" r="7" fill="#ffffff" stroke="#c9d6c4" stroke-width="1.4"/>`);
      });
      s.paint((cv) => {
        // the two leaves at the upper right
        const twig = P(-40, 206);
        sticker(cv, [
          [blade(off(twig, -150, 6), off(twig, -74, 34), 19, { at: 0.5, point: 0.75 }), '#a9b866'],
          [blade(off(twig, 60, 8), off(twig, 34, 50), 24, { at: 0.48, point: 0.75 }), '#5f9c4a'],
        ]);
        cv.add(`<path d="M${pt(off(twig, -150, 2))} L${pt(off(twig, -76, 28))} M${pt(off(twig, 58, 12))} L${pt(off(twig, 35, 44))}" stroke="#3f6e34" stroke-width="1.4" stroke-linecap="round" stroke-opacity="0.7"/>`);
        // the mauve flower at the left, and its leaf
        const bloom = P(190, 204);
        const petals = [];
        for (let i = 0; i < 5; i++) petals.push([blade(off(bloom, i * 72 - 90, 2), off(bloom, i * 72 - 90, 18), 17, { at: 0.62, point: 0.02 }), '#c8b4e2']);
        sticker(cv, [[blade(off(bloom, 96, 16), off(bloom, 112, 46), 19, { at: 0.5, point: 0.75 }), '#7fae62'], ...petals]);
        cv.add(`<circle cx="${n(bloom[0])}" cy="${n(bloom[1])}" r="5.6" fill="#f6dc8a" stroke="${line}" stroke-width="1.4"/>`);
        // the plant in its pot at the right
        const [px, py] = P(14, 206);
        const pot = `M${n(px - 15)} ${n(py + 2)} H${n(px + 15)} L${n(px + 11)} ${n(py + 26)} H${n(px - 11)} Z`;
        const fronds = [-64, -32, 0, 32, 64].map((turn, i) => [blade([px + turn * 0.08, py + 4], off([px, py + 4], turn - 90, 22 + (i % 2) * 6), 14, { at: 0.55, point: 0.35 }), i % 2 ? '#7fb56a' : '#99c684']);
        sticker(cv, [...fronds, [pot, '#c99a6c']]);
        cv.add(`<path d="M${n(px - 15)} ${n(py + 2)} H${n(px + 15)} V${n(py + 8)} H${n(px - 15)} Z" fill="#b7865a" stroke="${line}" stroke-width="1.6" stroke-linejoin="round"/>`);
      });
      s.paint((cv) => {
        // beside the fox: a mushroom, and three leaves of clover
        const stalk = 'M213 460 Q211 444 215 434 L229 434 Q233 444 231 460 Z';
        const cap = 'M196 438 Q198 410 222 408 Q246 410 248 438 Q222 446 196 438 Z';
        const clover = [0, 120, 240].map((turn) => [blade([196, 462], off([196, 462], turn - 100, 13), 13, { at: 0.62, point: 0.02 }), '#5f9c4a']);
        sticker(cv, [[stalk, '#fff5e2'], [cap, '#e6a84c'], ...clover]);
        cv.add('<circle cx="212" cy="424" r="4" fill="#fff6e4"/><circle cx="230" cy="420" r="3.2" fill="#fff6e4"/><circle cx="236" cy="432" r="2.6" fill="#fff6e4"/>');
        // the fox: its tail brought round in front of it, its body, its ears, its head laid down on the tail
        const TAN = '#e8c08a';
        const DEEP = '#d9a868';
        const CREAM = '#fff6e8';
        const body = spline([[92, 404], [110, 372], [150, 362], [184, 380], [190, 414], [166, 438], [120, 440], [94, 428]]);
        const tail = tube([[186, 408], [180, 438], [144, 454], [104, 448], [80, 428]], 36, 26);
        const tip = tube([[112, 450], [92, 440], [78, 424]], 30, 24, 8);
        const ear = (x, y, lean) => `M${x - 15} ${y + 14} Q${x - 10 + lean} ${y - 12} ${x + lean * 1.6} ${y - 26} Q${x + 14 + lean * 0.4} ${y - 8} ${x + 16} ${y + 12} Z`;
        const head = spline([[100, 352], [126, 358], [140, 376], [150, 396], [130, 412], [100, 420], [70, 412], [50, 396], [60, 376], [74, 358]]);
        sticker(cv, [[body, TAN], [tail, TAN], [tip, CREAM], [ear(74, 360, -6), DEEP], [ear(124, 358, 6), DEEP], [head, TAN]]);
        cv.add(`<path d="${ear(74, 362, -6)}" fill="${CREAM}" transform="translate(74 362) scale(0.56) translate(-74 -356)"/><path d="${ear(124, 360, 6)}" fill="${CREAM}" transform="translate(124 360) scale(0.56) translate(-124 -354)"/>`);
        // its face: pale from the cheeks down, pink in them, asleep
        cv.add(`<g clip-path="${within(cv, head)}"><path d="${spline([[100, 386], [128, 390], [152, 396], [132, 414], [100, 422], [68, 414], [48, 396], [72, 390]])}" fill="${CREAM}"/><ellipse cx="68" cy="401" rx="8.5" ry="5.2" fill="#f4a89e" fill-opacity="0.75" filter="${softly(cv, 1.6)}"/><ellipse cx="132" cy="401" rx="8.5" ry="5.2" fill="#f4a89e" fill-opacity="0.75" filter="${softly(cv, 1.6)}"/></g>`);
        cv.add(`<path d="${head}" fill="none" stroke="${line}" stroke-width="1.8" stroke-linejoin="round"/>`);
        cv.add(`<path d="M74 387 Q81 393 88 387 M112 387 Q119 393 126 387" fill="none" stroke="#5a3a26" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="100" cy="399" rx="3.8" ry="2.7" fill="#5a3a26"/><path d="M100 401.6 V404.4 M95.6 406.4 Q98 408 100 404.4 Q102 408 104.4 406.4" fill="none" stroke="#5a3a26" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);
        // (the line of its haunch, and the fur of its tail)
        cv.add(`<path d="M152 372 Q168 382 170 402" fill="none" stroke="${DEEP}" stroke-width="2.2" stroke-linecap="round"/><path d="M150 444 q4 -8 12 -10 M130 448 q3 -8 10 -11" fill="none" stroke="${DEEP}" stroke-width="2" stroke-linecap="round"/>`);
      });
      return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0.03, saturation: 1 } });
    },
  },
  {
    key: 'mar',
    ku: 'Xeleka Marî',
    en: 'Serpent',
    // the snake that holds its own tail, as an engraver cuts it: black, and every scale on it a small pale mark,
    // brightest along its back and dying away to its sides so that it is round; a thick body once round the
    // face, thinning to the tail; its head at the upper right, heavy-browed, the jaws open on the tail, two
    // fangs, and its forked tongue hanging inside the ring
    still(rnd) {
      const s = new Still(rnd);
      const R = 194;
      const DARK = '#121318';
      const BONE = '#f1ede2';
      const NECK = -66;
      const SWEEP = 346;
      const ease = (t) => t * t * (3 - 2 * t);
      // its body by `t`, 0 behind the head to 1 at the tip of the tail: where its middle runs, and how thick it is.
      // The last of the tail turns in a little, to lie between the jaws
      const angleAt = (t) => NECK - SWEEP * t;
      const midAt = (t) => R - 20 * ease(Math.max(0, (t - 0.9) / 0.1));
      const halfAt = (t) => (t < 0.58 ? 21.5 : 21.5 - 16.5 * ((t - 0.58) / 0.42) ** 1.15);
      const on = (t, f) => P(angleAt(t), midAt(t) + f * halfAt(t));
      const side = (f) => {
        const out = [];
        for (let i = 0; i <= 120; i++) out.push(on(i / 120, f));
        return out;
      };
      const body = `M${[...side(1), ...side(-1).reverse()].map(pt).join(' L')} Z`;
      // the head is drawn flat — `u` forward from the neck, `v` out from the ring — and laid along the ring, a
      // little larger than it is drawn, as a snake's head is broader than its neck
      const BIG = 1.2;
      const lay = ([u, v]) => P(NECK + ((u * BIG) / R) * (180 / Math.PI), R + v * BIG);
      const laid = (points, closed = true) => spline(points.map(lay), closed);
      const skull = laid([[-4, 18.5], [14, 22.5], [34, 24.5], [52, 20], [68, 12], [80, 4], [78, -3], [60, -5], [38, -6], [16, -8], [-4, -10]]);
      const jaw = laid([[-4, -6], [10, -8], [30, -17], [52, -28], [68, -37], [66, -44], [46, -40], [22, -30], [-4, -18.5]]);
      const mouth = laid([[12, -7], [40, -6], [76, -3], [70, -22], [66, -36], [44, -25], [24, -15]]);
      s.paint((cv) => {
        // the tongue first, from between the jaws out into the ring: it forks at its end
        const tongue = `M${pt(lay([50, -24]))} Q${pt(lay([70, -40]))} ${pt(lay([78, -56]))} Q${pt(lay([80, -66]))} ${pt(lay([90, -70]))} M${pt(lay([78, -56]))} Q${pt(lay([74, -66]))} ${pt(lay([78, -76]))}`;
        cv.add(`<path d="${tongue}" fill="none" stroke="${DARK}" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/><path d="${tongue}" fill="none" stroke="#c8343c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`);
        // the body, black, with a pale line along either edge of it
        cv.add(`<path d="${body}" fill="${DARK}" stroke="${DARK}" stroke-width="2.4" stroke-linejoin="round"/>`);
        cv.add(`<path d="M${side(0.93).map(pt).join(' L')}" fill="none" stroke="${BONE}" stroke-width="1.3" stroke-opacity="0.75"/><path d="M${side(-0.93).map(pt).join(' L')}" fill="none" stroke="${BONE}" stroke-width="1.3" stroke-opacity="0.6"/>`);
        // its scales: rows of them down its back, each a small pale leaf pointing to the tail and overlapping the
        // next, the rows set between one another; and along its belly, on the inside of the ring, the broad
        // plates that run across it
        let scales = '';
        const columns = 132;
        for (let i = 1; i < columns; i++) {
          const t = i / columns;
          const half = halfAt(t);
          const rows = half > 13 ? 5 : half > 8 ? 4 : 3;
          for (let k = 0; k < rows; k++) {
            const f = -0.3 + ((k + (i % 2) * 0.5) / rows) * 1.2;
            if (f > 0.9) continue;
            const from = on(t, f);
            const to = on(Math.min(1, t + 1.5 / columns), f);
            // (how brightly it is cut: most along the back, a little to the outside of the middle)
            const lit = Math.max(0.16, 1 - Math.abs(f - 0.3) * 1.25) * (0.75 + rnd() * 0.25);
            scales += `<path d="${blade(from, to, Math.max(2.4, half * 0.36), { at: 0.42, point: 0.7, count: 6 })}" fill="${BONE}" fill-opacity="${n(lit)}"/>`;
          }
          if (i % 2 === 0) scales += `<path d="M${pt(on(t, -0.9))} L${pt(on(t + 0.6 / columns, -0.42))}" stroke="${BONE}" stroke-width="${n(Math.max(1.2, half * 0.13))}" stroke-opacity="0.6" stroke-linecap="round"/>`;
        }
        cv.add(`<g clip-path="${within(cv, body)}">${scales}</g>`);
      });
      s.paint((cv) => {
        // the head: the dark inside of the mouth, the lower jaw, the skull over them
        cv.add(`<path d="${mouth}" fill="#2a0c10"/>`);
        // (the end of the tail lying in the mouth, pale against it)
        const end = [];
        for (let i = 0; i <= 12; i++) end.push(on(0.955 + (i / 12) * 0.045, 0));
        cv.add(`<path d="M${end.map(pt).join(' L')}" fill="none" stroke="${BONE}" stroke-width="1.2" stroke-opacity="0.5" stroke-dasharray="3 3"/>`);
        for (const d of [jaw, skull]) cv.add(`<path d="${d}" fill="${DARK}" stroke="${DARK}" stroke-width="2.4" stroke-linejoin="round"/>`);
        for (const d of [jaw, skull]) cv.add(`<path d="${d}" fill="none" stroke="${BONE}" stroke-width="1.5" stroke-opacity="0.85" stroke-linejoin="round" clip-path="${within(cv, d)}"/>`);
        // the plates of its head, cut in pale: the big ones over the skull, small ones along the lips
        let plates = '';
        for (const [u, v, w, h, o] of [[8, 12, 9, 7, 0.75], [22, 15, 10, 7, 0.9], [36, 16.5, 9, 6, 0.9], [14, 3, 8, 6, 0.55], [28, 5, 8, 6, 0.7], [58, 11, 8, 5, 0.85], [68, 5.5, 6, 4, 0.8], [4, -1, 6, 5, 0.4]]) plates += `<path d="${laid([[u - w / 2, v], [u, v + h / 2], [u + w / 2, v], [u, v - h / 2]])}" fill="${BONE}" fill-opacity="${o}"/>`;
        for (let u = 18; u <= 72; u += 7) plates += `<path d="${laid([[u - 2.6, -2.2], [u, -0.2], [u + 2.6, -2.2], [u, -4.2]])}" fill="${BONE}" fill-opacity="0.6"/>`;
        for (let i = 0; i < 7; i++) plates += `<path d="${laid([[8 + i * 8, -12 - i * 4.2], [11 + i * 8, -10.6 - i * 4.2], [14 + i * 8, -14 - i * 4.2], [11 + i * 8, -16.4 - i * 4.2]])}" fill="${BONE}" fill-opacity="${n(0.7 - i * 0.04)}"/>`;
        cv.add(plates);
        // its eye under the brow, and the pit of its nostril
        const eye = lay([48, 11.5]);
        cv.add(`<path d="${laid([[38, 18.5], [50, 19.5], [62, 14]], false)}" fill="none" stroke="${BONE}" stroke-width="2.4" stroke-linecap="round"/>`);
        cv.add(`<ellipse cx="${n(eye[0])}" cy="${n(eye[1])}" rx="7.6" ry="5.4" transform="rotate(${NECK + 108} ${n(eye[0])} ${n(eye[1])})" fill="${BONE}"/><ellipse cx="${n(eye[0])}" cy="${n(eye[1])}" rx="2" ry="5" transform="rotate(${NECK + 108} ${n(eye[0])} ${n(eye[1])})" fill="${DARK}"/>`);
        cv.add(`<circle cx="${n(lay([73, 5.5])[0])}" cy="${n(lay([73, 5.5])[1])}" r="1.5" fill="${BONE}" fill-opacity="0.2"/>`);
        // the fangs, down from the upper jaw, and small teeth along the lower
        for (const [u, len, wide] of [[64, 17, 7], [52, 11, 5.2]]) cv.add(`<path d="${blade(lay([u, -4]), lay([u - 5, -4 - len]), wide, { at: 0.25, point: 1, bend: -0.14 })}" fill="${BONE}" stroke="${DARK}" stroke-width="0.9"/>`);
        for (let i = 0; i < 4; i++) cv.add(`<path d="${blade(lay([34 + i * 8, -19 - i * 4]), lay([36 + i * 8, -13.5 - i * 4]), 3.8, { at: 0.3, point: 1 })}" fill="${BONE}"/>`);
      });
      return s.done({ finish: { paint: 0, grain: 0.014, contrast: 0.05, saturation: 1, ink: { colour: '#f1ede2', width: 1.1, opacity: 0.7 } } });
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
