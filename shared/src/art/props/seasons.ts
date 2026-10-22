/**
 * The pictures Hevalo shows on the seasons' and the months' badges — spring's
 * blossom, summer's sun, an autumn leaf, a snowflake, and a boy fishing from the moon — drawn
 * whole with the pen (pen.ts), in the style of the secrets (pictures.ts).
 */
import { circ, ell, glint, line, n, path, stroke } from '../pen.js';
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

/**
 * A month, and a dream of one: the moon lying on its back like a boat, and
 * a little Kurdish boy sitting in it — his şal û şapik, a red sash, a
 * black-and-white jamana wound round his head — fishing over its side, a
 * small gold fish on his line, clouds drifting under him.
 */
function moonBoat(p: Pen): string {
  const out: string[] = [];
  const ink = '#4a2a14';
  const turn = ' transform="rotate(-6)"';
  // the boy, drawn first: the moon's near side hides him below the waist
  const cloth = p.box([[0, '#efe0c2'], [0.55, '#c9ab7c'], [1, '#8a6a42']]);
  const skin = p.box([[0, '#ffe0c4'], [1, '#e2a47a']]);
  out.push(path('M-7,5C-7.2,0 -6.6,-3.6 -3.6,-4.6C-1.8,-5.2 0.6,-5 1.6,-4C2.8,-2.8 2.6,1 2.4,5Z', cloth, `${stroke(ink, 0.9)}${turn}`));
  out.push(path('M-7.1,2.2C-4,2.8 0,2.8 2.5,2.2V4.8H-7.1Z', p.box([[0, '#ff6a5a'], [1, '#b8202a']], 0, 0, 0, 1), `${stroke(ink, 0.6)}${turn}`));
  if (!p.tiny) out.push(line('M-6,3.4L-5.2,2.8L-4.4,3.4L-3.6,2.8L-2.8,3.4L-2,2.8L-1.2,3.4L-0.4,2.8L0.4,3.4L1.2,2.8', '#ffe2a0', 0.4, turn));
  // his arm reaching out to the rod
  out.push(line('M0.4,-2.8C2,-2.6 3.6,-2 4.6,-1.4', ink, 2.8, turn));
  out.push(line('M0.4,-2.8C2,-2.6 3.6,-2 4.6,-1.4', cloth, 1.8, turn));
  out.push(path(circ(4.9, -1.4, 1.05), skin, `${stroke(ink, 0.5)}${turn}`));
  // his head, the jamana wound round it — black and white, its fringe of tassels over his brow — his face to the line
  out.push(path(circ(-1.6, -8.2, 3.5), skin, `${stroke(ink, 0.8)}${turn}`));
  out.push(path('M-5.4,-8.6C-5.8,-12 -3.8,-13.6 -1.4,-13.6C1,-13.6 2.6,-12 2.3,-9.2C1.2,-10.2 -0.4,-10.6 -2,-10.4C-3.4,-10.2 -4.6,-9.6 -5.4,-8.6Z', '#24202c', `${stroke('#14101a', 0.6)}${turn}`));
  if (!p.tiny) {
    // the wound folds, the little white figures woven in it, the tassels
    out.push(line('M-4.8,-10.2C-2.8,-12 0,-12.2 2,-10.8M-5.2,-9.2C-3,-11 0.4,-11.2 2.3,-9.6', '#5a5468', 0.45, turn));
    out.push(path(`${circ(-3.4, -12.4, 0.32)}${circ(-1.4, -12.9, 0.32)}${circ(0.6, -12.4, 0.32)}${circ(-4.4, -10.6, 0.3)}${circ(-2.4, -11.4, 0.3)}${circ(-0.4, -11.5, 0.3)}${circ(1.4, -10.9, 0.3)}`, '#ffffff', turn));
    out.push(line('M-3.8,-9.8V-8.6M-2.6,-10.2V-9M-1.4,-10.4V-9.2M-0.2,-10.3V-9.1M1,-10V-8.8', '#24202c', 0.55, turn));
    out.push(path(`${circ(0.5, -8.4, 0.55)}`, '#2a1a10', turn));
    out.push(path(`${circ(0.35, -8.6, 0.2)}`, '#ffffff', turn));
    out.push(line('M0.2,-6.2Q1,-5.6 1.7,-6.4', '#8a3a20', 0.45, turn));
    out.push(path(ell(-0.6, -6.7, 0.9, 0.55), '#ff8a8a', ` fill-opacity="0.6"${turn}`));
  }
  // the rod, bent with the line, and the line straight down past the moon to a small gold fish
  out.push(line('M3.6,0.2Q10.6,-7.6 18.2,-17.6', '#7a4a1e', 0.95, turn));
  out.push(line('M18.2,-17.6V13.4', '#ffffff', 0.4, ` stroke-opacity="0.85"${turn}`));
  out.push(path('M18.2,13.2C19.4,13.8 19.8,15.4 19.2,16.8C18.8,17.6 18.4,18 18.2,18.4C18,18 17.6,17.6 17.2,16.8C16.6,15.4 17,13.8 18.2,13.2Z M18.2,18.2L16.8,20L19.6,20Z', p.box([[0, '#fff3a0'], [1, '#e8a21c']]), `${stroke('#9a5a06', 0.5)}${turn}`));
  // the moon on its back: the far horn, the near side over him
  const moon = 'M-15.6,-10.8A17,17 0 1 0 15.6,-10.8A15.6,15.6 0 0 1 -15.6,-10.8Z';
  out.push(path(moon, p.round([[0, '#fffdf0'], [0.5, '#ffe9a0'], [1, '#f2b23a']], -5, 2, 22), `${stroke('#a8640a', 1.1)}${turn}`));
  if (!p.tiny) {
    out.push(path(`${ell(-8.6, 9, 1.8, 1)}${ell(5.4, 10.6, 1.4, 0.8)}${ell(-1.4, 11.4, 1, 0.6)}`, '#e8b860', ` fill-opacity="0.6"${turn}`));
    out.push(path('M-14.4,-6.4C-13.6,-1.4 -10.6,3.4 -6,6C-10.2,5 -13.6,0.4 -14.4,-6.4Z', '#ffffff', ` fill-opacity="0.85"${turn}`));
  }
  // clouds drifting under it
  const cloud = p.line([[0, '#ffffff'], [1, '#cdbdf0']], 0, 10, 0, 19);
  out.push(path('M-19.6,17.6C-19.6,14.8 -16.8,13.4 -14.2,14.4C-13.2,11.8 -9.6,11.2 -7.8,13.2C-6.2,11.8 -3.2,12.4 -2.8,14.8C-0.4,14.4 1.4,16.2 0.8,17.6Z', cloud, stroke('#6a5a9a', 0.8)));
  out.push(path('M8.6,19.4C8.6,17.4 10.6,16.4 12.4,17C13.2,15.4 15.8,15.2 16.8,16.8C18.4,16.4 20,17.8 19.4,19.4Z', cloud, stroke('#6a5a9a', 0.8)));
  if (p.fine) out.push(path(`${glint(-12.6, -16.6, 1.6)}${glint(9.6, -16, 1.2)}${glint(-17.6, -1.6, 1)}`, '#ffffff'));
  return out.join('');
}

export const SEASONS: Readonly<Record<string, Picture>> = {
  bihar: blossom,
  havin: summerSun,
  payiz: autumnLeaf,
  zivistan: snowflake,
  mehane: moonBoat,
};
