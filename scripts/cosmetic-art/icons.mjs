/**
 * The shop's icons: Kurdish things painted as they are — a pomegranate split
 * open, a glass of tea on its saucer, a seal of red wax with the sun of the
 * Kurdish flag pressed into it, a saz, a buck come down to drink — painted by
 * hand rather than modelled: each one's colours laid in, its light and its
 * shadow laid over them as shapes of their own, brushed over and drawn in
 * (brush.mjs), and cut out of the dark, so that it lies over a profile
 * picture with nothing round it but its own light.
 *
 * They sit on a profile picture at about 40 pixels, so each is one clear
 * shape first, its colour second and its detail last: the detail is for the
 * shop tile. Each is a still life (still.mjs): paint laid on, light given off,
 * the mountain painted from a relief as the backgrounds' mountains are, the
 * rug's weave and the moon given relief and lit; then the painter's pass.
 */
import { crescent, rim, softly, specks, strokes, within } from './brush.mjs';
import { deerShapes } from './figures.mjs';
import { n, pt, sunRays } from './kit.mjs';
import { Still } from './still.mjs';

// ─────────────────────────────────────────────────────────────── shapes

/** A smooth closed outline through points (a Catmull-Rom spline, as cubic Béziers); open when `closed` is false. */
function spline(points, closed = true) {
  const count = points.length;
  const at = (i) => (closed ? points[(i + count) % count] : points[Math.max(0, Math.min(count - 1, i))]);
  let d = `M${pt(points[0])}`;
  for (let i = 0; i < (closed ? count : count - 1); i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d += ` C${pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${pt(p2)}`;
  }
  return closed ? `${d} Z` : d;
}

/** Points round (cx, cy) at radius `r`, the radius wandering by `wobble` in a few slow waves, as a hand-made thing's does. */
function roundish([cx, cy], r, rnd, { wobble = 0.04, count = 40, squash = 1 } = {}) {
  const waves = [2, 3, 5, 7].map((k) => [k, rnd() * Math.PI * 2, (rnd() * 0.6 + 0.4) / k]);
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    let m = 1;
    for (const [k, ph, amp] of waves) m += Math.sin(a * k + ph) * amp * wobble * 2;
    out.push([cx + Math.cos(a) * r * m, cy + Math.sin(a) * r * m * squash]);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────── icons

/** A radial gradient, `stops` [offset, colour, opacity?], centred (cx, cy) radius r, in the canvas's own units. */
function radial(cv, stops, cx, cy, r, fx = cx, fy = cy) {
  const id = cv.id('rg');
  cv.def(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fx="${n(fx)}" fy="${n(fy)}">${stops.map(([o, c, a = 1]) => `<stop offset="${n(o)}" stop-color="${c}"${a === 1 ? '' : ` stop-opacity="${n(a)}"`}/>`).join('')}</radialGradient>`);
  return `url(#${id})`;
}

/** A linear gradient from (x1, y1) to (x2, y2). */
function linear(cv, stops, x1, y1, x2, y2) {
  const id = cv.id('lg');
  cv.def(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">${stops.map(([o, c, a = 1]) => `<stop offset="${n(o)}" stop-color="${c}"${a === 1 ? '' : ` stop-opacity="${n(a)}"`}/>`).join('')}</linearGradient>`);
  return `url(#${id})`;
}

/**
 * A long rounded shape along a line from `base` to `tip` — a petal, a leaf,
 * a feather — `width` across at its widest, `at` of the way along, bent
 * sideways by `bend` (as a fraction of its length), its tip `point`ed (1) or
 * blunt (0).
 */
function blade(base, tip, width, { at = 0.55, bend = 0, point = 0.6, count = 14 } = {}) {
  const dx = tip[0] - base[0];
  const dy = tip[1] - base[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const left = [];
  const right = [];
  const k = Math.log(0.5) / Math.log(at);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const w = (width / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, k)), 0.75) * (1 - point * Math.pow(t, 6));
    const off = bend * len * Math.sin(Math.PI * t);
    const cx = base[0] + dx * t - uy * off;
    const cy = base[1] + dy * t + ux * off;
    left.push([cx - uy * w, cy + ux * w]);
    right.push([cx + uy * w, cy - ux * w]);
  }
  return spline([...left, ...right.reverse().slice(1, -1)]);
}

/** A point on a line, `t` of the way from a to b. */
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** `count` + 1 points along a smooth curve through `points` (Catmull-Rom). */
function along(points, count = 24) {
  const out = [];
  const m = points.length - 1;
  for (let k = 0; k <= count; k++) {
    const t = (k / count) * m;
    const i = Math.min(m - 1, Math.floor(t));
    const f = t - i;
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(m, i + 2)];
    out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * f + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * f * f + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * f * f * f)));
  }
  return out;
}

/** A tube along a smooth curve through `points`, `w0` thick at its start and `w1` at its end: a spout, a handle, a log. */
function tube(points, w0, w1 = w0, count = 24) {
  const line = along(points, count);
  const left = [];
  const right = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const w = (w0 + ((w1 - w0) * i) / (line.length - 1)) / 2;
    left.push([line[i][0] - ((b[1] - a[1]) / l) * w, line[i][1] + ((b[0] - a[0]) / l) * w]);
    right.push([line[i][0] + ((b[1] - a[1]) / l) * w, line[i][1] - ((b[0] - a[0]) / l) * w]);
  }
  return spline([...left, ...right.reverse()]);
}

/**
 * A tulip, its cup of six tepals in `colours` ([base, middle, tip, back]): the
 * three behind just showing their tips, the three in front closing round
 * them in an egg-shaped cup, satin, fine streaks running up them, the light
 * coming through their edges; a thick stem, and two broad leaves, grey-green
 * with the bloom on them, folded along the middle and arching away.
 */
function tulip(rnd, [base, middle, tip, back]) {
  // (a cut flower: drawn a little smaller, its stem's cut end clear of the frame)
  const s = new Still(rnd).place([0, -4], 0.93);
  // a tepal, painted: deep at its foot, its colour at its fullest in the middle, paler at the tip; fine veins
  // running up it; its edge thin, so lighter, where the light comes through; the shadow of what lies over it
  const tepal = (cv, b, t, w, o, { shade = 0, veins = 14 } = {}) => {
    const d = blade(b, t, w, o);
    cv.add(`<path d="${d}" fill="${linear(cv, [[0, base], [0.35, middle], [0.8, tip], [1, middle]], b[0], b[1], t[0], t[1])}"/>`);
    let lines = '';
    for (let i = 0; i < veins; i++) {
      const f = (i / (veins - 1) - 0.5) * w * 0.8;
      const m = lerp(b, t, 0.55);
      lines += `<path d="M${pt(lerp(b, t, 0.04))} Q${pt([m[0] + f, m[1]])} ${pt([t[0] + f * 0.3, t[1] + 10 + rnd() * 18])}" stroke="${rnd() < 0.3 ? tip : base}" stroke-width="${n(0.6 + rnd() * 1.2)}" stroke-opacity="${n(0.12 + rnd() * 0.16)}"/>`;
    }
    cv.add(`<g clip-path="${within(cv, d)}" fill="none">${lines}</g>`);
    // (and the paint laid on along it)
    const ang = (Math.atan2(t[1] - b[1], t[0] - b[0]) * 180) / Math.PI;
    strokes(cv, rnd, d, [Math.min(b[0], t[0]) - w, Math.min(b[1], t[1]), Math.max(b[0], t[0]) + w, Math.max(b[1], t[1])], { count: 240, colours: [tip, middle, base, back], flow: () => ang, length: 22, width: 3, opacity: [0.06, 0.2] });
    if (shade) crescent(cv, d, [shade * 16, 4], { colour: '#000', opacity: 0.35, soft: 12 });
    rim(cv, d, { colour: tip, width: 3, opacity: 0.45, soft: 1.5 });
    cv.add(`<path d="${d}" fill="none" stroke="${back}" stroke-width="1.2" stroke-opacity="0.5"/>`);
    return d;
  };
  // a leaf, painted: broad and grey-green with the bloom on it, rising from the stem's foot along `spine` (a
  // cubic's four points), `width` across; folded along its midrib, so that one half takes the light and the
  // other lies in shade, with fine veins running the length of it
  const leaf = (cv, [p0, p1, p2, p3], width) => {
    const N = 40;
    const mid = [];
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      mid.push([0, 1].map((c) => (1 - u) ** 3 * p0[c] + 3 * (1 - u) ** 2 * u * p1[c] + 3 * (1 - u) * u ** 2 * p2[c] + u ** 3 * p3[c]));
    }
    const across = mid.map((_, k) => {
      const a = mid[Math.max(0, k - 1)];
      const b = mid[Math.min(N, k + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    });
    // (narrow where it leaves the stem, broadest a third of the way up, drawn out to its point)
    const line = (off) => mid.map((q, k) => {
      const w = (width / 2) * Math.pow(Math.sin(Math.PI * Math.pow(k / N, 0.62)), 0.85) * off;
      return [q[0] + across[k][0] * w, q[1] + across[k][1] * w];
    });
    const part = (o0, o1) => spline([...line(o0), ...line(o1).reverse()]);
    const flow = (x, y) => {
      let best = 0;
      let dist = Infinity;
      for (let k = 0; k <= N; k++) {
        const dd = (mid[k][0] - x) ** 2 + (mid[k][1] - y) ** 2;
        if (dd < dist) [best, dist] = [k, dd];
      }
      return (Math.atan2(across[best][0], -across[best][1]) * 180) / Math.PI;
    };
    const box = [Math.min(...mid.map((q) => q[0])) - width, Math.min(...mid.map((q) => q[1])) - width, Math.max(...mid.map((q) => q[0])) + width, Math.max(...mid.map((q) => q[1])) + width];
    const d = part(1, -1);
    cv.add(`<path d="${d}" fill="${linear(cv, [[0, '#26382a'], [0.45, '#4a6a54'], [1, '#7a9886']], ...p0, ...p3)}"/>`);
    cv.add(`<path d="${part(0, -1.05)}" fill="#14241a" fill-opacity="0.4" clip-path="${within(cv, d)}" filter="${softly(cv, 2.5)}"/>`);
    cv.add(`<g clip-path="${within(cv, d)}" fill="none" stroke="#b0c8b8" stroke-width="0.9" stroke-opacity="0.32">${[-0.72, -0.48, -0.24, 0.24, 0.48, 0.72].map((o) => `<path d="${spline(line(o), false)}"/>`).join('')}</g>`);
    cv.add(`<path d="${spline(line(0), false)}" fill="none" stroke="#c8dacc" stroke-width="1.8" stroke-opacity="0.5"/>`);
    strokes(cv, rnd, d, box, { count: 220, colours: ['#8aa898', '#22362a', '#5a7a64'], flow, length: 24, width: 3, opacity: [0.06, 0.16], spread: 8 });
    // (the bloom on it, and its edge)
    cv.add(`<path d="${d}" fill="#b8c8c4" fill-opacity="0.12"/>`);
    rim(cv, d, { colour: '#a8c0b0', width: 2, opacity: 0.3, soft: 1 });
    cv.add(`<path d="${d}" fill="none" stroke="#14241a" stroke-width="1.2" stroke-opacity="0.6"/>`);
  };
  // the leaves: one lower, reaching out to the right; the other rising tall beside the stem and arching over,
  // its tip falling away
  s.paint((cv) => leaf(cv, [[264, 506], [324, 476], [398, 424], [444, 334]], 78));
  // the stem, bending a little under the weight of the flower: lit down its left side
  s.paint((cv) => {
    const spine = [[258, 296], [252, 360], [256, 430], [264, 508]];
    const stem = tube(spine, 12, 17);
    cv.add(`<path d="${stem}" fill="${linear(cv, [[0, '#86ac78'], [0.4, '#4c7c46'], [1, '#1a3418']], 246, 0, 276, 0)}"/>`);
    strokes(cv, rnd, stem, [240, 290, 280, 510], { count: 60, colours: ['#a8c898', '#22401e'], flow: () => 90, length: 22, width: 2, opacity: [0.08, 0.2], spread: 4 });
    cv.add(`<path d="${spline(spine.map(([x, y]) => [x - 3, y]), false)}" fill="none" stroke="#c4dcb4" stroke-width="1.6" stroke-opacity="0.45"/>`);
    cv.add(`<path d="${stem}" fill="none" stroke="#14281a" stroke-width="1" stroke-opacity="0.5"/>`);
    // (its cut end, pale and wet)
    cv.add(`<ellipse cx="264" cy="508" rx="8.5" ry="3.2" fill="#b8d0a0" stroke="#2a4a26" stroke-width="1"/>`);
  });
  s.paint((cv) => leaf(cv, [[254, 508], [196, 380], [124, 250], [66, 316]], 84));
  // the cup, nodding a little on its stem: the tepals behind just showing their tips, two at the sides, one in
  // front closing round them
  const nod = (draw) => s.paint((cv) => {
    cv.add('<g transform="rotate(-4 258 300)">');
    draw(cv);
    cv.add('</g>');
  });
  nod((cv) => {
    const a = tepal(cv, [246, 290], [214, 66], 100, { at: 0.6, bend: -0.03, point: 0.4 }, { veins: 8 });
    const b = tepal(cv, [266, 290], [302, 58], 100, { at: 0.6, bend: 0.04, point: 0.4 }, { veins: 8 });
    // (the inside of the cup, in shadow, behind the tepals in front)
    for (const d of [a, b]) cv.add(`<path d="${d}" fill="${back}" fill-opacity="0.4" clip-path="${within(cv, d)}"/>`);
  });
  nod((cv) => {
    tepal(cv, [250, 304], [184, 90], 128, { at: 0.55, bend: -0.12, point: 0.4 }, { shade: -1 });
    tepal(cv, [262, 304], [330, 80], 130, { at: 0.55, bend: 0.13, point: 0.4 }, { shade: 1 });
  });
  nod((cv) => {
    const front = tepal(cv, [256, 312], [250, 72], 150, { at: 0.5, bend: -0.03, point: 0.35 }, { veins: 20 });
    // the light on the front tepal's left, and its right in shade; and the satin sheen of it
    crescent(cv, front, [-22, 0], { colour: '#000', opacity: 0.32, soft: 18 });
    crescent(cv, front, [24, 0], { colour: '#fff', opacity: 0.16, soft: 18 });
    cv.add(`<g clip-path="${within(cv, front)}"><path d="M236 292 C204 240 200 150 236 98" fill="none" stroke="#fff" stroke-width="12" stroke-opacity="0.16" stroke-linecap="round" filter="${softly(cv, 5)}"/></g>`);
  });
  return s.done({ finish: { paint: 1.5, grain: 0.012, contrast: 0.08, saturation: 0.95 } });
}

export const ICONS = [
  {
    key: 'hinar',
    ku: 'Hinar',
    en: 'Pomegranate',
    // a ripe pomegranate, painted: broken open at its side, a piece of it leaning against it, the seeds packed in
    // both in their pale pith, ruby and wet; its skin deep crimson and a little rough, lit softly from the left, the
    // crown of its calyx at the top
    still(rnd) {
      const s = new Still(rnd);
      // the fruit, a little lopsided
      const C = [226, 276];
      const body = [];
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const m = 1 + 0.025 * Math.cos(a * 3 + 0.6) + 0.015 * Math.sin(a * 5 + 1.2);
        body.push([C[0] + Math.cos(a) * 172 * m, C[1] + Math.sin(a) * 160 * m]);
      }
      const bodyD = spline(body);
      // the hole broken in its right side, ragged
      const hole = roundish([292, 286], 104, rnd, { wobble: 0.14, count: 22, squash: 1.05 });
      const holeD = spline(hole);
      // seeds packed into a shape: each a little angular, ruby, darkest at its edge, a glint of light on it
      const seeds = (cv, shape, box, gap, lit) => {
        cv.add(`<path d="${shape}" fill="#3a0408"/>`);
        let out = '';
        const poly = [];
        for (let y = box[1]; y <= box[3]; y += gap * 0.86) {
          for (let x = box[0] + ((y / gap) % 2 ? gap / 2 : 0); x <= box[2]; x += gap) poly.push([x + (rnd() - 0.5) * gap * 0.35, y + (rnd() - 0.5) * gap * 0.35]);
        }
        for (const [x, y] of poly) {
          const r = gap * (0.44 + rnd() * 0.2);
          const pts = roundish([x, y], r, rnd, { wobble: 0.26, count: 6, squash: 1.05 + rnd() * 0.3 });
          // (deeper in the hole, and further from the light, the seeds are darker; no two quite the same)
          const shade = Math.max(0, Math.min(1, ((x - lit[0]) * 0.5 + (y - lit[1])) / 240 + (rnd() - 0.5) * 0.5));
          const c0 = ['#e43a52', '#cc2440', '#b0182e', '#901024'][Math.floor(shade * 3.99)];
          out += `<path d="${spline(pts)}" fill="${radial(cv, [[0, c0], [0.55, '#7e0a1e'], [1, '#3a020c']], x - r * 0.3, y - r * 0.35, r * 1.35)}"/>`;
          if (rnd() < 0.7) {
            const g = r * (0.12 + rnd() * 0.14);
            out += `<ellipse cx="${n(x - r * 0.3)}" cy="${n(y - r * 0.36)}" rx="${n(g * 1.6)}" ry="${n(g)}" transform="rotate(-35 ${n(x - r * 0.3)} ${n(y - r * 0.36)})" fill="#fff4f0" fill-opacity="${n(0.4 + rnd() * 0.5)}"/>`;
          }
        }
        cv.add(`<g clip-path="${within(cv, shape)}">${out}</g>`);
      };
      s.paint((cv) => {
        // the skin: crimson, lighter where the light falls, and its shadow side; its small pale pores
        cv.add(`<path d="${bodyD}" fill="${radial(cv, [[0, '#c4383a'], [0.35, '#a01c22'], [0.75, '#7a1018'], [1, '#4e080e']], 150, 190, 260, 140, 170)}"/>`);
        // (the skin mottled: patches a little browner, a little brighter)
        cv.add(`<g clip-path="${within(cv, bodyD)}" filter="${softly(cv, 12)}">`);
        for (let i = 0; i < 26; i++) cv.add(`<ellipse cx="${n(60 + rnd() * 340)}" cy="${n(120 + rnd() * 320)}" rx="${n(14 + rnd() * 30)}" ry="${n(10 + rnd() * 24)}" fill="${rnd() < 0.5 ? '#6a1a14' : '#d0484a'}" fill-opacity="${n(0.12 + rnd() * 0.16)}"/>`);
        cv.add('</g>');
        crescent(cv, bodyD, [-46, -40], { colour: '#2a0408', opacity: 0.55, soft: 26 });
        crescent(cv, bodyD, [26, 30], { colour: '#e8786a', opacity: 0.22, soft: 30 });
        strokes(cv, rnd, bodyD, [40, 100, 420, 450], { count: 900, colours: ['#d8505a', '#6a0c14', '#b02a2e'], flow: (x, y) => (Math.atan2(y - C[1], x - C[0]) * 180) / Math.PI + 90, length: 16, width: 3, opacity: [0.05, 0.16] });
        specks(cv, rnd, bodyD, [40, 100, 420, 450], { count: 260, colours: ['#f0a8a0', '#e88c84'], size: [0.6, 1.6], opacity: [0.15, 0.4] });
        cv.add(`<ellipse cx="148" cy="190" rx="52" ry="34" transform="rotate(-30 148 190)" fill="#f8c8c0" fill-opacity="0.32" filter="${softly(cv, 16)}"/>`);
        rim(cv, bodyD, { colour: '#2a0408', width: 5, opacity: 0.5, soft: 3 });
      });
      // the crown: a short tube flaring into pointed sepals, darker, dry at their tips
      const crown = 'M150 132 C146 116 140 104 130 94 C138 95 146 98 152 103 C152 90 154 80 158 70 C164 80 168 90 170 100 C176 90 184 84 194 80 C192 92 188 102 184 110 C192 107 200 106 208 108 C200 118 192 126 184 134 C178 142 160 142 150 132 Z';
      s.paint((cv) => {
        cv.add(`<path d="${crown}" fill="${linear(cv, [[0, '#5a0c10'], [0.6, '#8a2020'], [1, '#a83a2a']], 160, 70, 170, 140)}"/>`);
        crescent(cv, crown, [-6, -6], { colour: '#1a0204', opacity: 0.5, soft: 4 });
        cv.add(`<path d="M134 96 L130 94 M156 72 L158 70 M192 82 L194 80 M206 108 L208 108" stroke="#d8b090" stroke-width="2" stroke-linecap="round" stroke-opacity="0.7"/>`);
        rim(cv, crown, { colour: '#1a0204', width: 2, opacity: 0.6 });
      });
      // the hole: the skin's broken edge round it, thick and pale, and the seeds packed in it
      s.paint((cv) => {
        // (the skin broken thin and ragged round the hole, the pith pink-white in the break)
        const torn = spline(roundish([292, 286], 112, rnd, { wobble: 0.2, count: 34, squash: 1.05 }));
        cv.add(`<path d="${torn}" fill="#e6b8a8"/>`);
        cv.add(`<path d="${torn}" fill="none" stroke="#f4dccc" stroke-width="3" stroke-opacity="0.7"/>`);
        seeds(cv, holeD, [176, 166, 404, 404], 17, [220, 200]);
        // the pale membranes running in between the seeds, and the shadow of the near rim on them
        for (let i = 0; i < 3; i++) {
          const a = -0.4 + i * 0.9 + rnd() * 0.3;
          cv.add(`<path d="M${pt([292 + Math.cos(a) * 100, 286 + Math.sin(a) * 100])} Q${pt([292 + Math.cos(a + 0.4) * 50, 286 + Math.sin(a + 0.4) * 50])} ${pt([292 + rnd() * 20 - 10, 286 + rnd() * 20 - 10])}" fill="none" stroke="#f0d8c4" stroke-width="5" stroke-opacity="0.8" stroke-linecap="round" clip-path="${within(cv, holeD)}"/>`);
        }
        crescent(cv, holeD, [16, 18], { colour: '#1a0204', opacity: 0.55, soft: 8 });
      });
      // the piece broken off, leaning against the fruit at the front: its skin round its back, its seeds to us
      const piece = spline([[330, 300], [372, 270], [420, 262], [452, 290], [462, 340], [446, 398], [404, 436], [356, 446], [322, 420], [312, 370]]);
      const face = spline([[338, 306], [374, 282], [416, 278], [442, 300], [448, 342], [432, 392], [396, 424], [358, 430], [332, 408], [326, 364]]);
      s.shadow((cv) => cv.add(`<path d="${piece}" fill="#000" transform="translate(-12 6)"/>`), { blur: 10, opacity: 0.45 });
      s.paint((cv) => {
        cv.add(`<path d="${piece}" fill="${linear(cv, [[0, '#8a141c'], [1, '#4a080c']], 330, 270, 460, 440)}"/>`);
        strokes(cv, rnd, piece, [300, 250, 470, 450], { count: 220, colours: ['#c43a3a', '#5a0a10'], flow: () => 60, length: 12, width: 2.4, opacity: [0.06, 0.16] });
        cv.add(`<path d="${face}" fill="#e2b0a0"/>`);
        const inner = spline([[342, 312], [374, 290], [414, 286], [438, 306], [443, 344], [428, 388], [396, 416], [360, 422], [336, 402], [331, 362]]);
        seeds(cv, inner, [326, 280, 450, 426], 16, [340, 300]);
        cv.add(`<path d="M${pt([392, 300])} Q${pt([380, 350])} ${pt([400, 410])}" fill="none" stroke="#f0d8c4" stroke-width="5" stroke-opacity="0.85" stroke-linecap="round" clip-path="${within(cv, inner)}"/>`);
        crescent(cv, inner, [-8, -10], { colour: '#1a0204', opacity: 0.3, soft: 8 });
        rim(cv, piece, { colour: '#1a0204', width: 3, opacity: 0.5, soft: 2 });
      });
      return s.done({ finish: { paint: 2, grain: 0.012, contrast: 0.1, saturation: 1 } });
    },
  },
  {
    key: 'roj',
    ku: 'Roj',
    en: 'Sun',
    // the sun of the flag, as a thing of light: its twenty-one rays wavering like flames round a bright disc with a
    // spiral turning in it, white-hot at the heart, gold at the tips, glowing on whatever it lies over
    still(rnd) {
      const s = new Still(rnd);
      const C = [256, 256];
      const rays = [];
      for (let i = 0; i < 21; i++) {
        const a = (i / 21) * Math.PI * 2 - Math.PI / 2;
        const long = i % 2 === 0;
        const r0 = 104;
        const r1 = long ? 238 : 196;
        const w0 = long ? 24 : 18;
        const ph = rnd() * Math.PI * 2;
        const left = [];
        const right = [];
        for (let k = 0; k <= 10; k++) {
          const t = k / 10;
          const r = r0 + (r1 - r0) * t;
          // a flame's waver: more toward the tip
          const wob = Math.sin(t * Math.PI * 2.2 + ph) * 0.07 * t;
          const ang = a + wob;
          const w = (w0 / 2) * Math.pow(1 - t, 0.8) / r;
          left.push([C[0] + Math.cos(ang - w) * r, C[1] + Math.sin(ang - w) * r]);
          right.push([C[0] + Math.cos(ang + w) * r, C[1] + Math.sin(ang + w) * r]);
        }
        rays.push(spline([...left, ...right.reverse()]));
      }
      const spiral = [];
      for (let t = 0; t <= 1; t += 0.01) {
        const a = t * Math.PI * 2 * 3.4 - Math.PI / 2;
        const r = 7 + 80 * t;
        spiral.push([C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]);
      }
      const all = (cv, fill) => cv.add(`<g fill="${fill}">${rays.map((d) => `<path d="${d}"/>`).join('')}<circle cx="${C[0]}" cy="${C[1]}" r="112"/></g>`);
      s.glow((cv) => all(cv, '#ffae2a'), { blur: 22, strength: 0.75, halo: 0.9 });
      s.paint((cv) => all(cv, radial(cv, [[0, '#fffdf2'], [0.45, '#fff1b8'], [0.75, '#ffd760'], [1, '#f5a622']], C[0], C[1], 240)));
      s.paint((cv) => cv.add(`<circle cx="${C[0]}" cy="${C[1]}" r="104" fill="${radial(cv, [[0, '#fffffa'], [0.7, '#fff6d0'], [1, '#ffe48a']], C[0], C[1], 104)}"/>`));
      s.paint((cv) => cv.add(`<path d="${spline(spiral, false)}" fill="none" stroke="#e4961c" stroke-width="8" stroke-linecap="round" stroke-opacity="0.8"/>`), { blur: 0.8 });
      s.glow((cv) => cv.add(`<circle cx="${C[0]}" cy="${C[1]}" r="70" fill="#fff8e0"/>`), { blur: 14, strength: 0.5, halo: 0.4 });
      return s.done({ finish: { grain: 0.003, contrast: 0.05 } });
    },
  },
  {
    key: 'ciya',
    ku: 'Çiya',
    en: 'Mountain',
    // a high peak of the Zagros in late spring, painted as the mountains behind the shop's scenes are: its ribs of
    // dark rock running down from the summit with gullies between them, snow lying in the gullies and over the
    // shoulders, the morning light on its western faces and its eastern ones in blue shade, its foot lost in cloud
    still(rnd) {
      const s = new Still(rnd);
      const ridge = [[22, 512], [36, 440], [66, 384], [102, 344], [138, 300], [160, 268], [186, 236], [206, 196], [226, 152], [244, 106], [262, 62], [278, 84], [298, 118], [322, 150], [346, 176], [366, 192], [384, 176], [404, 160], [424, 186], [446, 224], [466, 268], [484, 318], [494, 372], [498, 440], [498, 512]];
      // (broken, as rock breaks: each stretch of the crest split again and again, its middle pushed up or down)
      const broken = (a, b, depth, rough) => {
        if (depth === 0) return [a];
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + (rnd() - 0.5) * Math.hypot(b[0] - a[0], b[1] - a[1]) * rough];
        return [...broken(a, m, depth - 1, rough), ...broken(m, b, depth - 1, rough)];
      };
      const crest = [];
      for (let i = 0; i < ridge.length - 1; i++) crest.push(...(i === 0 || i === ridge.length - 2 ? [ridge[i]] : broken(ridge[i], ridge[i + 1], 3, 0.3)));
      crest.push(ridge[ridge.length - 1]);
      // its foot fades into the cloud
      const fade = (cv) => cv.add(`<rect width="512" height="512" fill="${linear(cv, [[0, '#fff'], [0.72, '#fff'], [0.83, '#000']], 0, 0, 0, 512)}"/>`);
      s.terrain({ ridge: crest, peaks: [[262, 62, 240], [404, 160, 110]], lit: '#bcae9e', shadow: '#26365a', ambient: 0.18, snowline: 262, snowLit: '#ffffff', snowShadow: '#b8c6e2', foot: '#c4cede', footFrom: 330, scale: 0.8, relief: 0.9, light: [-0.75, -0.45, 0.55] }, { mask: fade });
      // and the cloud lying round its foot: a bank of billows, sunlit on top, grey beneath, torn at its edges
      s.paint((cv) => {
        const torn = (freq, tear) => {
          const f = cv.id('wisp');
          cv.def(`<filter id="${f}" x="-30%" y="-80%" width="160%" height="260%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${Math.floor(rnd() * 1000)}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="${tear}" xChannelSelector="R" yChannelSelector="G"/></filter>`);
          return `url(#${f})`;
        };
        let bank = '<ellipse cx="258" cy="426" rx="234" ry="22"/>';
        for (let i = 0; i < 13; i++) {
          const t = i / 12;
          bank += `<circle cx="${n(48 + t * 416 + (rnd() - 0.5) * 14)}" cy="${n(414 - Math.sin(t * Math.PI) * 10 + (rnd() - 0.5) * 10)}" r="${n((14 + rnd() * 12) * (0.6 + 0.4 * Math.sin(t * Math.PI)))}"/>`;
        }
        cv.add(`<g fill="${linear(cv, [[0, '#ffffff'], [0.5, '#eaedf2'], [1, '#aab4c6']], 0, 384, 0, 450)}" filter="${torn('0.016 0.04', 30)}">${bank}</g>`);
        // (the light on the tops of its billows)
        cv.add(`<g fill="#fffaf0" fill-opacity="0.55" filter="${torn('0.02 0.05', 20)}">`);
        for (let i = 0; i < 8; i++) cv.add(`<ellipse cx="${n(80 + i * 50 + rnd() * 16)}" cy="${n(398 + rnd() * 8)}" rx="${n(18 + rnd() * 14)}" ry="${n(5 + rnd() * 4)}"/>`);
        cv.add('</g>');
      }, { blur: 2.5 });
      return s.done({ finish: { paint: 1.5, grain: 0.01, contrast: 0.08, saturation: 0.95 } });
    },
  },
  {
    key: 'lale',
    ku: 'Lale',
    en: 'Tulip',
    still: (rnd) => tulip(rnd, ['#5a0e12', '#ae1c26', '#d8423a', '#2a0406']),
  },
  {
    key: 'laleya-mor',
    ku: 'Laleya Mor',
    en: 'Purple tulip',
    still: (rnd) => tulip(rnd, ['#26103a', '#58247e', '#8c52b6', '#140420']),
  },
  {
    key: 'ask',
    ku: 'Ask',
    en: 'Deer',
    // a buck come down to drink, painted as he stands against the light: the deer of the backgrounds (figures.mjs),
    // high on his long legs, his rump the highest of him and his back falling from it down his neck to his head,
    // which hangs nearly straight down; his coat a deep brown, darker down the legs to the hooves, lit along its
    // edges by the light behind him, the hair laid on in strokes; a dark eye ringed paler, a dark nose, and a rack
    // of golden bone, dark at its roots and pale at its tips
    still(rnd) {
      const s = new Still(rnd);
      const d = deerShapes({ x: 163, y: 395, size: 254 });
      const F = d.frame;
      const M = d.marks;
      const k = 2.54;
      const ink = '#140c06';
      const box = [0, 0, 512, 512];
      const deg = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      // the way the hair lies: down the legs, down the neck to the head, and back along the body toward the tail
      const legs = F([0, -50])[1];
      const neck = deg(M.withers, M.muzzle);
      const flow = (x, y) => (y > legs ? 90 : x > M.withers[0] ? neck : 172);
      // the coat: a deep brown, warmer along the back where the light is, darker down the legs to the hooves
      s.paint((cv) => {
        cv.add(`<path d="${d.body}" fill="${linear(cv, [[0, '#4c3a1e'], [0.35, '#3e2e17'], [0.6, '#322512'], [1, '#18120a']], 0, F([0, -110])[1], 0, F([0, 0])[1])}"/>`);
        // (the masses under it: the round of the haunch, the shoulder, the neck, catching a little light)
        cv.add(`<g clip-path="${within(cv, d.body)}">`);
        for (const [c, rx, ry, o] of [[[22, -88], 18, 15, 0.3], [[52, -84], 18, 10, 0.18], [[80, -80], 11, 15, 0.24], [[104, -70], 9, 13, 0.2]]) {
          const [cx, cy] = F(c);
          cv.add(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx * k)}" ry="${n(ry * k)}" fill="#7a6036" fill-opacity="${o}" filter="${softly(cv, 12)}"/>`);
        }
        cv.add('</g>');
        // (the underside in shadow)
        crescent(cv, d.body, [0, -18], { colour: '#0a0604', opacity: 0.45, soft: 14 });
        strokes(cv, rnd, d.body, box, { count: 4200, colours: ['#140e06', '#2e2210', '#5a4422', '#7a6034'], flow, length: 9, width: 1.4, opacity: [0.1, 0.28] });
        specks(cv, rnd, d.body, box, { count: 900, colours: ['#0e0a04', '#7a6236'], size: [0.4, 1.1], opacity: [0.15, 0.4] });
        // (the legs darkening to the hooves)
        cv.add(`<rect width="512" height="512" fill="${linear(cv, [[0, '#120c06', 0], [1, '#120c06', 0.55]], 0, F([0, -42])[1], 0, F([0, 0])[1])}" clip-path="${within(cv, d.body)}"/>`);
        // the light behind him, along the top of everything and round every edge
        crescent(cv, d.body, [0, 5], { colour: '#d8a860', opacity: 0.55, soft: 2.5 });
        rim(cv, d.body, { colour: '#c09050', width: 1.3, opacity: 0.6, soft: 0.6 });
        // the hooves, their horn catching the light
        for (const h of M.hooves) cv.add(`<ellipse cx="${n(h[0] + 1.6 * k)}" cy="${n(h[1] - 0.6 * k)}" rx="${n(2.4 * k)}" ry="${n(0.7 * k)}" fill="#e0ccb0" fill-opacity="0.35" filter="${softly(cv, 1.2)}"/>`);
        // the face: the eye, dark and wet in its paler ring, and the dark nose
        const [ex, ey] = M.eye;
        cv.add(`<ellipse cx="${n(ex)}" cy="${n(ey)}" rx="${n(2.8 * k)}" ry="${n(2.3 * k)}" fill="#8a6a48" fill-opacity="0.45" filter="${softly(cv, 2)}"/>`);
        cv.add(`<ellipse cx="${n(ex)}" cy="${n(ey)}" rx="${n(1.5 * k)}" ry="${n(1.2 * k)}" fill="#0a0604"/>`);
        cv.add(`<circle cx="${n(ex - 0.5 * k)}" cy="${n(ey - 0.5 * k)}" r="${n(0.45 * k)}" fill="#fff" fill-opacity="0.8"/>`);
        const [nx, ny] = M.nose;
        cv.add(`<ellipse cx="${n(nx)}" cy="${n(ny)}" rx="${n(3.2 * k)}" ry="${n(2.2 * k)}" fill="#0a0604" fill-opacity="0.8" filter="${softly(cv, 1.6)}"/>`);
        // (the ear's hollow, darker)
        cv.add(`<path d="M${pt(M.earBase)} L${pt(M.earTip)}" stroke="#1a1008" stroke-width="${n(1.6 * k)}" stroke-linecap="round" stroke-opacity="0.45" filter="${softly(cv, 1.5)}"/>`);
        cv.add(`<path d="${d.body}" fill="none" stroke="${ink}" stroke-width="1.3" stroke-opacity="0.55"/>`);
      });
      // the rack: bone, dark and rough at its roots, golden along the beams, pale at the tips, lit along its top
      s.paint((cv) => {
        const [bx, by] = M.burr;
        cv.add(`<path d="${d.rack}" fill="${radial(cv, [[0, '#2e1c0c'], [0.25, '#5a3a16'], [0.65, '#8a5c26'], [1, '#b08040']], bx, by, 46 * k)}"/>`);
        strokes(cv, rnd, d.rack, box, { count: 700, colours: ['#4a3018', '#c89452', '#e8c890'], flow: (x, y) => deg([bx, by], [x, y]), length: 8, width: 1.3, opacity: [0.08, 0.24] });
        crescent(cv, d.rack, [0, 3], { colour: '#f0d498', opacity: 0.45, soft: 1.5 });
        cv.add(`<path d="${d.rack}" fill="none" stroke="#2a1808" stroke-width="1.1" stroke-opacity="0.55"/>`);
      });
      return s.done({ finish: { paint: 0.5, grain: 0.018, contrast: 0.08, saturation: 0.95 } });
    },
  },
  {
    key: 'sterk',
    ku: 'Mohra Rojê',
    en: 'Sun seal',
    // a seal of dark red wax, painted: the wax spread round the stamp and pushed up in a thick lip, glossy, the
    // light running round its top; inside the lip the wax pressed flat, and the sun of the Kurdish flag standing
    // up from it — its round disc and its twenty-one rays, sharp-edged — a ring of the stamp's border round it
    still(rnd) {
      const s = new Still(rnd);
      const C = [256, 260];
      const wax = spline(roundish(C, 198, rnd, { wobble: 0.035, count: 48 }));
      const well = spline(roundish(C, 146, rnd, { wobble: 0.012, count: 48 }));
      // a raised shape, as a stamp raises it: lit along its upper left edges, dark along its lower right
      const raised = (cv, d, depth, base) => {
        cv.add(`<path d="${d}" fill="#2a0406" fill-opacity="0.85" transform="translate(${depth} ${depth})" filter="${softly(cv, depth * 0.5)}"/>`);
        cv.add(`<path d="${d}" fill="#e07070" fill-opacity="0.75" transform="translate(${-depth * 0.7} ${-depth * 0.7})" filter="${softly(cv, depth * 0.4)}"/>`);
        cv.add(`<path d="${d}" fill="${base}"/>`);
      };
      s.paint((cv) => {
        // the wax: deep red, darker toward its edge
        cv.add(`<path d="${wax}" fill="${radial(cv, [[0, '#86202a'], [0.7, '#6c141c'], [1, '#4c0a10']], C[0] - 30, C[1] - 30, 230)}"/>`);
        // the lip: its outside lit at the upper left and dark at the lower right, its inside the other way about
        crescent(cv, wax, [20, 20], { colour: '#d46a6a', opacity: 0.55, soft: 14 });
        crescent(cv, wax, [-24, -24], { colour: '#1e0204', opacity: 0.7, soft: 16 });
        cv.add(`<path d="${well}" fill="${radial(cv, [[0, '#7a1a22'], [1, '#64121a']], C[0] - 20, C[1] - 20, 160)}"/>`);
        crescent(cv, well, [14, 14], { colour: '#1e0204', opacity: 0.75, soft: 10 });
        crescent(cv, well, [-12, -12], { colour: '#e07a78', opacity: 0.45, soft: 10 });
        // the gloss on the lip: a bright line along the top of it, and its echo low on the inside
        cv.add(`<path d="M${pt([C[0] - 168, C[1] + 40])} A172 172 0 0 1 ${pt([C[0] + 30, C[1] - 170])}" fill="none" stroke="#fff0ec" stroke-width="5" stroke-opacity="0.75" stroke-linecap="round" filter="${softly(cv, 2.5)}"/>`);
        cv.add(`<path d="M${pt([C[0] - 150, C[1] - 10])} A160 160 0 0 1 ${pt([C[0] - 60, C[1] - 146])}" fill="none" stroke="#fff" stroke-width="2.4" stroke-opacity="0.85" stroke-linecap="round"/>`);
        cv.add(`<path d="M${pt([C[0] + 136, C[1] + 40])} A142 142 0 0 1 ${pt([C[0] + 20, C[1] + 140])}" fill="none" stroke="#f8c8c4" stroke-width="3" stroke-opacity="0.55" stroke-linecap="round" filter="${softly(cv, 1.5)}"/>`);
        // the stamp's border, a fine raised ring, and the sun standing up inside it: twenty-one rays, the first
        // pointing straight up, from under a round disc, the disc swelling a little to its middle
        const ring = `M${C[0] - 128} ${C[1]} A128 128 0 1 0 ${C[0] + 128} ${C[1]} A128 128 0 1 0 ${C[0] - 128} ${C[1]} Z M${C[0] - 121} ${C[1]} A121 121 0 1 1 ${C[0] + 121} ${C[1]} A121 121 0 1 1 ${C[0] - 121} ${C[1]} Z`;
        raised(cv, ring, 2.5, '#741820');
        const disc = (r) => `M${C[0] - r} ${C[1]} A${r} ${r} 0 1 0 ${C[0] + r} ${C[1]} A${r} ${r} 0 1 0 ${C[0] - r} ${C[1]} Z`;
        const rays = sunRays(C[0], C[1], 48, 106, 21, 0.12);
        const sun = `${rays} ${disc(54)}`;
        const face = linear(cv, [[0, '#8e2830'], [1, '#6a141c']], C[0] - 106, C[1] - 106, C[0] + 106, C[1] + 106);
        raised(cv, sun, 3.2, face);
        // (the shine along the rays' upper edges; then the disc laid over their roots, a little proud of them,
        // swelling to its middle, catching the light above and dark below)
        cv.add(`<path d="${rays}" fill="none" stroke="#ffd8d4" stroke-width="1.6" stroke-opacity="0.5" transform="translate(-1.5 -1.5)" clip-path="${within(cv, rays)}"/>`);
        cv.add(`<path d="${disc(54)}" fill="#2a0406" fill-opacity="0.6" transform="translate(1.8 1.8)" filter="${softly(cv, 1)}"/>`);
        cv.add(`<path d="${disc(54)}" fill="${face}"/>`);
        cv.add(`<path d="${disc(54)}" fill="${radial(cv, [[0, '#a03640', 0.7], [0.6, '#86242c', 0.35], [1, '#6a141c', 0]], C[0] - 16, C[1] - 18, 60)}"/>`);
        cv.add(`<path d="${disc(54)}" fill="none" stroke="#ffd8d4" stroke-width="1.6" stroke-opacity="0.5" transform="translate(-1.5 -1.5)" clip-path="${within(cv, disc(54))}"/>`);
        // the wax's own small marks
        strokes(cv, rnd, wax, [50, 56, 462, 464], { count: 500, colours: ['#a8343c', '#4a0a10'], flow: (x, y) => (Math.atan2(y - C[1], x - C[0]) * 180) / Math.PI + 90, length: 18, width: 2.4, opacity: [0.04, 0.12] });
        specks(cv, rnd, wax, [50, 56, 462, 464], { count: 90, colours: ['#ffd0cc', '#2a0406'], size: [0.6, 1.4], opacity: [0.15, 0.4] });
      });
      return s.done({ finish: { paint: 1.5, grain: 0.01, contrast: 0.1, saturation: 1 } });
    },
  },
  {
    key: 'caydan',
    ku: 'Îstîkan',
    en: 'Tea glass',
    // a glass of tea on its saucer, painted: the tulip glass pinched at the waist, the tea in it deep red where it
    // is deep and glowing amber where the light comes through it, the glass drawn in by its dark edges and its
    // white lights; the saucer cream, scalloped, painted round its rim with orange petals and little gold sprigs,
    // the glass's shadow lying on it amber
    still(rnd) {
      const s = new Still(rnd);
      const X = 256;
      // the glass: its half-width down its height, and the outline those make, `inset` in from its outside
      const profile = [[40, 118], [70, 114], [120, 100], [170, 86], [210, 80], [250, 86], [300, 104], [340, 114], [372, 112], [398, 100], [412, 90]];
      const glass = (inset, top = 40, bottom = 412) => {
        const rows = profile.filter(([y]) => y >= top && y <= bottom).map(([y, w]) => [y, w - inset]);
        if (rows[0][0] > top) {
          const i = profile.findIndex(([y]) => y > top);
          const [ya, wa] = profile[i - 1];
          const [yb, wb] = profile[i];
          rows.unshift([top, wa + ((wb - wa) * (top - ya)) / (yb - ya) - inset]);
        }
        // (its two sides each a smooth curve of its own, joined straight across the top and the bottom, so that
        // nothing bulges at the corners)
        const left = spline(rows.map(([y, w]) => [X - w, y]), false);
        const right = spline(rows.slice().reverse().map(([y, w]) => [X + w, y]), false);
        return `${left} L${right.slice(1)} Z`;
      };
      const halfAt = (y) => {
        const i = Math.max(1, profile.findIndex(([py]) => py >= y));
        const [ya, wa] = profile[i - 1];
        const [yb, wb] = profile[i];
        return wa + ((wb - wa) * (y - ya)) / (yb - ya);
      };
      // the saucer, scalloped
      const S = [256, 420];
      const scallop = [];
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const r = 1 + 0.018 * Math.cos(a * 12);
        scallop.push([S[0] + Math.cos(a) * 198 * r, S[1] + Math.sin(a) * 62 * r]);
      }
      const saucer = spline(scallop);
      s.paint((cv) => {
        // its edge, the thickness of the china seen at the front
        cv.add(`<path d="${saucer}" fill="#b8aa94" transform="translate(0 9)"/>`);
        cv.add(`<path d="${saucer}" fill="${linear(cv, [[0, '#fbf6ec'], [0.55, '#efe6d6'], [1, '#d6c8b2']], 80, 360, 440, 480)}"/>`);
        crescent(cv, saucer, [-30, -14], { colour: '#8a7a62', opacity: 0.35, soft: 18 });
        // the well the glass stands in
        cv.add(`<ellipse cx="${S[0]}" cy="${S[1] - 2}" rx="112" ry="34" fill="none" stroke="#c8b8a0" stroke-width="5" stroke-opacity="0.6" filter="${softly(cv, 2)}"/>`);
        // the orange petals round the rim, and the gold sprigs between them, smaller where the rim turns away
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + 0.13;
          const [cx, cy] = [S[0] + Math.cos(a) * 160, S[1] + Math.sin(a) * 50];
          const [ix, iy] = [S[0] + Math.cos(a) * 128, S[1] + Math.sin(a) * 40];
          const ang = (Math.atan2(cy - iy, cx - ix) * 180) / Math.PI;
          const fore = 0.55 + 0.45 * Math.max(0, Math.sin(a));
          // (a petal: a teardrop, its point toward the middle)
          const l = 15 * fore + 5;
          const w = 5.5 * fore + 2.4;
          const petalD = `M${n(-l)} 0 Q${n(-l * 0.2)} ${n(-w * 1.25)} ${n(l)} 0 Q${n(-l * 0.2)} ${n(w * 1.25)} ${n(-l)} 0 Z`;
          cv.add(`<path d="${petalD}" transform="translate(${n(cx)} ${n(cy)}) rotate(${n(ang)})" fill="#e4845a" stroke="#b8542c" stroke-width="1.2" stroke-opacity="0.6"/>`);
          const b = a + Math.PI / 12;
          const [gx, gy] = [S[0] + Math.cos(b) * 158, S[1] + Math.sin(b) * 49];
          for (const t of [-1, 0, 1]) cv.add(`<ellipse cx="${n(gx + t * 5 * fore)}" cy="${n(gy - Math.abs(t) * 2)}" rx="${n(3.2 * fore + 1)}" ry="${n(1.6 * fore + 0.6)}" transform="rotate(${n(t * 40)} ${n(gx + t * 5 * fore)} ${n(gy)})" fill="#b88a34"/>`);
          cv.add(`<circle cx="${n(gx)}" cy="${n(gy + 3 * fore)}" r="${n(1.4 * fore + 0.6)}" fill="#7a4a1c"/>`);
        }
        // the glass's shadow on the saucer: the light comes through the tea, so it is amber, dark only under the foot
        cv.add(`<ellipse cx="${X + 70}" cy="${S[1] + 14}" rx="118" ry="30" fill="#b0581c" fill-opacity="0.38" filter="${softly(cv, 7)}"/>`);
        cv.add(`<ellipse cx="${X + 8}" cy="${S[1] - 2}" rx="96" ry="18" fill="#2a160c" fill-opacity="0.45" filter="${softly(cv, 4)}"/>`);
        strokes(cv, rnd, saucer, [56, 356, 456, 490], { count: 700, colours: ['#fffaf0', '#d8ccb8', '#e8dccb'], flow: () => 0, length: 14, width: 2.4, opacity: [0.06, 0.18] });
      });
      // the inside of the glass above the tea: its far wall, pale and clear, and the mouth of it open
      s.paint((cv) => {
        cv.add(`<path d="${glass(0, 40, 92)}" fill="${linear(cv, [[0, '#e8eae6'], [0.5, '#b8bcb8'], [1, '#d8dad6']], X - 118, 0, X + 118, 0)}" fill-opacity="0.32"/>`);
        cv.add(`<ellipse cx="${X}" cy="40" rx="116" ry="20" fill="#3a3632" fill-opacity="0.25"/>`);
      });
      // the tea: dark red in the deep of the glass, amber at its sides and glowing at its foot, the window's light
      // lying across it
      const tea = glass(5, 82, 404);
      s.paint((cv) => {
        cv.add(`<path d="${tea}" fill="${linear(cv, [[0, '#c4561c'], [0.16, '#9a2c0a'], [0.45, '#5e1204'], [0.75, '#741806'], [1, '#a63e10']], X - 112, 0, X + 112, 0)}"/>`);
        cv.add(`<g clip-path="${within(cv, tea)}">`);
        cv.add(`<rect x="0" y="80" width="512" height="44" fill="#2a0602" fill-opacity="0.55" filter="${softly(cv, 10)}"/>`);
        cv.add(`<ellipse cx="${X - 10}" cy="392" rx="84" ry="30" fill="#f0903a" fill-opacity="0.7" filter="${softly(cv, 14)}"/>`);
        cv.add(`<path d="M${X - 92} 130 Q${X - 70} 250 ${X - 86} 380" fill="none" stroke="#e8884a" stroke-width="26" stroke-opacity="0.45" filter="${softly(cv, 9)}"/>`);
        cv.add(`<path d="M${X - 100} 300 Q${X} 320 ${X + 104} 296" fill="none" stroke="#f4b07a" stroke-width="10" stroke-opacity="0.28" filter="${softly(cv, 5)}"/>`);
        cv.add(`<path d="M${X + 30} 120 Q${X + 40} 240 ${X + 34} 370" fill="none" stroke="#2a0602" stroke-width="22" stroke-opacity="0.35" filter="${softly(cv, 10)}"/>`);
        cv.add('</g>');
        strokes(cv, rnd, tea, [X - 120, 80, X + 120, 410], { count: 520, colours: ['#4a0c02', '#8a2408', '#c4561c', '#e07a34'], flow: () => 90, length: 34, width: 3, opacity: [0.05, 0.16] });
        // the surface of the tea, seen a little from above: dark, its edge caught by the light
        const w = halfAt(82) - 5;
        cv.add(`<ellipse cx="${X}" cy="82" rx="${n(w)}" ry="19" fill="${linear(cv, [[0, '#a8461a'], [0.5, '#5a1206'], [1, '#8a3412']], X - w, 0, X + w, 0)}"/>`);
        cv.add(`<path d="M${n(X - w + 6)} 86 Q${X} 104 ${n(X + w - 6)} 86" fill="none" stroke="#f0a060" stroke-width="2.4" stroke-opacity="0.7"/>`);
        cv.add(`<path d="M${n(X - w + 20)} 76 Q${X - 10} 66 ${X + 40} 68" fill="none" stroke="#fff2e0" stroke-width="2" stroke-opacity="0.55"/>`);
      });
      // the glass itself, painted as a painter paints glass: by its edges, dark, and by the window in it, white
      s.paint((cv) => {
        const outside = glass(0);
        cv.add(`<path d="${outside}" fill="none" stroke="#1c1816" stroke-width="4" stroke-opacity="0.85"/>`);
        cv.add(`<path d="${outside}" fill="none" stroke="#6a6662" stroke-width="9" stroke-opacity="0.25" clip-path="${within(cv, outside)}"/>`);
        // the rim: the far side of it grey, the near side dark with the light along its top
        cv.add(`<path d="M${X - 118} 40 A118 22 0 0 1 ${X + 118} 40" fill="none" stroke="#8a8682" stroke-width="3"/>`);
        cv.add(`<path d="M${X - 118} 40 A118 22 0 0 0 ${X + 118} 40" fill="none" stroke="#1c1816" stroke-width="4"/>`);
        cv.add(`<path d="M${X - 100} 52 A118 22 0 0 0 ${X + 60} 60" fill="none" stroke="#fff" stroke-width="2.6" stroke-opacity="0.8"/>`);
        // the long light down its left side, a shorter one on the right, and the thick glass of its foot
        cv.add(`<path d="M${X - 96} 64 Q${X - 82} 140 ${X - 66} 210 Q${X - 76} 290 ${X - 92} 360" fill="none" stroke="#fff" stroke-width="9" stroke-opacity="0.75" stroke-linecap="round" filter="${softly(cv, 1.5)}"/>`);
        cv.add(`<path d="M${X - 80} 120 Q${X - 70} 170 ${X - 62} 200" fill="none" stroke="#fff" stroke-width="3" stroke-opacity="0.6" stroke-linecap="round"/>`);
        cv.add(`<path d="M${X + 96} 150 Q${X + 80} 200 ${X + 74} 226" fill="none" stroke="#fff" stroke-width="4" stroke-opacity="0.55" stroke-linecap="round" filter="${softly(cv, 1)}"/>`);
        cv.add(`<path d="M${X + 100} 320 Q${X + 108} 350 ${X + 100} 380" fill="none" stroke="#fff" stroke-width="3" stroke-opacity="0.4" stroke-linecap="round"/>`);
        cv.add(`<path d="M${X - 88} 404 Q${X} 424 ${X + 88} 404" fill="none" stroke="#fff6e8" stroke-width="5" stroke-opacity="0.55" filter="${softly(cv, 1.5)}"/>`);
        cv.add(`<path d="M${X - 90} 412 Q${X} 432 ${X + 90} 412" fill="none" stroke="#1c1816" stroke-width="3" stroke-opacity="0.8"/>`);
      });
      return s.done({ finish: { paint: 2, grain: 0.012, contrast: 0.08, saturation: 1 } });
    },
  },
  {
    key: 'saz',
    ku: 'Saz',
    en: 'Saz',
    // a saz lying slantwise, painted: the pear of its bowl, staves of dark mulberry showing round a pale spruce face
    // with its small sound hole and its bridge, the long walnut neck with its frets tied round it, the pegs at its
    // head, the strings running the length of it, the varnish catching the light in long streaks
    still(rnd) {
      const s = new Still(rnd).place([-6, 10], 0.95);
      const ink = '#24120a';
      const O = [84, 446];
      const a = [Math.cos(-0.8), Math.sin(-0.8)];
      const q = [-a[1], a[0]];
      const S = (u, v) => [O[0] + a[0] * u + q[0] * v, O[1] + a[1] * u + q[1] * v];
      const deg = (-0.8 * 180) / Math.PI;
      const profile = [[0, 0], [8, 34], [20, 52], [40, 68], [65, 76], [90, 74], [115, 64], [140, 48], [165, 30], [185, 18], [200, 13]];
      const outline = (grow, shift) => spline([...profile.map(([u, w]) => S(u, -(w + grow) + shift)), ...profile.slice(1, -1).reverse().map(([u, w]) => S(u, w + grow + shift))]);
      const across = (cv, stops, u, w) => linear(cv, stops, ...S(u, -w), ...S(u, w));
      const box = [0, 0, 512, 512];
      // the bowl, its staves showing past the face on the shadowed side
      s.paint((cv) => {
        const bowl = outline(5, 7);
        cv.add(`<path d="${bowl}" fill="#3e1a0c"/>`);
        let staves = '';
        for (let k = -4; k <= 4; k++) staves += `<path d="M${pt(S(4, k * 9 + 7))} Q${pt(S(90, k * 19 + 7))} ${pt(S(200, k * 3 + 7))}" fill="none" stroke="${k % 2 ? '#2a0e06' : '#7a3a1c'}" stroke-width="8"/>`;
        cv.add(`<g clip-path="${within(cv, bowl)}">${staves}</g>`);
        crescent(cv, bowl, [-10, -10], { colour: '#000', opacity: 0.5, soft: 10 });
        cv.add(`<path d="${bowl}" fill="none" stroke="${ink}" stroke-width="2"/>`);
      });
      // the face: spruce, honey-pale, its fine straight grain; a dark binding round its edge
      s.paint((cv) => {
        const face = outline(0, 0);
        cv.add(`<path d="${face}" fill="${across(cv, [[0, '#e6b878'], [0.5, '#d29a58'], [1, '#a8723a']], 80, 76)}"/>`);
        let grain = '';
        for (let k = -9; k <= 9; k++) grain += `<path d="M${pt(S(2, k * 8.2 + (rnd() - 0.5) * 2))} L${pt(S(200, k * 1.4))}" stroke="#7a4a20" stroke-width="${n(0.6 + rnd() * 0.6)}" stroke-opacity="${n(0.25 + rnd() * 0.2)}"/>`;
        cv.add(`<g clip-path="${within(cv, face)}">${grain}</g>`);
        strokes(cv, rnd, face, box, { count: 260, colours: ['#f2cc90', '#b07a40'], flow: () => deg, length: 26, width: 2.4, opacity: [0.06, 0.16] });
        crescent(cv, face, [-16, -16], { colour: '#3a1a08', opacity: 0.4, soft: 18 });
        // the varnish: a long light along the upper edge of the face
        cv.add(`<path d="M${pt(S(30, -58))} Q${pt(S(90, -70))} ${pt(S(170, -30))}" fill="none" stroke="#fff4e0" stroke-width="5" stroke-opacity="0.55" stroke-linecap="round" filter="${softly(cv, 2)}"/>`);
        cv.add(`<path d="${face}" fill="none" stroke="#2a1208" stroke-width="3.5"/>`);
        // the sound hole with its ring of inlay, the bridge, the tail block
        const [hx, hy] = S(150, 0);
        cv.add(`<circle cx="${n(hx)}" cy="${n(hy)}" r="8.5" fill="#140804"/><circle cx="${n(hx)}" cy="${n(hy)}" r="13" fill="none" stroke="#3a1c0c" stroke-width="2.5" stroke-dasharray="2 2"/>`);
        cv.add(`<path d="M${pt(S(34, -28))} L${pt(S(42, -28))} L${pt(S(42, 28))} L${pt(S(34, 28))} Z" fill="#2a1408" stroke="#5a3418" stroke-width="1"/>`);
        cv.add(`<path d="M${pt(S(2, -10))} L${pt(S(12, -10))} L${pt(S(12, 10))} L${pt(S(2, 10))} Z" fill="#2a1408"/>`);
      });
      // the neck, dark walnut narrowing to the head, its frets tied round it, the light along its edge
      s.paint((cv) => {
        const neck = `M${pt(S(192, -14))} L${pt(S(522, -11))} L${pt(S(522, 11))} L${pt(S(192, 14))} Z`;
        cv.add(`<path d="${neck}" fill="${across(cv, [[0, '#6a4224'], [0.45, '#432614'], [1, '#22120a']], 350, 13)}"/>`);
        strokes(cv, rnd, neck, box, { count: 160, colours: ['#7a5030', '#1a0e06'], flow: () => deg, length: 30, width: 2, opacity: [0.08, 0.2] });
        let u = 512;
        let frets = '';
        for (let k = 0; k < 19; k++) {
          frets += `<path d="M${pt(S(u, -13))} L${pt(S(u, 13))}" stroke="#e0d0b0" stroke-width="2.2" stroke-opacity="0.85"/><path d="M${pt(S(u + 1.6, -13))} L${pt(S(u + 1.6, 13))}" stroke="#000" stroke-width="1" stroke-opacity="0.35"/>`;
          u -= 24 * Math.pow(0.95, k);
        }
        cv.add(frets);
        cv.add(`<path d="M${pt(S(200, -11))} L${pt(S(515, -9))}" stroke="#f0d8b8" stroke-width="2.4" stroke-opacity="0.45" filter="${softly(cv, 1)}"/>`);
        cv.add(`<path d="${neck}" fill="none" stroke="${ink}" stroke-width="2"/>`);
      });
      // the head and its pegs
      s.paint((cv) => {
        const head = spline([S(516, -13), S(560, -15), S(590, -12), S(594, 0), S(590, 12), S(560, 15), S(516, 13)]);
        for (const u of [534, 556, 578]) {
          for (const side of [-1, 1]) {
            const peg = spline([S(u - 4, side * 12), S(u - 3, side * 30), S(u - 7, side * 38), S(u, side * 41), S(u + 7, side * 38), S(u + 3, side * 30), S(u + 4, side * 12)]);
            cv.add(`<path d="${peg}" fill="${linear(cv, [[0, '#8a5a30'], [1, '#3a2010']], ...S(u - 6, side * 30), ...S(u + 6, side * 30))}" stroke="${ink}" stroke-width="1.4"/>`);
          }
        }
        cv.add(`<path d="${head}" fill="#3a2010" stroke="${ink}" stroke-width="2"/>`);
        cv.add(`<path d="M${pt(S(520, -9))} L${pt(S(586, -8))}" stroke="#d8b890" stroke-width="2" stroke-opacity="0.4"/>`);
      });
      // the strings, each with its fine shadow
      s.paint((cv) => {
        for (const [v0, v1] of [[-18, -7], [-15, -5], [-2, -1], [1, 1], [14, 5], [17, 7]]) {
          cv.add(`<path d="M${pt(S(6, v0 + 3))} L${pt(S(38, v0 + 3))} L${pt(S(560, v1 * 0.9 + 3))}" fill="none" stroke="#000" stroke-width="1.6" stroke-opacity="0.35"/>`);
          cv.add(`<path d="M${pt(S(6, v0))} L${pt(S(38, v0))} L${pt(S(560, v1 * 0.9))}" fill="none" stroke="#efe8d8" stroke-width="1.2" stroke-opacity="0.9"/>`);
        }
      }, { blur: 0.3 });
      return s.done({ finish: { paint: 1.5, grain: 0.012, contrast: 0.08 } });
    },
  },
  {
    key: 'kevok',
    ku: 'Kevok',
    en: 'Dove',
    // a white dove flying with a letter in her beak, painted as the old printed scraps were: white, shaded in cool
    // grey, every feather drawn in with a fine dark line and its barbs touched in, her wings up and spread, her
    // tail fanned; a dark eye ringed with orange, a pink beak, and the letter sealed with a spot of red wax
    still(rnd) {
      const s = new Still(rnd);
      const ink = '#4a4646';
      // a feather from `base` to `tip`, `w` wide: white down its middle, grey to its edges, drawn round with
      // the fine line, its shaft and a few barbs touched in
      const feather = (cv, base, tip, w, { shade = 0, point = 0.25 } = {}) => {
        const d = blade(base, tip, w, { at: 0.45, point });
        const dx = tip[0] - base[0];
        const dy = tip[1] - base[1];
        const len = Math.hypot(dx, dy);
        const [ux, uy] = [dx / len, dy / len];
        const mid = lerp(base, tip, 0.5);
        const g = linear(cv, [[0, shade ? '#d8d6d4' : '#fcfbf8'], [0.5, shade ? '#c4c2c2' : '#eceae6'], [1, shade ? '#96949a' : '#c6c4c4']], mid[0] + uy * w * 0.5, mid[1] - ux * w * 0.5, mid[0] - uy * w * 0.5, mid[1] + ux * w * 0.5);
        cv.add(`<path d="${d}" fill="${g}"/>`);
        let barbs = '';
        for (let k = 0; k < 6; k++) {
          const t = 0.2 + rnd() * 0.7;
          const p0 = lerp(base, tip, t);
          const side = rnd() < 0.5 ? -1 : 1;
          const l = w * (0.25 + rnd() * 0.2);
          barbs += `<path d="M${pt(p0)} l${n(-uy * side * l + ux * l * 0.6)} ${n(ux * side * l + uy * l * 0.6)}"/>`;
        }
        cv.add(`<g clip-path="${within(cv, d)}" stroke="${ink}" stroke-width="0.9" stroke-opacity="0.35" fill="none">${barbs}<path d="M${pt(lerp(base, tip, 0.04))} L${pt(lerp(base, tip, 0.9))}" stroke-opacity="0.45"/></g>`);
        cv.add(`<path d="${d}" fill="none" stroke="${ink}" stroke-width="1.4" stroke-opacity="0.75"/>`);
      };
      const ray = (base, deg, len) => [base[0] + Math.cos((deg * Math.PI) / 180) * len, base[1] + Math.sin((deg * Math.PI) / 180) * len];
      // the far wing, below and behind, a little in shade: its long feathers swept down and back
      s.paint((cv) => {
        for (let i = 0; i < 9; i++) {
          const t = i / 8;
          const base = lerp([300, 318], [236, 330], t);
          feather(cv, base, ray(base, 146 + t * 14 + (rnd() - 0.5) * 4, 190 - t * 46), 34, { shade: 1 });
        }
        const coverts = spline([[318, 300], [300, 340], [260, 372], [214, 384], [196, 360], [228, 330], [270, 310]]);
        cv.add(`<path d="${coverts}" fill="${linear(cv, [[0, '#e4e2e0'], [1, '#aeacb0']], 300, 300, 210, 380)}"/>`);
        cv.add(`<path d="${coverts}" fill="none" stroke="${ink}" stroke-width="1.4" stroke-opacity="0.7"/>`);
      });
      // the tail, fanned
      s.paint((cv) => {
        for (let i = 0; i < 7; i++) {
          const t = i / 6;
          const base = [222, 300 + t * 6];
          feather(cv, base, ray(base, 166 + (t - 0.5) * 38, 132 + Math.sin(t * Math.PI) * 18), 36, { point: 0.05 });
        }
      });
      // the body, full at the breast, and the head
      const body = spline([[214, 290], [262, 262], [320, 246], [370, 240], [404, 232], [426, 240], [438, 262], [434, 284], [416, 300], [380, 318], [330, 336], [270, 336], [228, 322]]);
      s.paint((cv) => {
        cv.add(`<path d="${body}" fill="${linear(cv, [[0, '#fefdfa'], [0.6, '#eeece8'], [1, '#c4c2c4']], 0, 236, 0, 340)}"/>`);
        crescent(cv, body, [-10, -26], { colour: '#6e6e7a', opacity: 0.42, soft: 14 });
        // (the small feathers of the breast and the back, little arcs one over another)
        let arcs = '';
        for (let y = 252; y < 336; y += 9) {
          for (let x = 230 + ((y / 9) % 2) * 7; x < 420; x += 15) {
            const r = 6 + rnd() * 2;
            arcs += `<path d="M${pt([x - r, y + rnd() * 3])} Q${pt([x, y + r * 0.9])} ${pt([x + r, y + rnd() * 3])}"/>`;
          }
        }
        cv.add(`<g clip-path="${within(cv, body)}" fill="none" stroke="${ink}" stroke-width="0.8" stroke-opacity="0.22">${arcs}</g>`);
        cv.add(`<path d="${body}" fill="none" stroke="${ink}" stroke-width="1.6" stroke-opacity="0.75"/>`);
      });
      // the letter in her beak: folded paper, its flap, a spot of red wax
      s.paint((cv) => {
        const L = 'M440 292 L494 274 L506 314 L452 332 Z';
        cv.add(`<path d="${L}" fill="${linear(cv, [[0, '#fbf4e4'], [1, '#e2d2b4']], 440, 280, 500, 330)}" stroke="${ink}" stroke-width="1.4"/>`);
        cv.add(`<path d="M440 292 L476 310 L494 274" fill="none" stroke="${ink}" stroke-width="1.1" stroke-opacity="0.7"/>`);
        cv.add(`<circle cx="474" cy="308" r="6.5" fill="#b0182a" stroke="#6a0812" stroke-width="1"/><circle cx="472" cy="306" r="2" fill="#f0a0a0" fill-opacity="0.7"/>`);
      });
      // the beak, pink, and the dark eye ringed with orange
      s.paint((cv) => {
        cv.add(`<path d="M428 252 C436 254 446 260 454 268 C446 270 438 270 430 266 Z" fill="${linear(cv, [[0, '#e6b4a4'], [1, '#a86a5c']], 428, 252, 454, 268)}" stroke="${ink}" stroke-width="1.2"/>`);
        cv.add(`<circle cx="414" cy="250" r="6.4" fill="#d27a2c" stroke="${ink}" stroke-width="1.2"/><circle cx="414.6" cy="250" r="3.4" fill="#1a1008"/><circle cx="413" cy="248.4" r="1.2" fill="#fff" fill-opacity="0.9"/>`);
      });
      // the near wing, raised high: its coverts round the shoulder, its long flight feathers fanned up and back
      s.paint((cv) => {
        // (the secondaries along the arm, then the long primaries from the hand, fanned up and back)
        for (let i = 0; i < 8; i++) {
          const t = i / 7;
          const base = lerp([262, 262], [304, 196], t);
          feather(cv, base, ray(base, -150 + t * 20 + (rnd() - 0.5) * 4, 120 + t * 30), 34);
        }
        for (let i = 0; i < 9; i++) {
          const t = i / 8;
          const base = lerp([304, 196], [330, 150], t);
          feather(cv, base, ray(base, -132 + t * 36 + (rnd() - 0.5) * 4, 150 + Math.sin(t * Math.PI) * 30 - t * 10), 32);
        }
        const wing = spline([[278, 282], [274, 240], [286, 202], [308, 166], [332, 140], [352, 140], [362, 186], [356, 236], [334, 270], [300, 286]]);
        cv.add(`<path d="${wing}" fill="${linear(cv, [[0, '#fefdfa'], [1, '#dcdad8']], 300, 140, 340, 270)}"/>`);
        cv.add(`<path d="${wing}" fill="none" stroke="${ink}" stroke-width="1.5" stroke-opacity="0.75"/>`);
        // (the coverts over the arm: row on row of small feathers, each row lying over the bases of the one behind
        // it, the last over the flight feathers', their rounded tips lying back the way the flight feathers grow)
        const arm = [[262, 262], [304, 196], [330, 150]];
        for (let r = 0; r < 3; r++) {
          for (let seg = 0; seg < 2; seg++) {
            const [a, b] = [arm[seg], arm[seg + 1]];
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
            const count = Math.round(len / 12);
            for (let i = 0; i < count; i++) {
              const t = (i + 0.5 + (r % 2) * 0.4) / count;
              const along = (seg + t) / 2;
              const off = 14 + r * 15;
              const base = [a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off];
              const lie = ((-152 + along * 40 + (rnd() - 0.5) * 6) * Math.PI) / 180;
              const l = (28 - r * 4) * (0.92 + rnd() * 0.16);
              const tip = [base[0] + Math.cos(lie) * l, base[1] + Math.sin(lie) * l];
              const d = blade(base, tip, 17 - r * 2, { at: 0.62, point: 0 });
              cv.add(`<path d="${d}" fill="${linear(cv, [[0, '#cfcdcf'], [0.55, '#f2f1ee'], [1, '#fefdfa']], ...base, ...tip)}" stroke="${ink}" stroke-width="1" stroke-opacity="0.6"/>`);
              cv.add(`<path d="M${pt(lerp(base, tip, 0.15))} L${pt(lerp(base, tip, 0.7))}" stroke="${ink}" stroke-width="0.7" stroke-opacity="0.3"/>`);
            }
          }
        }
        crescent(cv, wing, [6, -12], { colour: '#6e6e7a', opacity: 0.3, soft: 8 });
      });
      return s.done({ finish: { paint: 1.5, grain: 0.012, contrast: 0.06, saturation: 0.95 } });
    },
  },
  {
    key: 'genim',
    ku: 'Genim',
    en: 'Wheat',
    // a sheaf of ripe wheat tied with a bow of brown satin, painted: the ears fanning out above the bow, their husks
    // in two rows each lying over the one above it, the long awns bristling from them; the straws crossing at the
    // tie and spreading below; the satin smooth, its sheen running along its loops
    still(rnd) {
      const s = new Still(rnd);
      const ink = '#5a3c18';
      const B = [256, 344];
      const fan = [-36, -23, -11, 0, 11, 23, 36];
      const stalks = fan.map((deg, i) => {
        const a = ((deg + (rnd() - 0.5) * 4) * Math.PI) / 180;
        const up = [Math.sin(a), -Math.cos(a)];
        const b = (-deg * 0.45 * Math.PI) / 180;
        const down = [Math.sin(b), Math.cos(b)];
        const reach = 128 + (i % 2) * 18 + rnd() * 12;
        const ear = 128 + rnd() * 20;
        return { up, base: [B[0] + up[0] * reach, B[1] + up[1] * reach], tip: [B[0] + up[0] * (reach + ear), B[1] + up[1] * (reach + ear)], foot: [B[0] + down[0] * (150 + rnd() * 14), B[1] + down[1] * (150 + rnd() * 14)] };
      });
      // the straws: pale gold, lit down one side
      s.paint((cv) => {
        for (const st of stalks) {
          cv.add(`<path d="M${pt(st.foot)} L${pt(st.base)}" stroke="#a8803a" stroke-width="6" stroke-linecap="round"/>`);
          cv.add(`<path d="M${pt(st.foot)} L${pt(st.base)}" stroke="#e8cc8a" stroke-width="2" stroke-linecap="round" stroke-opacity="0.8" transform="translate(-1.4 0)"/>`);
          cv.add(`<path d="M${pt(st.foot)} L${pt(st.base)}" stroke="${ink}" stroke-width="0.8" stroke-opacity="0.5" transform="translate(2.6 0)"/>`);
        }
      });
      // the ears: the husks in two rows, alternating up the stem, the topmost first so each lies over the one above
      const spikelets = [];
      const awns = [];
      for (const st of stalks) {
        const dx = st.tip[0] - st.base[0];
        const dy = st.tip[1] - st.base[1];
        const len = Math.hypot(dx, dy);
        const u = [dx / len, dy / len];
        const v = [-u[1], u[0]];
        const ear = [];
        for (let k = 0, t = 2; t < len - 14; k++, t += 11) {
          const side = k % 2 ? 1 : -1;
          const shrink = t > len * 0.6 ? 1 - ((t - len * 0.6) / len) * 1.2 : 1;
          const turn = side * (0.36 + rnd() * 0.08);
          const d = [u[0] * Math.cos(turn) - v[0] * Math.sin(turn), u[1] * Math.cos(turn) - v[1] * Math.sin(turn)];
          const p0 = [st.base[0] + u[0] * t + v[0] * side * 1.5, st.base[1] + u[1] * t + v[1] * side * 1.5];
          const L = 30 * shrink + 6;
          const p1 = [p0[0] + d[0] * L, p0[1] + d[1] * L];
          ear.push({ p0, p1, w: 15 * shrink + 4 });
          const lean = side * (0.12 + rnd() * 0.1);
          const a = [u[0] * Math.cos(lean) - v[0] * Math.sin(lean), u[1] * Math.cos(lean) - v[1] * Math.sin(lean)];
          const l = (58 + rnd() * 40) * (0.6 + shrink * 0.4);
          const bow = (rnd() - 0.5) * 8;
          awns.push([p1, [p1[0] + a[0] * l * 0.5 + v[0] * bow, p1[1] + a[1] * l * 0.5 + v[1] * bow], [p1[0] + a[0] * l, p1[1] + a[1] * l]]);
        }
        spikelets.push(...ear.reverse());
      }
      s.paint((cv) => {
        cv.add(`<g fill="none" stroke-linecap="round">${awns.map(([p0, m, p1]) => `<path d="M${pt(p0)} Q${pt(m)} ${pt(p1)}" stroke="#d8b878" stroke-width="${n(0.8 + rnd() * 0.7)}" stroke-opacity="${n(0.55 + rnd() * 0.35)}"/>`).join('')}</g>`);
      }, { blur: 0.2 });
      s.paint((cv) => {
        for (const { p0, p1, w } of spikelets) {
          const d = blade(p0, p1, w, { at: 0.42, point: 0.8, count: 10 });
          // (each husk lit on its upper side and shaded below, its keel pale, its edge drawn in)
          const m = lerp(p0, p1, 0.5);
          cv.add(`<path d="${d}" fill="${linear(cv, [[0, '#f2dc9e'], [0.45, '#d8aa58'], [1, '#9a6a28']], m[0] - w * 0.5, m[1] - w * 0.6, m[0] + w * 0.5, m[1] + w * 0.6)}"/>`);
          cv.add(`<path d="M${pt(lerp(p0, p1, 0.15))} L${pt(lerp(p0, p1, 0.9))}" stroke="#fbeec4" stroke-width="1.1" stroke-opacity="0.7"/>`);
          cv.add(`<path d="${d}" fill="none" stroke="${ink}" stroke-width="0.9" stroke-opacity="0.6"/>`);
        }
      });
      // the bow: two loops, their insides in shadow, the knot, two tails cut in a V; satin, its sheen in long bands
      const loopL = spline([[B[0] - 8, B[1] - 12], [B[0] - 60, B[1] - 46], [B[0] - 112, B[1] - 50], [B[0] - 118, B[1] - 14], [B[0] - 98, B[1] + 20], [B[0] - 50, B[1] + 18], [B[0] - 8, B[1] + 10]]);
      const loopR = spline([[B[0] + 8, B[1] - 12], [B[0] + 58, B[1] - 50], [B[0] + 108, B[1] - 60], [B[0] + 120, B[1] - 26], [B[0] + 104, B[1] + 12], [B[0] + 54, B[1] + 16], [B[0] + 8, B[1] + 10]]);
      const tailL = `M${pt([B[0] - 12, B[1] + 6])} C${pt([B[0] - 28, B[1] + 50])} ${pt([B[0] - 50, B[1] + 96])} ${pt([B[0] - 74, B[1] + 140])} L${pt([B[0] - 58, B[1] + 128])} L${pt([B[0] - 44, B[1] + 150])} C${pt([B[0] - 24, B[1] + 104])} ${pt([B[0] - 8, B[1] + 56])} ${pt([B[0] + 4, B[1] + 10])} Z`;
      const tailR = `M${pt([B[0] + 4, B[1] + 8])} C${pt([B[0] + 22, B[1] + 52])} ${pt([B[0] + 44, B[1] + 96])} ${pt([B[0] + 70, B[1] + 136])} L${pt([B[0] + 76, B[1] + 118])} L${pt([B[0] + 94, B[1] + 126])} C${pt([B[0] + 66, B[1] + 90])} ${pt([B[0] + 38, B[1] + 46])} ${pt([B[0] + 16, B[1] + 2])} Z`;
      const satin = (cv, d, [x1, y1, x2, y2], sheen) => {
        cv.add(`<path d="${d}" fill="${linear(cv, [[0, '#3a1c0c'], [0.5, '#6a3c1e'], [1, '#4a2612']], x1, y1, x2, y2)}"/>`);
        cv.add(`<g clip-path="${within(cv, d)}"><path d="${sheen}" fill="none" stroke="#c8946a" stroke-width="12" stroke-opacity="0.5" stroke-linecap="round" filter="${softly(cv, 5)}"/><path d="${sheen}" fill="none" stroke="#f0caa4" stroke-width="3" stroke-opacity="0.45" stroke-linecap="round" filter="${softly(cv, 1.5)}"/></g>`);
        cv.add(`<path d="${d}" fill="none" stroke="#24100a" stroke-width="1.6" stroke-opacity="0.7"/>`);
      };
      s.paint((cv) => {
        satin(cv, tailL, [B[0] - 70, B[1] + 140, B[0], B[1]], `M${pt([B[0] - 4, B[1] + 20])} C${pt([B[0] - 22, B[1] + 70])} ${pt([B[0] - 36, B[1] + 110])} ${pt([B[0] - 52, B[1] + 136])}`);
        satin(cv, tailR, [B[0] + 80, B[1] + 130, B[0], B[1]], `M${pt([B[0] + 12, B[1] + 16])} C${pt([B[0] + 28, B[1] + 56])} ${pt([B[0] + 52, B[1] + 92])} ${pt([B[0] + 76, B[1] + 122])}`);
      });
      s.paint((cv) => {
        satin(cv, loopL, [B[0] - 118, B[1] - 50, B[0], B[1] + 10], `M${pt([B[0] - 16, B[1] - 10])} Q${pt([B[0] - 64, B[1] - 40])} ${pt([B[0] - 110, B[1] - 34])}`);
        satin(cv, loopR, [B[0] + 120, B[1] - 60, B[0], B[1] + 10], `M${pt([B[0] + 16, B[1] - 10])} Q${pt([B[0] + 62, B[1] - 46])} ${pt([B[0] + 112, B[1] - 44])}`);
        // the insides of the loops, deep in shade where they go into the knot
        for (const [d, dx] of [[loopL, -1], [loopR, 1]]) cv.add(`<g clip-path="${within(cv, d)}"><ellipse cx="${B[0] + dx * 52}" cy="${B[1] + 2}" rx="40" ry="14" fill="#140804" fill-opacity="0.75" filter="${softly(cv, 7)}"/></g>`);
      });
      s.paint((cv) => {
        const knot = `M${B[0] - 16} ${B[1] - 17} Q${B[0]} ${B[1] - 21} ${B[0] + 16} ${B[1] - 17} Q${B[0] + 20} ${B[1]} ${B[0] + 16} ${B[1] + 17} Q${B[0]} ${B[1] + 21} ${B[0] - 16} ${B[1] + 17} Q${B[0] - 20} ${B[1]} ${B[0] - 16} ${B[1] - 17} Z`;
        cv.add(`<ellipse cx="${B[0] + 4}" cy="${B[1] + 4}" rx="24" ry="22" fill="#000" fill-opacity="0.5" filter="${softly(cv, 6)}"/>`);
        satin(cv, knot, [B[0] - 16, B[1] - 16, B[0] + 16, B[1] + 16], `M${B[0] - 6} ${B[1] - 14} Q${B[0] - 9} ${B[1]} ${B[0] - 6} ${B[1] + 14}`);
        cv.add(`<path d="M${B[0] + 6} ${B[1] - 15} Q${B[0] + 3} ${B[1]} ${B[0] + 6} ${B[1] + 15}" fill="none" stroke="#24100a" stroke-width="1.2" stroke-opacity="0.6"/>`);
      });
      return s.done({ finish: { paint: 1.5, grain: 0.012, contrast: 0.08 } });
    },
  },
  {
    key: 'kilim',
    ku: 'Kilîm',
    en: 'Kilim diamond',
    // a small kilim, flat-woven in wool: a madder-red field with a stepped diamond in the middle of it, indigo,
    // gold and ivory one inside another; a border of interlocking triangles; the weave's fine ribs, the soft
    // folds it lies in, and its fringes knotted at either end
    still(rnd) {
      const s = new Still(rnd);
      const [x0, y0, x1, y1] = [112, 82, 400, 430];
      // (a hand-woven thing's edges are never quite straight)
      const edge = (a, b, count, sway) => Array.from({ length: count + 1 }, (_, i) => {
        const p = lerp(a, b, i / count);
        const k = Math.sin((i / count) * Math.PI) * sway * (0.6 + rnd() * 0.8);
        return [p[0] + (a[1] === b[1] ? 0 : k), p[1] + (a[1] === b[1] ? k : 0)];
      });
      const outline = [...edge([x0, y0], [x1, y0], 8, 2), ...edge([x1, y0], [x1, y1], 10, -3).slice(1), ...edge([x1, y1], [x0, y1], 8, -2).slice(1), ...edge([x0, y1], [x0, y0], 10, 3).slice(1, -1)];
      const rug = `M${outline.map(pt).join(' L')} Z`;
      const red = '#8a221e';
      const indigo = '#1c2850';
      const ivory = '#e2d4b2';
      const gold = '#c08628';
      // a stepped diamond: the stairs of a weave going round it
      const stepped = (cx, cy, w, h, steps) => {
        const dx = w / steps;
        const dy = h / steps;
        const p = [];
        for (let i = 0; i < steps; i++) p.push([cx + i * dx, cy - h + i * dy], [cx + (i + 1) * dx, cy - h + i * dy]);
        for (let i = 0; i < steps; i++) p.push([cx + w - i * dx, cy + i * dy], [cx + w - i * dx, cy + (i + 1) * dy]);
        for (let i = 0; i < steps; i++) p.push([cx - i * dx, cy + h - i * dy], [cx - (i + 1) * dx, cy + h - i * dy]);
        for (let i = 0; i < steps; i++) p.push([cx - w + i * dx, cy - i * dy], [cx - w + i * dx, cy - (i + 1) * dy]);
        return `M${p.map(pt).join(' L')} Z`;
      };
      const B = 34;
      // the fringes, behind the rug: its warps, knotted in bunches at each end and hanging loose
      s.surface(
        (cv) => {
          let d = '';
          for (const [y, dir] of [[y0, -1], [y1, 1]]) {
            for (let x = x0 + 6; x < x1 - 4; x += 12) {
              const knot = [x + 4, y + dir * 12];
              cv.add(`<ellipse cx="${n(knot[0])}" cy="${n(knot[1])}" rx="4.5" ry="3.5" fill="${ivory}"/>`);
              for (let k = 0; k < 4; k++) {
                const sx = x + k * 2.6;
                const len = 30 + rnd() * 10;
                const end = [knot[0] + (k - 1.5) * 2.6 + (rnd() - 0.5) * 6, knot[1] + dir * len];
                d += `M${pt([sx, y])} L${pt(knot)} Q${pt([knot[0] + (rnd() - 0.5) * 6, knot[1] + dir * len * 0.5])} ${pt(end)} `;
              }
            }
          }
          cv.add(`<path d="${d}" fill="none" stroke="${ivory}" stroke-width="1.8" stroke-linecap="round"/>`);
        },
        { inflate: { radius: 1.2, profile: 'round', height: 1 }, mottle: { scale: 3, amount: 0.1 }, material: { gloss: 0.1, shine: 10, wrap: 0.3, sheen: 0.4 } },
      );
      const weave = (cv, colour, width, opacity) => {
        const clip = cv.id('rug');
        cv.def(`<clipPath id="${clip}"><path d="${rug}"/></clipPath>`);
        let d = '';
        for (let x = x0 - 4; x < x1 + 4; x += 4.8) d += `M${n(x)} ${y0 - 6} L${n(x)} ${y1 + 6} `;
        cv.add(`<path d="${d}" clip-path="url(#${clip})" stroke="${colour}" stroke-width="${width}" stroke-opacity="${opacity}"/>`);
      };
      s.surface(
        (cv) => {
          const clip = cv.id('rug');
          cv.def(`<clipPath id="${clip}"><path d="${rug}"/></clipPath>`);
          cv.add(`<path d="${rug}" fill="${red}"/><g clip-path="url(#${clip})">`);
          // the plain-woven ends and the border: a dark line, the band of triangles, a guard line
          cv.add(`<rect x="${x0 - 6}" y="${y0 - 6}" width="${x1 - x0 + 12}" height="14" fill="${ivory}"/><rect x="${x0 - 6}" y="${y1 - 8}" width="${x1 - x0 + 12}" height="14" fill="${ivory}"/>`);
          cv.add(`<rect x="${x0 - 6}" y="${y0 + 3}" width="${x1 - x0 + 12}" height="3" fill="${red}"/><rect x="${x0 - 6}" y="${y1 - 6}" width="${x1 - x0 + 12}" height="3" fill="${red}"/>`);
          const bx0 = x0 + 6;
          const by0 = y0 + 12;
          const bx1 = x1 - 6;
          const by1 = y1 - 12;
          cv.add(`<path d="M${bx0} ${by0} H${bx1} V${by1} H${bx0} Z M${bx0 + B} ${by0 + B} V${by1 - B} H${bx1 - B} V${by0 + B} Z" fill="${indigo}" fill-rule="evenodd"/>`);
          // (the triangles, gold into the indigo, stepped as the weave steps them)
          const tri = (a, b, inward) => {
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const count = Math.round(len / 24);
            for (let i = 0; i < count; i++) {
              const p = lerp(a, b, i / count);
              const q = lerp(a, b, (i + 1) / count);
              const m = lerp(p, q, 0.5);
              const tip = [m[0] + inward[0] * (B - 8), m[1] + inward[1] * (B - 8)];
              const steps = 4;
              const pts = [];
              for (let k = 0; k <= steps; k++) {
                const t = k / steps;
                const left = lerp(p, tip, t);
                const right = lerp(q, tip, t);
                pts.push(left);
                if (k < steps) pts.push([left[0] + inward[0] * ((B - 8) / steps), left[1] + inward[1] * ((B - 8) / steps)]);
                void right;
              }
              const back = [];
              for (let k = steps; k >= 0; k--) {
                const t = k / steps;
                const right = lerp(q, tip, t);
                if (k < steps) back.push([right[0] + inward[0] * ((B - 8) / steps), right[1] + inward[1] * ((B - 8) / steps)]);
                back.push(right);
              }
              cv.add(`<path d="M${[...pts, ...back].map(pt).join(' L')} Z" fill="${i % 2 ? ivory : gold}"/>`);
            }
          };
          tri([bx0 + 4, by0 + 4], [bx1 - 4, by0 + 4], [0, 1]);
          tri([bx1 - 4, by1 - 4], [bx0 + 4, by1 - 4], [0, -1]);
          tri([bx0 + 4, by1 - 4], [bx0 + 4, by0 + 4], [1, 0]);
          tri([bx1 - 4, by0 + 4], [bx1 - 4, by1 - 4], [-1, 0]);
          cv.add(`<path d="M${bx0 + B} ${by0 + B} V${by1 - B} H${bx1 - B} V${by0 + B} Z" fill="none" stroke="${ivory}" stroke-width="4"/>`);
          // the medallion: a stepped diamond, indigo, gold and ivory one inside another, red at its heart
          const C = [256, 256];
          cv.add(`<path d="${stepped(C[0], C[1], 88, 112, 8)}" fill="${ivory}"/>`);
          cv.add(`<path d="${stepped(C[0], C[1], 78, 100, 8)}" fill="${indigo}"/>`);
          cv.add(`<path d="${stepped(C[0], C[1], 58, 74, 6)}" fill="${gold}"/>`);
          cv.add(`<path d="${stepped(C[0], C[1], 42, 54, 5)}" fill="${red}"/>`);
          cv.add(`<path d="${stepped(C[0], C[1], 22, 28, 3)}" fill="${ivory}"/>`);
          cv.add(`<path d="${stepped(C[0], C[1], 9, 12, 1)}" fill="${indigo}"/>`);
          // small stepped diamonds in the field's corners, and a pair above and below the medallion
          for (const [cx, cy] of [[184, 152], [328, 152], [184, 360], [328, 360]]) {
            cv.add(`<path d="${stepped(cx, cy, 16, 20, 3)}" fill="${ivory}"/><path d="${stepped(cx, cy, 7, 9, 1)}" fill="${indigo}"/>`);
          }
          for (const cy of [134, 378]) cv.add(`<path d="${stepped(256, cy, 12, 9, 2)}" fill="${gold}"/>`);
          cv.add('</g>');
          // the weave's ribs, darker between, and the selvedges wrapped in dark wool
          weave(cv, '#000', 1.4, 0.12);
          const side = (from, to) => `M${outline.slice(from, to).map(pt).join(' L')}`;
          cv.add(`<path d="${side(8, 19)} ${side(26, 35)} L${pt(outline[0])}" fill="none" stroke="#2a1a12" stroke-width="5" stroke-linejoin="round"/>`);
        },
        {
          inflate: { radius: 6, profile: 'soft', height: 0.5 },
          relief: [
            // the folds it lies in: a long soft ridge and a hollow across it
            {
              draw: (cv) => {
                cv.add(`<rect width="512" height="512" fill="#808080"/>`);
                cv.add(`<g fill="none"><path d="M60 176 C180 196 320 190 460 214" stroke="#fff" stroke-width="56" stroke-opacity="0.85"/><path d="M50 320 C190 300 320 326 470 312" stroke="#000" stroke-width="60" stroke-opacity="0.75"/></g>`);
              },
              height: 96,
              blur: 20,
            },
            // the ribs of the weave
            { draw: (cv) => weave(cv, '#fff', 1.8, 0.5), height: 3, blur: 0.6 },
          ],
          mottle: { scale: 14, amount: 0.07, stretch: 10, angle: 0 },
          material: { gloss: 0.05, shine: 6, wrap: 0.3, sheen: 0.4, hollows: 0.5 },
        },
      );
      return s.done({ finish: { grain: 0.004 } });
    },
  },
  {
    key: 'pet',
    ku: 'Pêta Newrozê',
    en: 'Newroz flame',
    // the Newroz fire: logs crossed on one another, their bark rough and charred, their ends cut pale, embers
    // glowing in their cracks, and the flames standing up out of them, white-gold at the heart, orange, then red
    // at their wavering tips, sparks going up, all of it throwing its light round it
    still(rnd) {
      const s = new Still(rnd);
      // a log from a to b, `w` thick, sawn square at both ends, painted: its bark dark and rough, split along its
      // length, charred where the fire has had it, lit along the edge the flames are above; the end sawn off it
      // (`cut`) pale wood and its rings, the other end in shadow
      const log = (a, b, w, cut) =>
        s.paint((cv) => {
          const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
          const side = (p, k) => [p[0] - uy * k, p[1] + ux * k];
          // (its outline a little uneven, as a branch is)
          const top = [];
          const bottom = [];
          for (let k = 0; k <= 8; k++) {
            const p = lerp(a, b, k / 8);
            const r = (w / 2) * (1 - (k / 8) * 0.08) * (1 + (rnd() - 0.5) * 0.06);
            top.push(side(p, -r));
            bottom.push(side(p, r));
          }
          const d = `M${pt(top[0])} ${spline(top, false).slice(1 + pt(top[0]).length)} L${bottom.slice().reverse().map(pt).join(' L')} Z`;
          // (which way is up across it: toward the flames)
          const up = ux >= 0 ? [uy, -ux] : [-uy, ux];
          const m = lerp(a, b, 0.5);
          const box = [Math.min(a[0], b[0]) - w, Math.min(a[1], b[1]) - w, Math.max(a[0], b[0]) + w, Math.max(a[1], b[1]) + w];
          cv.add(`<path d="${d}" fill="${linear(cv, [[0, '#7a5638'], [0.25, '#4c3626'], [0.6, '#2a1e16'], [1, '#0e0a08']], m[0] + (up[0] * w) / 2, m[1] + (up[1] * w) / 2, m[0] - (up[0] * w) / 2, m[1] - (up[1] * w) / 2)}"/>`);
          // the bark: rough, in ridges along the wood, split here and there
          strokes(cv, rnd, d, box, { count: 260, colours: ['#160e0a', '#5a4030', '#2e2219', '#806044'], flow: () => angle, length: 26, width: 2.6, opacity: [0.18, 0.45], spread: 5, bend: 0.1 });
          let cracks = '';
          for (let k = 0; k < 12; k++) {
            const p = lerp(a, b, rnd());
            const off = (rnd() - 0.5) * w * 0.8;
            const l = 20 + rnd() * 46;
            cracks += `<path d="M${pt(side(p, off))} l${n(ux * l)} ${n(uy * l)}" stroke-width="${n(1.4 + rnd() * 1.8)}"/>`;
          }
          cv.add(`<g clip-path="${within(cv, d)}" fill="none" stroke="#0a0605" stroke-linecap="round" stroke-opacity="0.75">${cracks}</g>`);
          // charred toward the fire, grey with ash
          const char = lerp(a, b, cut === 'a' ? 0.85 : 0.5);
          cv.add(`<g clip-path="${within(cv, d)}"><ellipse cx="${n(char[0])}" cy="${n(char[1])}" rx="${n(w * 2.4)}" ry="${n(w * 0.9)}" transform="rotate(${n(angle)} ${n(char[0])} ${n(char[1])})" fill="#0a0706" fill-opacity="0.75" filter="${softly(cv, 6)}"/></g>`);
          specks(cv, rnd, d, [char[0] - w * 2, char[1] - w, char[0] + w * 2, char[1] + w], { count: 70, colours: ['#6e6862', '#8c8680', '#4a4440'], size: [0.6, 1.8], opacity: [0.25, 0.6] });
          // the flames' light along its upper edge, its underside lost in shadow
          crescent(cv, d, [-up[0] * 8, -up[1] * 8], { colour: '#ff9440', opacity: 0.55, soft: 4 });
          crescent(cv, d, [up[0] * 10, up[1] * 10], { colour: '#000', opacity: 0.5, soft: 6 });
          cv.add(`<path d="${d}" fill="none" stroke="#080504" stroke-width="1.4" stroke-opacity="0.6"/>`);
          // its ends: the sawn one pale wood, ringed, checked from the heart, its bark round it; the other dark
          for (const [end, sawn] of [[a, cut === 'a'], [b, cut === 'b']]) {
            const [cx, cy] = end;
            const r = w * (end === b ? 0.46 : 0.5);
            const e = (k, extra) => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(r * 0.55 * k)}" ry="${n(r * k)}" transform="rotate(${n(angle)} ${n(cx)} ${n(cy)})" ${extra}/>`;
            if (!sawn) {
              cv.add(e(1, `fill="${radial(cv, [[0, '#3a2a1c'], [1, '#120c08']], cx, cy, r)}"`));
              continue;
            }
            cv.add(e(1, `fill="${radial(cv, [[0, '#c8a070'], [0.5, '#ae8050'], [0.85, '#7e5634'], [1, '#3a2414']], cx, cy, r)}"`));
            for (const k of [0.18, 0.36, 0.54, 0.72]) cv.add(e(k, `fill="none" stroke="#6a4a2c" stroke-width="1.1" stroke-opacity="${n(0.4 + rnd() * 0.25)}"`));
            let checks = '';
            for (let k = 0; k < 3; k++) {
              const t = rnd() * Math.PI * 2;
              const [ex, ey] = [Math.cos(t) * r * 0.55 * 0.8, Math.sin(t) * r * 0.8];
              const ca = (angle * Math.PI) / 180;
              checks += `<path d="M${pt([cx, cy])} l${n(ex * Math.cos(ca) - ey * Math.sin(ca))} ${n(ex * Math.sin(ca) + ey * Math.cos(ca))}"/>`;
            }
            cv.add(`<g fill="none" stroke="#3a2414" stroke-width="1.3" stroke-opacity="0.6" stroke-linecap="round">${checks}</g>`);
            cv.add(e(1, `fill="none" stroke="#1a100a" stroke-width="3.2"`));
          }
        });
      log([96, 446], [404, 360], 46, 'a');
      log([428, 452], [130, 372], 44, 'a');
      // (embers in the cracks where the fire has eaten into them)
      const embers = (cv, fill) => {
        for (let k = 0; k < 26; k++) {
          const x = 170 + rnd() * 170;
          const y = 372 + rnd() * 50 - Math.abs(x - 256) * 0.1;
          cv.add(`<path d="M${pt([x, y])} l${n(6 + rnd() * 14)} ${n((rnd() - 0.5) * 6)}" stroke="${fill}" stroke-width="${n(1.5 + rnd() * 2.5)}" stroke-linecap="round"/>`);
        }
      };
      s.glow((cv) => embers(cv, '#ff6a1a'), { blur: 4, strength: 0.9, halo: 0.6 });
      s.paint((cv) => embers(cv, '#ffc060'), { blur: 0.6, opacity: 0.85 });
      // the flames: tongues of fire, each wavering up to a tip that curls
      const tongue = ([bx, by], height, width, lean, ph) => {
        const left = [];
        const right = [];
        for (let k = 0; k <= 16; k++) {
          const t = k / 16;
          const cx = bx + lean * height * t * t + Math.sin(t * Math.PI * 1.6 + ph) * width * 0.16 * t;
          const y = by - height * t;
          const w = (width / 2) * Math.pow(Math.max(0, 1 - t), 0.85) * Math.min(1, 0.55 + t * 3) * (1 + 0.12 * Math.sin(t * Math.PI * 3 + ph * 2));
          left.push([cx - w, y]);
          right.push([cx + w, y]);
        }
        return spline([...left, ...right.reverse().slice(1)]);
      };
      const flames = [
        [[256, 410], 330, 180, 0.04, 0.3],
        [[204, 404], 236, 120, -0.22, 1.7],
        [[312, 404], 254, 124, 0.18, 2.6],
        [[160, 410], 150, 80, -0.3, 4.1],
        [[350, 410], 168, 82, 0.28, 5.2],
        [[232, 400], 200, 70, -0.08, 0.9],
        [[284, 400], 216, 70, 0.1, 3.3],
      ];
      // (and torn by the air rising through them, their edges licking up in tongues of their own)
      const layer = (cv, scaleH, scaleW, stops, tear = 34) => {
        const f = cv.id('lick');
        cv.def(`<filter id="${f}" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.03 0.011" numOctaves="3" seed="${Math.floor(rnd() * 1000)}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="${tear}" xChannelSelector="R" yChannelSelector="G"/></filter>`);
        cv.add(`<g filter="url(#${f})">`);
        for (const [[bx, by], h, w, lean, ph] of flames) cv.add(`<path d="${tongue([bx, by], h * scaleH, w * scaleW, lean, ph)}" fill="${linear(cv, stops, 0, by, 0, by - h * scaleH)}"/>`);
        cv.add('</g>');
      };
      s.glow((cv) => layer(cv, 0.85, 0.9, [[0, '#ff7a20'], [0.6, '#e04010'], [1, '#c02008']]), { blur: 20, strength: 0.4, halo: 0.6 });
      s.paint((cv) => layer(cv, 1.05, 1, [[0, '#ff8a24'], [0.4, '#f05a14'], [0.75, '#c82a0a', 0.8], [1, '#8a1404', 0]], 46), { blur: 1.5 });
      s.paint((cv) => layer(cv, 0.74, 0.7, [[0, '#ffd060'], [0.5, '#ffa830'], [1, '#ff7a1a', 0]], 30), { blur: 2 });
      s.paint((cv) => layer(cv, 0.44, 0.44, [[0, '#fffbe8'], [0.5, '#fff0b0'], [1, '#ffd060', 0]], 18), { blur: 2.5 });
      s.glow((cv) => cv.add(`<ellipse cx="256" cy="380" rx="80" ry="50" fill="#ffd27a"/>`), { blur: 24, strength: 0.3, halo: 0.5 });
      // the log in front, across the foot of the fire
      log([150, 470], [372, 462], 40, 'b');
      s.glow((cv) => cv.add(`<path d="M190 446 C230 440 290 440 330 444" fill="none" stroke="#ff7a24" stroke-width="5"/>`), { blur: 5, strength: 0.6, halo: 0.6 });
      // sparks going up
      s.glow((cv) => {
        for (let k = 0; k < 22; k++) {
          const x = 150 + rnd() * 220;
          const y = 40 + rnd() * 220;
          cv.add(`<path d="M${pt([x, y])} l${n((rnd() - 0.5) * 6)} ${n(-3 - rnd() * 6)}" stroke="#ffd080" stroke-width="${n(1.5 + rnd() * 1.6)}" stroke-linecap="round"/>`);
        }
      }, { blur: 1.4, strength: 1.4, halo: 0.4 });
      return s.done({ finish: { grain: 0.005, contrast: 0.08, saturation: 1.05, warmth: 0.02 } });
    },
  },
  {
    key: 'heyv',
    ku: 'Heyv',
    en: 'Crescent moon',
    // the young moon: a crescent of the full grey globe, lit from beyond it, its seas and craters showing on the lit
    // edge, the rest of it lost in the dark, and a cold glow round it; the globe set to one side, so that what is
    // seen of it, the crescent, sits in the middle
    still(rnd) {
      const s = new Still(rnd).place([-96, 0]);
      const C = [256, 256];
      const R = 196;
      s.surface(
        (cv) => {
          cv.add(`<circle cx="${C[0]}" cy="${C[1]}" r="${R}" fill="#bdb8ae"/>`);
          // the seas: broad dark stains, softened
          const sea = cv.id('sea');
          cv.def(`<filter id="${sea}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>`);
          const clip = cv.id('globe');
          cv.def(`<clipPath id="${clip}"><circle cx="${C[0]}" cy="${C[1]}" r="${R}"/></clipPath>`);
          cv.add(`<g clip-path="url(#${clip})" filter="url(#${sea})" fill="#5e5a54">`);
          for (const [x, y, r] of [[404, 168, 44], [430, 262, 34], [398, 354, 40], [356, 220, 30], [440, 330, 22], [350, 410, 26]]) cv.add(`<path d="${spline(roundish([x, y], r, rnd, { wobble: 0.18, count: 10 }))}" fill-opacity="${n(0.5 + rnd() * 0.3)}"/>`);
          cv.add('</g>');
          for (let i = 0; i < 18; i++) {
            const a = rnd() * Math.PI * 2;
            const r = Math.sqrt(rnd()) * (R - 20);
            const cr = 3 + rnd() ** 2 * 12;
            cv.add(`<circle cx="${n(C[0] + Math.cos(a) * r)}" cy="${n(C[1] + Math.sin(a) * r)}" r="${n(cr)}" fill="#8e8a82" fill-opacity="0.35"/>`);
          }
          // the bright splash round a young crater
          cv.add(`<circle cx="410" cy="330" r="7" fill="#efece4" fill-opacity="0.8"/>`);
        },
        {
          inflate: { radius: R, profile: 'round', height: 1, soften: 6 },
          relief: {
            draw: (cv) => {
              // the craters' rims, raised round their floors
              for (let i = 0; i < 16; i++) {
                const a = rnd() * Math.PI * 2;
                const r = Math.sqrt(rnd()) * (R - 14);
                const cr = 3 + rnd() ** 2 * 12;
                cv.add(`<circle cx="${n(C[0] + Math.cos(a) * r)}" cy="${n(C[1] + Math.sin(a) * r)}" r="${n(cr)}" fill="none" stroke="#fff" stroke-width="${n(1.2 + cr * 0.15)}" stroke-opacity="0.45"/>`);
              }
            },
            height: 2,
            blur: 1.6,
          },
          bumps: { scale: 9, amount: 0.25 },
          mottle: { scale: 16, amount: 0.14 },
          material: { ambient: 0, fill: 0, gloss: 0, sheen: 0, hollows: 0.3, seen: 0.35 },
        },
      );
      s.glow((cv) => cv.add(`<path d="M${C[0]} ${C[1] - R} A${R} ${R} 0 1 1 ${C[0]} ${C[1] + R} A${R * 0.3} ${R} 0 1 0 ${C[0]} ${C[1] - R} Z" fill="#cfdcff" transform="rotate(-16 ${C[0]} ${C[1]})"/>`), { blur: 16, strength: 0.28, halo: 0.6 });
      return s.done({ light: { key: [[0.9, -0.28, -0.36], [1, 0.98, 0.94], 1.6], fill: [[0, 0, 1], [0, 0, 0], 0], ambient: [0, 0, 0] }, finish: { grain: 0.004, saturation: 0.9, warmth: 0 } });
    },
  },
];