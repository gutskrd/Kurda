/**
 * The pictures Hevalo shows on the seasons' and the months' badges — spring's
 * blossom, summer's sun, an autumn leaf, a snowflake and the new moon — drawn
 * whole with the pen (pen.ts), in the style of the secrets (pictures.ts).
 */
import { circ, glint, line, n, path, stroke } from '../pen.js';
import type { Pen, Picture } from '../pen.js';

/** A point turned about 0,0 by `deg` degrees. */
const turned = (x: number, y: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};
const pts = (list: readonly (readonly [number, number])[]): string => list.map(([x, y]) => `${n(x)},${n(y)}`).join('L');

/** Spring: a blossom of five pink petals, each notched at its tip, white at its heart, gold stamens, two young leaves. */
function blossom(p: Pen): string {
  const out: string[] = [];
  const ink = '#a8285e';
  const leaf = p.box([[0, '#d8ffa6'], [0.55, '#5fcf5c'], [1, '#22863f']]);
  out.push(path('M3,8C8,6 14.6,8.4 18.4,14.6C12.4,16.4 6.6,14 3,8Z', leaf, stroke('#1f6b3a', 0.9)));
  out.push(path('M-3.4,7.6C-8.6,7 -14.6,10.6 -17.2,17C-11,17.8 -5.6,14.4 -3.4,7.6Z', leaf, stroke('#1f6b3a', 0.9)));
  const petal = 'M0,-1.6C-5.4,-3.8 -8,-11 -4.8,-15.4C-3.2,-17.4 -1.2,-16.8 0,-15C1.2,-16.8 3.2,-17.4 4.8,-15.4C8,-11 5.4,-3.8 0,-1.6Z';
  const pink = p.round([[0, '#ffffff'], [0.3, '#fff0f6'], [0.7, '#ffa6cf'], [1, '#ec5c9e']], 0, 0, 17);
  for (let i = 0; i < 5; i++) out.push(path(petal, pink, `${stroke(ink, 0.9)} transform="rotate(${i * 72 - 8})"`));
  if (!p.tiny) {
    // the petals' veins, faint, and the light on the upper ones
    for (let i = 0; i < 5; i++) out.push(line('M0,-4V-12', ink, 0.5, ` stroke-opacity="0.35" transform="rotate(${i * 72 - 8})"`));
    out.push(path('M-3.6,-13.6C-2.6,-15 -1.4,-15 -0.6,-14C-1.8,-13.6 -2.8,-13 -3.6,-11.6Z', '#ffffff', ' fill-opacity="0.9" transform="rotate(-8)"'));
    out.push(path('M-3.6,-13.6C-2.6,-15 -1.4,-15 -0.6,-14C-1.8,-13.6 -2.8,-13 -3.6,-11.6Z', '#ffffff', ' fill-opacity="0.8" transform="rotate(-80)"'));
  }
  // its heart: a gold eye and a ring of stamens
  out.push(path(circ(0, 0, 3.2), p.roundBox([[0, '#fff6c2'], [0.6, '#ffc93a'], [1, '#d9770c']], 0.4, 0.35, 0.7), stroke('#8a4a06', 0.7)));
  if (!p.tiny) {
    const tips = Array.from({ length: 8 }, (_, i) => turned(0, -5.4, i * 45 + 20));
    out.push(line(tips.map(([x, y]) => `M${n(x * 0.62)},${n(y * 0.62)}L${n(x)},${n(y)}`).join(''), '#d9770c', 0.6));
    out.push(path(tips.map(([x, y]) => circ(x, y, 0.85)).join(''), '#ffe27a', stroke('#8a4a06', 0.4)));
  }
  if (p.fine) out.push(path(`${glint(13.6, -13.6, 2)}${glint(-15.4, -6.6, 1.4)}`, '#ffffff'));
  return out.join('');
}

/** Summer: the sun at its height, a disc of gold-white light, its rays long and short in turn, its glow round it. */
function summerSun(p: Pen): string {
  const out: string[] = [];
  out.push(path(circ(0, 0, 20), p.round([[0, '#fff6c2', 0.8], [0.55, '#ffd84a', 0.35], [1, '#ffb81c', 0]], 0, 0, 20)));
  const rays = Array.from({ length: 12 }, (_, i) => {
    const deg = i * 30;
    const reach = i % 2 === 0 ? 18.6 : 15;
    return `M${pts([turned(-2.6, -10.4, deg), turned(0, -reach, deg), turned(2.6, -10.4, deg)])}Z`;
  });
  out.push(path(rays.join(''), p.round([[0, '#fff3a0'], [0.6, '#ffb21f'], [1, '#f2701a']], 0, 0, 19), stroke('#b8500a', 0.9)));
  out.push(path(circ(0, 0, 10.6), p.round([[0, '#ffffff'], [0.35, '#fff3a6'], [0.8, '#ffc21f'], [1, '#f39a12']], -3.4, -3.6, 13.6), stroke('#b8500a', 1.1)));
  if (!p.tiny) out.push(path('M-7.6,-2.4C-7,-5.8 -4.6,-7.8 -1.6,-8.4C-4.2,-6.8 -6,-5 -7.6,-2.4Z', '#ffffff', ' fill-opacity="0.9"'));
  if (p.fine) out.push(path(`${glint(15.6, 12.6, 1.8)}${glint(-15, 13, 1.3)}`, '#ffffff'));
  return out.join('');
}

/** A point at `deg` degrees clockwise from straight up, `r` from (0, cy). */
const polar = (deg: number, r: number, cy: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [Math.sin(a) * r, cy - Math.cos(a) * r];
};

/** Autumn: a maple leaf turning, gold into orange into red — five toothed lobes, deep cuts between them, pale veins, a brown stalk. */
function autumnLeaf(p: Pen): string {
  const out: string[] = [];
  const cy = -0.6;
  // each lobe as its two teeth, its notches and its tip; between the lobes, the cuts
  const lobe = (t: number, r: number): [number, number][] =>
    [[t - 16, 0.72], [t - 9, 0.62], [t, 1], [t + 9, 0.62], [t + 16, 0.72]].map(([a, k]) => polar(a ?? 0, r * (k ?? 1), cy));
  const outline: [number, number][] = [
    polar(180, 4.6, cy),
    ...lobe(242, 11.4),
    polar(268, 7.6, cy),
    ...lobe(298, 17.4),
    polar(330, 6.4, cy),
    ...lobe(360, 19),
    polar(30, 6.4, cy),
    ...lobe(62, 17.4),
    polar(92, 7.6, cy),
    ...lobe(118, 11.4),
  ];
  const turn = ' transform="rotate(-12)"';
  out.push(line(`M0,${n(cy + 4.6)}C-0.2,10 -0.8,14.4 -2,18.6`, '#6a3010', 2.2, turn));
  out.push(path(`M${pts(outline)}Z`, p.line([[0, '#ffe27a'], [0.45, '#ff9a2a'], [1, '#d6341c']], -12, -16, 12, 8), `${stroke('#8a2a10', 1.1)}${turn}`));
  if (!p.tiny) {
    // the veins, from the stalk out toward each lobe's point
    const veins = [242, 298, 360, 62, 118].map((t) => {
      const [x, y] = polar(t, t === 242 || t === 118 ? 9 : 15, cy);
      return `M0,${n(cy + 4)}L${n(x)},${n(y)}`;
    });
    out.push(line(veins.join(''), '#fff0b8', 0.75, ` stroke-opacity="0.85"${turn}`));
  }
  if (p.fine) out.push(path(`${glint(14.6, -14.6, 1.8)}${glint(-14.6, 12.6, 1.3)}`, '#ffffff'));
  return out.join('');
}

/** Winter: a snowflake of six arms, each branched twice, ice-blue into white, a six-sided crystal at its heart. */
function snowflake(p: Pen): string {
  const out: string[] = [];
  const arm = 'M0,-3V-17.4M0,-8.6L-4.8,-12.8M0,-8.6L4.8,-12.8M0,-13.2L-3,-16M0,-13.2L3,-16';
  const arms = Array.from({ length: 6 }, (_, i) => i * 60);
  out.push(path(circ(0, 0, 19), p.round([[0, '#ffffff', 0.55], [0.6, '#bfe6ff', 0.2], [1, '#bfe6ff', 0]], 0, 0, 19)));
  for (const deg of arms) out.push(line(arm, '#2a5fa8', 4, ` transform="rotate(${deg})"`));
  const ice = p.round([[0, '#ffffff'], [0.5, '#e2f5ff'], [1, '#8fd0ff']], 0, 0, 18);
  for (const deg of arms) out.push(line(arm, ice, 2.2, ` transform="rotate(${deg})"`));
  const hex = Array.from({ length: 6 }, (_, i) => turned(0, -4.6, i * 60 + 30));
  out.push(path(`M${pts(hex)}Z`, p.roundBox([[0, '#ffffff'], [0.6, '#c8ecff'], [1, '#6fb6f0']], 0.35, 0.3, 0.7), stroke('#2a5fa8', 1)));
  if (!p.tiny) out.push(path(`M${pts([turned(0, -3, 330), turned(0, -3, 30), [0, 0]])}Z`, '#ffffff', ' fill-opacity="0.9"'));
  if (p.fine) out.push(path(`${glint(13.6, -13.6, 1.8)}${glint(-14, 12.6, 1.4)}`, '#ffffff'));
  return out.join('');
}

/** Where two circles meet: the crescent's two horns. */
function meet(r1: number, x2: number, y2: number, r2: number): [[number, number], [number, number]] {
  const d = Math.hypot(x2, y2);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const [ux, uy] = [x2 / d, y2 / d];
  return [
    [a * ux - h * uy, a * uy + h * ux],
    [a * ux + h * uy, a * uy - h * ux],
  ];
}

/** A month: the new moon, a gold crescent glowing, and a star beside it. */
function newMoon(p: Pen): string {
  const out: string[] = [];
  const [R, cx, cy, r] = [14.4, 6.6, -4.4, 12];
  const [a, b] = meet(R, cx, cy, r);
  const crescent = `M${n(a[0])},${n(a[1])}A${R},${R} 0 1 1 ${n(b[0])},${n(b[1])}A${r},${r} 0 0 0 ${n(a[0])},${n(a[1])}Z`;
  out.push(path(circ(-2, 1, 19.4), p.round([[0, '#fff6c8', 0.6], [0.6, '#ffe27a', 0.2], [1, '#ffe27a', 0]], -2, 1, 19.4)));
  out.push(path(crescent, p.round([[0, '#fffdf0'], [0.5, '#ffe58e'], [1, '#f0a10c']], -8, -2, 20), stroke('#a8640a', 1.2)));
  if (!p.tiny) out.push(path('M-10.4,-5.6C-9,-9.8 -5.4,-12.4 -1.4,-13C-4.6,-11 -7.6,-8.6 -10.4,-5.6Z', '#ffffff', ' fill-opacity="0.85"'));
  // the star
  const star = Array.from({ length: 10 }, (_, i) => turned(0, i % 2 === 0 ? -5.6 : -2.4, i * 36)).map(([x, y]): [number, number] => [x + 8.6, y - 5]);
  out.push(path(`M${pts(star)}Z`, p.roundBox([[0, '#fffbe0'], [0.6, '#ffd84a'], [1, '#e8a21c']], 0.4, 0.35, 0.7), stroke('#a8640a', 0.9)));
  if (p.fine) out.push(path(`${glint(16.6, 4.6, 1.8)}${glint(-15.6, 13.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

export const SEASONS: Readonly<Record<string, Picture>> = {
  bihar: blossom,
  havin: summerSun,
  payiz: autumnLeaf,
  zivistan: snowflake,
  mehane: newMoon,
};
