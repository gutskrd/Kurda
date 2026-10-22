/**
 * The pictures drawn whole: a found secret's treasure and the pictures that
 * stand on a badge by themselves, without Hevalo (badges.ts). Each is an
 * illustration in its own colours rather than a few flat parts — the white
 * fur of the cat of Van and the blue and the gold of its eyes, a spring
 * pouring out of the rocks into its pool — modelled the way a painted object
 * is: a body lit from the upper left into its shade, a darker form shadow on
 * the side away from the light, a cool light reflected back into that shadow,
 * small hard highlights where the light strikes, and a fine line round each
 * part in a deep tone of its own colour, never black.
 *
 * Each is drawn in the icons' 40-unit box centred on 0,0 (icons.ts), so it
 * is placed the same way. `fine` details — fur, whiskers, ripples, the
 * glints — are left out of the small drawing, and at the smallest only the
 * shapes and their colours are left.
 */
import { circ, ell, glint, line, mix, n, path, stroke } from './pen.js';
import type { Pen, Picture } from './pen.js';

// ─────────────────────────────────────────────────────────────── the pictures

/**
 * The cat of Van, white as snow, one eye blue as the lake and one gold: its
 * head with fur at the cheeks, pink in its ears, whiskers, a little pink nose
 * and a smile.
 */
function cat(p: Pen): string {
  const ink = '#4a2f5c';
  const head =
    'M-15.5,-6C-16.2,-10.5 -15.4,-15.2 -13.4,-18.6C-10.4,-17.2 -7.4,-14.6 -5,-11.7C-1.8,-12.9 1.8,-12.9 5,-11.7C7.4,-14.6 10.4,-17.2 13.4,-18.6' +
    'C15.4,-15.2 16.2,-10.5 15.5,-6C17.4,-3.2 18.1,0 17.7,3Q19.8,4.2 20.3,6Q18.6,6.3 17.1,7.1Q19,8.7 18.9,10.6Q16.6,10.8 14.5,11.1' +
    'C11.6,14.6 6.2,16.4 0,16.4C-6.2,16.4 -11.6,14.6 -14.5,11.1Q-16.6,10.8 -18.9,10.6Q-19,8.7 -17.1,7.1Q-18.6,6.3 -20.3,6Q-19.8,4.2 -17.7,3' +
    'C-18.1,0 -17.4,-3.2 -15.5,-6Z';
  const out: string[] = [];
  out.push(path(head, p.round([[0, '#ffffff'], [0.55, '#f7f4ff'], [0.85, '#e4dcf4'], [1, '#cfc3e8']], -3, -4, 22), stroke(ink, 1.3)));
  // the shade under the cheeks and the jaw, and the light on the brow
  if (!p.tiny) {
    out.push(path('M-17,6.5C-13,12.5 -6,14.6 0,14.6C6,14.6 13,12.5 17,6.5C15.5,12.6 8.5,16.2 0,16.2C-8.5,16.2 -15.5,12.6 -17,6.5Z', '#b9a8dc', ' fill-opacity="0.55"'));
    out.push(path(ell(-2, -7.5, 7.5, 3.4), p.roundBox([[0, '#ffffff', 0.95], [1, '#ffffff', 0]])));
  }
  // the ears' pink
  const earL = 'M-13,-15.9C-10.9,-14.6 -9,-13 -7.5,-11.2C-9.9,-10.5 -12.2,-9.3 -13.9,-7.9C-14.3,-10.6 -14,-13.5 -13,-15.9Z';
  const earR = 'M13,-15.9C10.9,-14.6 9,-13 7.5,-11.2C9.9,-10.5 12.2,-9.3 13.9,-7.9C14.3,-10.6 14,-13.5 13,-15.9Z';
  const pink = p.box([[0, '#ffd0e2'], [0.6, '#ff8fb8'], [1, '#e25d92']], 0.5, 0, 0.5, 1);
  out.push(path(earL + earR, pink, stroke('#c2457a', 0.6)));
  if (p.fine) {
    // tufts of white fur in the ears, and a few on the brow
    out.push(line('M-12.4,-8.9C-12.2,-11 -11.6,-12.8 -10.6,-14.2M-10.6,-9.6C-10.6,-11.2 -10.1,-12.6 -9.3,-13.6M12.4,-8.9C12.2,-11 11.6,-12.8 10.6,-14.2M10.6,-9.6C10.6,-11.2 10.1,-12.6 9.3,-13.6', '#ffffff', 0.7));
    out.push(line('M-1.6,-11.4V-9.2M0,-11.8V-9M1.6,-11.4V-9.2', '#c9bce6', 0.6));
  }
  // the eyes: the lake's blue and the gold, each with its pupil and two lights
  const eye = (cx: number, light: string, mid: string, dark: string, rim: string): string => {
    const shape = ell(cx, 0.2, 4.5, 4.9);
    const parts = [path(shape, p.round([[0, light], [0.45, mid], [1, dark]], cx, 2.4, 5.6), stroke(rim, 1))];
    if (!p.tiny) {
      // the lid's shadow over the top of the eye
      parts.push(path(`M${n(cx - 4.4)},-0.6C${n(cx - 3.6)},-3.8 ${n(cx + 3.6)},-3.8 ${n(cx + 4.4)},-0.6C${n(cx + 3)},-2.6 ${n(cx - 3)},-2.6 ${n(cx - 4.4)},-0.6Z`, rim, ' fill-opacity="0.45"'));
    }
    parts.push(path(ell(cx, 0.6, 2.1, 3.5), '#1d1030'));
    parts.push(path(circ(cx - 1.6, -1.6, 1.45) + circ(cx + 1.7, 2.6, 0.65), '#ffffff'));
    return parts.join('');
  };
  out.push(eye(-6.7, '#d8f6ff', '#55bdf7', '#1d5bc4', '#1c3f86'));
  out.push(eye(6.7, '#fff6c2', '#ffc93a', '#d9770c', '#8a4a06'));
  // nose and mouth
  out.push(path('M-2,5.3Q0,4.4 2,5.3Q1.7,6.8 0,7.8Q-1.7,6.8 -2,5.3Z', p.box([[0, '#ffc2d8'], [1, '#ef6f9f']], 0.5, 0, 0.5, 1), stroke('#b03a6c', 0.6)));
  if (!p.tiny) out.push(line('M0,7.8V8.7M0,8.7Q-1.3,10.6 -3.2,9.6M0,8.7Q1.3,10.6 3.2,9.6', ink, 0.85));
  if (!p.tiny) out.push(path(ell(-11.2, 6.8, 2.8, 1.7) + ell(11.2, 6.8, 2.8, 1.7), p.roundBox([[0, '#ff9cc2', 0.75], [1, '#ff9cc2', 0]])));
  if (p.fine) {
    out.push(path(circ(-0.7, 5.4, 0.45), '#ffffff', ' fill-opacity="0.9"'));
    out.push(line('M-8.6,6.6L-21,4.4M-8.4,8.2L-20.6,9.2M-8.8,9.8L-19,13.2M8.6,6.6L21,4.4M8.4,8.2L20.6,9.2M8.8,9.8L19,13.2', ink, 0.45, ' stroke-opacity="0.7"'));
  }
  return out.join('');
}

/**
 * The spring of knowledge: water pouring out from between mossy rocks and
 * falling into its pool, rings spreading where it falls, drops thrown up,
 * stones round the pool's edge and a fern growing by it.
 */
function spring(p: Pen): string {
  const out: string[] = [];
  const rock = p.box([[0, '#dfe6f5'], [0.45, '#97a4c2'], [1, '#56607f']]);
  const rockInk = '#2b3150';
  const moss = p.box([[0, '#d6ff9a'], [0.5, '#6fd35c'], [1, '#2f9a48']], 0.3, 0, 0.6, 1);
  // the two rocks, and the cleft between them the water comes out of
  out.push(path('M-19.5,4C-20.6,-4.5 -16.8,-13.4 -9.6,-15.4C-4.2,-16.9 0.6,-14.6 1.4,-10.2C1.9,-7.4 1.4,-3 0.8,4.6Z', rock, stroke(rockInk, 1.1)));
  out.push(path('M0.6,4.6C0.4,-2.6 2.6,-10.4 9.2,-11.8C15.4,-13 20.6,-8 20,-1.6C19.8,1.2 19.2,3 18.2,4.6Z', rock, stroke(rockInk, 1.1)));
  out.push(path('M-0.4,-10.8C0.8,-11.8 2.8,-11.8 4,-10.6C3.4,-9.2 1.8,-8.8 0.2,-9.2Z', '#1b2140'));
  // moss on their tops
  out.push(path('M-16.4,-9.6C-14,-14.4 -8.6,-16.4 -3.6,-15C-1.2,-14.2 0.6,-12.8 1.2,-11C-0.8,-11.8 -2.2,-10.4 -4.4,-11.2C-7,-12.4 -9.2,-10.8 -11.6,-11.4C-13.4,-11.8 -14.6,-10.2 -16.4,-9.6Z', moss, stroke('#1f6b3a', 0.6)));
  out.push(path('M4.2,-9.6C6.6,-12.2 11.2,-13.2 14.8,-11.6C17,-10.6 18.8,-8.8 19.6,-6.8C17.8,-7.6 16.4,-6.6 14.6,-7.4C12.6,-8.2 10.8,-7 9,-7.8C7.4,-8.4 5.8,-8.2 4.2,-9.6Z', moss, stroke('#1f6b3a', 0.6)));
  if (!p.tiny) {
    // the rocks' cracks and the light on their shoulders
    out.push(line('M-12,-6.4C-10.6,-4.2 -10.8,-1.4 -12.6,1M-6.6,-10.2C-5.6,-8.4 -6,-6.6 -7.2,-5.4M13.6,-4.6C12.6,-2.6 13,-0.2 14.2,1.6', rockInk, 0.6, ' stroke-opacity="0.55"'));
    out.push(path('M-17.6,-3.4C-17.2,-7 -15.2,-9.6 -12.8,-10.6C-14.4,-8.2 -15.6,-6 -17.6,-3.4Z', '#ffffff', ' fill-opacity="0.55"'));
    out.push(path('M17.6,-2.4C17.8,-4.6 17.2,-6.4 16,-7.4C17.6,-7 18.8,-5.2 18.6,-3.2Z', '#ffffff', ' fill-opacity="0.45"'));
  }
  // the pool
  out.push(path(ell(0, 11.6, 19.4, 6.6), p.round([[0, '#d8fcff'], [0.4, '#5fd6f7'], [0.8, '#2b9ad8'], [1, '#1f6fb4']], 1.6, 10.4, 19), stroke('#17507f', 1.1)));
  // the water: pouring over the cleft's lip and falling, widening, into the pool
  const fall = 'M-0.4,-9.8C0.8,-10.4 2.6,-10.4 3.6,-9.8C4.6,-4 5.2,2.6 5.2,10.2L-2.6,10.2C-2,2.6 -1.4,-4 -0.4,-9.8Z';
  out.push(path(fall, p.line([[0, '#ffffff'], [0.35, '#bff4ff'], [1, '#43c9f2']], 0, -10, 0, 10), stroke('#17507f', 0.9)));
  out.push(path(ell(1.6, -9.6, 2.8, 1.2), '#ffffff'));
  if (!p.tiny) {
    out.push(line('M0.4,-8.2C0.2,-2.4 -0.4,3.6 -1,9.4', '#ffffff', 1.2));
    out.push(line('M1.8,-8.4C2,-2.6 2.2,3.4 2.2,9.4M3.2,-8C3.6,-2.4 4,3.4 4.1,9.4', '#ffffff', 0.6, ' stroke-opacity="0.75"'));
    // where it falls: spray, rings spreading, drops thrown up
    out.push(path(ell(1.3, 10.2, 6.6, 2.1), '#ffffff', ' fill-opacity="0.6"'));
    out.push(line(`${ell(1.3, 11.2, 9.4, 2.9)}${ell(1.3, 11.8, 14, 4.2)}`, '#ffffff', 0.7, ' stroke-opacity="0.6"'));
    out.push(path(`${circ(-3.8, 7.4, 0.9)}${circ(7.2, 6.6, 1)}${circ(9, 8.8, 0.7)}${circ(-5.6, 9.2, 0.6)}${circ(6.2, 4.2, 0.55)}${circ(-3, 4.6, 0.5)}`, '#e9fdff', stroke('#17507f', 0.4)));
  }
  // stones at the pool's edge
  const stone = p.box([[0, '#eef2fb'], [0.5, '#a9b4cf'], [1, '#69739a']]);
  out.push(path(`${ell(-13.2, 16.2, 4, 2.6)}${ell(-5, 18.2, 3.4, 2.2)}${ell(10.4, 17.4, 4.2, 2.6)}${ell(17.2, 13.6, 2.6, 2)}`, stone, stroke(rockInk, 0.9)));
  // a fern by the rocks, and a sprig on the other side
  const leaf = p.box([[0, '#e2ffb0'], [0.6, '#6fd35c'], [1, '#2a8f44']]);
  out.push(path('M-18.6,6.6C-21.4,2.4 -21.2,-2.4 -18.8,-5.6C-17.8,-1.8 -17.6,2.4 -18.6,6.6Z M-17.2,7C-15.4,3.2 -12.6,0.8 -9.4,0.2C-10.8,3.4 -13.6,5.8 -17.2,7Z', leaf, stroke('#1f6b3a', 0.6)));
  out.push(path('M18.4,6.6C18.8,3.4 20.4,0.8 22.6,-0.4C22.4,2.8 20.8,5.4 18.4,6.6Z', leaf, stroke('#1f6b3a', 0.6)));
  if (p.fine) out.push(path(`${glint(-9.4, 12.8, 1.6)}${glint(12.8, 11.4, 1.2)}${glint(-6, -4.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/**
 * A butterfly made like a brooch: wings in shimmering violet into blue and
 * pink, rimmed in gold, with gold veins, an eye on each upper wing and
 * pearls along their edges.
 */
function butterfly(p: Pen): string {
  const out: string[] = [];
  const gold = '#b8780c';
  const upper = 'M-1.2,-2.6C-4,-10 -10,-17.6 -16.4,-17.2C-21,-16.8 -21.6,-11.4 -19.6,-6.8C-17.8,-2.8 -12,0.2 -1.4,0.6Z';
  const lower = 'M-1.2,1.4C-6.4,1.6 -13.6,3.4 -15.6,8.8C-17,12.8 -13.6,16.2 -9.4,14.8C-5.6,13.6 -2.6,8.2 -1.2,1.4Z';
  const mirror = (d: string): string => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${n(-Number(x))},${y}`);
  const wingsUp = p.round([[0, '#3d2bd6'], [0.4, '#8f5cff'], [0.75, '#d77bff'], [1, '#ffb0e6']], 0, -2, 20);
  const wingsDown = p.round([[0, '#3d2bd6'], [0.45, '#6f7bff'], [0.8, '#5fd0ff'], [1, '#c8f4ff']], 0, 2, 16);
  out.push(path(upper + mirror(upper), wingsUp, stroke(gold, 1.3)));
  out.push(path(lower + mirror(lower), wingsDown, stroke(gold, 1.3)));
  if (!p.tiny) {
    // the light across the upper wings, and their veins in gold
    out.push(path('M-17.6,-12.6C-16.4,-15.4 -13.4,-16.2 -10.8,-15C-13.6,-14.2 -15.8,-13.2 -17.6,-12.6Z M17.6,-12.6C16.4,-15.4 13.4,-16.2 10.8,-15C13.6,-14.2 15.8,-13.2 17.6,-12.6Z', '#ffffff', ' fill-opacity="0.7"'));
    const veins = 'M-2,-1.6C-7,-5 -11,-9 -14.6,-14.2M-2,-0.6C-8,-2.4 -13,-4 -18.2,-7.6M-2,2.6C-6,4 -9.6,6.6 -12.2,11.4M-2,3.2C-4,6.4 -5.4,9.4 -6.6,12.6';
    out.push(line(veins + mirror(veins), '#ffd36a', 0.7, ' stroke-opacity="0.85"'));
    // an eye on each upper wing: gold round blue
    const eyes = `${circ(-12.6, -9.2, 2.9)}${circ(12.6, -9.2, 2.9)}`;
    out.push(path(eyes, p.roundBox([[0, '#fff6c6'], [0.6, '#ffc93a'], [1, '#d68a10']]), stroke(gold, 0.6)));
    out.push(path(`${circ(-12.6, -9.2, 1.5)}${circ(12.6, -9.2, 1.5)}`, p.roundBox([[0, '#c8f4ff'], [1, '#2f6ce0']])));
    out.push(path(`${circ(-13.1, -9.8, 0.5)}${circ(12.1, -9.8, 0.5)}`, '#ffffff'));
  }
  if (p.fine) {
    // pearls along the edges
    const pearls = [[-18.6, -10.6], [-18.4, -6.8], [-15.2, -3.4], [-14.4, 10.6], [-11.2, 13.4]].flatMap(([x, y]) => [circ(x ?? 0, y ?? 0, 0.75), circ(-(x ?? 0), y ?? 0, 0.75)]);
    out.push(path(pearls.join(''), '#ffffff', ' fill-opacity="0.95"'));
  }
  // the body, its head and the antennae curling at their ends
  out.push(line('M-0.8,-8.8C-2.6,-12.6 -5,-15.6 -7.6,-17.2M0.8,-8.8C2.6,-12.6 5,-15.6 7.6,-17.2', '#5a3410', 0.9));
  out.push(path(`${circ(-7.8, -17.4, 1.2)}${circ(7.8, -17.4, 1.2)}`, p.roundBox([[0, '#fff3a0'], [1, '#d68a10']]), stroke('#5a3410', 0.5)));
  out.push(path('M0,-7.6C1.6,-7.6 2.1,-5.4 2.1,-2.6V9.4C2.1,12.8 1.3,15.4 0,15.4C-1.3,15.4 -2.1,12.8 -2.1,9.4V-2.6C-2.1,-5.4 -1.6,-7.6 0,-7.6Z', p.box([[0, '#ffe7a6'], [0.5, '#c98a2a'], [1, '#6b3e10']], 0, 0, 1, 0), stroke('#4a2a08', 0.8)));
  out.push(path(circ(0, -8.6, 2.2), p.roundBox([[0, '#ffe7a6'], [0.7, '#c98a2a'], [1, '#6b3e10']], 0.35, 0.3, 0.7), stroke('#4a2a08', 0.8)));
  if (!p.tiny) out.push(line('M-0.6,-4V10', '#ffffff', 0.6, ' stroke-opacity="0.7"'));
  return out.join('');
}

/** A straight arrow: one shot into the gold at the very middle of the target, its feathers still trembling. */
function target(p: Pen): string {
  const out: string[] = [];
  const [cx, cy] = [-3.2, 3.4];
  const rings: [number, string, string][] = [
    [16, '#fffaf0', '#e9d8bf'],
    [12.6, '#ff5a6e', '#d11f49'],
    [9.2, '#fffaf0', '#e9d8bf'],
    [5.8, '#ff5a6e', '#d11f49'],
    [2.8, '#fff3a0', '#ffb81c'],
  ];
  // its stand's legs behind it
  out.push(line('M-12,14L-15.6,21M5.6,14L9.2,21', '#7a4a1e', 2.2));
  rings.forEach(([r, light, dark], i) => {
    out.push(path(circ(cx, cy, r), p.round([[0, light], [0.7, light], [1, dark]], cx - 3, cy - 3, r * 1.4), stroke(i === 0 ? '#5a2a1a' : '#8a1c34', i === 0 ? 1.3 : 0.6)));
  });
  if (!p.tiny) out.push(path(`M${n(cx - 13.6)},${n(cy - 5)}C${n(cx - 12)},${n(cy - 11)} ${n(cx - 6)},${n(cy - 14.4)} ${n(cx)},${n(cy - 14.4)}C${n(cx - 6.4)},${n(cy - 12.2)} ${n(cx - 10.6)},${n(cy - 8.8)} ${n(cx - 13.6)},${n(cy - 5)}Z`, '#ffffff', ' fill-opacity="0.6"'));
  // the arrow: shaft, head buried in the gold, feathers
  out.push(line(`M${n(cx + 1)},${n(cy - 1)}L16.4,-15.6`, '#4a2a10', 2.6));
  out.push(line(`M${n(cx + 1)},${n(cy - 1)}L16.4,-15.6`, p.line([[0, '#ffd59a'], [1, '#b8742c']], cx, cy, 16, -16), 1.4));
  out.push(path('M12.4,-11.6L13.2,-19.4L16.4,-15.6Z M12.4,-11.6L20.2,-12.4L16.4,-15.6Z', p.box([[0, '#ffc0cb'], [0.5, '#ff4f72'], [1, '#c81e48']]), stroke('#7a1030', 0.6)));
  out.push(path('M15.2,-14.4L16.2,-21.4L19.2,-18.2Z M15.2,-14.4L22.2,-15.4L19.2,-18.2Z', p.box([[0, '#ffffff'], [1, '#d9d1f5']]), stroke('#7a1030', 0.6)));
  if (p.fine) out.push(line('M18.6,-6.6Q21,-5 21.4,-2.4M8.6,-17.8Q10.6,-20.2 13.2,-20.6', '#ffffff', 0.8, ' stroke-opacity="0.8"'));
  if (p.fine) out.push(path(`${glint(cx - 8.4, cy + 9.4, 1.4)}${glint(cx + 1.6, cy - 2.2, 1.6)}`, '#ffffff'));
  return out.join('');
}

/** Anew: a sprout that has split a stone, two glossy leaves opening into the light and a drop of dew on one. */
function sprout(p: Pen): string {
  const out: string[] = [];
  const ink = '#2b3150';
  // the stone, split by it
  const stone = p.box([[0, '#e6ebf7'], [0.45, '#9aa6c4'], [1, '#56607f']]);
  out.push(path('M-18.4,18.6C-20,9.6 -12.4,3.4 0,3.4C12.4,3.4 20,9.6 18.4,18.6Z', stone, stroke(ink, 1.1)));
  if (!p.tiny) {
    out.push(path('M-15.6,11.6C-14.2,7.8 -10.4,5.4 -6,4.8C-9.6,6.6 -12.6,8.8 -15.6,11.6Z', '#ffffff', ' fill-opacity="0.65"'));
    // the light breaking out of the crack, and the crack itself
    out.push(path(ell(0.2, 4.6, 6, 2.6), p.roundBox([[0, '#fff3b0', 0.9], [1, '#fff3b0', 0]])));
    out.push(line('M0.2,3.6L-1.4,8.2L1.2,11.4L-0.8,15L0.6,18.4M-1.4,8.2L-4.6,10M1.2,11.4L4.4,12.6', ink, 1));
  }
  // the stem and its two leaves
  const green = p.box([[0, '#e4ffb0'], [0.45, '#6fd35c'], [1, '#22863f']]);
  out.push(line('M0.2,4.2C0,1 -0.6,-2 0.4,-6', '#1f6b3a', 3.4));
  out.push(line('M0.2,4.2C0,1 -0.6,-2 0.4,-6', p.line([[0, '#2f9a48'], [1, '#9be36b']], 0, 4, 0, -6), 2));
  out.push(path('M0.2,-4.6C-3.6,-13.6 -12.4,-17.4 -19,-14.4C-15.6,-6.4 -7.4,-2.2 0.2,-4.6Z', green, stroke('#1f6b3a', 1)));
  out.push(path('M0.6,-5.6C3.6,-14.6 11.8,-19.6 18.8,-17.6C16.6,-9 8.6,-4 0.6,-5.6Z', green, stroke('#1f6b3a', 1)));
  if (!p.tiny) {
    out.push(line('M-0.8,-5.4C-5.6,-9.2 -10.6,-12 -16.2,-13.8M1.4,-6.6C6,-10.8 11,-14.2 16.4,-16.4', '#1f6b3a', 0.7, ' stroke-opacity="0.6"'));
    out.push(path('M-15.6,-14.6C-12,-15.8 -7.6,-15 -4.6,-12.6C-8.4,-13.2 -12,-13.6 -15.6,-14.6Z M15.4,-17C12.2,-17.6 8.4,-16.4 5.8,-14C9,-15 12.4,-16 15.4,-17Z', '#ffffff', ' fill-opacity="0.65"'));
    // a drop of dew
    out.push(path('M-9.6,-10.6C-9.6,-12.2 -8.6,-13.4 -8.6,-13.4C-8.6,-13.4 -7.6,-12.2 -7.6,-10.6C-7.6,-9.8 -8.1,-9.2 -8.6,-9.2C-9.1,-9.2 -9.6,-9.8 -9.6,-10.6Z', '#e9fdff', stroke('#2b8fb8', 0.4)));
  }
  if (p.fine) out.push(path(`${glint(-14.6, -2.2, 1.6)}${glint(13.6, -5.4, 1.2)}${glint(6.6, 0.6, 1)}`, '#ffffff'));
  return out.join('');
}

/**
 * The mountain partridge, the chukar, on its rock: a blue-grey back and a
 * warm breast, the black band through its eye and round its pale throat,
 * black and chestnut bars down its flank, and its red beak, eye and feet.
 */
function partridge(p: Pen): string {
  const out: string[] = [];
  const ink = '#33283c';
  out.push(path('M-17.6,19.6C-17.6,14.8 -12.4,12.4 -6.4,12.8C-2.4,11 5.6,11 9.8,12.6C15,12.4 19.4,14.8 19.4,19.6Z', p.box([[0, '#e6ebf7'], [0.45, '#9aa6c4'], [1, '#56607f']]), stroke('#2b3150', 1)));
  if (!p.tiny) out.push(path('M-14.6,15.6C-12.6,13.8 -9.4,13.2 -6.4,13.6C-9,14.4 -11.6,15 -14.6,15.6Z', '#ffffff', ' fill-opacity="0.6"'));
  // tail, feet, then the body over them
  out.push(path('M-12.2,1.8L-19.8,-2C-20.4,1.6 -19,5 -15.4,6.8Z', p.box([[0, '#c9bfb2'], [1, '#7c6a5a']]), stroke(ink, 1)));
  out.push(line('M-2.6,10.4L-3.2,13.4M4.4,9.8L4.8,12.8', '#e0263f', 2));
  const body = 'M-15.2,4C-15.6,-3 -8.6,-7.4 -1,-7.2C2.6,-8 4.8,-10.6 5.8,-13.4C7,-16.8 10,-18 12.8,-17.4C15.6,-16.8 16.8,-14.4 16.6,-12.2L16.4,-9.6C16.2,-7 15.2,-4.6 14.6,-2.2C13.8,4.2 9.2,10.6 0.8,11C-7.4,11.4 -15,10.2 -15.2,4Z';
  out.push(path(body, p.line([[0, '#d9e1f0'], [0.35, '#a9b6cf'], [0.62, '#c6b8b0'], [0.8, '#efd3aa'], [1, '#d39a62']], -2, -17, 2, 11), stroke(ink, 1.2)));
  // the pale flank and its bars
  out.push(path('M-6.4,5C-2.4,3 6,2.4 11.4,3.4C10,7.6 5,10.4 -0.6,10.6C-3.8,10.6 -6.2,8.6 -6.4,5Z', '#fff1d8', stroke(ink, 0.5, ' stroke-opacity="0.5"')));
  if (!p.tiny) {
    out.push(line('M-3.6,4.4C-3,6.4 -2.8,8 -2.8,9.8M3.4,3.6C3.8,5.6 3.8,7.4 3.6,9.2M9.4,3.4C9.4,5 9,6.4 8.4,7.6', '#1d1626', 1.15));
    out.push(line('M-0.2,3.8C0.4,5.8 0.6,7.6 0.4,9.6M6.6,3.4C6.8,5.4 6.6,7 6,8.6', '#9a3b1a', 1.15));
  }
  // the wing folded on the back, its feathers
  out.push(path('M-12.6,2C-10.8,-4.4 -2.6,-6.6 4.4,-3.6C2.8,3 -4.8,6.4 -12.6,2Z', p.box([[0, '#cfc4b8'], [0.5, '#a08c7a'], [1, '#6e5a4a']]), stroke(ink, 0.8)));
  if (p.fine) out.push(line('M-9.4,1.4C-8,-1.6 -5.6,-3.2 -2.6,-3.6M-6,2.6C-4.6,0 -2.4,-1.6 0.6,-2M-10.8,-0.2C-9.6,-2.8 -7.6,-4.4 -5,-4.8', '#fff7ee', 0.6, ' stroke-opacity="0.7"'));
  // the pale throat, and the black band round it and through the eye
  out.push(path('M9.6,-11.8C10.4,-7.8 12.4,-4.8 14.9,-3.4C15.8,-5.6 16.4,-8 16.6,-10.4C14.6,-10.9 12,-11.4 9.6,-11.8Z', '#fff4df'));
  out.push(path('M16.8,-13.6C14.2,-13 11.4,-13.2 8.8,-12.4C7.6,-9 8.2,-5.2 11.4,-2.6C13,-2.2 14.4,-2.6 15.1,-3.5C12,-4.8 10.6,-7.8 11,-10.6C12.8,-11.1 14.8,-11.3 16.8,-11.4Z', '#1d1626'));
  // its red beak, and its eye ringed in red
  out.push(path('M16.6,-13.4L20.6,-11L16.5,-9.4Z', p.box([[0, '#ff9aa6'], [1, '#d81e3a']]), stroke('#7a1020', 0.5)));
  out.push(path(circ(12.9, -12.3, 2), '#ff3b4f', stroke('#7a1020', 0.4)));
  out.push(path(circ(12.9, -12.3, 1.05), '#1d1626'));
  out.push(path(circ(12.5, -12.7, 0.42), '#ffffff'));
  if (!p.tiny) out.push(path('M7.4,-14.6C8.6,-16.6 11,-17.4 13.2,-16.8C11,-16.4 9.2,-15.8 7.4,-14.6Z M-12.4,-1.6C-10.6,-4.6 -7,-6.4 -3,-6.4C-6.6,-5.4 -9.6,-3.8 -12.4,-1.6Z', '#ffffff', ' fill-opacity="0.7"'));
  return out.join('');
}

/** The golden hand: a key of the keyboard cast in gold, a star raised on it, shining. */
function goldenKey(p: Pen): string {
  const out: string[] = [];
  const deep = '#7a4a04';
  // the key seen from a little above: its skirt widening to the foot, its top face dished in it
  out.push(path('M-13.6,-18.4H13.6C15.6,-18.4 16.4,-17.2 16.6,-15.4L17.6,13.6C17.8,16.8 15.8,18.8 12.6,18.8H-12.6C-15.8,18.8 -17.8,16.8 -17.6,13.6L-16.6,-15.4C-16.4,-17.2 -15.6,-18.4 -13.6,-18.4Z', p.line([[0, '#ffe58e'], [0.45, '#e8a21c'], [1, '#a8640a']], 0, -18, 0, 19), stroke(deep, 1.2)));
  if (!p.tiny) out.push(line('M-12.6,9.4L-16.2,17.4M12.6,9.4L16.2,17.4', deep, 0.8, ' stroke-opacity="0.55"'));
  out.push(path('M-13.4,-13C-13.4,-15.6 -12,-16.8 -9.4,-16.8H9.4C12,-16.8 13.4,-15.6 13.4,-13V6.4C13.4,8.8 12,10.2 9.6,10.2H-9.6C-12,10.2 -13.4,8.8 -13.4,6.4Z', p.round([[0, '#fffbe0'], [0.45, '#ffd84a'], [1, '#e8a21c']], -4, -12, 24), stroke(deep, 1)));
  // the star, raised
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = (-90 + i * 36) * (Math.PI / 180);
    const r = i % 2 === 0 ? 8.2 : 3.6;
    return `${n(Math.cos(a) * r)},${n(-3.2 + Math.sin(a) * r)}`;
  });
  out.push(path(`M${star.join('L')}Z`, p.box([[0, '#fff6c6'], [0.5, '#f7b928'], [1, '#c27a0a']]), stroke(deep, 0.8)));
  if (!p.tiny) {
    out.push(path(`M0,-11.4L-1.9,-5.8L-7.8,-5.8L-3,-2.2Z`, '#ffffff', ' fill-opacity="0.55"'));
    out.push(path('M-11.6,-12.4C-11.6,-14.4 -10.6,-15.2 -8.6,-15.2H-1.6C-6.2,-14.6 -9.4,-13.4 -11.6,-10.2Z', '#ffffff', ' fill-opacity="0.75"'));
  }
  if (p.fine) out.push(path(`${glint(13.6, -15.6, 3.4)}${glint(-15.6, 13.6, 2.2)}${glint(6.2, 5.6, 1.3)}`, '#ffffff'));
  return out.join('');
}

/** The guest of the fire is given tea: a tulip glass of it, red as the fire, on a gold-rimmed saucer, steam rising, a lump of sugar beside it. */
function teaGlass(p: Pen): string {
  const out: string[] = [];
  const ink = '#5a2a1a';
  // the saucer
  out.push(path(ell(0, 16.4, 13.4, 3.6), '#c9b9a8', stroke(ink, 0.9)));
  out.push(path(ell(0, 14.8, 17.6, 4.8), p.round([[0, '#ffffff'], [0.6, '#f4efe8'], [1, '#d9cdbf']], -4, 13, 18), stroke('#b8780c', 1.2)));
  if (!p.tiny) out.push(line(ell(0, 14.8, 13.2, 3.4), '#2f6ce0', 0.7, ' stroke-dasharray="1.2 1.6"'));
  // the glass, and the tea in it
  const glass = 'M-8.6,-12.4C-8.6,-6 -5.2,-2.4 -5.2,2C-5.2,6 -7.2,9 -6.8,12.4C-6.6,14.2 6.6,14.2 6.8,12.4C7.2,9 5.2,6 5.2,2C5.2,-2.4 8.6,-6 8.6,-12.4Z';
  out.push(path('M-7.8,-8.2C-7.2,-4.8 -4.4,-1.6 -4.4,2C-4.4,6 -6.4,9 -6,12C-5.8,13.4 5.8,13.4 6,12C6.4,9 4.4,6 4.4,2C4.4,-1.6 7.2,-4.8 7.8,-8.2Z', p.line([[0, '#ff9f4a'], [0.4, '#e2441f'], [1, '#8a1c10']], 0, -8, 0, 13)));
  out.push(path(ell(0, -8.2, 7.8, 1.5), p.box([[0, '#ffd08a'], [1, '#f07a30']])));
  out.push(path(glass, '#ffffff', ` fill-opacity="0.18"${stroke('#7a5a8a', 1)}`));
  out.push(line(ell(0, -12.4, 8.6, 1.6), '#e8a21c', 1.1));
  if (!p.tiny) {
    out.push(line('M-6.6,-10.4C-6.2,-5.6 -3.8,-2.4 -3.6,1.4M-5.4,6.4C-5.8,8.4 -5.8,10.2 -5.4,11.8', '#ffffff', 1.1, ' stroke-opacity="0.85"'));
    out.push(line('M6.4,-9.6C6,-6.4 4.6,-3.8 4,-1.6', '#ffffff', 0.7, ' stroke-opacity="0.6"'));
  }
  // a lump of sugar
  out.push(path('M9.6,10.6L13,9.4L16,10.8L12.6,12.2Z', '#ffffff', stroke(ink, 0.6)));
  out.push(path('M9.6,10.6L12.6,12.2L12.6,15.2L9.6,13.6Z', '#efe6dc', stroke(ink, 0.6)));
  out.push(path('M12.6,12.2L16,10.8L16,13.8L12.6,15.2Z', '#d9cdbf', stroke(ink, 0.6)));
  // the steam
  if (!p.tiny) out.push(line('M-2.6,-14.4C-5,-16.4 -0.6,-17.8 -2.8,-20.4M2.8,-14.6C0.6,-16.6 5,-18 2.8,-20.8', '#ffffff', 1.3, ' stroke-opacity="0.85"'));
  if (p.fine) out.push(path(`${glint(-13.6, 8.6, 1.8)}${glint(10.6, -10.4, 1.4)}`, '#ffffff'));
  return out.join('');
}

/** The points of a five-pointed star, its first straight up from its middle, turned by `turn` degrees. */
function starPoints(cx: number, cy: number, outer: number, inner: number, turn = 0): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const a = (-90 + turn + i * 36) * (Math.PI / 180);
    const r = i % 2 === 0 ? outer : inner;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

/** A gold star cut with ten facets, light and shade, the way a star is cast in metal. */
function facetedStar(p: Pen, cx: number, cy: number, outer: number, inner: number, turn: number, ink: string): string {
  const pts = starPoints(cx, cy, outer, inner, turn);
  const out = [path(`M${pts.map(([x, y]) => `${n(x)},${n(y)}`).join('L')}Z`, p.round([[0, '#fffbe0'], [0.5, '#ffd84a'], [1, '#f0a10c']], cx - 3, cy - 3, outer * 1.2), stroke(ink, 1.2))];
  if (!p.tiny) {
    // the facets away from the light, a shade darker: each point's right half
    const shade = pts
      .map((pt, i) => (i % 2 === 0 ? `M${n(cx)},${n(cy)}L${n(pt[0])},${n(pt[1])}L${n(pts[(i + 1) % 10]?.[0] ?? 0)},${n(pts[(i + 1) % 10]?.[1] ?? 0)}Z` : ''))
      .join('');
    out.push(path(shade, '#c27a0a', ' fill-opacity="0.35"'));
    out.push(line(pts.map(([x, y], i) => (i % 2 === 0 ? `M${n(cx)},${n(cy)}L${n(x)},${n(y)}` : '')).join(''), '#ffffff', 0.5, ' stroke-opacity="0.6"'));
  }
  return out.join('');
}

/** A shooting star: a faceted gold star flying down to the left, its trail of three colours fading behind it. */
function shootingStar(p: Pen): string {
  const out: string[] = [];
  const trail = (d: string, colour: string, x1: number, y1: number, x2: number, y2: number): string =>
    path(d, p.line([[0, colour], [0.55, colour, 0.75], [1, colour, 0]], x1, y1, x2, y2));
  out.push(trail('M-4.2,-3.6C1.4,-11.2 9.6,-16.4 20.6,-20C11.6,-13.6 4.8,-7.8 0.4,-0.6Z', '#ff8fc8', -2, -2, 20, -20));
  out.push(trail('M0.6,0.2C6.4,-6.2 13.6,-10.4 22,-12.4C14.4,-7.4 8.6,-3 4.6,3.2Z', '#b57bff', 2, 1, 22, -12));
  out.push(trail('M3.6,4.4C8.8,1.2 14.4,-1.2 20.8,-1.8C15,1.8 10.4,4.8 6.8,7.6Z', '#5fd0ff', 5, 5, 21, -2));
  if (p.fine) out.push(path(`${glint(10.6, -13.6, 1.4)}${glint(16.6, -6.6, 1.1)}${glint(13.4, 1.2, 0.9)}${glint(4.6, -15.6, 1)}`, '#ffffff'));
  out.push(facetedStar(p, -7.4, 6.4, 12.4, 5.4, -14, '#9a5a06'));
  if (!p.tiny) out.push(path(ell(-10.4, 1.2, 2.2, 1.3), '#ffffff', ' fill-opacity="0.8" transform="rotate(-30 -10.4 1.2)"'));
  return out.join('');
}

/** A pearl, glowing in its open shell. */
function pearl(p: Pen): string {
  const out: string[] = [];
  const ink = '#8a3a52';
  const shell = p.line([[0, '#ffe9ee'], [0.5, '#ffb3c4'], [1, '#e9799a']], 0, -17, 0, 8);
  // the upper shell, open behind: a fan with a scalloped edge and its ribs
  const fan = 'M-2.4,7.4L-18.4,1.6C-19.6,-1.4 -18.6,-4.2 -16.4,-5.2C-17,-8.4 -15.2,-11 -12.4,-11.4C-12,-14.4 -9.4,-16.4 -6.4,-16C-5,-18.4 -1.8,-19.2 0,-17.6' +
    'C1.8,-19.2 5,-18.4 6.4,-16C9.4,-16.4 12,-14.4 12.4,-11.4C15.2,-11 17,-8.4 16.4,-5.2C18.6,-4.2 19.6,-1.4 18.4,1.6L2.4,7.4Z';
  out.push(path(fan, shell, stroke(ink, 1.1)));
  if (!p.tiny) out.push(line('M0,6.6L0,-16.6M-1.6,6.6L-6.6,-15M1.6,6.6L6.6,-15M-2.6,6.8L-12.6,-10.4M2.6,6.8L12.6,-10.4M-3,7L-16.6,-4.4M3,7L16.6,-4.4', ink, 0.6, ' stroke-opacity="0.45"'));
  // its glow, then the pearl
  out.push(path(circ(0, 1.6, 10.6), p.round([[0, '#fff7ff', 0.9], [0.55, '#ffd9f0', 0.35], [1, '#ffd9f0', 0]], 0, 1.6, 10.6)));
  out.push(path(circ(0, 1.6, 6.8), p.round([[0, '#ffffff'], [0.4, '#f6efff'], [0.8, '#dccbf4'], [1, '#c0a9e4']], -2.2, -0.6, 8.6), stroke('#7a5a9a', 0.9)));
  if (!p.tiny) {
    out.push(path(ell(-2.4, -1.2, 2.4, 1.6), '#ffffff', ' transform="rotate(-35 -2.4 -1.2)"'));
    out.push(path('M-4.6,5.2C-2.4,7 1.6,7.2 4.4,5.4C2.4,7.8 -2.4,7.8 -4.6,5.2Z', '#ffc2e0', ' fill-opacity="0.8"'));
  }
  // the lower shell in front of it
  const bowl = 'M-19.4,3.2C-18.6,12 -10.2,18.4 0,18.4C10.2,18.4 18.6,12 19.4,3.2C13.2,7.2 6.6,8.6 0,8.6C-6.6,8.6 -13.2,7.2 -19.4,3.2Z';
  out.push(path(bowl, p.line([[0, '#ffd2dc'], [0.5, '#f592ae'], [1, '#c25478']], 0, 3, 0, 18), stroke(ink, 1.1)));
  if (!p.tiny) {
    out.push(line('M0,8.8V18M-6.4,8.4L-5,17.6M6.4,8.4L5,17.6M-12.4,6.8L-10,16M12.4,6.8L10,16M-17.4,4.6L-15.2,12.6M17.4,4.6L15.2,12.6', ink, 0.6, ' stroke-opacity="0.45"'));
    out.push(path('M-16.6,6.6C-12,9.2 -6,10.2 0,10.2C-6,11 -12.6,9.8 -16.6,6.6Z', '#ffffff', ' fill-opacity="0.7"'));
  }
  if (p.fine) out.push(path(`${glint(9.6, -4.6, 1.8)}${glint(-11.4, -8.2, 1.3)}${glint(5.6, 11.6, 1)}`, '#ffffff'));
  return out.join('');
}

type Hue = readonly [string, string, string, string];
const VIOLET: Hue = ['#f6ebff', '#cfa6ff', '#9a5cf0', '#5e2cb8'];
const PINK: Hue = ['#ffeaf4', '#ffa6d2', '#e8559c', '#9e2464'];
const AQUA: Hue = ['#e6fffd', '#94f2ec', '#2fc6d0', '#127486'];

/** One crystal: a six-sided column with a pointed tip, two faces and two facets showing, standing on (x, y) and leaning `turn` degrees. */
function crystal(p: Pen, x: number, y: number, w: number, h: number, tip: number, turn: number, [hi, light, mid, dark]: Hue): string {
  const ridge = -w * 0.12;
  const pt = (a: number, b: number): string => `${n(a)},${n(b)}`;
  const tf = ` transform="translate(${n(x)} ${n(y)}) rotate(${n(turn)})"`;
  const ink = mix(dark, '#000000', 0.35);
  const out = [
    path(`M${pt(-w / 2, 0)}L${pt(-w / 2, -h)}L${pt(0, -h - tip)}L${pt(w / 2, -h)}L${pt(w / 2, 0)}Z`, dark, `${stroke(ink, 1)}${tf}`),
    path(`M${pt(-w / 2, 0)}L${pt(-w / 2, -h)}L${pt(ridge, -h)}L${pt(ridge, 0)}Z`, p.box([[0, hi], [1, light]], 0, 0, 1, 1), tf),
    path(`M${pt(ridge, 0)}L${pt(ridge, -h)}L${pt(w / 2, -h)}L${pt(w / 2, 0)}Z`, p.box([[0, mid], [1, dark]], 0, 0, 1, 1), tf),
    path(`M${pt(-w / 2, -h)}L${pt(0, -h - tip)}L${pt(ridge, -h)}Z`, '#ffffff', tf),
    path(`M${pt(ridge, -h)}L${pt(0, -h - tip)}L${pt(w / 2, -h)}Z`, light, tf),
  ];
  if (!p.tiny) out.push(line(`M${pt(-w / 2 + 0.9, -1)}L${pt(-w / 2 + 0.9, -h + 0.4)}`, '#ffffff', 0.7, ` stroke-opacity="0.8"${tf}`));
  out.push(path(`M${pt(-w / 2, 0)}L${pt(-w / 2, -h)}L${pt(0, -h - tip)}L${pt(w / 2, -h)}L${pt(w / 2, 0)}Z`, 'none', `${stroke(ink, 1)}${tf}`));
  return out.join('');
}

/** Words set like crystal: a cluster of crystals, violet, pink and aqua, grown up out of their stone. */
function crystals(p: Pen): string {
  const out: string[] = [];
  out.push(path(circ(0, 2, 19), p.round([[0, '#e9d6ff', 0.6], [0.6, '#c99bff', 0.18], [1, '#c99bff', 0]], 0, 2, 19)));
  out.push(crystal(p, -7.6, 14.6, 7.6, 15, 6, -24, PINK));
  out.push(crystal(p, 8.2, 14.6, 7.4, 14, 5.6, 22, AQUA));
  out.push(crystal(p, 0, 14.4, 9.4, 22, 7.4, 0, VIOLET));
  out.push(crystal(p, -12.6, 17.4, 5, 6.4, 3.6, -48, AQUA));
  out.push(crystal(p, 12.8, 17.6, 5.2, 6.8, 3.8, 50, PINK));
  out.push(crystal(p, 3.6, 17.4, 5, 6, 3.4, 12, PINK));
  // the stone they grow from
  out.push(path('M-18.4,19.4C-17.6,15.4 -13,13.4 -8,14C-4,12.6 4,12.6 8,14C13,13.4 17.6,15.4 18.4,19.4Z', p.box([[0, '#8a7aa8'], [1, '#3e3258']]), stroke('#241a38', 1)));
  if (p.fine) out.push(path(`${glint(-14.6, -6.6, 2)}${glint(13.6, -9.4, 1.6)}${glint(-2.6, -17.6, 1.4)}`, '#ffffff'));
  return out.join('');
}

/** Words kept: an open chest of treasure, coins and jewels heaped up in it and the light of them on its lid. */
function treasure(p: Pen): string {
  const out: string[] = [];
  const ink = '#4a2208';
  const wood = p.box([[0, '#e0975a'], [0.5, '#a95a26'], [1, '#6a3010']]);
  const gold = p.line([[0, '#fff3a0'], [0.5, '#ffc21f'], [1, '#c27a0a']], 0, -4, 0, 18);
  // the lid, open behind, its inside lit by what is in the chest
  out.push(path('M-16.4,0.4L-17.6,-10.6C-12,-17.6 12,-17.6 17.6,-10.6L16.4,0.4Z', p.line([[0, '#6a2e10'], [1, '#c87a3a']], 0, -16, 0, 0), stroke(ink, 1.1)));
  out.push(line('M-17.6,-10.6C-12,-17.6 12,-17.6 17.6,-10.6', '#ffd84a', 1.8));
  if (!p.tiny) out.push(line('M-9,-14.8L-9.6,0M9,-14.8L9.6,0', ink, 0.6, ' stroke-opacity="0.45"'));
  out.push(path(ell(0, -1, 15.4, 10), p.round([[0, '#fff6c2', 0.95], [0.5, '#ffd84a', 0.45], [1, '#ffd84a', 0]], 0, -1, 15.4)));
  // the heap of gold, its coins, and three jewels on it
  out.push(path('M-16,1.4C-13.4,-3.6 -7.2,-6.4 0,-6.8C7.2,-6.4 13.4,-3.6 16,1.4Z', p.line([[0, '#fff3a0'], [0.6, '#ffc21f'], [1, '#d88a0c']], 0, -7, 0, 1.4), stroke('#9a5a06', 0.7)));
  const coins = [[-11.4, -0.6], [-6.8, -3.4], [-1.4, -4.6], [4.2, -3.6], [9.4, -1.4], [-3.8, -1], [6.6, 0.2], [1, -1.6], [12.6, 0.4], [-13.4, 0.8]];
  out.push(path(coins.map(([x, y]) => ell(x ?? 0, y ?? 0, 2.6, 1.3)).join(''), '#ffe680', stroke('#c27a0a', 0.5)));
  out.push(path('M-8.6,-6.4L-5.8,-9.6L-3,-6.4L-5.8,-3.4Z', p.box([[0, '#ffb3c0'], [0.5, '#ff2d55'], [1, '#a8102e']]), stroke('#6a0818', 0.6)));
  out.push(path(circ(6.6, -6.2, 2.6), p.roundBox([[0, '#c6ecff'], [0.6, '#3f8cff'], [1, '#1b3fae']], 0.35, 0.3, 0.7), stroke('#10236a', 0.6)));
  out.push(path('M0.4,-9.2L2.6,-7.4L1.8,-4.8L-1,-4.8L-1.8,-7.4Z', p.box([[0, '#c8ffd8'], [0.5, '#22c063'], [1, '#0d6a34']]), stroke('#063a1a', 0.6)));
  // the chest
  out.push(path('M-17,0.4H17V14.6C17,17 15.4,18.6 13,18.6H-13C-15.4,18.6 -17,17 -17,14.6Z', wood, stroke(ink, 1.2)));
  if (!p.tiny) out.push(line('M-8.6,1V18M8.6,1V18', ink, 0.6, ' stroke-opacity="0.45"'));
  // its gold bands, rim and lock
  out.push(path('M-17,0.4H17V3.4H-17Z M-14.4,3.4H-11.4V18.6H-14.4Z M11.4,3.4H14.4V18.6H11.4Z', gold, stroke(ink, 0.8)));
  out.push(path('M-3.6,3.4H3.6V9.6C3.6,11.6 2,12.8 0,12.8C-2,12.8 -3.6,11.6 -3.6,9.6Z', gold, stroke(ink, 0.8)));
  out.push(path(`${circ(0, 6.6, 1.1)}M-0.6,7L-0.9,9.6H0.9L0.6,7Z`, ink));
  // a string of pearls over its edge
  if (!p.tiny) out.push(path([[-9.4, 1.2], [-8, 3.2], [-6.2, 4.8], [-4.2, 5.6]].map(([x, y]) => circ(x ?? 0, y ?? 0, 0.95)).join(''), '#fff8ff', stroke('#7a5a9a', 0.4)));
  if (p.fine) out.push(path(`${glint(-15.4, -14.4, 2)}${glint(15.6, -15.4, 1.6)}${glint(10.6, -8.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** A whole month, full as the moon on its fourteenth night: the moon, glowing, its seas and craters soft on it, a wisp of cloud across its foot. */
function fullMoon(p: Pen): string {
  const out: string[] = [];
  out.push(path(circ(0, -1, 20.4), p.round([[0, '#fff6c8', 0.7], [0.62, '#ffe27a', 0.25], [1, '#ffe27a', 0]], 0, -1, 20.4)));
  out.push(path(circ(0, -1, 15.4), p.round([[0, '#fffdf0'], [0.55, '#fff0b8'], [0.85, '#f7d27a'], [1, '#e8ad4a']], -4.6, -5.6, 20), stroke('#b8780c', 1.1)));
  if (!p.tiny) {
    // its seas
    out.push(path('M-9.6,-6.6C-7.4,-9.6 -2.4,-9.8 -0.8,-7C0.4,-4.6 -2.2,-2.6 -5,-3C-7.4,-3.2 -10.8,-4 -9.6,-6.6Z M3.6,2.6C5.6,0.2 10.4,0.6 11,3.6C11.6,6.6 8,8.4 5.4,7.4C3.4,6.6 2.4,4.2 3.6,2.6Z', '#e8b860', ' fill-opacity="0.55"'));
    // craters: a shade on the side away from the light, a rim of light on the other
    const craters: [number, number, number][] = [[6.4, -8, 2.6], [-7.6, 5.4, 2.2], [-1.6, 9.6, 1.6], [9.6, -1.6, 1.4], [-11.6, -0.6, 1.2]];
    out.push(path(craters.map(([x, y, r]) => circ(x, y, r)).join(''), '#d99a3a', ' fill-opacity="0.5"'));
    out.push(path(craters.map(([x, y, r]) => circ(x + r * 0.25, y + r * 0.25, r * 0.72)).join(''), '#fff6d6', ' fill-opacity="0.8"'));
    out.push(path(ell(-6.6, -9.6, 4.4, 2.2), '#ffffff', ' fill-opacity="0.7" transform="rotate(-35 -6.6 -9.6)"'));
  }
  // a wisp of cloud across its foot
  out.push(path('M-19.6,13.6C-19.6,10.6 -16.6,9 -13.8,10C-12.8,7.4 -9,6.6 -7,8.6C-5.4,6.8 -2,7.2 -1.2,9.8C1.6,9.2 3.6,11.4 3,13.6Z', p.line([[0, '#ffffff'], [1, '#d6c6f4']], 0, 7, 0, 14), stroke('#7a5aa8', 0.9)));
  out.push(path('M6.4,17.6C6.4,15.4 8.6,14.2 10.6,15C11.6,13 14.6,12.8 15.8,14.6C17.6,14 19.8,15.6 19.2,17.6Z', p.line([[0, '#ffffff'], [1, '#d6c6f4']], 0, 13, 0, 18), stroke('#7a5aa8', 0.9)));
  if (p.fine) out.push(path(`${glint(15.6, -15.6, 2)}${glint(-16.4, -14.4, 1.4)}${glint(18.4, 4.6, 1.1)}`, '#ffffff'));
  return out.join('');
}

/** A diamond, cut brilliant: its table, the facets of its crown and the long facets down to its point, each catching the light its own way. */
function diamond(p: Pen): string {
  const out: string[] = [];
  const ink = '#173f7a';
  const P: Record<string, [number, number]> = {
    TL: [-8.4, -11.4], TM: [0, -11.4], TR: [8.4, -11.4], BL: [-6.4, -14.6], BR: [6.4, -14.6],
    GL: [-18, -3.6], GA: [-9, -3.6], GM: [0, -3.6], GB: [9, -3.6], GR: [18, -3.6], C: [0, 18.4],
  };
  const poly = (...ks: string[]): string => `M${ks.map((k) => `${n(P[k]?.[0] ?? 0)},${n(P[k]?.[1] ?? 0)}`).join('L')}Z`;
  out.push(path(circ(0, 0, 20), p.round([[0, '#e6f6ff', 0.55], [0.6, '#9fd4ff', 0.18], [1, '#9fd4ff', 0]], 0, 0, 20)));
  const facets: [string, string][] = [
    [poly('BL', 'BR', 'TR', 'TL'), '#ffffff'],
    [poly('GL', 'TL', 'GA'), '#c6ecff'],
    [poly('TL', 'TM', 'GA'), '#ffffff'],
    [poly('GA', 'TM', 'GM'), '#8fd2ff'],
    [poly('TM', 'GM', 'GB'), '#d8f2ff'],
    [poly('TM', 'TR', 'GB'), '#7cc4ff'],
    [poly('TR', 'GR', 'GB'), '#3f8ee8'],
    [poly('BL', 'TL', 'GL'), '#e6f6ff'],
    [poly('BR', 'GR', 'TR'), '#5aa8f0'],
    [poly('GL', 'GA', 'C'), '#a8dcff'],
    [poly('GA', 'GM', 'C'), '#4f9cf0'],
    [poly('GM', 'GB', 'C'), '#d8f2ff'],
    [poly('GB', 'GR', 'C'), '#2a6cc8'],
  ];
  const shown = p.tiny ? facets.slice(0, 1) : facets;
  out.push(path(poly('BL', 'BR', 'GR', 'C', 'GL'), p.line([[0, '#e6f6ff'], [1, '#3f8ee8']], 0, -15, 0, 18), stroke(ink, 1.3)));
  out.push(shown.map(([d, fill]) => path(d, fill, stroke(ink, 0.5, ' stroke-opacity="0.6"'))).join(''));
  out.push(path(poly('BL', 'BR', 'GR', 'C', 'GL'), 'none', stroke(ink, 1.3)));
  if (!p.tiny) out.push(line('M-15.6,-3.6L-6,10.6M-6.4,-12.6L-3.6,-12.6', '#ffffff', 0.9, ' stroke-opacity="0.85"'));
  if (p.fine) out.push(path(`${glint(12.6, -14.6, 3.4)}${glint(-15.6, 9.6, 1.8)}${glint(4.6, 5.6, 1.4)}`, '#ffffff'));
  return out.join('');
}

/** Warm-hearted: a heart of cloud, soft and pink into violet, standing on its own lilac shade. */
function cloudHeart(p: Pen): string {
  const out: string[] = [];
  const heart = 'M0,15.4C-8,10 -16.4,4.2 -16.4,-4C-16.4,-10.2 -12,-13.6 -7.8,-13.6C-4.4,-13.6 -1.6,-11.8 0,-8.8C1.6,-11.8 4.4,-13.6 7.8,-13.6C12,-13.6 16.4,-10.2 16.4,-4C16.4,4.2 8,10 0,15.4Z';
  // puffs round its edge, small enough that it keeps a heart's two lobes and its point
  const half: [number, number, number][] = [
    [-3.2, -10.8, 2.8], [-7.8, -13.2, 3.6], [-12.8, -11.4, 3.6], [-16, -6.2, 3.4], [-15.6, 0.4, 3.4], [-12.6, 6, 3.2], [-8.2, 10.2, 3], [-4, 13.2, 2.6],
  ];
  const puffs: [number, number, number][] = [...half, ...half.map(([x, y, r]): [number, number, number] => [-x, y, r]), [0, 15, 2.4]];
  // each shape its own path, so where two overlap neither cuts the other
  const cloud = (more: string): string => [heart, ...puffs.map(([x, y, r]) => circ(x, y, r))].map((d) => `<path d="${d}"/>`).join('').replace(/\/>/g, `${more}/>`);
  const ink = '#5a2a8a';
  // its shade below it, the outline round the whole, then the cloud itself over the outline's inner half
  out.push(`<g fill="#8f55e8" transform="translate(0 2.2)">${cloud(stroke(ink, 2.4))}</g>`);
  out.push(`<g fill="#8f55e8">${cloud(stroke(ink, 2.4))}</g>`);
  out.push(`<g fill="${p.line([[0, '#ffe2f2'], [0.45, '#ffaee0'], [1, '#c48aff']], -6, -17, 6, 17)}">${cloud('')}</g>`);
  if (!p.tiny) {
    // the light on its upper puffs, and its gloss
    out.push(path(`${circ(-13.4, -12.4, 1.8)}${circ(-8.4, -14.6, 1.6)}${circ(7.4, -14.6, 1.4)}${circ(12.4, -12.4, 1.6)}${circ(-16.4, -7.4, 1.4)}`, '#ffffff', ' fill-opacity="0.8"'));
    out.push(path('M-12.4,-3.6C-11.6,-7 -9,-9 -6,-9.2C-8.6,-7.6 -10.6,-5.6 -12.4,-3.6Z', '#ffffff', ' fill-opacity="0.85"'));
    out.push(path(`${circ(-8.6, 7.4, 2.2)}${circ(9.6, 3.6, 1.8)}${circ(2.4, 9.6, 1.6)}`, '#b57bff', ' fill-opacity="0.35"'));
  }
  if (p.fine) out.push(path(`${glint(17.6, -16.6, 2.4)}${glint(-18.6, 11.6, 1.6)}${glint(14.6, 13.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

export const PICTURES: Readonly<Record<string, Picture>> = {
  'tire-rast': target,
  'ji-nu-ve': sprout,
  'kewe-ciye': partridge,
  'deste-zerin': goldenKey,
  'mevane-agir': teaGlass,
  'kaniya-zanine': spring,
  'pisika-wane': cat,
  perperok: butterfly,
  'sterka-siqiti': shootingStar,
  mirari: pearl,
  belur: crystals,
  gencine: treasure,
  'heyva-cardehe': fullMoon,
  elmas: diamond,
  dilgerm: cloudHeart,
};
