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
 * A month, and a dream of one: a little Kurdish boy sitting on the new moon,
 * fishing. The moon is a great crescent open to the right, glowing, soft
 * craters on it; he sits on its inner curve in his şal û şapik, a red pştên
 * striped with gold round his waist, a black-and-white jamana wound round
 * his head with its fringe of tassels and its tail, white klaş on his feet
 * dangling over the moon's edge, looking up in wonder with his rod raised
 * into the moon's hollow and his line dropping past its horn to a small
 * gold fish.
 */
function moonBoat(p: Pen): string {
  const out: string[] = [];
  const ink = '#3a2414';
  // the moon: the circle about (-3, 0) with the circle about (5, -2.6) taken out of it
  const [R, r] = [17.4, 14.6];
  // from its lower horn round its back to its upper horn, then back down the hollow
  const [low, high] = meet(-3, 0, R, 5, -2.6, r);
  const moon = `M${n(low[0])},${n(low[1])}A${R},${R} 0 1 1 ${n(high[0])},${n(high[1])}A${r},${r} 0 1 0 ${n(low[0])},${n(low[1])}Z`;
  // its glow; beside Hevalo the badge's own halo lights it
  if (p.fine) out.push(path(circ(-3, 0, 20.4), p.round([[0, '#fff6c8', 0.6], [0.7, '#ffe27a', 0.18], [1, '#ffe27a', 0]], -3, 0, 20.4)));
  out.push(path(moon, p.round([[0, '#fffdf0'], [0.45, '#fff0bc'], [0.8, '#f4cf76'], [1, '#d9a24a']], -9, -4, 22), stroke('#a8701c', 1)));
  if (!p.tiny) {
    // its craters, soft, and the light along its outer edge
    const craters: [number, number, number][] = [[-13.6, -4.6, 1.6], [-11, 4.4, 1.2], [-6.6, 11.4, 1.1], [-9.6, -10.4, 1], [-14.4, 6.4, 0.9], [-15.6, 0.4, 0.7]];
    out.push(path(craters.slice(0, p.fine ? 6 : 4).map(([x, y, k]) => circ(x, y, k)).join(''), '#d9aa58', ' fill-opacity="0.45"'));
    if (p.fine) out.push(path(craters.map(([x, y, k]) => circ(x + k * 0.3, y + k * 0.3, k * 0.65)).join(''), '#fff8dc', ' fill-opacity="0.7"'));
    out.push(line('M-17.6,-6.4C-18.8,-0.6 -17.6,5.6 -14.2,10.4', '#ffffff', 1.2, ' stroke-opacity="0.8"'));
    // the moon's inner edge in its own soft shade
    if (p.fine) out.push(line('M0.9,-15.6C-6.2,-13 -10.2,-6 -9.4,1.4C-8.8,6.8 -5,11.2 0.4,12.6', '#c8903e', 1.6, ' stroke-opacity="0.35"'));
  }
  const cloth = p.box([[0, '#d9c29a'], [0.55, '#a8865a'], [1, '#6e5232']]);
  const skin = p.box([[0, '#ffdcbc'], [1, '#d99a6a']]);
  // his legs over the moon's edge, the far one hanging behind, the near one bent forward; white klaş on both feet
  out.push(
    path(
      'M3.6,12.8C3.9,14.4 4.2,16 4.6,17.6L6.4,17.4C6.2,15.8 6,14.2 5.9,12.9Z' +
        'M-0.2,9.2C2.6,8.6 6,9 8,10.4C8.8,11 8.6,12.4 7.8,12.8C5.8,13.2 2.6,13 -0.2,12.4Z' +
        'M6.4,11.6C7.2,13.2 7.9,15 8.3,16.8L10.1,16.4C9.7,14.4 9.2,12.6 8.6,11.2Z',
      cloth,
      stroke(ink, 0.6),
    ),
  );
  out.push(
    path(
      'M4.2,17.2C4.2,18.6 5,19.4 6.4,19.4C7.6,19.4 8.6,19 9.2,18.4C8.2,18.4 7.2,18 6.6,17.2Z' +
        'M7.9,16.6C8,17.9 8.8,18.6 10.2,18.5C11.4,18.4 12.4,17.9 12.9,17.2C11.9,17.3 10.9,17 10.3,16.2Z',
      p.box([[0, '#ffffff'], [1, '#d8d2c6']], 0, 0, 0, 1),
      stroke(ink, 0.55),
    ),
  );
  if (p.fine) out.push(line('M5,18.4L7.4,18.2M8.8,17.6L11.4,17.3', '#a89a86', 0.35));
  // his jacket, and the pştên wound round his waist
  out.push(path('M-1.6,10.8C-2,7.6 -1.6,4.6 -0.2,3C1,1.8 3.4,1.8 4.6,3.2C5.6,4.6 5.4,7.8 4.8,10.8Z', cloth, stroke(ink, 0.7)));
  out.push(path('M-1.8,8.4C0.2,9 3,9 5.1,8.4L5,10.4C3,11 0.2,11 -1.7,10.4Z', p.box([[0, '#ff5a4a'], [1, '#9a1a24']], 0, 0, 0, 1), stroke(ink, 0.5)));
  if (!p.tiny) out.push(line('M-1.6,9.2C0.4,9.8 3,9.8 5,9.2M-1.6,9.8C0.4,10.4 3,10.4 5,9.8', '#ffd36a', 0.3));
  if (p.fine) out.push(line('M3.2,3.2C3.4,4.8 3.6,6.6 3.6,8.4', ink, 0.45, ' stroke-opacity="0.6"'));
  // his arms out to the rod, the rod, and his hands closed on it
  const arms = 'M0.8,4.2C1.8,6 4,6.8 5.8,6.6M3.4,3.8C4.6,5.2 5.8,5.6 7,5.4';
  out.push(line(arms, ink, 2.6));
  out.push(line(arms, cloth, 1.7));
  out.push(line('M5.6,7.8Q11.2,-1 17.6,-12.8', '#5a3410', 1.1));
  if (p.fine) out.push(line('M5.6,7.8Q11.2,-1 17.6,-12.8', '#c8904a', 0.55));
  out.push(path(circ(6.2, 6.4, 0.95) + circ(7.3, 5.2, 0.95), skin, stroke(ink, 0.45)));
  // his head, turned up toward the line: ear, eye looking up, small nose, open happy mouth
  out.push(path('M1.2,2.6C0.2,1.8 -0.2,0.6 -0.1,-0.6C0,-2.6 1.4,-3.8 3,-3.8C4.4,-3.8 5.3,-3 5.5,-1.8C5.6,-1.3 5.7,-0.9 6.2,-0.4C6.4,-0.2 6.1,0.1 5.7,0.1C5.8,0.4 5.8,0.8 5.6,1.1C5.6,1.6 5.4,2 5,2.3C4.4,2.8 3.4,3 2.4,2.9Z', skin, stroke(ink, 0.6)));
  if (!p.tiny) {
    out.push(path(ell(2, -0.1, 0.62, 0.86), skin, stroke(ink, 0.35)));
    out.push(path(circ(4.55, -1.25, 0.44), '#2a1a10'));
    out.push(path('M4.7,1C5.1,1 5.4,0.95 5.6,0.8C5.6,1.4 5.3,1.75 4.95,1.7C4.75,1.55 4.65,1.3 4.7,1Z', '#8a2a1a'));
  }
  if (p.fine) {
    out.push(line('M2.1,-0.6C1.8,-0.3 1.8,0.2 2.1,0.4', ink, 0.25, ' stroke-opacity="0.6"'));
    out.push(path(circ(4.45, -1.45, 0.17), '#ffffff'));
    out.push(line('M3.9,-2.2Q4.5,-2.55 5.15,-2.2', ink, 0.32));
    out.push(path(ell(3.9, 0.7, 0.7, 0.42), '#ff8a7a', ' fill-opacity="0.55"'));
  }
  // the jamana wound full round his head: its tail behind, its rolled brim, its black-and-white weave, its fringe of tassels over his brow
  out.push(path('M-0.4,-0.6C-1.8,0.4 -2.4,1.8 -2.2,3.2L-1.2,3C-1.2,1.8 -0.8,0.8 0.2,0Z', '#24202c', stroke('#14101a', 0.4)));
  out.push(path('M-0.9,-0.1C-1.8,-3.6 0.4,-6.2 3.2,-6.2C5.8,-6.2 7,-4.5 6.3,-2.3C5,-2.9 3.6,-3.1 2.2,-2.7C1,-2.3 0.1,-1.3 -0.9,-0.1Z', '#24202c', stroke('#14101a', 0.5)));
  out.push(line('M-0.7,-0.4C0.4,-2 2.2,-2.9 4,-2.9C5,-2.9 5.8,-2.6 6.3,-2.3', '#14101a', 1.4));
  if (!p.tiny) {
    // the weave: small white crosses on the black
    const crosses = [[0.6, -4.2], [2, -5.1], [3.6, -5.4], [5, -4.8], [1.2, -3], [2.8, -3.7], [4.4, -3.6], [5.8, -3.4], [-0.2, -2.2]];
    out.push(line(crosses.map(([x, y]) => `M${n((x ?? 0) - 0.25)},${n((y ?? 0) - 0.25)}l.5,.5m0,-.5l-.5,.5`).join(''), '#ffffff', 0.22));
  }
  if (p.fine) {
    // the folds where it is wound, the stitched brim, and the fringe: little tassels hanging over his brow and temple
    out.push(line('M0,-3.2C1.4,-4.8 3.6,-5.2 5.4,-4.4M-0.6,-1.6C0.8,-3.4 3.2,-4 5.8,-3.2', '#5a5468', 0.3));
    out.push(line('M-0.4,-0.6C0.8,-2.1 2.4,-2.7 4,-2.7C5,-2.7 5.8,-2.4 6.3,-2.1', '#ffffff', 0.3, ' stroke-dasharray="0.5 0.5"'));
    out.push(line('M3.2,-2.5V-1.6M3.9,-2.6V-1.7M4.6,-2.6V-1.8M5.3,-2.5V-1.7M6,-2.3V-1.6M2.5,-2.3V-1.6', '#24202c', 0.4));
    out.push(path(`${circ(3.2, -1.5, 0.22)}${circ(3.9, -1.6, 0.22)}${circ(4.6, -1.7, 0.22)}${circ(5.3, -1.6, 0.22)}${circ(6, -1.5, 0.22)}${circ(2.5, -1.5, 0.22)}`, '#24202c'));
  }
  // the line dropping past the moon's horn, and a small gold fish on it
  out.push(line('M17.6,-12.8V15.4', '#ffffff', 0.35, ' stroke-opacity="0.9"'));
  out.push(path('M17.6,15.2C18.6,15.7 18.9,17 18.4,18.1C18.1,18.8 17.8,19.1 17.6,19.4C17.4,19.1 17.1,18.8 16.8,18.1C16.3,17 16.6,15.7 17.6,15.2Z M17.6,19.2L16.4,20.6L18.8,20.6Z', p.box([[0, '#fff3a0'], [1, '#e8a21c']]), stroke('#9a5a06', 0.45)));
  if (p.fine) out.push(path(`${glint(-17.6, -15.6, 1.4)}${glint(-19, 14.6, 1)}`, '#ffffff'));
  return out.join('');
}

export const SEASONS: Readonly<Record<string, Picture>> = {
  bihar: blossom,
  havin: summerSun,
  payiz: autumnLeaf,
  zivistan: snowflake,
  mehane: moonBoat,
};
