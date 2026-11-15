/**
 * The things the Stories library's covers are told with (story-covers.mjs),
 * since a cover has no people in it: a blacksmith's anvil and hammer, the
 * leather apron raised on a spear, the forge's hearth; a stone throne and
 * the serpent's coils round it; the castle of Cizîr over the Tigris, a rose
 * bush, two graves and the thorn between them; the face of a crag; a fortress
 * on its crag and the tents of the army round it.
 *
 * Like places.mjs, each takes where it stands and how big it is, and colours
 * for its shadowed and its lit faces, and returns SVG markup; the light itself
 * (a forge's glow, a shaft from far above, a low sun) is laid on by the rim and
 * falloff of the compositor, so the drawing stays flat planes — one highlight
 * and one shade step to a form, as the house rules have it. Every number goes through `n`, and
 * every choice comes from the seeded generator it is given.
 */
import { between, n, pt } from './kit.mjs';
import { blob } from './nature.mjs';

/** A closed outline through `points` (in the piece's own units), carried to the canvas by `at`. */
const outline = (points, at) => `M${points.map((p) => pt(at(p))).join(' L')} Z`;

// ──────────────────────────────────────────────────────────── the smithy

/**
 * A blacksmith's anvil on its block, in profile: the horn to the left, the
 * flat face across the top with the hardy hole near the heel, the waist and
 * the splayed feet, standing on a squat block of oak. (x, y) is the foot of
 * the block, `size` the anvil's length from the horn's tip to the heel.
 * `iron` and `face` colour the body and the worn top of it; `wood` the block.
 * Returns the markup and where the face is, for whatever is laid on it.
 */
export function anvil({ x, y, size, iron, face, wood, woodDark }) {
  const k = size / 100;
  // the anvil's own units: x from the horn's tip, y down from the face; the block is 38 tall under the feet
  const top = y - (46 + 38) * k;
  const at = ([u, v]) => [x + (u - 58) * k, top + v * k];
  const body = [
    [24, 0], [99, 0], [100, 1.5], [100, 11], [97, 12.5], [88, 14], [81, 18], [77, 24], [76.5, 32], [79, 36], [86, 40], [90, 44], [90, 46],
    [27, 46], [27, 44], [31, 40], [38, 36], [40.5, 32], [40, 24], [37, 20], [31, 17.5], [22, 14], [12, 10], [3, 6.5], [0, 5.2], [2, 4], [10, 2.2], [18, 0.8],
  ];
  // the block: a round of oak, a little wider at its foot, its top cut level
  const block = [[24, 46], [93, 46], [94, 60], [96, 80], [98, 84], [20, 84], [22, 80], [23, 60]];
  const out = [];
  out.push(`<path d="${outline(block, at)}" fill="${wood}"/>`);
  // the block's grain and its shaded side, and the cracks of its drying
  out.push(`<path d="${outline([[78, 46], [93, 46], [94, 60], [96, 80], [98, 84], [82, 84], [80, 60]], at)}" fill="${woodDark}"/>`);
  const grain = [];
  for (const u of [32, 41, 52, 63, 71]) grain.push(`M${pt(at([u, 48]))} L${pt(at([u + 0.6, 82]))}`);
  out.push(`<path d="${grain.join(' ')}" stroke="${woodDark}" stroke-width="${n(Math.max(0.8, 0.5 * k))}" stroke-opacity="0.7"/>`);
  out.push(`<path d="${outline(body, at)}" fill="${iron}"/>`);
  // the face, worn bright, and the edge of the heel and the horn's back catching it
  out.push(`<path d="${outline([[24, 0], [99, 0], [100, 1.5], [100, 3.2], [24, 3.2], [16, 2.4], [18, 0.8]], at)}" fill="${face}"/>`);
  // the hardy hole and the pritchel hole
  out.push(`<path d="${outline([[88, 0], [92, 0], [92, 1.6], [88, 1.6]], at)}" fill="${iron}"/><path d="${outline([[80.5, 0], [82, 0], [82, 1.6], [80.5, 1.6]], at)}" fill="${iron}"/>`);
  return { markup: out.join(''), face: [at([24, 0]), at([99, 0])] };
}

/**
 * A smith's hammer leant against something: its head on the ground at
 * (x, y), its handle reaching up to `to`. `size` is the head's length.
 */
export function hammer({ x, y, to, size, iron, wood }) {
  const dx = to[0] - x;
  const dy = to[1] - y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  // across the handle
  const vx = -uy;
  const vy = ux;
  const w0 = size * 0.17;
  const w1 = size * 0.12;
  const handle = [
    [x + vx * w0, y + vy * w0], [to[0] + vx * w1, to[1] + vy * w1], [to[0] + ux * w1 * 0.6, to[1] + uy * w1 * 0.6], [to[0] - vx * w1, to[1] - vy * w1], [x - vx * w0, y - vy * w0],
  ];
  // the head across the foot of the handle: a square face on one side, the peen tapering to an edge on the other
  const h = size * 0.24;
  const head = [
    [x + vx * size * 0.42 - ux * h, y + vy * size * 0.42 - uy * h],
    [x + vx * size * 0.42 + ux * h, y + vy * size * 0.42 + uy * h],
    [x - vx * size * 0.3 + ux * h, y - vy * size * 0.3 + uy * h],
    [x - vx * size * 0.58 + ux * h * 0.25, y - vy * size * 0.58 + uy * h * 0.25],
    [x - vx * size * 0.58 - ux * h * 0.25, y - vy * size * 0.58 - uy * h * 0.25],
    [x - vx * size * 0.3 - ux * h, y - vy * size * 0.3 - uy * h],
  ];
  return `<path d="M${handle.map(pt).join(' L')} Z" fill="${wood}"/><path d="M${head.map(pt).join(' L')} Z" fill="${iron}"/>`;
}

/**
 * A smith's forge in the open: a waist-high hearth of rough stones laid in
 * courses, a flat slab across the top where the coals lie, and a low fireback
 * of stones behind them; (x, y) is the middle of its foot, `w` its width and
 * `h` its height, the tongs leant against its side. Returns the fireback
 * (`back`, to stand behind the fire), the hearth (`front`), and where the
 * coals lie (`bed`).
 */
export function forge(rnd, { x, y, w, h, stone, stoneDark, mortar, tongs }) {
  const top = y - h;
  const front = [];
  // the body, dark between the stones, and the stones course by course, each a little proud of the next
  front.push(`<path d="M${pt([x - w / 2, y + 2])} L${pt([x - w / 2 + 3, top + 4])} L${pt([x + w / 2 - 3, top + 4])} L${pt([x + w / 2, y + 2])} Z" fill="${mortar}"/>`);
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const ry = y - ((r + 0.5) * (h - 8)) / rows;
    const rh = (h - 8) / rows;
    let u = x - w / 2 + (r % 2 ? -between(rnd, 6, 14) : 0);
    while (u < x + w / 2 - 4) {
      const sw = Math.min(x + w / 2 - u, between(rnd, w * 0.12, w * 0.32));
      const cx = Math.max(x - w / 2 + sw * 0.4, u + sw / 2);
      front.push(`<path d="${blob(rnd, cx, ry + between(rnd, -2, 2), sw * 0.5, rh * between(rnd, 0.4, 0.52), 0.35, 10)}" fill="${rnd() < 0.6 ? stoneDark : stone}"/>`);
      u += sw + between(rnd, 1, 3);
    }
  }
  // the slab, a little over the edge all round
  front.push(`<path d="M${pt([x - w / 2 - 8, top + 8])} L${pt([x - w / 2 - 6, top - 2])} L${pt([x + w / 2 + 7, top - 3])} L${pt([x + w / 2 + 9, top + 7])} Z" fill="${stone}"/>`);
  // the fireback behind the coals, and the chimney on it that draws the smoke up: stone laid in courses, the
  // stack narrowing as it rises
  const back = [];
  const wall = (x0, x1, y0, y1, courses, taper = 0) => {
    back.push(`<path d="M${pt([x0, y0 + 2])} L${pt([x0 + taper, y1])} L${pt([x1 - taper, y1])} L${pt([x1, y0 + 2])} Z" fill="${mortar}"/>`);
    for (let r = 0; r < courses; r++) {
      const t = (r + 0.5) / courses;
      const ry = y0 + (y1 - y0) * t;
      const inset = taper * t;
      const ch = Math.abs(y1 - y0) / courses;
      let u = x0 + inset + (r % 2 ? -between(rnd, 2, 6) : 0);
      while (u < x1 - inset - 2) {
        const sw = Math.min(x1 - inset - u, between(rnd, (x1 - x0) * 0.16, (x1 - x0) * 0.34));
        const cx = Math.max(x0 + inset + sw * 0.4, u + sw / 2);
        back.push(`<path d="${blob(rnd, cx, ry, sw * 0.5, ch * between(rnd, 0.4, 0.5), 0.3, 9)}" fill="${rnd() < 0.6 ? stoneDark : stone}"/>`);
        u += sw + between(rnd, 1, 2.5);
      }
    }
  };
  wall(x - w * 0.42, x + w * 0.42, top, top - h * 0.62, 3);
  wall(x - w * 0.2, x + w * 0.2, top - h * 0.6, top - h * 1.25, 4, w * 0.04);
  // the tongs leant against its side: two long arms of iron crossed at the rivet, the jaws on the ground
  const jaw = [x - w / 2 - w * 0.2, y + 1];
  const rest = [x - w / 2 + 2, top + h * 0.12];
  const pivot = [jaw[0] + (rest[0] - jaw[0]) * 0.2, jaw[1] + (rest[1] - jaw[1]) * 0.2];
  const spread = w * 0.03;
  front.push(`<path d="M${pt([jaw[0] - spread, jaw[1]])} L${pt(pivot)} L${pt([rest[0] + spread, rest[1]])} M${pt([jaw[0] + spread, jaw[1]])} L${pt(pivot)} L${pt([rest[0] - spread, rest[1] + spread])}" fill="none" stroke="${tongs}" stroke-width="${n(w * 0.02)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  return { back: back.join(''), front: front.join(''), bed: [x, top - 2], chimney: [x, top - h * 1.25] };
}

/**
 * The smith's leather apron raised on a spear, as the legend has it: the spear
 * from `foot` up to `top` with its iron point, and the apron hung from it by
 * its neck strap just under the point, hanging as an apron hangs from a peg —
 * the bib at the top, cut away under the arms, the wider skirt below with its
 * corners rounded, and the two waist ties hanging from its sides. `size` is
 * the apron's length from the top of the bib to the hem.
 *
 * Heavy leather does not fly as cloth does: the wind from the left (`wind`, 0
 * for still air) only swings it a little off the plumb (`sway`, radians),
 * trails the skirt off downwind, lifts its far corner and sets the hem
 * rippling, while the lighter ties swing further. The skirt is painted in flat
 * planes, each from a point under the waist, where the leather hangs flat,
 * widening to the hem: a narrow one down its left side in `leatherLit`, where
 * it turns toward the forge, a wider one down its right in `leatherDark`, where
 * the wind turns it away, and the leather's own tone between. The forge has
 * scorched it here and there (`scorch`), and the stitching round its edge
 * shows as a line of its own tone (`stitch`). Returns the spear and the apron
 * apart.
 */
export function apronOnSpear(rnd, { foot, top, size, sway = 0.06, wind = 1, wood, iron, leather, leatherLit, leatherDark, scorch, stitch, cord }) {
  const len = Math.hypot(top[0] - foot[0], top[1] - foot[1]);
  const ux = (top[0] - foot[0]) / len;
  const uy = (top[1] - foot[1]) / len;
  const sw = size * 0.02;
  const staff = [];
  staff.push(`<path d="M${pt([foot[0] - sw * 1.2, foot[1]])} L${pt([top[0] - sw * 0.8, top[1]])} L${pt([top[0] + sw * 0.8, top[1]])} L${pt([foot[0] + sw * 1.2, foot[1]])} Z" fill="${wood}"/>`);
  // the point: a leaf of iron on its socket, which the strap hangs under
  const tip = [top[0] + ux * size * 0.17, top[1] + uy * size * 0.17];
  const side = [-uy, ux];
  const at = (t, k) => [top[0] + ux * size * t + side[0] * size * k, top[1] + uy * size * t + side[1] * size * k];
  staff.push(`<path d="M${pt(at(-0.05, -0.014))} L${pt(at(0, -0.02))} L${pt(at(0.05, -0.016))} Q${pt(at(0.08, -0.05))} ${pt(tip)} Q${pt(at(0.08, 0.05))} ${pt(at(0.05, 0.016))} L${pt(at(0, 0.02))} L${pt(at(-0.05, 0.014))} Z" fill="${iron}"/>`);

  // The apron in its own units, fractions of `size`: x across from its middle line, y down from where the strap
  // hangs on the spear. The bib's top is DROP below that, and v is measured down from the bib's top.
  const DROP = 0.16;
  const BIB = 0.14; // half the bib's width
  const CHEST = 0.08; // how far the bib's sides run straight down before they are cut away under the arms
  const WAIST = 0.34; // where the cut ends and the ties are sewn on
  const HIP = 0.32; // half the apron's width there
  const HEM = 0.345; // and at the hem
  const ROUND = 0.05; // the hem's corners
  const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
  const half = (v) => {
    if (v <= CHEST) return BIB;
    if (v <= WAIST) return BIB + (HIP - BIB) * (1 - Math.sqrt(Math.max(0, 1 - ((v - CHEST) / (WAIST - CHEST)) ** 2)));
    return HIP + ((HEM - HIP) * (v - WAIST)) / (1 - WAIST);
  };
  // the wind's work on it: the skirt trailed off to the right, its far corner lifted, and the hem rippling, dipped in
  // the middle and lifted at the corners
  const bend = ([x, y]) => {
    const v = y - DROP;
    const k = clamp((v - WAIST) / (1 - WAIST));
    const sk = clamp(x / half(Math.max(0, v)), -1, 1);
    return [x + wind * 0.09 * k * k, y - wind * 0.05 * k ** 3 * Math.max(0, sk) ** 2 + wind * 0.016 * k ** 3 * Math.cos(sk * 2.6)];
  };
  // then the whole swung a little off the plumb about the strap, and carried onto the canvas
  const hang = [top[0] - ux * size * 0.065, top[1] - uy * size * 0.065];
  const cs = Math.cos(sway * wind);
  const sn = Math.sin(sway * wind);
  const place = (p) => {
    const [bx, by] = bend(p);
    return [hang[0] + size * (bx * cs + by * sn), hang[1] + size * (by * cs - bx * sn)];
  };
  const path = (points) => `M${points.map((p) => pt(place(p))).join(' L')} Z`;
  const smooth = (points) => {
    const c = points.map(place);
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    let d = `M${pt(mid(c[c.length - 1], c[0]))}`;
    for (let i = 0; i < c.length; i++) d += ` Q${pt(c[i])} ${pt(mid(c[i], c[(i + 1) % c.length]))}`;
    return `${d} Z`;
  };

  // its outline: down the right side from the bib's corner, round the armhole, down the skirt, round the corner
  // and along the hem to the middle; the left side is the same turned over
  const right = [[BIB, DROP], [BIB, DROP + CHEST]];
  for (let i = 1; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2);
    right.push([BIB + (HIP - BIB) * (1 - Math.cos(a)), DROP + CHEST + (WAIST - CHEST) * Math.sin(a)]);
  }
  for (let v = WAIST + 0.03; v < 1 - ROUND; v += 0.03) right.push([half(v), DROP + v]);
  const corner = [half(1 - ROUND) - ROUND, DROP + 1 - ROUND];
  for (let i = 0; i <= 6; i++) right.push([corner[0] + ROUND * Math.cos((i / 6) * (Math.PI / 2)), corner[1] + ROUND * Math.sin((i / 6) * (Math.PI / 2))]);
  for (let x = corner[0] - 0.02; x > 0.005; x -= 0.02) right.push([x, DROP + 1]);
  const outline = [...right, [0, DROP + 1], ...right.map(([x, y]) => [-x, y]).reverse()];
  // the line of the stitching, a little inside the edge all round (each point moved in along the bisector of its
  // corner, far enough to stay as far from both of its sides)
  const inset = outline.map((p, i) => {
    const prev = outline[(i + outline.length - 1) % outline.length];
    const next = outline[(i + 1) % outline.length];
    const normal = (a, b) => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    };
    const n0 = normal(prev, p);
    const n1 = normal(p, next);
    const m = [n0[0] + n1[0], n0[1] + n1[1]];
    const ml = Math.hypot(m[0], m[1]) || 1;
    const reach = 0.022 / Math.max(0.6, (m[0] * n0[0] + m[1] * n0[1]) / ml);
    return [p[0] + (m[0] / ml) * reach, p[1] + (m[1] / ml) * reach];
  });

  // a plane of the skirt: from a point under the waist, widening as it runs down to the hem (and past it, to be cut
  // by the outline); `tip` and `hem` say where across the skirt (-1 its left edge, 1 its right) it starts and ends,
  // `from` how far down it starts, `wide` half its width at the hem
  const wedge = ({ tip, from, hem, wide }) => {
    const left = [];
    const right = [];
    for (let v = from + 0.02; v <= 1.08; v += 0.02) {
      const t = (v - from) / (1 - from);
      const mid = tip + (hem - tip) * t;
      left.push([(mid - wide * t ** 1.1) * half(v), DROP + v]);
      right.push([(mid + wide * t ** 1.1) * half(v), DROP + v]);
    }
    return [[tip * half(from), DROP + from], ...left, ...right.reverse()];
  };

  // a scorch: a ragged patch of burnt leather, off-centre in a fainter one of singeing
  const singe = (cx, cy, r) => {
    const ragged = (x0, y0, s) => {
      const a0 = rnd() * Math.PI * 2;
      return Array.from({ length: 11 }, (_, i) => {
        const k = between(rnd, 0.55, 1.25);
        return [x0 + Math.cos(a0 + (i / 11) * Math.PI * 2) * r * s * k, y0 + Math.sin(a0 + (i / 11) * Math.PI * 2) * r * s * k * 1.2];
      });
    };
    return `<path d="${smooth(ragged(cx, cy, 1.6))}" fill="${scorch}" fill-opacity="0.3"/><path d="${smooth(ragged(cx + r * 0.2, cy + r * 0.25, 0.9))}" fill="${scorch}" fill-opacity="0.6"/>`;
  };

  // the ties: a thong from each side of the waist, falling out from it a little, then hanging, swung downwind
  const tie = (dir, reach, swing) => {
    const line = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      line.push(place([dir * (HIP - 0.01) + dir * 0.055 * Math.sin(Math.min(1, t * 2.5) * (Math.PI / 2)) + wind * swing * t * t + 0.012 * Math.sin(t * 5 + dir) * t, DROP + WAIST + 0.01 + reach * t * (1 - 0.3 * wind * swing * t)]));
    }
    const edge = (s) => line.map((p, i) => {
      const a = line[Math.max(0, i - 1)];
      const b = line[Math.min(line.length - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const w = size * (0.009 - 0.0035 * (i / (line.length - 1)));
      return [p[0] - ((b[1] - a[1]) / l) * w * s, p[1] + ((b[0] - a[0]) / l) * w * s];
    });
    return `M${[...edge(1), ...edge(-1).reverse()].map(pt).join(' L')} Z`;
  };

  const apron = [];
  apron.push(`<path d="${tie(-1, 0.36, 0.03)} ${tie(1, 0.34, 0.16)}" fill="${cord}"/>`);
  apron.push(`<clipPath id="apron-cut"><path d="${path(outline)}"/></clipPath>`);
  apron.push(`<path d="${path(outline)}" fill="${leather}"/>`);
  apron.push('<g clip-path="url(#apron-cut)">');
  apron.push(`<path d="${path(wedge({ tip: -0.45, from: 0.36, hem: -0.55, wide: 0.18 }))}" fill="${leatherLit}"/><path d="${path(wedge({ tip: 0.55, from: 0.38, hem: 0.62, wide: 0.38 }))}" fill="${leatherDark}"/>`);
  apron.push(singe(-0.03, DROP + 0.74, 0.042), singe(0.07, DROP + 0.13, 0.02));
  apron.push(`<path d="${path(inset)}" fill="none" stroke="${stitch}" stroke-width="${n(size * 0.006)}" stroke-dasharray="${n(size * 0.012)} ${n(size * 0.008)}" stroke-opacity="0.4"/>`);
  apron.push('</g>');
  // the neck strap, from the bib's corners up and over the spear under its collar
  const strap = `M${pt(place([-(BIB - 0.025), DROP + 0.01]))} Q${pt(place([-0.035, 0.01]))} ${pt(place([0, -0.006]))} Q${pt(place([0.035, 0.01]))} ${pt(place([BIB - 0.025, DROP + 0.01]))}`;
  apron.push(`<path d="${strap}" fill="none" stroke="${cord}" stroke-width="${n(size * 0.016)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  return { staff: staff.join(''), apron: apron.join('') };
}

// ──────────────────────────────────────────────────────────── under the earth

/**
 * A throne cut from the rock, seen from the front: a plinth, the seat, an arm
 * either side, and a tall back ending in a pointed arch with a carved border
 * and a lozenge at its head; (x, y) is the middle of the plinth's foot, `w`
 * the plinth's width. Lit from above: every top in `lit`, every face in
 * `stone`, the sides and the undersides in `dark`.
 */
export function throne({ x, y, w, stone, lit, dark }) {
  const k = w / 240;
  const at = ([u, v]) => [x + u * k, y + v * k];
  const box = (u0, v0, u1, v1, fill) => `<path d="${outline([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], at)}" fill="${fill}"/>`;
  const out = [];
  // the back: a slab with a pointed arch for a head
  const back = [[-76, -100], [-76, -290], [-58, -318], [-30, -340], [0, -352], [30, -340], [58, -318], [76, -290], [76, -100]];
  out.push(`<path d="${outline(back, at)}" fill="${stone}"/>`);
  out.push(`<path d="${outline([[60, -100], [60, -296], [44, -322], [30, -340], [58, -318], [76, -290], [76, -100]], at)}" fill="${dark}"/>`);
  // its border, cut in, and the lozenge at its head
  const inner = [[-58, -110], [-58, -284], [-44, -306], [-22, -324], [0, -332], [22, -324], [44, -306], [58, -284], [58, -110]];
  out.push(`<path d="M${inner.map((p) => pt(at(p))).join(' L')}" fill="none" stroke="${dark}" stroke-width="${n(4 * k)}" stroke-linejoin="round"/>`);
  out.push(`<path d="${outline([[0, -306], [12, -286], [0, -266], [-12, -286]], at)}" fill="${dark}"/><path d="${outline([[0, -298], [5, -286], [0, -274], [-5, -286]], at)}" fill="${lit}"/>`);
  // the arms, their tops lit
  out.push(box(-112, -150, -72, -60, stone), box(72, -150, 112, -60, stone));
  out.push(box(98, -150, 112, -60, dark), box(-112, -150, -72, -140, lit), box(72, -150, 112, -140, lit));
  // the seat: its top, and its front in shade under the lip
  out.push(box(-76, -104, 76, -60, stone), box(-80, -110, 80, -100, lit), box(-76, -100, 76, -92, dark));
  // the plinth, wider, its top a step
  out.push(box(-120, -60, 120, 0, stone), box(-124, -64, 124, -54, lit), box(104, -54, 120, 0, dark));
  return out.join('');
}

/**
 * A serpent's body as a tube through `points` (its middle line, [x, y]),
 * `width(t)` across at t from 0 to 1 along it, lit from `light` ([x, y]: the
 * way toward the light in the picture): the body in `body`, a band of `lit`
 * down the side that faces the light and of `shade` down the side away from
 * it — each as wide as that side is turned to the light or from it, so the
 * bands grow and shrink as the body turns, never jump — and down its back a
 * chain of lozenges in `scale` set between small dark ones (`scaleDark`), the
 * pattern of scales its coils are known by. `caps` ([start, end]) rounds an
 * end off where the body turns away from us round something, as it is seen
 * there end-on. Returns markup.
 */
export function serpent({ points, width, body, lit, shade, scale, scaleDark, light = [0.3, -1], every = 1, caps = [false, false] }) {
  const len = [0];
  for (let i = 1; i < points.length; i++) len.push(len[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const total = len[len.length - 1] || 1;
  const ll = Math.hypot(light[0], light[1]) || 1;
  // the way across the body at each point (always to the same hand), and how far that way faces the light
  const across = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
  const facing = across.map(([nx, ny]) => (nx * light[0] + ny * light[1]) / ll);
  const half = points.map((p, i) => width(len[i] / total) / 2);
  const at = (i, k) => [points[i][0] + across[i][0] * half[i] * k, points[i][1] + across[i][1] * half[i] * k];
  const left = points.map((p, i) => at(i, 1));
  const right = points.map((p, i) => at(i, -1));
  const out = [`<path d="M${[...left, ...right.reverse()].map(pt).join(' L')} Z" fill="${body}"/>`];
  // the bands, a quad to each step, from the edge in toward the middle as far as that side faces the light
  const band = (sign, reach) => {
    const quads = [];
    for (let i = 0; i < points.length - 1; i++) {
      const f0 = facing[i] * sign;
      const f1 = facing[i + 1] * sign;
      const s0 = Math.sign(f0) || 1;
      if (s0 !== (Math.sign(f1) || 1)) continue;
      const k0 = s0 * (1 - reach * Math.abs(f0));
      const k1 = s0 * (1 - reach * Math.abs(f1));
      quads.push(`M${pt(at(i, s0))} L${pt(at(i + 1, s0))} L${pt(at(i + 1, k1))} L${pt(at(i, k0))} Z`);
    }
    return quads.join(' ');
  };
  out.push(`<path d="${band(1, 0.62)}" fill="${lit}"/>`, `<path d="${band(-1, 0.5)}" fill="${shade}"/>`);
  // the scales: a lozenge every so often along the back, a small dark one between
  const marks = [];
  const darks = [];
  let next = 0;
  for (let i = 1; i < points.length - 1; i++) {
    if (len[i] < next) continue;
    const w = half[i] * 2;
    if (w < 9) continue;
    const [px, py] = points[i];
    const [nx, ny] = across[i];
    const tx = ny;
    const ty = -nx;
    const lo = w * 0.36;
    const hi = w * 0.22;
    const off = w * 0.06 * Math.sign(facing[i]);
    const c = [px + nx * off, py + ny * off];
    marks.push(`M${pt([c[0] + tx * lo, c[1] + ty * lo])} L${pt([c[0] + nx * hi, c[1] + ny * hi])} L${pt([c[0] - tx * lo, c[1] - ty * lo])} L${pt([c[0] - nx * hi, c[1] - ny * hi])} Z`);
    const d = [c[0] + tx * w * 0.52, c[1] + ty * w * 0.52];
    darks.push(`M${pt([d[0] + tx * w * 0.12, d[1] + ty * w * 0.12])} L${pt([d[0] + nx * w * 0.09, d[1] + ny * w * 0.09])} L${pt([d[0] - tx * w * 0.12, d[1] - ty * w * 0.12])} L${pt([d[0] - nx * w * 0.09, d[1] - ny * w * 0.09])} Z`);
    next = len[i] + w * 1.04 * every;
  }
  out.push(`<path d="${marks.join(' ')}" fill="${scale}"/>`, `<path d="${darks.join(' ')}" fill="${scaleDark}"/>`);
  // the round ends: the body seen end-on, its upper side toward the light
  const lx = light[0] / ll;
  const ly = light[1] / ll;
  for (const [i, on] of [[0, caps[0]], [points.length - 1, caps[1]]]) {
    if (!on) continue;
    const [cx, cy] = points[i];
    const r = half[i];
    // three discs tangent at the shaded side: the lit crescent, the body's own, and the shade
    out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${lit}"/><circle cx="${n(cx - lx * r * 0.3)}" cy="${n(cy - ly * r * 0.3)}" r="${n(r * 0.7)}" fill="${body}"/><circle cx="${n(cx - lx * r * 0.62)}" cy="${n(cy - ly * r * 0.62)}" r="${n(r * 0.38)}" fill="${shade}"/>`);
  }
  return out.join('');
}

/** A smooth line through `knots` ([x, y]), `per` points between each two (Catmull–Rom). */
export function spline(knots, per = 12) {
  const out = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const p0 = knots[Math.max(0, i - 1)];
    const p1 = knots[i];
    const p2 = knots[i + 1];
    const p3 = knots[Math.min(knots.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(knots[knots.length - 1]);
  return out;
}

/** A small old crown, a band with five points, (x, y) the middle of its foot, `w` across: gold, lit on top. */
export function crown({ x, y, w, gold, lit, dark }) {
  const k = w / 100;
  const at = ([u, v]) => [x + u * k, y + v * k];
  const points = [[-50, 0], [-50, -24], [-44, -46], [-34, -28], [-20, -54], [-8, -30], [0, -62], [8, -30], [20, -54], [34, -28], [44, -46], [50, -24], [50, 0]];
  const band = [[-50, 0], [-50, -16], [50, -16], [50, 0]];
  const out = [`<path d="${outline(points, at)}" fill="${gold}"/>`, `<path d="${outline([[16, 0], [16, -40], [20, -54], [34, -28], [44, -46], [50, -24], [50, 0]], at)}" fill="${dark}"/>`];
  out.push(`<path d="${outline(band, at)}" fill="${lit}"/>`);
  for (const [u, v] of [[-44, -46], [-20, -54], [0, -62], [20, -54], [44, -46]]) out.push(`<circle cx="${n(at([u, v])[0])}" cy="${n(at([u, v])[1])}" r="${n(4 * k)}" fill="${lit}"/>`);
  for (const u of [-30, 0, 30]) out.push(`<path d="${outline([[u, -12], [u + 5, -8], [u, -4], [u - 5, -8]], at)}" fill="${dark}"/>`);
  return out.join('');
}

/**
 * Roots come down through the roof of a cave: `count` of them from `y` (the
 * roof) between x0 and x1, each tapering as it reaches down `len` (min, max)
 * and wandering as it goes, with rootlets off it. One path's `d`.
 */
export function roots(rnd, { x0, x1, y, count, len, width }) {
  const out = [];
  const limb = (px, py, a, l, w, depth) => {
    const steps = 8;
    const left = [];
    const right = [];
    let cx = px;
    let cy = py;
    let ang = a;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ww = w * (1 - t * 0.92) + 0.4;
      left.push([cx - Math.cos(ang) * ww / 2, cy + Math.sin(ang) * ww / 2]);
      right.push([cx + Math.cos(ang) * ww / 2, cy - Math.sin(ang) * ww / 2]);
      if (depth > 0 && i > 1 && i < steps - 1 && rnd() < 0.32) limb(cx, cy, ang + (rnd() < 0.5 ? -1 : 1) * between(rnd, 0.4, 0.9), l * between(rnd, 0.25, 0.45), ww * 0.5, depth - 1);
      ang += between(rnd, -0.22, 0.22);
      ang *= 0.85;
      cx += Math.sin(ang) * (l / steps);
      cy += Math.cos(ang) * (l / steps);
    }
    out.push(`M${[...left, ...right.reverse()].map(pt).join(' L')} Z`);
  };
  for (let i = 0; i < count; i++) limb(between(rnd, x0, x1), y, between(rnd, -0.3, 0.3), between(rnd, len[0], len[1]), width * between(rnd, 0.5, 1.2), 2);
  return out.join(' ');
}

// ──────────────────────────────────────────────────────────── Cizîr

/**
 * The castle of Cizîr as it stands over the Tigris: on a rise of rock at the
 * water's edge, its slopes running down into the bank either side, a plain
 * massive curtain wall with round towers along it, the emir's hall behind
 * with its pointed windows and a small dome, and at the east end the tall
 * square tower the town calls Birca Belek, "the piebald tower", for its
 * courses of dark basalt and pale stone laid turn about. (x, y) is the middle
 * of the rise's top, `w` the width of the castle. Faces in `stone`, pale
 * courses in `pale`, the edges toward the light (`light`, -1 on the left) in
 * `lit`, the sides away in `dark`, windows in `window`, and two lit, one high
 * in the tower and one in the hall, in `lamp`. Returns the markup and where
 * the two lamps are.
 */
export function cizir(rnd, { x, y, w, stone, pale, lit, dark, rock, window, lamp, bank, light = -1 }) {
  const out = [];
  const rect = (x0, y0, ww, hh, fill) => `<rect x="${n(x0)}" y="${n(y0)}" width="${n(ww)}" height="${n(hh)}" fill="${fill}"/>`;
  // the rise: long slopes down to the bank either side, and a face of rock dropping to the water in front
  const rise = [[x - w * 0.84, bank], [x - w * 0.7, bank - w * 0.03], [x - w * 0.6, y + w * 0.05], [x - w * 0.53, y + w * 0.01]];
  for (let u = -0.5; u <= 0.5; u += 0.05) rise.push([x + u * w, y + between(rnd, -1, 1)]);
  rise.push([x + w * 0.55, y + w * 0.02], [x + w * 0.63, y + w * 0.07], [x + w * 0.74, bank - w * 0.025], [x + w * 0.88, bank], [x + w * 0.88, bank + w * 0.03], [x + w * 0.4, bank + w * 0.045], [x - w * 0.4, bank + w * 0.045], [x - w * 0.84, bank + w * 0.03]);
  out.push(`<path d="M${rise.map(pt).join(' L')} Z" fill="${rock}"/>`);
  const side = (x0, top, ww, hh, wallFill) => {
    // a block lit down its edge toward the light and shaded down the other
    const shadeW = ww * 0.22;
    out.push(rect(x0, top, ww, hh, wallFill));
    out.push(rect(light < 0 ? x0 + ww - shadeW : x0, top, shadeW, hh, dark));
    out.push(rect(light < 0 ? x0 : x0 + ww - ww * 0.06, top, ww * 0.06, hh, lit));
  };
  const lamps = [];
  const arch = (cx, top, aw, ah, fill) => `<path d="M${pt([cx - aw / 2, top + ah])} L${pt([cx - aw / 2, top + aw * 0.5])} Q${pt([cx - aw / 2, top])} ${pt([cx, top - aw * 0.3])} Q${pt([cx + aw / 2, top])} ${pt([cx + aw / 2, top + aw * 0.5])} L${pt([cx + aw / 2, top + ah])} Z" fill="${fill}"/>`;
  // the hall behind the wall: two storeys of pointed windows, a little dome on its roof; one window lit
  const hx = x - w * 0.26;
  const hw = w * 0.3;
  const hTop = y - w * 0.22;
  side(hx - hw / 2, hTop, hw, w * 0.22 + 2, stone);
  out.push(rect(hx - hw / 2 - 2, hTop - w * 0.008, hw + 4, w * 0.01, stone));
  const dome = `M${pt([hx + hw * 0.08, hTop])} Q${pt([hx + hw * 0.08, hTop - w * 0.06])} ${pt([hx + hw * 0.2, hTop - w * 0.07])} Q${pt([hx + hw * 0.32, hTop - w * 0.06])} ${pt([hx + hw * 0.32, hTop])} Z`;
  out.push(`<path d="${dome}" fill="${stone}"/>`, rect(hx + hw * 0.195, hTop - w * 0.09, w * 0.004, w * 0.022, stone));
  for (let k = 0; k < 4; k++) {
    const cx = hx - hw / 2 + hw * (0.16 + k * 0.22);
    const on = k === 2;
    out.push(arch(cx, hTop + w * 0.035, w * 0.02, w * 0.04, on ? lamp : window));
    if (on) lamps.push([cx, hTop + w * 0.06]);
  }
  // the tower: square, tall, a little battered at the foot, banded dark and pale, its high window lit
  const kx = x + w * 0.3;
  const kw = w * 0.14;
  const kTop = y - w * 0.5;
  const bands = 14;
  for (let b = 0; b < bands; b++) {
    const y0 = kTop + ((y - kTop) * b) / bands;
    const hh = (y - kTop) / bands + 1;
    const spread = (b / bands) * kw * 0.06;
    const fill = b % 2 ? pale : stone;
    out.push(`<path d="M${pt([kx - kw / 2 - spread, y0])} L${pt([kx + kw / 2 + spread, y0])} L${pt([kx + kw / 2 + spread + kw * 0.06 / bands, y0 + hh])} L${pt([kx - kw / 2 - spread - kw * 0.06 / bands, y0 + hh])} Z" fill="${fill}"/>`);
  }
  out.push(`<path d="M${pt([kx + kw * 0.26, kTop])} L${pt([kx + kw / 2, kTop])} L${pt([kx + kw * 0.56, y + 1])} L${pt([kx + kw * 0.28, y + 1])} Z" fill="${dark}" fill-opacity="0.8"/>`);
  out.push(`<path d="M${pt([kx - kw / 2, kTop])} L${pt([kx - kw * 0.44, kTop])} L${pt([kx - kw * 0.5, y + 1])} L${pt([kx - kw * 0.56, y + 1])} Z" fill="${lit}"/>`);
  // its parapet, plain, a little proud
  out.push(rect(kx - kw * 0.54, kTop - w * 0.02, kw * 1.08, w * 0.024, stone), rect(kx + kw * 0.3, kTop - w * 0.02, kw * 0.24, w * 0.024, dark));
  for (const v of [0.18, 0.3]) out.push(rect(kx - w * 0.004, kTop + w * v, w * 0.008, w * 0.022, window));
  out.push(arch(kx - kw * 0.1, kTop + w * 0.05, w * 0.022, w * 0.042, lamp));
  lamps.push([kx - kw * 0.1, kTop + w * 0.072]);
  // the curtain wall, massive and plain, its parapet with a merlon here and there, and its round towers
  const wallTop = y - w * 0.09;
  side(x - w * 0.5, wallTop, w * 0.86, w * 0.09 + 3, stone);
  const merlons = [];
  for (let u = -0.49; u < 0.34; u += 0.035) if (rnd() < 0.55) merlons.push(rect(x + u * w, wallTop - w * 0.012, w * 0.014, w * 0.013, stone));
  out.push(merlons.join(''));
  for (const u of [-0.5, -0.1, 0.1]) {
    const bx = x + u * w;
    const bw = w * 0.075;
    const bTop = y - w * 0.13;
    // round: a lit edge, a broad shade round the far side, and a battered foot
    out.push(`<path d="M${pt([bx - bw / 2, bTop])} L${pt([bx + bw / 2, bTop])} L${pt([bx + bw * 0.62, y + 2])} L${pt([bx - bw * 0.62, y + 2])} Z" fill="${stone}"/>`);
    out.push(`<path d="M${pt([bx + bw * 0.1, bTop])} L${pt([bx + bw / 2, bTop])} L${pt([bx + bw * 0.62, y + 2])} L${pt([bx + bw * 0.14, y + 2])} Z" fill="${dark}"/>`);
    out.push(`<path d="M${pt([bx - bw / 2, bTop])} L${pt([bx - bw * 0.4, bTop])} L${pt([bx - bw * 0.5, y + 2])} L${pt([bx - bw * 0.62, y + 2])} Z" fill="${lit}"/>`);
    out.push(rect(bx - bw * 0.56, bTop - w * 0.012, bw * 1.12, w * 0.014, stone));
  }
  for (let u = -0.42; u < 0.3; u += 0.11) if (rnd() < 0.5) out.push(rect(x + u * w, wallTop + w * 0.035, w * 0.007, w * 0.016, window));
  return { markup: out.join(''), lamps };
}

/**
 * A rose bush as it grows in a courtyard garden: a full dome of small dark
 * leaves (`leaf`, to be repainted leaf by leaf) on its canes, and its roses
 * over it — each five petals round a darker heart, in `rose` with the
 * petals toward the light (`light`, [x, y]) in `roseLit` — and buds, and a few
 * petals fallen on the grass under it. (x, y) is its foot, `w` across.
 */
export function roseBush(rnd, { x, y, w, leaf, rose, roseLit, heart, light = [-1, -0.6] }) {
  // a full dome of small leaves, the canes showing at its foot, and its roses over the outside of it
  const leaves = [];
  const canes = [];
  for (let i = 0; i < 70; i++) {
    const a = between(rnd, -Math.PI, 0);
    const d = Math.sqrt(rnd());
    leaves.push(blob(rnd, x + Math.cos(a) * w * 0.48 * d, y - w * 0.04 + Math.sin(a) * w * 0.5 * d, w * between(rnd, 0.05, 0.085), w * between(rnd, 0.04, 0.065), 0.5, 9));
  }
  for (let i = 0; i < 5; i++) canes.push(`M${pt([x + between(rnd, -0.05, 0.05) * w, y + 2])} L${pt([x + between(rnd, -0.3, 0.3) * w, y - w * 0.12])}`);
  const tips = [];
  for (let i = 0; i < 22; i++) {
    const a = between(rnd, -Math.PI * 0.94, -Math.PI * 0.06);
    const d = between(rnd, 0.62, 1);
    tips.push([x + Math.cos(a) * w * 0.47 * d, y - w * 0.04 + Math.sin(a) * w * 0.5 * d]);
  }
  const roses = [];
  const ll = Math.hypot(light[0], light[1]);
  const lx = light[0] / ll;
  const ly = light[1] / ll;
  const flower = (cx, cy, r) => {
    const out = [`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 1.05)}" fill="${rose}"/>`];
    const a0 = rnd() * Math.PI * 2;
    for (let p = 0; p < 5; p++) {
      const a = a0 + (p / 5) * Math.PI * 2;
      const px = cx + Math.cos(a) * r * 0.45;
      const py = cy + Math.sin(a) * r * 0.4;
      const toward = Math.cos(a) * lx + Math.sin(a) * ly;
      out.push(`<ellipse cx="${n(px)}" cy="${n(py)}" rx="${n(r * 0.5)}" ry="${n(r * 0.38)}" transform="rotate(${n((a * 180) / Math.PI)} ${n(px)} ${n(py)})" fill="${toward > 0.2 ? roseLit : rose}"/>`);
    }
    out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.32)}" fill="${heart}"/>`);
    return out.join('');
  };
  for (const [tx, ty] of tips) {
    if (rnd() < 0.78) roses.push(flower(tx, ty, w * between(rnd, 0.028, 0.042)));
    else roses.push(`<ellipse cx="${n(tx)}" cy="${n(ty)}" rx="${n(w * 0.011)}" ry="${n(w * 0.017)}" fill="${heart}"/>`);
  }
  // fallen petals
  for (let i = 0; i < 9; i++) {
    const px = x + between(rnd, -0.5, 0.7) * w;
    const py = y + between(rnd, -2, 10);
    roses.push(`<ellipse cx="${n(px)}" cy="${n(py)}" rx="${n(w * 0.012)}" ry="${n(w * 0.007)}" transform="rotate(${n(between(rnd, -40, 40))} ${n(px)} ${n(py)})" fill="${rnd() < 0.5 ? rose : roseLit}"/>`);
  }
  return { leaves: `<path d="${canes.join(' ')}" stroke="${leaf}" stroke-width="${n(w * 0.012)}" fill="none"/><path d="${leaves.join(' ')}" fill="${leaf}"/>`, roses: roses.join('') };
}

/**
 * Two graves side by side in the grass, as the old ones in the country are
 * marked: a rough-hewn stone upright at the head of each, leaning with age, a
 * smaller one at the foot, the mound between sunk under the grass; and between
 * the two graves a small thorn bush, a tangle of bare twigs set with thorns.
 * (x, y) is the middle between them at the headstones' foot, `gap` the
 * distance between the two. Returns the stones and the thorn apart.
 */
export function twoGraves(rnd, { x, y, gap, stone, stoneLit, stoneDark, mound, thorn }) {
  const out = [];
  for (const side of [-1, 1]) {
    const gx = x + side * gap / 2;
    const sw = gap * 0.3;
    const sh = gap * between(rnd, 0.42, 0.5);
    out.push(`<path d="${blob(rnd, gx - side * gap * 0.04, y + gap * 0.13, gap * 0.3, gap * 0.08, 0.3, 9)}" fill="${mound}" fill-opacity="0.6"/>`);
    // a rough slab: its outline hewn, not cut, its top a broken curve
    const slab = (cx, by, ww, hh, lean) => {
      const pts = [[-0.5, 0], [-0.52, -0.5], [-0.46, -0.82], [-0.3, -0.97], [-0.04, -1], [0.22, -0.95], [0.42, -0.84], [0.5, -0.6], [0.48, 0]].map(([u, v]) => [u + between(rnd, -0.03, 0.03), v + between(rnd, -0.02, 0.02)]);
      const at = ([u, v]) => [cx + u * ww - v * hh * lean, by + v * hh];
      const shadeAt = pts.map(([u, v]) => [Math.max(u, 0.18), v]);
      const litAt = [[-0.5, 0], [-0.52, -0.5], [-0.46, -0.82], [-0.3, -0.97], [-0.36, -0.8], [-0.42, -0.5], [-0.4, 0]];
      return `<path d="M${pts.map((p) => pt(at(p))).join(' L')} Z" fill="${stone}"/><path d="M${shadeAt.map((p) => pt(at(p))).join(' L')} Z" fill="${stoneDark}"/><path d="M${litAt.map((p) => pt(at(p))).join(' L')} Z" fill="${stoneLit}"/>`;
    };
    out.push(slab(gx, y + 2, sw, sh, side * between(rnd, 0.04, 0.1)));
    out.push(slab(gx - side * gap * 0.06, y + gap * 0.26, sw * 0.6, sh * 0.42, -side * between(rnd, 0.05, 0.12)));
  }
  // the thorn between them: twigs from one root, forking, each fork set with short thorns
  const twigs = [];
  const grow = (px, py, a, len, depth) => {
    const ex = px + Math.sin(a) * len;
    const ey = py - Math.cos(a) * len;
    twigs.push(`M${pt([px, py])} L${pt([ex, ey])}`);
    const thorns = Math.round(len / (gap * 0.04));
    for (let i = 1; i <= thorns; i++) {
      const t = i / (thorns + 1);
      const tx = px + (ex - px) * t;
      const ty = py + (ey - py) * t;
      const ta = a + (i % 2 ? 1 : -1) * 1.05;
      twigs.push(`M${pt([tx, ty])} L${pt([tx + Math.sin(ta) * gap * 0.035, ty - Math.cos(ta) * gap * 0.035])}`);
    }
    if (depth > 0) for (const k of [-1, 1]) grow(ex, ey, a + k * between(rnd, 0.3, 0.65), len * between(rnd, 0.55, 0.72), depth - 1);
  };
  for (let i = 0; i < 6; i++) grow(x + between(rnd, -4, 4), y + gap * 0.12, between(rnd, -0.75, 0.75), gap * between(rnd, 0.2, 0.3), 2);
  const thornBush = `<path d="${twigs.join(' ')}" fill="none" stroke="${thorn}" stroke-width="${n(Math.max(1.2, gap * 0.016))}" stroke-linecap="round"/>`;
  return { graves: out.join(''), thorn: thornBush };
}

// ──────────────────────────────────────────────────────────── crags

/**
 * A face of rock as a painter blocks one in: one mass under the skyline
 * `line(x)` from x0 to x1 down to `bottom`, in the middle of `tones` (darkest
 * first); broad planes of it a step lighter where it turns, hanging from the
 * skyline; long cracks down it in the darkest; and strata running across it
 * as ledges, a lip over a shadow. With `litTone` the light comes from the side
 * `light` (-1 the left): the planes' edges toward it and the face's own edge
 * on that side are lit. With `snow`, snow lies along the skyline and on the
 * ledges' lips; with `grass`, grass grows on some of them. The light along the
 * skyline is the compositor's (a rim). Returns markup.
 */
export function rockFace(rnd, { line, x0, x1, bottom, tones, lip, grass = null, snow = null, litTone = null, light = -1 }) {
  const out = [];
  const top = [];
  for (let x = x0; x <= x1; x += 4) top.push([x, line(x)]);
  out.push(`<path d="M${top.map(pt).join(' L')} L${pt([x1, bottom])} L${pt([x0, bottom])} Z" fill="${tones[1]}"/>`);
  // planes: wedges hanging from the skyline, each turned a little more to the light than the rock round it
  const planes = [];
  const lits = [];
  for (let x = x0 + between(rnd, 0, 30); x < x1 - 20; x += between(rnd, 40, 110)) {
    const w = between(rnd, 24, 70);
    const ya = line(x);
    const yb = line(Math.min(x1, x + w));
    const depth = between(rnd, 90, 300);
    const foot = x + w * between(rnd, 0.1, 0.6);
    const quad = [[x, ya], [Math.min(x1, x + w), yb], [foot + w * 0.2, Math.min(bottom, ya + depth * 0.7)], [foot, Math.min(bottom, ya + depth)]];
    planes.push(`<path d="M${quad.map(pt).join(' L')} Z" fill="${tones[2 + Math.floor(rnd() * (tones.length - 2))]}" fill-opacity="${n(between(rnd, 0.5, 0.9))}"/>`);
    if (litTone) {
      // the edge of the plane toward the light, catching it
      const e = light < 0 ? [quad[0], quad[3]] : [quad[1], quad[2]];
      const k = w * between(rnd, 0.15, 0.4) * -light;
      lits.push(`M${pt(e[0])} L${pt([e[0][0] + k, e[0][1] + 2])} L${pt([e[1][0] + k * 0.6, e[1][1]])} L${pt(e[1])} Z`);
    }
  }
  out.push(planes.join(''));
  if (litTone) {
    // the face's own edge on the light's side, lit down its length
    const side = [];
    const edgeX = light < 0 ? x0 : x1;
    for (let y = line(edgeX); y < bottom; y += 12) side.push([edgeX - light * between(rnd, 6, 22) * (1 - (y - line(edgeX)) / (bottom - line(edgeX)) * 0.5), y]);
    lits.push(`M${pt([edgeX, line(edgeX)])} L${side.map(pt).join(' L')} L${pt([edgeX, bottom])} Z`);
    out.push(`<path d="${lits.join(' ')}" fill="${litTone}" fill-opacity="0.75"/>`);
  }
  // cracks: long dark splits down the face
  const cracks = [];
  for (let i = 0; i < Math.round((x1 - x0) / 40); i++) {
    const x = between(rnd, x0 + 10, x1);
    const y = line(x) + between(rnd, 0, 30);
    const len = between(rnd, 60, 260);
    const w = between(rnd, 1.5, 4.5);
    const drift = between(rnd, -0.12, 0.12) * len;
    cracks.push(`M${pt([x - w, y])} Q${pt([x + drift * 0.5 - w * 0.6, y + len * 0.5])} ${pt([x + drift, Math.min(bottom, y + len)])} Q${pt([x + drift * 0.5 + w * 0.6, y + len * 0.5])} ${pt([x + w, y])} Z`);
  }
  out.push(`<path d="${cracks.join(' ')}" fill="${tones[0]}"/>`);
  // the strata: ledges across long stretches of it, gently tilted, some with grass or snow on them
  const ledges = [];
  const tufts = [];
  for (let i = 0; i < Math.round((x1 - x0) / 90); i++) {
    const xa = between(rnd, x0, x1 - 60);
    const xb = Math.min(x1, xa + between(rnd, 60, 220));
    const ya = Math.max(line(xa), line(xb)) + between(rnd, 20, bottom - Math.max(line(xa), line(xb)) - 20);
    const tilt = between(rnd, -0.06, 0.06) * (xb - xa);
    if (ya < line(xa) + 8 || ya < line(xb) + 8) continue;
    ledges.push(`<path d="M${pt([xa, ya])} L${pt([xb, ya + tilt])} L${pt([xb - 6, ya + tilt + 3.5])} L${pt([xa + 6, ya + 4])} Z" fill="${tones[0]}" fill-opacity="0.7"/>`);
    const thick = snow ? between(rnd, 2.5, 5) : 2;
    ledges.push(`<path d="M${pt([xa + 2, ya - thick])} Q${pt([(xa + xb) / 2, ya + tilt / 2 - thick * 1.4])} ${pt([xb - 2, ya + tilt - thick])} L${pt([xb, ya + tilt])} L${pt([xa, ya])} Z" fill="${snow ?? lip}" fill-opacity="${snow ? 0.95 : 0.6}"/>`);
    if (grass && rnd() < 0.5) {
      for (let g = 0; g < 8; g++) {
        const t = rnd();
        const gx = xa + (xb - xa) * t;
        const gy = ya + tilt * t;
        tufts.push(`M${pt([gx - 1.2, gy])} L${pt([gx + between(rnd, -3, 3), gy - between(rnd, 4, 10)])} L${pt([gx + 1.2, gy])} Z`);
      }
    }
  }
  out.push(ledges.join(''));
  if (grass) out.push(`<path d="${tufts.join(' ')}" fill="${grass}"/>`);
  if (snow) {
    // snow along the top, thicker where the rock is level
    const cap = top.map(([x, y], i) => {
      const prev = top[Math.max(0, i - 1)][1];
      const next = top[Math.min(top.length - 1, i + 1)][1];
      const level = Math.max(0, 1 - Math.abs(next - prev) / 10);
      return [x, y + 1.5 + level * between(rnd, 3, 7)];
    });
    out.push(`<path d="M${top.map(pt).join(' L')} L${cap.reverse().map(pt).join(' L')} Z" fill="${snow}"/>`);
  }
  return out.join('');
}

// ──────────────────────────────────────────────────────────── Dimdim

/**
 * A mountain fortress along the top of its crag: curtain walls following the
 * rock's edge `line(x)` from x0 to x1, towers along them — square ones and
 * round ones, taller than the wall — and the keep standing up behind; plain,
 * massive, a merlon here and there, snow lying along every top. Lit from the
 * side `light` (-1 the left) in `lit`, shaded on the other in `dark`; the
 * snow in `snow`; a few dark slits in `slit`.
 */
export function fortress(rnd, { line, x0, x1, wallH, stone, lit, dark, snow, slit, light = -1 }) {
  const out = [];
  const snowCap = (xa, xb, y, thick) => `<path d="M${pt([xa - 1.5, y + 1])} Q${pt([(xa + xb) / 2, y - thick])} ${pt([xb + 1.5, y + 1])} L${pt([xb + 1, y + thick * 0.6])} L${pt([xa - 1, y + thick * 0.6])} Z" fill="${snow}"/>`;
  const block = (xa, xb, topY, footY, round = false) => {
    const w = xb - xa;
    out.push(`<path d="M${pt([xa, footY])} L${pt([xa + w * 0.03, topY])} L${pt([xb - w * 0.03, topY])} L${pt([xb, footY])} Z" fill="${stone}"/>`);
    // the side away from the light; a round tower's shade wraps further round
    const shadeW = w * (round ? 0.45 : 0.24);
    if (light < 0) out.push(`<path d="M${pt([xb - shadeW, footY])} L${pt([xb - shadeW, topY])} L${pt([xb - w * 0.03, topY])} L${pt([xb, footY])} Z" fill="${dark}"/>`);
    else out.push(`<path d="M${pt([xa, footY])} L${pt([xa + w * 0.03, topY])} L${pt([xa + shadeW, topY])} L${pt([xa + shadeW, footY])} Z" fill="${dark}"/>`);
    const litW = w * (round ? 0.18 : 0.08);
    if (light < 0) out.push(`<path d="M${pt([xa, footY])} L${pt([xa + w * 0.03, topY])} L${pt([xa + litW, topY])} L${pt([xa + litW, footY])} Z" fill="${lit}"/>`);
    else out.push(`<path d="M${pt([xb - litW, footY])} L${pt([xb - litW, topY])} L${pt([xb - w * 0.03, topY])} L${pt([xb, footY])} Z" fill="${lit}"/>`);
    out.push(snowCap(xa + w * 0.03, xb - w * 0.03, topY, Math.max(2, w * 0.08)));
  };
  // the keep, behind
  const kx = x0 + (x1 - x0) * 0.58;
  const kTop = Math.min(line(kx - 30), line(kx + 30)) - wallH * 1.9;
  block(kx - wallH * 0.75, kx + wallH * 0.75, kTop, line(kx) + 2);
  out.push(`<rect x="${n(kx - wallH * 0.12)}" y="${n(kTop + wallH * 0.5)}" width="${n(wallH * 0.1)}" height="${n(wallH * 0.3)}" fill="${slit}"/>`);
  // the walls, in runs between the towers, stepping with the rock
  const towers = [];
  for (let x = x0; x <= x1; x += between(rnd, 70, 110)) towers.push(Math.min(x, x1));
  if (towers[towers.length - 1] < x1 - 10) towers.push(x1);
  for (let i = 0; i < towers.length - 1; i++) {
    const xa = towers[i];
    const xb = towers[i + 1];
    const steps = Math.max(1, Math.round((xb - xa) / 16));
    for (let k = 0; k < steps; k++) {
      const a = xa + ((xb - xa) * k) / steps;
      const b = xa + ((xb - xa) * (k + 1)) / steps;
      const foot = Math.max(line(a), line(b)) + 3;
      const topY = Math.min(line(a), line(b)) - wallH;
      out.push(`<rect x="${n(a - 0.5)}" y="${n(topY)}" width="${n(b - a + 1)}" height="${n(foot - topY)}" fill="${stone}"/>`);
      out.push(`<rect x="${n(a - 0.5)}" y="${n(topY - 1.5)}" width="${n(b - a + 1)}" height="3" fill="${snow}"/>`);
      if (rnd() < 0.35) out.push(`<rect x="${n(a + (b - a) * 0.4)}" y="${n(topY - wallH * 0.16)}" width="${n(wallH * 0.14)}" height="${n(wallH * 0.17)}" fill="${stone}"/>`);
      if (rnd() < 0.2) out.push(`<rect x="${n(a + (b - a) * 0.5)}" y="${n(topY + wallH * 0.35)}" width="${n(wallH * 0.06)}" height="${n(wallH * 0.24)}" fill="${slit}"/>`);
    }
  }
  // the towers over the wall, round and square by turns
  for (const [i, tx] of towers.entries()) {
    const round = i % 2 === 1;
    const w = wallH * (round ? 0.95 : 0.8);
    const foot = Math.max(line(tx - w / 2), line(tx + w / 2)) + wallH * 0.4;
    const topY = Math.min(line(tx - w / 2), line(tx + w / 2)) - wallH * between(rnd, 1.2, 1.45);
    block(tx - w / 2, tx + w / 2, topY, foot, round);
    out.push(`<rect x="${n(tx - wallH * 0.04)}" y="${n(topY + wallH * 0.45)}" width="${n(wallH * 0.08)}" height="${n(wallH * 0.26)}" fill="${slit}"/>`);
  }
  return out.join('');
}

/**
 * The tents of an army's camp in the snow: cones of pale canvas with a dark
 * door, shaded on the side away from the light (`light`, -1 the left); a few
 * great pavilions among them, ridged over two poles. Each entry of `at` is
 * [x, y, size]. Returns markup.
 */
export function campTents(rnd, { at, canvas, shade, door, light = -1 }) {
  const out = [];
  for (const [x, y, size] of at) {
    if (size > 16 && rnd() < 0.3) {
      // a pavilion: a long ridge between two peaks, the roof falling to low walls
      const w = size * 2.2;
      const h = size * 0.9;
      out.push(`<path d="M${pt([x - w / 2, y])} L${pt([x - w / 2, y - h * 0.4])} L${pt([x - w * 0.28, y - h])} L${pt([x + w * 0.28, y - h])} L${pt([x + w / 2, y - h * 0.4])} L${pt([x + w / 2, y])} Z" fill="${canvas}"/>`);
      out.push(`<path d="M${pt([x + light * -w * 0.04, y])} L${pt([x + light * -w * 0.04, y - h * 0.4])} L${pt([x - light * w * 0.28, y - h])} L${pt([x - light * w * 0.5, y - h * 0.4])} L${pt([x - light * w * 0.5, y])} Z" fill="${shade}"/>`);
      out.push(`<path d="M${pt([x - w * 0.06, y])} L${pt([x - w * 0.06, y - h * 0.32])} L${pt([x + w * 0.06, y - h * 0.32])} L${pt([x + w * 0.06, y])} Z" fill="${door}"/>`);
      continue;
    }
    const w = size;
    const h = size * between(rnd, 0.85, 1.1);
    out.push(`<path d="M${pt([x - w / 2, y])} Q${pt([x - w * 0.18, y - h * 0.55])} ${pt([x, y - h])} Q${pt([x + w * 0.18, y - h * 0.55])} ${pt([x + w / 2, y])} Z" fill="${canvas}"/>`);
    out.push(`<path d="M${pt([x, y])} L${pt([x, y - h])} Q${pt([x - light * w * 0.18, y - h * 0.55])} ${pt([x - light * w / 2, y])} Z" fill="${shade}"/>`);
    out.push(`<path d="M${pt([x + light * w * 0.1, y])} L${pt([x + light * w * 0.02, y - h * 0.4])} L${pt([x - light * w * 0.08, y])} Z" fill="${door}"/>`);
    out.push(`<path d="M${pt([x - w * 0.02, y - h])} L${pt([x, y - h * 1.12])} L${pt([x + w * 0.02, y - h])} Z" fill="${shade}"/>`);
  }
  return out.join('');
}
