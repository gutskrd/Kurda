/**
 * The shop's icons: Kurdish things painted as they are — a ripe pomegranate,
 * a glass of tea on its saucer, a seal of red wax with the sun of the
 * Kurdish flag pressed into it, a saz, a dove carrying a letter — painted by
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
import { n, pt, sunRays } from './kit.mjs';
import { Still } from './still.mjs';

// ─────────────────────────────────────────────────────────────── shapes

/** A smooth closed outline through points (a Catmull-Rom spline, as cubic Béziers); open when `closed` is false. */
export function spline(points, closed = true) {
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
export function radial(cv, stops, cx, cy, r, fx = cx, fy = cy) {
  const id = cv.id('rg');
  cv.def(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fx="${n(fx)}" fy="${n(fy)}">${stops.map(([o, c, a = 1]) => `<stop offset="${n(o)}" stop-color="${c}"${a === 1 ? '' : ` stop-opacity="${n(a)}"`}/>`).join('')}</radialGradient>`);
  return `url(#${id})`;
}

/** A linear gradient from (x1, y1) to (x2, y2). */
export function linear(cv, stops, x1, y1, x2, y2) {
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
export function blade(base, tip, width, { at = 0.55, bend = 0, point = 0.6, count = 14 } = {}) {
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
export function tube(points, w0, w1 = w0, count = 24) {
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
  return s.done({ finish: { paint: 1.5, grain: 0.012, contrast: 0.08, saturation: 0.95, ink: true } });
}

export const ICONS = [
  {
    key: 'hinar',
    ku: 'Hinar',
    en: 'Pomegranate',
    // a ripe pomegranate, whole, painted as a still life: round and a little faceted, faint ridges running down it
    // from the crown; its skin a deep leathery red, blushed warmer where the sun had it, its small pale pores, a
    // dull sheen where the light falls on it from the upper left; the crown of its calyx standing up from the top,
    // turned a little toward us, six pointed sepals curling out round a dark mouth, dry at their tips; and its
    // shadow under it
    still(rnd) {
      const s = new Still(rnd);
      const C = [252, 298];
      const R = 160;
      // (the fruit turned: its top toward us, its axis leaning a little to the right)
      const tilt = 0.5;
      const lean = 0.3;
      const turn = ([x, y, z]) => {
        const y1 = y * Math.cos(tilt) - z * Math.sin(tilt);
        const z1 = y * Math.sin(tilt) + z * Math.cos(tilt);
        return [x * Math.cos(lean) + y1 * Math.sin(lean), -x * Math.sin(lean) + y1 * Math.cos(lean), z1];
      };
      const view = ([x, y]) => [C[0] + x, C[1] - y * 0.95];
      const surface = (t, f, r = R) => turn([r * Math.sin(t) * Math.cos(f), r * Math.cos(t), r * Math.sin(t) * Math.sin(f)]);
      // its outline: round, with the faint angles of its ridges
      const outline = [];
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const m = 1 + 0.016 * Math.cos(6 * a + 0.5) + 0.01 * Math.sin(3 * a + 1.1);
        outline.push([C[0] + Math.cos(a) * R * m, C[1] + Math.sin(a) * R * 0.95 * m]);
      }
      const body = spline(outline);
      // its shadow on whatever it stands on
      s.paint((cv) => cv.add(`<ellipse cx="${C[0] + 14}" cy="${C[1] + R * 0.95 - 6}" rx="${n(R * 0.86)}" ry="22" fill="#000" fill-opacity="0.5"/>`), { blur: 12 });
      // the fruit
      s.paint((cv) => {
        // the skin: deep red, lighter and warmer where the light is, darkest round the shadow side
        cv.add(`<path d="${body}" fill="${radial(cv, [[0, '#e0484a'], [0.28, '#c02a30'], [0.62, '#8e1420'], [0.9, '#5c0a12'], [1, '#44060c']], C[0] - 66, C[1] - 70, R * 1.55, C[0] - 80, C[1] - 86)}"/>`);
        cv.add(`<g clip-path="${within(cv, body)}">`);
        // (blushed warmer, toward gold, where the sun had it; and here and there browner)
        cv.add(`<ellipse cx="${C[0] - 70}" cy="${C[1] - 50}" rx="90" ry="70" fill="#f0a050" fill-opacity="0.22" filter="${softly(cv, 30)}"/>`);
        for (let i = 0; i < 18; i++) cv.add(`<ellipse cx="${n(C[0] - R + rnd() * 2 * R)}" cy="${n(C[1] - R + rnd() * 2 * R)}" rx="${n(16 + rnd() * 26)}" ry="${n(12 + rnd() * 20)}" fill="${rnd() < 0.55 ? '#5a1210' : '#d8504a'}" fill-opacity="${n(0.08 + rnd() * 0.12)}" filter="${softly(cv, 12)}"/>`);
        // (the ridges running down it from the crown: each a soft fold, shade on one side and light on the other)
        for (let k = 0; k < 6; k++) {
          const f = (k / 6) * Math.PI * 2 + 0.3;
          const line = [];
          for (let t = 0.2; t <= 2.95; t += 0.05) {
            const p = surface(t, f);
            if (p[2] > R * 0.08) line.push(view(p));
          }
          if (line.length < 4) continue;
          const d = `M${line.map(pt).join(' L')}`;
          cv.add(`<path d="${d}" fill="none" stroke="#4a060c" stroke-width="7" stroke-opacity="0.22" filter="${softly(cv, 4)}"/>`);
          cv.add(`<path d="${d}" fill="none" stroke="#f08070" stroke-width="5" stroke-opacity="0.1" transform="translate(-6 -3)" filter="${softly(cv, 4)}"/>`);
        }
        cv.add('</g>');
        // the shadow side, and the warm light thrown back up into it from below
        crescent(cv, body, [-40, -44], { colour: '#1e0206', opacity: 0.55, soft: 30 });
        crescent(cv, body, [-14, -22], { colour: '#e2604a', opacity: 0.2, soft: 14 });
        strokes(cv, rnd, body, [C[0] - R, C[1] - R, C[0] + R, C[1] + R], { count: 1400, colours: ['#d84a50', '#5a0a12', '#b02a30', '#7a2a1a'], flow: (x, y) => (Math.atan2(y - C[1], x - C[0]) * 180) / Math.PI + 90, length: 14, width: 2.4, opacity: [0.05, 0.14] });
        specks(cv, rnd, body, [C[0] - R, C[1] - R, C[0] + R, C[1] + R], { count: 320, colours: ['#f4c0a0', '#f0a090', '#ffe0b0'], size: [0.5, 1.4], opacity: [0.12, 0.36] });
        // the gloss: a broad soft sheen and a small bright one inside it
        cv.add(`<ellipse cx="${C[0] - 70}" cy="${C[1] - 78}" rx="62" ry="40" transform="rotate(-32 ${C[0] - 70} ${C[1] - 78})" fill="#ffd8c8" fill-opacity="0.16" filter="${softly(cv, 20)}"/>`);
        cv.add(`<ellipse cx="${C[0] - 80}" cy="${C[1] - 86}" rx="22" ry="12" transform="rotate(-32 ${C[0] - 80} ${C[1] - 86})" fill="#fff4ec" fill-opacity="0.28" filter="${softly(cv, 7)}"/>`);
        rim(cv, body, { colour: '#2a0408', width: 4, opacity: 0.5, soft: 2 });
      });
      // the crown: a short thick neck rising from the top, and round its mouth six fleshy sepals, touching at their
      // feet, each narrowing to a point that curls out and back, dry and pale at its tip
      s.paint((cv) => {
        const A = turn([0, 1, 0]);
        const e1 = turn([1, 0, 0]);
        const e2 = turn([0, 0, 1]);
        const base = turn([0, R * 0.95, 0]);
        const at = (r, h, psi) => view([0, 1, 2].map((c) => base[c] + A[c] * h + (e1[c] * Math.cos(psi) + e2[c] * Math.sin(psi)) * r));
        // (where its foot meets the fruit, a ring of shadow)
        const foot = [];
        for (let i = 0; i < 18; i++) foot.push(at(38, -2, (i / 18) * Math.PI * 2));
        cv.add(`<path d="${spline(foot)}" fill="#2a0408" fill-opacity="0.5" filter="${softly(cv, 4)}"/>`);
        // the neck
        const neck = [];
        for (let i = 0; i <= 12; i++) neck.push(at(35, -5, Math.PI + (i / 12) * Math.PI));
        for (let i = 12; i >= 0; i--) neck.push(at(31, 36, Math.PI + (i / 12) * Math.PI));
        const sepal = (psi) => {
          const l = at(31, 35, psi - 0.52);
          const r = at(31, 35, psi + 0.52);
          const tip = at(56 + rnd() * 6, 72 + rnd() * 8, psi + (rnd() - 0.5) * 0.1);
          const waist = at(37, 56, psi);
          // (the sides drawn in toward its middle as they rise, so it narrows to its point)
          const side = (corner) => lerp(lerp(corner, tip, 0.55), waist, 0.45);
          return { d: `M${pt(l)} Q${pt(side(l))} ${pt(tip)} Q${pt(side(r))} ${pt(r)} Z`, front: Math.sin(psi) > 0, tip, root: at(31, 35, psi) };
        };
        const sepals = [0, 1, 2, 3, 4, 5].map((i) => sepal((i / 6) * Math.PI * 2 + 0.26));
        const paintSepal = (sp) => {
          cv.add(`<path d="${sp.d}" fill="${linear(cv, sp.front ? [[0, '#8e1c1e'], [0.55, '#b4442e'], [1, '#d8a070']] : [[0, '#5a0e12'], [0.6, '#8a3424'], [1, '#b88a5a']], ...sp.root, ...sp.tip)}"/>`);
          crescent(cv, sp.d, [3, -2], { colour: '#1a0204', opacity: 0.3, soft: 3 });
          cv.add(`<path d="${sp.d}" fill="none" stroke="#2a0406" stroke-width="1.3" stroke-opacity="0.6"/>`);
        };
        sepals.filter((sp) => !sp.front).forEach(paintSepal);
        // (its mouth, in shadow, the dry threads of the flower in it)
        const mouth = [];
        for (let i = 0; i < 16; i++) mouth.push(at(29, 36, (i / 16) * Math.PI * 2));
        cv.add(`<path d="${spline(mouth)}" fill="#1e0204"/>`);
        for (let i = 0; i < 10; i++) {
          const p = at(rnd() * 18, 38 + rnd() * 7, rnd() * Math.PI * 2);
          cv.add(`<circle cx="${n(p[0])}" cy="${n(p[1])}" r="${n(0.7 + rnd() * 0.8)}" fill="#7a4a2a" fill-opacity="0.55"/>`);
        }
        const neckD = spline(neck);
        cv.add(`<path d="${neckD}" fill="${linear(cv, [[0, '#6a0e14'], [0.4, '#b23232'], [1, '#5a0a10']], ...at(35, 15, Math.PI), ...at(35, 15, 0))}"/>`);
        crescent(cv, neckD, [-8, 0], { colour: '#2a0408', opacity: 0.35, soft: 6 });
        strokes(cv, rnd, neckD, [200, 40, 400, 240], { count: 80, colours: ['#d05a48', '#4a080c'], flow: () => -72, length: 8, width: 1.6, opacity: [0.08, 0.2] });
        sepals.filter((sp) => sp.front).forEach(paintSepal);
      });
      return s.done({ finish: { paint: 1.5, grain: 0.012, contrast: 0.1, saturation: 1, ink: true } });
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
      return s.done({ finish: { grain: 0.003, contrast: 0.05, ink: true } });
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
      return s.done({ finish: { paint: 1.5, grain: 0.01, contrast: 0.08, saturation: 0.95, ink: true } });
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
    // a fawn sitting up and looking at us, drawn soft, as with a pastel on rough paper, and no line round it: a
    // big round head, a pale face that comes up in two curves round the eyes, two dots for eyes and a small red
    // nose, round ears, a pair of short brown antlers and a tuft between them; a small body with a pale front,
    // its forefeet together before it and its hind feet out at either side, dark at the hoof, a stub of a tail
    still(rnd) {
      const s = new Still(rnd).place([0, -4], 1.02);
      const TAN = '#e39a58';
      const DEEP = '#cf8442';
      const CREAM = '#fbe9bf';
      const HOOF = '#a9683a';
      const box = [60, 40, 452, 492];
      // (a round shape, its radius a little uneven, as a hand draws one)
      const blob = ([cx, cy], rx, ry, turn = 0, wobble = 0.03) => {
        const out = [];
        const [c, si] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)];
        const phase = rnd() * 6;
        for (let i = 0; i < 26; i++) {
          const t = (i / 26) * Math.PI * 2;
          const k = 1 + wobble * Math.sin(t * 3 + phase) + wobble * 0.6 * Math.sin(t * 5 + phase * 2);
          out.push([cx + Math.cos(t) * rx * k * c - Math.sin(t) * ry * k * si, cy + Math.cos(t) * rx * k * si + Math.sin(t) * ry * k * c]);
        }
        return spline(out);
      };
      // the pastel's edge: everything drawn through it is frayed a little, the way the stick drags on the paper
      const frayed = (cv, tear = 6.5) => {
        const f = cv.id('fray');
        cv.def(`<filter id="${f}" x="-60%" y="-60%" width="220%" height="220%"><feTurbulence type="fractalNoise" baseFrequency="0.26" numOctaves="2" seed="${Math.floor(rnd() * 1000)}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="${tear}" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="0.9"/></filter>`);
        return `url(#${f})`;
      };
      // a mass of colour laid in with the pastel: the shape, frayed, and the grain of the paper showing in it
      const mass = (cv, d, fill, { light = '#fff3d8', dark = DEEP, grain = 150 } = {}) => {
        cv.add(`<path d="${d}" fill="${fill}" filter="${frayed(cv)}"/>`);
        specks(cv, rnd, d, box, { count: grain * 3, colours: [light], size: [0.8, 2.4], opacity: [0.08, 0.24] });
        specks(cv, rnd, d, box, { count: grain * 2, colours: [dark], size: [0.8, 2.2], opacity: [0.06, 0.18] });
      };
      const head = blob([256, 214], 134, 112, 0, 0.025);
      const body = blob([256, 392], 84, 78, 0, 0.03);
      // its face: pale, coming up in a curve round each eye and dipping between them
      const face = spline([[256, 196], [224, 174], [182, 186], [158, 230], [172, 278], [212, 302], [256, 307], [300, 302], [340, 278], [354, 230], [330, 186], [288, 174]]);
      s.paint((cv) => {
        // behind it: its tail, its hind feet, its antlers and its ears
        mass(cv, blob([342, 402], 26, 17, -42), TAN, { grain: 30 });
        mass(cv, blob([354, 392], 12, 8, -42), CREAM, { grain: 10, dark: '#e8c98a' });
        for (const side of [-1, 1]) {
          mass(cv, blob([256 + side * 84, 452], 40, 30, side * 8), TAN, { grain: 50 });
          mass(cv, blob([256 + side * 90, 468], 34, 19, side * 6), HOOF, { grain: 30, light: '#d9a26a', dark: '#7a4622' });
          // an antler: a short beam and one tine, both blunt
          const antler = `M${256 + side * 60} 130 Q${256 + side * 60} 100 ${256 + side * 70} 76 M${256 + side * 62} 104 Q${256 + side * 80} 98 ${256 + side * 98} 82`;
          cv.add(`<path d="${antler}" fill="none" stroke="#a5683a" stroke-width="23" stroke-linecap="round" stroke-linejoin="round" filter="${frayed(cv, 5)}"/>`);
          cv.add(`<path d="M${256 + side * 57} 122 Q${256 + side * 58} 104 ${256 + side * 64} 90" fill="none" stroke="#c28a56" stroke-width="6" stroke-linecap="round" stroke-opacity="0.6" filter="${softly(cv, 2)}"/>`);
          mass(cv, blob([256 + side * 132, 150], 50, 44, side * 28), TAN, { grain: 60 });
          mass(cv, blob([256 + side * 134, 154], 30, 26, side * 28), CREAM, { grain: 24, dark: '#e8c98a' });
        }
      });
      s.paint((cv) => {
        // its body, pale down the front, and its forefeet together before it
        mass(cv, body, TAN, { grain: 170 });
        mass(cv, blob([256, 392], 42, 56, 0, 0.04), CREAM, { grain: 60, dark: '#e8c98a' });
        for (const side of [-1, 1]) {
          mass(cv, blob([256 + side * 30, 446], 28, 36), TAN, { grain: 46 });
          mass(cv, blob([256 + side * 30, 470], 27, 17), HOOF, { grain: 26, light: '#d9a26a', dark: '#7a4622' });
        }
        // (the shade its head throws on it)
        cv.add(`<ellipse cx="256" cy="330" rx="74" ry="20" fill="#b9682c" fill-opacity="0.3" filter="${softly(cv, 8)}" clip-path="${within(cv, body)}"/>`);
      });
      s.paint((cv) => {
        // its head: the tuft on top first, then the head and the pale of its face
        mass(cv, blob([246, 108], 20, 16, -20), TAN, { grain: 16 });
        mass(cv, blob([270, 104], 16, 14, 20), TAN, { grain: 12 });
        mass(cv, head, TAN, { grain: 300 });
        cv.add(`<ellipse cx="256" cy="140" rx="84" ry="26" fill="#f4bb7a" fill-opacity="0.6" filter="${softly(cv, 9)}" clip-path="${within(cv, head)}"/>`);
        cv.add(`<path d="M244 112 Q262 98 274 112 Q262 108 256 122" fill="none" stroke="${DEEP}" stroke-width="5" stroke-linecap="round" stroke-opacity="0.75" filter="${softly(cv, 1.2)}"/>`);
        mass(cv, face, CREAM, { grain: 150, light: '#fffaf0', dark: '#ecce90' });
        // its eyes, its nose, and a little pink in its cheeks
        cv.add(`<g filter="${frayed(cv, 2.2)}"><ellipse cx="214" cy="246" rx="10" ry="11.5" fill="#3a2418"/><ellipse cx="298" cy="246" rx="10" ry="11.5" fill="#3a2418"/><ellipse cx="256" cy="258" rx="16" ry="11" fill="#cb4a30"/></g>`);
        cv.add('<ellipse cx="251" cy="254.6" rx="5" ry="2.6" fill="#ef8a6a" fill-opacity="0.7"/>');
        cv.add(`<ellipse cx="186" cy="270" rx="16" ry="9" fill="#f6a08c" fill-opacity="0.4" filter="${softly(cv, 4)}"/><ellipse cx="326" cy="270" rx="16" ry="9" fill="#f6a08c" fill-opacity="0.4" filter="${softly(cv, 4)}"/>`);
      });
      return s.done({ finish: { paint: 0, grain: 0.04, contrast: 0.03, saturation: 1 } });
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
      return s.done({ finish: { paint: 1.5, grain: 0.01, contrast: 0.1, saturation: 1, ink: true } });
    },
  },
  {
    key: 'caydan',
    ku: 'Çay',
    en: 'Tea',
    // a glass of tea on its saucer, seen from a little above, so the mouth of the glass is an open ring with the
    // tea lying in it: the glass widest at the lip, drawn in slowly to a waist four tenths of the way down,
    // swelling as slowly to a belly low on it and then quickly in to a small foot; the tea red, dark where the
    // round glass turns it away from the light and orange on its surface; thin white lights down the glass; the
    // saucer broad and white with a scalloped edge, painted round with long coral strokes and gold sprigs
    still(rnd) {
      const s = new Still(rnd);
      const X = 256;
      const ink = '#2a1712';
      // the glass: its half-width down its height, the widest line of the lip first, the waist at 230, the
      // belly at 348 and the foot last — measured, because a tea glass drawn by eye comes out a tumbler
      const profile = [[85, 140], [107, 135], [120, 128.5], [134, 119.5], [148, 112], [161, 106], [175, 103], [189, 101], [203, 99.5], [216, 98.5], [230, 98], [244, 100], [260, 104], [282, 108.5], [304, 111.5], [326, 114], [348, 115], [369, 112.5], [391, 104], [413, 90], [429, 76], [438, 69]];
      const halfAt = (y) => {
        const i = Math.min(profile.length - 1, Math.max(1, profile.findIndex(([py]) => py >= y)));
        const [ya, wa] = profile[i - 1];
        const [yb, wb] = profile[i];
        return wa + ((wb - wa) * (y - ya)) / (yb - ya);
      };
      // its outline from `top` to `bottom`, `inset` in from its outside: each side a smooth curve of its own, the
      // far edge of an ellipse across the top (`lid` high; none is straight across) and the near edge of one
      // across the bottom (`foot` deep), as a round thing seen from above has
      const body = (inset, top, bottom, lid, foot) => {
        const rows = [[top, halfAt(top) - inset], ...profile.filter(([y]) => y > top && y < bottom).map(([y, w]) => [y, w - inset]), [bottom, halfAt(bottom) - inset]];
        const left = spline(rows.map(([y, w]) => [X - w, y]), false);
        const right = spline(rows.slice().reverse().map(([y, w]) => [X + w, y]), false);
        const [yb, wb] = rows.at(-1);
        const [yt, wt] = rows[0];
        const across = lid ? `A${n(wt)} ${n(lid)} 0 0 0 ${n(X - wt)} ${n(yt)}` : '';
        return `${left} A${n(wb)} ${n(foot)} 0 0 0 ${n(X + wb)} ${n(yb)} L${right.slice(1)} ${across} Z`;
      };
      const ring = (cx, cy, rx, ry) => `M${n(cx - rx)} ${n(cy)} A${n(rx)} ${n(ry)} 0 0 1 ${n(cx + rx)} ${n(cy)} A${n(rx)} ${n(ry)} 0 0 1 ${n(cx - rx)} ${n(cy)} Z`;
      const RIM = { y: 85, rx: 140, ry: 61 };
      const outside = body(0, RIM.y, 438, RIM.ry, 11);
      const mouth = ring(X, RIM.y, RIM.rx, RIM.ry);
      // the tea: its surface an ellipse lying in the mouth of the glass, toward its near side, and everything in
      // the glass under that, down to the foot
      const LEVEL = 121;
      const SURFACE = { rx: 111, ry: 25 };
      const tea = body(5, LEVEL, 428, SURFACE.ry, 9);
      // the saucer: broad, seen from above, its edge scalloped
      const S = { x: 256, y: 374, rx: 226, ry: 122 };
      const onPlate = (u, v) => [S.x + u * S.rx, S.y + v * S.ry];
      const edge = [];
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        const r = 1 + 0.014 * Math.cos(a * 12 + 0.4);
        edge.push(onPlate(Math.cos(a) * r, Math.sin(a) * r));
      }
      const saucer = spline(edge);
      // (a shape on the plate, given as points round the plate's own circle, lies down with it)
      const laid = (points) => spline(points.map(([u, v]) => onPlate(u, v)));
      s.paint((cv) => {
        // the thickness of the china at the front, and the plate
        cv.add(`<path d="${saucer}" fill="#b9b0a4" transform="translate(0 6)"/>`);
        cv.add(`<path d="${saucer}" fill="${linear(cv, [[0, '#fbf9f4'], [0.55, '#f1ede5'], [1, '#d9d2c6']], 60, 262, 430, 498)}"/>`);
        // the grey a white plate is painted with: under its far rim, and a turn of it round the well
        crescent(cv, saucer, [-22, -14], { colour: '#8d8580', opacity: 0.32, soft: 16 });
        cv.add(`<ellipse cx="${S.x}" cy="${S.y + 26}" rx="${n(S.rx * 0.58)}" ry="${n(S.ry * 0.54)}" fill="none" stroke="#a9a19a" stroke-width="7" stroke-opacity="0.4" filter="${softly(cv, 5)}" clip-path="${within(cv, saucer)}"/>`);
        // the coral strokes round the rim, long and round-ended, each pointing at the middle; a gold sprig between
        // each and the next
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + 0.2;
          const [ux, uy] = [Math.cos(a), Math.sin(a)];
          const [vx, vy] = [-uy, ux];
          const stroke = [];
          for (let k = 0; k < 20; k++) {
            const t = (k / 20) * Math.PI * 2;
            // (a long oval, from half way out nearly to the edge, fuller at its outer end)
            const along = 0.73 + Math.cos(t) * 0.18;
            const across = Math.sin(t) * (0.105 + 0.025 * Math.cos(t));
            stroke.push([ux * along + vx * across, uy * along + vy * across]);
          }
          const d = laid(stroke);
          cv.add(`<path d="${d}" fill="#e2664a" clip-path="${within(cv, saucer)}"/>`);
          crescent(cv, d, [-3, -3], { colour: '#f4a184', opacity: 0.6, soft: 3 });
          crescent(cv, d, [3, 3], { colour: '#b9432c', opacity: 0.45, soft: 3 });
          const b = a + Math.PI / 8;
          const [gx, gy] = onPlate(Math.cos(b) * 0.79, Math.sin(b) * 0.79);
          const near = 0.62 + 0.38 * Math.max(0, Math.sin(b));
          for (const t of [-1, 0, 1]) cv.add(`<ellipse cx="${n(gx + t * 8.5 * near)}" cy="${n(gy - Math.abs(t) * 3)}" rx="${n(6 * near + 1)}" ry="${n(2.7 * near + 0.7)}" transform="rotate(${n(t * 42)} ${n(gx + t * 8.5 * near)} ${n(gy)})" fill="#b08a30"/>`);
          cv.add(`<circle cx="${n(gx)}" cy="${n(gy + 4.6 * near)}" r="${n(2.4 * near + 0.6)}" fill="#5a3a14"/>`);
        }
        // what the glass casts: grey to its right, and before its foot the light that has come through the tea
        cv.add(`<ellipse cx="${X + 70}" cy="442" rx="84" ry="24" fill="#5a4a48" fill-opacity="0.45" filter="${softly(cv, 7)}" clip-path="${within(cv, saucer)}"/>`);
        cv.add(`<ellipse cx="${X + 30}" cy="466" rx="48" ry="15" fill="#ea7a2a" fill-opacity="0.8" filter="${softly(cv, 6)}" clip-path="${within(cv, saucer)}"/>`);
        cv.add(`<ellipse cx="${X}" cy="442" rx="76" ry="13" fill="#241210" fill-opacity="0.5" filter="${softly(cv, 4)}"/>`);
        strokes(cv, rnd, saucer, [26, 250, 486, 500], { count: 520, colours: ['#fffdf6', '#d9d2c6', '#e9e3d8'], flow: () => 0, length: 14, width: 2.4, opacity: [0.04, 0.13] });
      });
      // the glass above the tea, which is clear: its far wall a pale grey with the room's lights lying on it white
      s.paint((cv) => {
        cv.add(`<path d="${outside}" fill="${linear(cv, [[0, '#b4b0b6'], [0.4, '#d6d3d6'], [0.75, '#c2bec4'], [1, '#a29ea4']], X - 140, 0, X + 140, 0)}" fill-opacity="0.78"/>`);
        cv.add(`<g clip-path="${within(cv, mouth)}">`);
        cv.add(`<path d="M${X - 8} 30 Q${X + 78} 26 ${X + 128} 72 Q${X + 108} 96 ${X + 84} 92 Q${X + 60} 62 ${X + 26} 60 Q${X + 6} 48 ${X - 8} 30 Z" fill="#fff" fill-opacity="0.95" filter="${softly(cv, 1.4)}"/>`);
        cv.add(`<path d="M${X - 130} 82 Q${X - 116} 48 ${X - 70} 34 Q${X - 92} 62 ${X - 98} 104 Z" fill="#fff" fill-opacity="0.6" filter="${softly(cv, 2)}"/>`);
        cv.add(`<path d="M${X - 56} 30 Q${X - 30} 52 ${X - 26} 84" fill="none" stroke="#7d7880" stroke-width="16" stroke-opacity="0.35" filter="${softly(cv, 5)}"/>`);
        cv.add('</g>');
      });
      // the tea
      s.paint((cv) => {
        cv.add(`<path d="${tea}" fill="${linear(cv, [[0, '#5e1208'], [0.18, '#98230e'], [0.5, '#7c1609'], [0.82, '#9e2810'], [1, '#541006']], X - 124, 0, X + 124, 0)}"/>`);
        cv.add(`<g clip-path="${within(cv, tea)}">`);
        // the turns a round glass makes of it: each a soft mass of dark or of light lying across it, curved as the
        // glass is round and deepest at its middle, `reach` of the way out to either side, moved `off` to one side
        const turn = (y, depth, colour, opacity, soft, reach = 1, off = 0) => {
          const w = (halfAt(y) + 6) * reach;
          const cx = X + off * halfAt(y);
          const sag = w * 0.36;
          cv.add(`<path d="M${n(cx - w)} ${n(y)} Q${n(cx)} ${n(y + sag + depth)} ${n(cx + w)} ${n(y)} Q${n(cx)} ${n(y + sag - depth)} ${n(cx - w)} ${n(y)} Z" fill="${colour}" fill-opacity="${opacity}" filter="${softly(cv, soft)}"/>`);
        };
        turn(140, 30, '#d8602c', 0.95, 5);
        turn(150, 26, '#3a0806', 0.6, 7, 0.55, 0.08);
        turn(196, 52, '#260404', 0.82, 9, 0.9, -0.05);
        turn(236, 26, '#cc4a1e', 0.6, 8, 0.42, -0.42);
        turn(286, 46, '#2c0505', 0.8, 9, 0.92, 0.05);
        turn(330, 40, '#bc2612', 0.9, 9);
        turn(374, 30, '#c43c12', 0.85, 8);
        turn(398, 18, '#e8802c', 0.9, 5, 0.78);
        cv.add('</g>');
        // the glass turning away at either side, which darkens it there
        rim(cv, tea, { colour: '#3a0806', width: 9, opacity: 0.45, soft: 5 });
        strokes(cv, rnd, tea, [X - 126, 120, X + 126, 436], { count: 300, colours: ['#3e0a06', '#7c1c10', '#b83a16', '#d05a1c'], flow: () => 88, length: 34, width: 3.4, opacity: [0.04, 0.11] });
        // its surface, seen through the mouth of the glass: orange where the light lies on it, brightest along its
        // far edge, dark toward us where the lip stands over it
        cv.add(`<g clip-path="${within(cv, mouth)}">`);
        const top = ring(X, LEVEL, SURFACE.rx, SURFACE.ry);
        cv.add(`<path d="${top}" fill="${linear(cv, [[0, '#e0661c'], [0.4, '#c44810'], [0.75, '#8c260c'], [1, '#5a1208']], 0, LEVEL - SURFACE.ry, 0, LEVEL + SURFACE.ry)}"/>`);
        cv.add(`<path d="M${n(X - SURFACE.rx + 10)} ${LEVEL - 6} A${n(SURFACE.rx)} ${SURFACE.ry} 0 0 1 ${n(X + SURFACE.rx - 10)} ${LEVEL - 6}" fill="none" stroke="#f6a04a" stroke-width="2.6" stroke-opacity="0.95" stroke-linecap="round"/>`);
        cv.add(`<ellipse cx="${X + 26}" cy="${LEVEL + 6}" rx="56" ry="8" fill="#4a0e06" fill-opacity="0.6" filter="${softly(cv, 3.5)}"/>`);
        cv.add(`<path d="${top}" fill="none" stroke="${ink}" stroke-width="2.4" stroke-opacity="0.75"/>`);
        cv.add('</g>');
      });
      // the glass itself: the dark line round it, the lip, the white lights down it, and its thick foot
      s.paint((cv) => {
        // the foot: thick glass, grey, a light lying along it
        const foot = body(0, 424, 438, 0, 11);
        cv.add(`<path d="${foot}" fill="${linear(cv, [[0, '#9a948f'], [0.3, '#4a403c'], [0.62, '#cfc8c0'], [1, '#3a302c']], X - 76, 0, X + 76, 0)}" fill-opacity="0.92"/>`);
        cv.add(`<path d="M${X - 52} 441 Q${X - 6} 451 ${X + 34} 445" fill="none" stroke="#fbf7f0" stroke-width="3.6" stroke-opacity="0.8" stroke-linecap="round" filter="${softly(cv, 1)}"/>`);
        cv.add(`<path d="M${X - 78} 425 Q${X} 438 ${X + 78} 425" fill="none" stroke="${ink}" stroke-width="2" stroke-opacity="0.6"/>`);
        // the line round the glass, and the paler turn of the glass inside it
        cv.add(`<path d="${outside}" fill="none" stroke="#e8e2dc" stroke-width="8" stroke-opacity="0.2" clip-path="${within(cv, outside)}"/>`);
        cv.add(`<path d="${outside}" fill="none" stroke="${ink}" stroke-width="3.6" stroke-linejoin="round"/>`);
        // the lip: a dark line along its near side, and the light on it
        cv.add(`<path d="M${X - RIM.rx} ${RIM.y} A${RIM.rx} ${RIM.ry} 0 0 0 ${X + RIM.rx} ${RIM.y}" fill="none" stroke="${ink}" stroke-width="3.4"/>`);
        cv.add(`<path d="M${X - 122} 108 A${RIM.rx} ${RIM.ry} 0 0 0 ${X - 36} 142" fill="none" stroke="#fff" stroke-width="3" stroke-opacity="0.9" stroke-linecap="round"/>`);
        // the white lights down the glass, each keeping its place across it as the glass narrows and swells
        const light = (at, from, to, width, opacity) => {
          const points = [];
          for (let y = from; y <= to; y += 14) points.push([X + at * halfAt(y), y]);
          cv.add(`<path d="${spline(points, false)}" fill="none" stroke="#fff" stroke-width="${width}" stroke-opacity="${opacity}" stroke-linecap="round" filter="${softly(cv, 0.7)}"/>`);
        };
        light(-0.8, 156, 262, 6, 0.75);
        light(-0.62, 170, 356, 3, 0.7);
        light(-0.22, 164, 330, 2, 0.65);
        light(-0.1, 160, 300, 2.6, 0.6);
        light(0.34, 170, 322, 2, 0.5);
        light(0.84, 300, 392, 3, 0.4);
        // two drops of gold where the light comes through at the right
        cv.add(`<path d="M${X + 52} 330 q4 9 0 20" fill="none" stroke="#f6b83a" stroke-width="3.6" stroke-linecap="round" stroke-opacity="0.9"/>`);
        cv.add(`<path d="M${X + 80} 384 q3 7 0 14" fill="none" stroke="#f6b83a" stroke-width="3" stroke-linecap="round" stroke-opacity="0.8"/>`);
      });
      return s.done({ finish: { paint: 2, grain: 0.012, contrast: 0.08, saturation: 1.04, ink: true } });
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
      return s.done({ finish: { paint: 1.5, grain: 0.012, contrast: 0.08, ink: true } });
    },
  },
  {
    key: 'kevok',
    ku: 'Kevok',
    en: 'Dove',
    // a white dove carrying a letter, as a messenger: seen from the side on the wing, one smooth shape from her
    // round head down her breast to a long tail, her near wing lifted at the top of its beat with its feathers
    // in a scalloped edge and the far wing a grey sliver behind it; a small orange beak, a dot of an eye, and
    // in the beak a cream envelope sealed with a red heart. White, warm under the breast and cool in the wing
    still(rnd) {
      const s = new Still(rnd).place([-20, 6], 0.95);
      const body = spline([[336, 184], [364, 168], [394, 182], [406, 210], [401, 236], [390, 266], [370, 300], [334, 332], [286, 350], [234, 356], [188, 362], [152, 370], [150, 356], [198, 328], [250, 294], [296, 258], [320, 218]]);
      // the near wing: its leading edge from the shoulder up to the tip, then its feathers' ends, one round end
      // after another, down and back to her side
      const lead = [[306, 258], [292, 212], [262, 154], [226, 98], [184, 52]];
      const ends = [[184, 52], [158, 94], [146, 138], [144, 184], [153, 228], [172, 266], [202, 296], [244, 312]];
      // (round ends from point to point, each bowed `out` pixels to the outside of the wing)
      const scallops = (points, out) => {
        let d = '';
        for (let i = 1; i < points.length; i++) {
          const [ax, ay] = points[i - 1];
          const [bx, by] = points[i];
          const len = Math.hypot(bx - ax, by - ay);
          d += ` Q${n((ax + bx) / 2 - ((by - ay) / len) * out)} ${n((ay + by) / 2 + ((bx - ax) / len) * out)} ${n(bx)} ${n(by)}`;
        }
        return d;
      };
      const wing = `${spline(lead, false)}${scallops(ends, 17)} Q288 300 306 258 Z`;
      const far = 'M318 246 Q322 140 262 50 Q238 70 224 96 L296 252 Z';
      const tail = [
        [[204, 350], [86, 432], 30],
        [[200, 348], [62, 412], 34],
        [[198, 344], [50, 388], 36],
      ].map(([from, to, wide]) => blade(from, to, wide, { at: 0.62, point: 0.2 }));
      const beak = 'M399 204 Q418 207 433 218 Q418 227 399 231 Q395 217 399 204 Z';
      s.paint((cv) => {
        // the far wing, in shadow
        cv.add(`<path d="${far}" fill="${linear(cv, [[0, '#a9b5cc'], [1, '#c8d0e0']], 310, 240, 262, 52)}"/>`);
        // her body: white, warm where the breast turns under, cool behind the wing
        cv.add(`<path d="${body}" fill="#fdfbf6"/>`);
        crescent(cv, body, [-10, -16], { colour: '#f1bf9c', opacity: 0.6, soft: 13 });
        cv.add(`<ellipse cx="238" cy="318" rx="70" ry="22" transform="rotate(-32 238 318)" fill="#c5cee0" fill-opacity="0.75" filter="${softly(cv, 9)}" clip-path="${within(cv, body)}"/>`);
        strokes(cv, rnd, body, [140, 170, 410, 372], { count: 150, colours: ['#ffffff', '#f3e3d6', '#e3e8f0'], flow: () => -32, length: 18, width: 2.6, opacity: [0.08, 0.2] });
        // the tail growing out of her, the lowest feather first, each lying on the one under it
        tail.forEach((d, i) => {
          cv.add(`<path d="${d}" fill="${['#e1e6ef', '#eff1f6', '#fdfbf6'][i]}"/>`);
          crescent(cv, d, [3, -5], { colour: '#b9c3d6', opacity: 0.5, soft: 4 });
        });
        cv.add(`<ellipse cx="196" cy="352" rx="34" ry="13" transform="rotate(-24 196 352)" fill="#fdfbf6" filter="${softly(cv, 5)}" clip-path="${within(cv, `${tail[2]} ${body}`)}"/>`);
      });
      // the letter, and then her beak closed on its edge
      s.paint((cv) => {
        cv.add('<g transform="rotate(-12 424 218)">');
        cv.add(`<rect x="422" y="186" width="94" height="64" rx="5" fill="${linear(cv, [[0, '#fff7e6'], [1, '#f1e2c4']], 422, 186, 516, 250)}"/>`);
        cv.add('<path d="M424 250 L458 220 M514 250 L480 220" fill="none" stroke="#d9c6a2" stroke-width="2.2" stroke-linecap="round"/>');
        cv.add('<path d="M424 188 L469 226 L514 188" fill="none" stroke="#cdb58a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>');
        // the seal: a heart
        cv.add('<path d="M469 240 C455 229 452 219 459 214 C464 211 468 214 469 218 C470 214 474 211 479 214 C486 219 483 229 469 240 Z" fill="#e0483c"/>');
        cv.add('<path d="M460 218 Q462 215 465 216" fill="none" stroke="#ffb0a4" stroke-width="2" stroke-linecap="round"/>');
        cv.add('</g>');
        cv.add(`<path d="${beak}" fill="${linear(cv, [[0, '#f8b84e'], [1, '#e88a26']], 400, 206, 430, 228)}"/>`);
        cv.add('<path d="M400 218 Q417 217 431 218" fill="none" stroke="#a8561c" stroke-width="2" stroke-linecap="round"/>');
        // her eye
        cv.add('<circle cx="375" cy="206" r="7" fill="#1c1a24"/><circle cx="372.6" cy="203.4" r="2.3" fill="#ffffff"/>');
      });
      // the near wing over her back
      s.paint((cv) => {
        cv.add(`<path d="${wing}" fill="${linear(cv, [[0, '#f1f3f8'], [0.45, '#fdfbf6'], [1, '#ffffff']], 300, 270, 180, 70)}"/>`);
        // cool where each feather lies under the next, and along the wing's own edge
        rim(cv, wing, { colour: '#b4bfd6', width: 7, opacity: 0.45, soft: 4 });
        cv.add(`<g clip-path="${within(cv, wing)}" fill="none" stroke-linecap="round">`);
        // the long feathers, each a line in from where two ends meet; and the rows of short feathers over them
        for (const [x, y] of ends.slice(1, -1)) cv.add(`<path d="M${n(x)} ${n(y)} L${n(x + (276 - x) * 0.3)} ${n(y + (170 - y) * 0.3)}" stroke="#b4bfd6" stroke-width="2.4" stroke-opacity="0.75"/>`);
        cv.add(`<path d="M204 104${scallops([[204, 104], [190, 142], [187, 182], [195, 222], [213, 256], [242, 280]], 9)}" stroke="#bcc6da" stroke-width="2.4"/>`);
        cv.add(`<path d="M232 140${scallops([[232, 140], [224, 174], [228, 208], [244, 238], [266, 258]], 7)}" stroke="#cbd3e2" stroke-width="2.2"/>`);
        cv.add('</g>');
      });
      return s.done({ finish: { paint: 1, grain: 0.01, contrast: 0.05, saturation: 1, ink: { colour: '#2b3140', width: 3.4 } } });
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
      return s.done({ finish: { paint: 1.5, grain: 0.012, contrast: 0.08, ink: true } });
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
      return s.done({ finish: { grain: 0.004, ink: true } });
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
      return s.done({ finish: { grain: 0.005, contrast: 0.08, saturation: 1.05, warmth: 0.02, ink: true } });
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