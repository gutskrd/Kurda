/**
 * The pictures Hevalo shows on the seasons' and the months' badges — spring's
 * blossom, summer's sun with the Kurdish sun's twenty-one rays, an autumn leaf, a snowflake, and a boy fishing from the moon — drawn
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

/** Summer: the Kurdish sun at its height — twenty-one straight golden rays round its body, sharp and even, the light glowing round it. */
function summerSun(p: Pen): string {
  const out: string[] = [];
  out.push(path(circ(0, 0, 20.4), p.round([[0, '#fff6c2', 0.85], [0.5, '#ffd84a', 0.4], [1, '#ffb81c', 0]], 0, 0, 20.4)));
  // twenty-one points, and between each two a notch at half their reach, as on the flag
  const rays = Array.from({ length: 42 }, (_, i) => turned(0, i % 2 === 0 ? -19 : -9.4, (i * 360) / 42));
  out.push(path(`M${pts(rays)}Z`, p.round([[0, '#fff8d0'], [0.45, '#ffd42e'], [0.8, '#fcbe14'], [1, '#f2a20c']], -2.6, -3, 20), stroke('#d07a08', 0.45)));
  if (!p.tiny) {
    // its body lit from the upper left, and a gleam on it
    out.push(path(circ(0, 0, 8.6), p.round([[0, '#ffffff', 0.75], [0.6, '#fff3b0', 0.3], [1, '#fff3b0', 0]], -2.6, -3, 9.6)));
    out.push(path('M-6.2,-1.8C-5.6,-4.6 -3.6,-6.4 -1,-6.8C-3.2,-5.6 -4.8,-3.8 -6.2,-1.8Z', '#ffffff', ' fill-opacity="0.85"'));
  }
  if (p.fine) out.push(path(`${glint(16.6, 13.6, 1.6)}${glint(-15.6, 14.6, 1.2)}`, '#ffffff'));
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
function meet(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): [[number, number], [number, number]] {
  const [dx, dy] = [x2 - x1, y2 - y1];
  const d = Math.hypot(dx, dy);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const [ux, uy] = [dx / d, dy / d];
  const [bx, by] = [x1 + a * ux, y1 + a * uy];
  return [
    [bx - h * uy, by + h * ux],
    [bx + h * uy, by - h * ux],
  ];
}

/**
 * A month, and a dream of one: a little Kurdish boy sitting in the new moon,
 * fishing the sky. The moon is a great crescent, its hollow open up and to the
 * right, glowing, soft craters on it. He sits on the floor of its hollow in
 * his şal û şapik, a red pştên striped with gold round his waist, a
 * black-and-white jamana wound round his head with its fringe and its tail,
 * his legs over the lower horn and his white klaş swinging in the air; the
 * moon lights him from behind. He holds his rod up with both hands and looks
 * up, delighted: on the end of his line, far below the moon, hangs the star
 * he has caught, gold and glowing.
 */
function moonBoat(p: Pen): string {
  const out: string[] = [];
  // the moon: the circle about (-5, -1) with the circle about (2.5, -4.5) taken out of it
  const [R, r] = [15.5, 13.2];
  const [low, high] = meet(-5, -1, R, 2.5, -4.5, r);
  const moon = `M${n(low[0])},${n(low[1])}A${R},${R} 0 1 1 ${n(high[0])},${n(high[1])}A${r},${r} 0 0 0 ${n(low[0])},${n(low[1])}Z`;
  if (p.fine) out.push(path(circ(-5, -1, 18.6), p.round([[0, '#fff6c8', 0.55], [0.7, '#ffe27a', 0.16], [1, '#ffe27a', 0]], -5, -1, 18.6)));
  out.push(path(moon, p.round([[0, '#fffdf0'], [0.45, '#fff0bc'], [0.8, '#f4cf76'], [1, '#d9a24a']], -10, -5, 20), stroke('#a8701c', 1)));
  if (!p.tiny) {
    // its craters, soft, and the light along its outer edge
    const craters: [number, number, number][] = [[-14.6, -3.6, 1.5], [-12.2, 5.4, 1.2], [-6.6, 10.6, 1.1], [-11, -10.8, 1], [-16.4, 3, 0.8]];
    out.push(path(craters.map(([x, y, k]) => circ(x, y, k)).join(''), '#d9aa58', ' fill-opacity="0.45"'));
    if (p.fine) out.push(path(craters.map(([x, y, k]) => circ(x + k * 0.3, y + k * 0.3, k * 0.65)).join(''), '#fff8dc', ' fill-opacity="0.7"'));
    out.push(line('M-19.4,-5.2C-20.4,0.6 -19,6.6 -15.2,10.8', '#ffffff', 1.1, ' stroke-opacity="0.8"'));
    // where he sits, his shadow on the moon
    out.push(path(ell(3.6, 8.75, 3.4, 0.6), '#8a5a1a', ' fill-opacity="0.35"'));
  }
  // he is lit from behind by the moon: light on his back, his front in its own shade. He is drawn
  // about his seat, (4.2, 8.6), and set down a quarter bigger where he sits, at (3.6, 8.6)
  const boy: string[] = [];
  const ink = '#4a2c18';
  const cloth = p.box([[0, '#e8d2a6'], [0.5, '#bc9a68'], [1, '#7e5e3a']]);
  const skin = p.box([[0, '#ffe2c8'], [0.6, '#f4b88a'], [1, '#d99064']]);
  const klash = p.box([[0, '#ffffff'], [1, '#d6cec2']], 0, 0, 0, 1);
  const shade = '#3a2414';
  // the far leg, behind: thigh along the horn, shin hanging from the knee, its klaş
  boy.push(path('M3.4,7.1C5,6.6 6.6,6.5 7.7,6.7C8.5,6.9 8.8,7.6 8.7,8.4C8.6,9.2 8.5,9.9 8.6,10.6L7.4,10.8C7.3,10 7.3,9.2 7.4,8.6C6.2,8.7 4.8,8.8 3.6,8.7Z', cloth, stroke(ink, 0.5)));
  boy.push(path('M7.2,10.6C7,11.4 7.4,11.9 8.2,11.9C9.1,11.9 9.9,11.6 10.4,11C9.6,11.1 8.9,10.9 8.5,10.4Z', klash, stroke(ink, 0.45)));
  // the near leg: the wide şal from the hip to the knee, gathered at the ankle, and its klaş with its toe turned up
  boy.push(path('M3.8,7.8C5.4,7.4 7.4,7.3 8.7,7.6C9.7,7.8 10.1,8.6 9.9,9.5C9.8,10.3 9.8,11 10,11.6L8.6,11.8C8.4,11.1 8.4,10.3 8.5,9.6C7,9.8 5.4,9.9 4,9.7Z', cloth, stroke(ink, 0.55)));
  boy.push(path('M8.4,11.6C8.2,12.5 8.7,13 9.6,13C10.6,13 11.6,12.6 12.1,11.8C12.4,11.4 12.7,11.4 12.7,11.7C12.6,11.1 12.1,11 11.6,11.3C11,11.6 10.3,11.6 9.9,11.4Z', klash, stroke(ink, 0.45)));
  if (!p.tiny) {
    boy.push(line('M8.6,12.4C9.6,12.7 10.8,12.6 11.8,12', '#a89a86', 0.3));
    // the folds of the şal at the knee, and the shade under the thigh
    boy.push(line('M8.9,8.1C9.3,8.6 9.4,9.2 9.2,9.8M6.2,9.6C6.9,9.2 7.6,9.1 8.4,9.3', shade, 0.25, ' stroke-opacity="0.5"'));
  }
  // his jacket, a little open at the neck on his white shirt, and the pştên wound round his waist
  boy.push(path('M2.2,8.8C1.8,7 1.9,5.2 2.5,4C3,3.1 4,2.8 5,3C6,3.3 6.4,4.2 6.3,5.4C6.2,6.6 5.9,7.8 5.7,8.8Z', cloth, stroke(ink, 0.6)));
  boy.push(path('M3.9,2.95L4.6,4.6L5.4,3.1C4.9,2.95 4.4,2.9 3.9,2.95Z', '#fbf6ec', stroke(ink, 0.3)));
  boy.push(path('M2,6.8C3.3,7.3 4.7,7.3 6.1,6.8L6,8.2C4.7,8.7 3.3,8.7 2.1,8.2Z', p.box([[0, '#ff5a4a'], [1, '#9a1a24']], 0, 0, 0, 1), stroke(ink, 0.45)));
  if (!p.tiny) {
    boy.push(line('M2.1,7.4C3.3,7.9 4.7,7.9 6,7.4M2.1,7.9C3.3,8.4 4.7,8.4 6,7.9', '#ffd36a', 0.26));
    boy.push(path('M5.9,4.2C6.3,5.4 6.2,6.8 5.8,8.8L5.7,8.8C5.9,7.8 6.1,6.6 6,5.4Z', shade, ' fill-opacity="0.25"'));
  }
  // the far arm up to the rod, the rod, then the near arm: sleeves, and his hands closed on it
  boy.push(path('M4.9,3.4C5.8,3.8 6.6,4.1 7.3,3.9L7.6,4.9C6.7,5.3 5.6,5 4.7,4.4Z', cloth, stroke(ink, 0.45)));
  boy.push(line('M5.2,7.2Q9.8,1 14.44,-7.24', '#5a3410', 0.85));
  if (p.fine) boy.push(line('M5.2,7.2Q9.8,1 14.44,-7.24', '#d8a060', 0.32));
  boy.push(path('M2.3,4.2C2,5.6 2.5,6.8 3.8,7C4.7,7.1 5.5,6.8 6,6.4L5.6,5.3C5,5.7 4.4,5.9 3.9,5.8C3.4,5.7 3.4,4.8 3.6,4.1Z', cloth, stroke(ink, 0.5)));
  boy.push(path(circ(6.3, 5.8, 0.72) + circ(7.4, 4.35, 0.66), skin, stroke(ink, 0.4)));
  // his head, turned up to what he has caught: hair at his nape, ear, round cheek, two bright eyes, a wide smile
  boy.push(path('M1.4,-0.6C1.1,0.8 1.3,2 2,2.8L2.6,1.2Z', '#2a1c18'));
  boy.push(path('M1.3,-0.6C1.3,-2.4 2.5,-3.4 4.1,-3.4C5.7,-3.4 6.9,-2.4 7,-0.6C7.1,0.6 6.8,1.6 6.2,2.2C5.5,2.9 4.6,3.1 3.7,3C2.5,2.8 1.5,1.6 1.3,-0.6Z', skin, stroke(ink, 0.5)));
  boy.push(path(ell(2, 0.5, 0.55, 0.72), skin, stroke(ink, 0.35)));
  boy.push(path(`${ell(4.85, -0.05, 0.46, 0.6)}${ell(6.32, -0.2, 0.34, 0.52)}`, '#2a1a10'));
  boy.push(path('M4.8,1.3C5.2,2.3 6.3,2.4 6.75,1.3C6.1,1.55 5.4,1.55 4.8,1.3Z', '#7a2214'));
  if (!p.tiny) {
    boy.push(path(`${circ(5, -0.28, 0.18)}${circ(6.42, -0.42, 0.13)}`, '#ffffff'));
    boy.push(path('M5.3,1.8C5.6,2.1 6.1,2.1 6.4,1.8C6.1,1.95 5.6,1.95 5.3,1.8Z', '#ff8a7a'));
    boy.push(line('M6.95,0.3C7.25,0.5 7.25,0.9 6.95,1.05', ink, 0.25));
    boy.push(path(ell(4.3, 1.25, 0.62, 0.36), '#ff8a7a', ' fill-opacity="0.5"'));
  }
  // the jamana wound round his head: its tail down his back, wound in folds, a fine black-and-white weave, its fringe
  boy.push(path('M1.7,-0.6C0.6,0.4 0.2,1.9 0.5,3.6L1.6,3.5C1.4,2.2 1.6,1 2.5,-0.1Z', '#26222e', stroke('#14101a', 0.35)));
  boy.push(path('M1,0.4C0.5,-2.2 2,-4.3 4.2,-4.4C6.4,-4.5 7.7,-2.8 7.3,-0.8C6,-1.5 4.5,-1.7 3,-1.3C2.2,-1 1.6,-0.4 1,0.4Z', '#26222e', stroke('#14101a', 0.45)));
  if (!p.tiny) {
    boy.push(line('M1.4,-1.6C2.6,-3 4.6,-3.4 6.6,-2.6M1.6,-2.8C2.8,-3.8 4.6,-4 6,-3.6', '#4a4458', 0.35));
    const weave: string[] = [];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 7 - row; col++) weave.push(`M${n(1.8 + col * 0.82 + row * 0.41)},${n(-1.9 - row * 0.62)}h0.1`);
    boy.push(line(weave.join(''), '#ffffff', 0.26, ' stroke-opacity="0.85"'));
    // the moon behind him lights his back
    boy.push(line('M0.9,-0.2C0.7,-2.2 1.8,-3.9 3.6,-4.3M2.1,8.4C1.8,6.8 1.9,5.2 2.4,4.1', '#fff4c0', 0.3, ' stroke-opacity="0.6"'));
  }
  if (p.fine) {
    // the jamana's fringe: little tassels over his brow
    boy.push(path(`${circ(5, -0.7, 0.2)}${circ(5.6, -0.65, 0.2)}${circ(6.2, -0.55, 0.2)}${circ(6.8, -0.4, 0.18)}`, '#26222e'));
  }
  out.push(`<g transform="translate(3.6 8.6) scale(1.25) translate(-4.2 -8.6)">${boy.join('')}</g>`);
  // his line, straight down from the rod's tip under the weight of the star he has caught
  const [sx, sy, sr, turn] = [16.2, 15.4, 3, -14];
  const tips = Array.from({ length: 10 }, (_, i): [number, number] => {
    const a = ((-90 + turn + i * 36) * Math.PI) / 180;
    const k = i % 2 === 0 ? sr : sr * 0.46;
    return [sx + Math.cos(a) * k, sy + Math.sin(a) * k];
  });
  out.push(line(`M16.4,-11.2Q15.8,0 ${n(tips[0]![0])},${n(tips[0]![1])}`, '#fffbe8', 0.35, ' stroke-opacity="0.9"'));
  // the star: gold, its points rounded, glowing
  if (!p.tiny) out.push(path(circ(sx, sy, sr * 1.9), p.round([[0, '#fff2a0', 0.6], [1, '#fff2a0', 0]], sx, sy, sr * 1.9)));
  const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(tips[9]!, tips[0]!);
  const star = `M${n(start[0]!)},${n(start[1]!)}${tips.map((t, i) => {
    const m = mid(t, tips[(i + 1) % 10]!);
    return `Q${n(t[0])},${n(t[1])} ${n(m[0]!)},${n(m[1]!)}`;
  }).join('')}Z`;
  out.push(path(star, p.round([[0, '#fffbd0'], [0.45, '#ffd84a'], [1, '#f09a10']], sx - 1, sy - 1, sr * 1.3), stroke('#a8600a', 0.6)));
  if (!p.tiny) out.push(path(ell(sx - 0.8, sy - 0.9, 0.9, 0.5), '#ffffff', ` fill-opacity="0.8" transform="rotate(${turn} ${sx} ${sy})"`));
  if (p.fine) out.push(path(`${glint(-17.4, -14.6, 1.4)}${glint(11.4, 9.2, 1)}${glint(18.6, 9.6, 0.9)}${glint(12.2, -14.8, 1.1)}`, '#ffffff'));
  return out.join('');
}

export const SEASONS: Readonly<Record<string, Picture>> = {
  bihar: blossom,
  havin: summerSun,
  payiz: autumnLeaf,
  zivistan: snowflake,
  mehane: moonBoat,
};
