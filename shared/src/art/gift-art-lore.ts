/**
 * The gifts from the old stories (gift-art.ts): Kawa's hammer, from the Newroz legend of the smith who rose against the
 * tyrant, forged in Damascus steel with the sun of Kurdistan on its plate; and Şahmaran, queen of the serpents, as the
 * owner's folk painting shows her, framed to hang on a wall and painted afresh rather than traced.
 */
import { type Drawing, type Pt } from './svg.js';
import { brush, ellipse, floor, FLOOR, outline, paint, polygon, roundish, runs, scaleAbout, streaks, touch, tremble, within, type Rnd, type Tone } from './gift-paint.js';

// ────────────────────────────────────────────────────────────────────── kawa

/** One face of the hammer: its own steel, a darker and a lighter run of the Damascus pattern laid over it. */
type Steel = { base: string; dark: string; light: string };
const FRONT: Steel = { base: '#5d636d', dark: '#353940', light: '#a9b0ba' };
const TOP: Steel = { base: '#858c97', dark: '#585e68', light: '#d3d8df' };
const END: Steel = { base: '#3f434a', dark: '#24272c', light: '#7b818b' };
const BEVEL: Steel = { base: '#b6bcc5', dark: '#8a9099', light: '#eef1f4' };
const PLATE: Tone = { base: '#c9a14a', light: '#ecd08a', shade: '#93702c' };
const EMBER = ['#c33a28', '#ec7a2c', '#f7b63a', '#ffe4a0'];
const FIRELIGHT = '#e98b4e';

/**
 * The Damascus pattern over a four-sided face, its corners p00, p10, p11, p01 going round: `count` bands of folded
 * steel flowing along it from p00's side to p10's, dark and light by turns, each wandering in the same slow waves so
 * they run together like the grain of the metal.
 */
function damascus(dr: Drawing, rnd: Rnd, face: readonly [Pt, Pt, Pt, Pt], steel: Steel, count: number, waves = 1.6): void {
  const [p00, p10, p11, p01] = face;
  const at = (u: number, v: number): Pt => [
    (1 - u) * (1 - v) * p00[0] + u * (1 - v) * p10[0] + u * v * p11[0] + (1 - u) * v * p01[0],
    (1 - u) * (1 - v) * p00[1] + u * (1 - v) * p10[1] + u * v * p11[1] + (1 - u) * v * p01[1],
  ];
  const [f1, f2, ph1, ph2] = [waves, waves * 2.3, rnd() * 6.3, rnd() * 6.3];
  paint(dr, polygon(face), steel.base);
  within(dr, polygon(face), () => {
    let dark = '';
    let light = '';
    for (let k = -1; k <= count; k++) {
      const v0 = (k + 0.5) / count;
      const t = (0.1 + rnd() * 0.12) / count;
      const drift = (rnd() - 0.5) * 0.5;
      const edge = (u: number, side: number): Pt => {
        const wave = (0.5 / count) * Math.sin(Math.PI * 2 * f1 * u + ph1 + drift) + (0.16 / count) * Math.sin(Math.PI * 2 * f2 * u + ph2 + k * 0.4);
        return at(u, v0 + wave + side * t * (0.6 + 0.4 * Math.sin(u * 9 + k)));
      };
      const pts: Pt[] = [];
      for (let i = 0; i <= 10; i++) pts.push(edge(i / 10 * 1.1 - 0.05, -1));
      for (let i = 10; i >= 0; i--) pts.push(edge(i / 10 * 1.1 - 0.05, 1));
      if (k % 2) dark += outline(pts);
      else light += outline(pts);
    }
    paint(dr, dark, steel.dark, 0.92);
    paint(dr, light, steel.light, 0.8);
  });
}

/** The sun of Kurdistan, twenty-one rays round a disc, about (cx, cy). */
function kurdishSun(cx: number, cy: number, r: number): string {
  let rays = '';
  for (let i = 0; i < 21; i++) {
    const a = -Math.PI / 2 + (i / 21) * Math.PI * 2;
    const w = Math.PI / 21 * 0.62;
    rays += polygon([[cx + Math.cos(a - w) * r * 1.08, cy + Math.sin(a - w) * r * 1.08], [cx + Math.cos(a) * r * 2.05, cy + Math.sin(a) * r * 2.05], [cx + Math.cos(a + w) * r * 1.08, cy + Math.sin(a + w) * r * 1.08]]);
  }
  return rays + ellipse(cx, cy, r, r);
}

export function kawa(dr: Drawing, rnd: Rnd): void {
  // the plinth: a block of rough-hewn stone, its top lit by the embers
  floor(dr, rnd, 64, 109, 42, 5);
  const top = tremble([[24, 92], [82, 92], [98, 84.4], [40, 84.4]], rnd, 0.35);
  const front = tremble([[24, 92], [82, 92], [82.4, 108], [23.6, 108.4]], rnd, 0.35);
  const flank = tremble([[82, 92], [98, 84.4], [98.4, 100.4], [82.4, 108]], rnd, 0.35);
  paint(dr, polygon(front), '#948c80');
  paint(dr, polygon(flank), '#736d64');
  paint(dr, polygon(top), '#b8b0a3');
  within(dr, polygon(front), () => paint(dr, streaks(rnd, [24, 92, 82, 108], 16, 8, 7, 0.8), '#7a7368', 0.6));
  within(dr, polygon(top), () => paint(dr, polygon([[24, 92], [44, 84.4], [60, 84.4], [40, 92]]), FIRELIGHT, 0.3));
  paint(dr, brush([[34, 108], [36.6, 101], [35, 95]], 0.6, rnd, { count: 4 }) + brush([[90, 96], [92.4, 91], [91.4, 87]], 0.5, rnd, { count: 4 }), '#5e584f', 0.8);

  // the hammer standing on a corner of its head, drawn square to its own head and turned onto the stone
  const T: Pt = [65, 68];
  dr.add(`<g transform="translate(${T[0]} ${T[1]}) rotate(-30)">`);
  // the head: a block, its long edges chamfered so its ends are octagons; `D` is how its depth falls on the picture
  const D: Pt = [8.4, -2.8];
  const C = 3.4;
  const cf = 0.14;
  const P = (x: number, y: number, z: number): Pt => [x + z * D[0], y + z * D[1]];
  const HX = 22;
  const HY = 13;
  // the turned steel handle, rising from the middle of the head's top, its ring grooves and its pommel
  const hx = D[0] / 2;
  const hy = -HY + D[1] / 2;
  const handle: [Pt, Pt, Pt, Pt] = [[hx - 3.6, hy], [hx - 3.6, -64], [hx + 3.6, -64], [hx + 3.6, hy]];
  damascus(dr, rnd, [handle[0], handle[1], handle[2], handle[3]], FRONT, 7, 2.2);
  paint(dr, polygon([[hx - 3.6, hy], [hx - 3.6, -64], [hx - 1.8, -64], [hx - 1.8, hy]]), BEVEL.light, 0.45);
  paint(dr, polygon([[hx + 1.8, hy], [hx + 1.8, -64], [hx + 3.6, -64], [hx + 3.6, hy]]), END.dark, 0.5);
  paint(dr, polygon([[hx - 3.6, hy], [hx - 3.6, hy - 22], [hx - 2.4, hy - 22], [hx - 2.4, hy]]), FIRELIGHT, 0.55);
  let grooves = '';
  let lips = '';
  for (let y = hy - 6; y > -60; y -= 6.2) {
    grooves += brush([[hx - 3.7, y], [hx, y + 0.5], [hx + 3.7, y]], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 4 });
    lips += brush([[hx - 3.5, y + 1], [hx, y + 1.5], [hx + 3.5, y + 1]], 0.5, rnd, { start: 1, end: 1, peak: 0.5, count: 4 });
  }
  paint(dr, grooves, END.dark);
  paint(dr, lips, BEVEL.light, 0.8);
  const pommel = [[hx - 5, -63], [hx - 5, -69], [hx - 3.6, -71], [hx + 3.6, -71], [hx + 5, -69], [hx + 5, -63], [hx + 3.6, -61.6], [hx - 3.6, -61.6]] as Pt[];
  paint(dr, polygon(pommel), TOP.base);
  within(dr, polygon(pommel), () => damascus(dr, rnd, [[hx - 5, -61.6], [hx - 5, -71], [hx + 5, -71], [hx + 5, -61.6]], TOP, 3, 1.2));
  paint(dr, polygon([[hx - 5, -63], [hx - 5, -69], [hx - 3.6, -71], [hx - 2.4, -71], [hx - 3.4, -69], [hx - 3.4, -63]]), BEVEL.light, 0.6);
  paint(dr, polygon([[hx + 3.4, -63], [hx + 3.4, -69], [hx + 3.6, -71], [hx + 5, -69], [hx + 5, -63]]), END.dark, 0.6);
  // the head's faces, back to front: the back chamfer and the top, the front chamfer, the octagonal end, the broad face
  const oct = [P(HX, -HY + C, 0), P(HX, -HY, cf), P(HX, -HY, 1 - cf), P(HX, -HY + C, 1), P(HX, HY - C, 1), P(HX, HY, 1 - cf), P(HX, HY, cf), P(HX, HY - C, 0)];
  damascus(dr, rnd, [P(-HX, -HY, 1 - cf), P(HX, -HY, 1 - cf), P(HX, -HY + C, 1), P(-HX, -HY + C, 1)], BEVEL, 2);
  damascus(dr, rnd, [P(-HX, -HY, cf), P(HX, -HY, cf), P(HX, -HY, 1 - cf), P(-HX, -HY, 1 - cf)], TOP, 6);
  damascus(dr, rnd, [P(-HX, -HY + C, 0), P(HX, -HY + C, 0), P(HX, -HY, cf), P(-HX, -HY, cf)], BEVEL, 2);
  paint(dr, polygon(oct), END.base);
  within(dr, polygon(oct), () => {
    damascus(dr, rnd, [oct[0]!, oct[3]!, oct[4]!, oct[7]!], END, 7, 1);
  });
  paint(dr, polygon([oct[0]!, oct[1]!, oct[2]!, oct[3]!, [oct[3]![0] - 0.8, oct[3]![1] + 1.4], [oct[0]![0] + 0.2, oct[0]![1] + 1.6]]), END.light, 0.8);
  const face: [Pt, Pt, Pt, Pt] = [P(-HX, -HY + C, 0), P(HX, -HY + C, 0), P(HX, HY - C, 0), P(-HX, HY - C, 0)];
  damascus(dr, rnd, face, FRONT, 11, 1.4);
  paint(dr, polygon([P(-HX, HY - C - 2.4, 0), P(-HX * 0.3, HY - C - 1, 0), P(-HX * 0.3, HY - C, 0), P(-HX, HY - C, 0)]) + polygon([P(-HX, -HY + C + 4, 0), P(-HX + 1.2, -HY + C + 4, 0), P(-HX + 1.2, HY - C, 0), P(-HX, HY - C, 0)]), FIRELIGHT, 0.3);
  // the gold plate inlaid in the broad face, four rivets at its corners, the sun of Kurdistan engraved on it
  const plate = tremble([[-14.6, -6.6], [14.6, -6.6], [14.6, 6.6], [-14.6, 6.6]], rnd, 0.08);
  paint(dr, polygon(plate), PLATE.base);
  paint(dr, polygon([[-14.6, -6.6], [14.6, -6.6], [13.8, -5.6], [-13.8, -5.6]]), PLATE.light);
  paint(dr, polygon([[-14.6, 6.6], [14.6, 6.6], [13.8, 5.6], [-13.8, 5.6]]) + polygon([[14.6, -6.6], [14.6, 6.6], [13.8, 5.6], [13.8, -5.6]]), PLATE.shade);
  paint(dr, kurdishSun(0, 0, 2.3), '#b8441e');
  paint(dr, ellipse(-0.6, -0.6, 0.9, 0.9), '#e0703a');
  let rivets = '';
  let shine = '';
  for (const [x, y] of [[-12, -4.2], [12, -4.2], [12, 4.2], [-12, 4.2]] as const) {
    rivets += ellipse(x, y, 1.2, 1.2);
    shine += ellipse(x - 0.4, y - 0.4, 0.45, 0.45);
  }
  paint(dr, rivets, '#6c727c');
  paint(dr, shine, '#eef1f4');
  dr.add('</g>');
  // embers glowing on the stone at its foot, and sparks going up past it
  let coals = '';
  let hearts = '';
  for (const [x, y, r] of [[38, 88.6, 2.2], [44.6, 90, 1.6], [33, 90.4, 1.4], [74, 89.4, 1.5], [28, 106, 1.2], [86, 107, 1]] as const) {
    coals += outline(roundish(x, y, r * 1.3, r, rnd, { count: 7, tremor: 0.12 }));
    hearts += ellipse(x - r * 0.2, y - r * 0.2, r * 0.5, r * 0.4);
  }
  paint(dr, coals, EMBER[0]!);
  paint(dr, hearts, EMBER[2]!);
  let sparks = '';
  let bright = '';
  for (let i = 0; i < 12; i++) {
    const x = 26 + rnd() * 70;
    const y = 30 + rnd() * 52;
    const mark = touch(x, y, 1.4 + rnd() * 1.4, 0.55, -70 - rnd() * 40);
    if (i % 3) sparks += mark;
    else bright += mark;
  }
  paint(dr, sparks, EMBER[1]!);
  paint(dr, bright, EMBER[3]!);
}

// ────────────────────────────────────────────────────────────────── şahmaran

const CREAM = '#f1ead9';
const SCALE_GOLD = '#dcb43c';
const SCALE_GREEN = '#4e7d3a';
const NEAR_BLACK = '#1a1c17';
const WALNUT: Tone = { base: '#6c4326', light: '#93633a', shade: '#472a14' };
const GILT_LINE = '#d6ab48';

export function sahmaran(dr: Drawing, rnd: Rnd): void {
  // the picture: wider than tall, as the painting is; `A` turns its own measure (410 across, 307 down) into the frame's
  const X0 = 15;
  const Y0 = 31;
  const W = 90;
  const H = 62;
  const A = (x: number, y: number): Pt => [X0 + (x / 410) * W, Y0 + (y / 307) * H];
  const shape = (pts: ReadonlyArray<readonly [number, number]>, wobble = 0.15): Pt[] => tremble(pts.map(([x, y]) => A(x, y)), rnd, wobble);
  // the cord it hangs by, its nail, and its shadow on the wall
  paint(dr, brush([[13, 25], [36, 17.6], [60, 12.6]], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }) + brush([[107, 25], [84, 17.6], [60, 12.6]], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }), '#a8302c');
  paint(dr, ellipse(60, 12.6, 1.5, 1.5), '#3a2a22');
  paint(dr, ellipse(59.6, 12.2, 0.5, 0.5), '#b9b2a8');
  paint(dr, polygon([[9.6, 27.6], [113.6, 27.6], [113.6, 102.6], [9.6, 102.6]]), FLOOR, 0.16);
  // the frame: carved walnut, a gold fillet inside it, so the cream picture reads clearly within
  const frame = tremble(runs([[8, 24], [112, 24], [112, 100], [8, 100]], 6), rnd, 0.2);
  paint(dr, outline(frame), WALNUT.base);
  within(dr, outline(frame), () => {
    paint(dr, polygon([[6, 22], [114, 22], [114, 26], [10.4, 26], [10.4, 102], [6, 102]]), WALNUT.light);
    paint(dr, polygon([[109.6, 26], [114, 26], [114, 102], [6, 102], [6, 97.6], [109.6, 97.6]]), WALNUT.shade);
    paint(dr, streaks(rnd, [8, 24, 112, 100], 22, 0, 10, 0.6), WALNUT.light, 0.4);
  });
  let carving = '';
  for (const [x, y] of [[11.2, 27.2], [108.8, 27.2], [108.8, 96.8], [11.2, 96.8]] as const) carving += touch(x, y, 3.4, 1.4, 45) + touch(x, y, 3.4, 1.4, -45);
  paint(dr, carving, WALNUT.light);
  paint(dr, polygon(tremble([[X0 - 1.6, Y0 - 1.6], [X0 + W + 1.6, Y0 - 1.6], [X0 + W + 1.6, Y0 + H + 1.6], [X0 - 1.6, Y0 + H + 1.6]], rnd, 0.1)), GILT_LINE);
  const picture = tremble(runs([[X0, Y0], [X0 + W, Y0], [X0 + W, Y0 + H], [X0, Y0 + H]], 6), rnd, 0.1);
  paint(dr, outline(picture), CREAM);
  within(dr, outline(picture), () => {
    paint(dr, streaks(rnd, [X0, Y0, X0 + W, Y0 + H], 18, -6, 14, 1.6), '#e6dcc4', 0.5);
    // the row of small feet along her belly, each curling like a wave
    let feet = '';
    for (let i = 0; i < 7; i++) {
      const x = 98 + i * 32;
      feet += outline(shape([[x, 258], [x + 3, 274], [x + 12, 286], [x + 24, 283], [x + 18, 278], [x + 14, 270], [x + 18, 258]], 0.1));
    }
    paint(dr, feet, NEAR_BLACK);
    // the long serpent body, sweeping left in a great arc from the queen to the head that rises at its far end; laid on
    // dark, then scaled in green and gold with a dark scallop to every scale
    const bodyRef: Array<[number, number]> = [[56, 92], [36, 128], [22, 170], [26, 214], [48, 246], [92, 262], [160, 268], [240, 266], [310, 258], [350, 240], [364, 210], [352, 184], [300, 180], [240, 180], [192, 175], [148, 162], [118, 138], [104, 112], [100, 92]];
    const body = shape(bodyRef);
    paint(dr, outline(body), NEAR_BLACK);
    const inner = scaleAbout(body, ...A(190, 190), 0.97, 0.955);
    paint(dr, outline(inner), SCALE_GOLD);
    within(dr, outline(inner), () => {
      const inside = (x: number, y: number): boolean => {
        let hit = false;
        for (let i = 0, j = bodyRef.length - 1; i < bodyRef.length; j = i++) {
          const [xi, yi] = A(...bodyRef[i]!);
          const [xj, yj] = A(...bodyRef[j]!);
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
        }
        return hit;
      };
      const r = 1.45;
      let greens = '';
      let scallops = '';
      for (let row = 0; row < 22; row++) {
        const y = Y0 + 9 + row * 2.2;
        for (let col = 0; col < 32; col++) {
          const x = X0 + 2 + col * r * 2 + (row % 2) * r;
          if (!inside(x, y + 0.6)) continue;
          const arc = `M${x - r} ${y.toFixed(1)}a${r} ${r} 0 0 0 ${2 * r} 0`;
          if ((col + Math.floor(row / 2)) % 2) greens += `${arc}Z`;
          scallops += arc;
        }
      }
      paint(dr, greens, SCALE_GREEN);
      dr.add(`<path d="${scallops}" fill="none" stroke="${NEAR_BLACK}" stroke-width="0.4"/>`);
    });
    // the cape wrapped round her body below the queen: gold, orange and red, scalloped
    const cape = shape([[356, 192], [330, 180], [262, 182], [214, 188], [204, 204], [214, 228], [262, 240], [330, 234], [358, 222]]);
    paint(dr, outline(cape), NEAR_BLACK);
    const capeIn = scaleAbout(cape, ...A(282, 210), 0.95, 0.88);
    paint(dr, outline(capeIn), '#e0802c');
    within(dr, outline(capeIn), () => {
      // laid in rows of scales like feathers, yellow at the top, then orange edged in red, then red
      let yellow = '';
      let red = '';
      let edges = '';
      for (let row = 0; row < 4; row++) {
        for (let i = 0; i < 12; i++) {
          const [x, y] = A(206 + i * 14 + (row % 2) * 7, 184 + row * 13);
          const arc = `M${(x - 1.6).toFixed(1)} ${y.toFixed(1)}a1.6 1.6 0 0 0 3.2 0`;
          if (row === 0) yellow += `${arc}Z`;
          if (row === 3) red += `${arc}Z`;
          edges += arc;
        }
      }
      paint(dr, polygon([A(196, 168), A(372, 168), A(372, 186), A(196, 186)]), '#f2c44a');
      paint(dr, yellow, '#f2c44a');
      paint(dr, polygon([A(196, 226), A(372, 224), A(372, 252), A(196, 252)]) + red, '#c3372c');
      dr.add(`<path d="${edges}" fill="none" stroke="#a82a22" stroke-width="0.45"/>`);
    });
    // the head at the arc's far end: dark, its mouth open on a red forked tongue that reaches toward the queen, a red
    // and gold collar at its neck, a gold eye
    paint(dr, brush([A(150, 63), A(184, 56), A(214, 50)], 0.8, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }) + brush([A(208, 51), A(222, 44)], 0.6, rnd, { count: 4 }) + brush([A(208, 51), A(222, 56)], 0.6, rnd, { count: 4 }), '#c8302a');
    const head = shape([[50, 74], [68, 56], [100, 49], [134, 49], [160, 53], [176, 58], [150, 63], [170, 70], [140, 79], [112, 87], [84, 97], [58, 97]]);
    paint(dr, outline(head), NEAR_BLACK);
    within(dr, outline(head), () => {
      let dots = '';
      for (const [x, y] of [[80, 66], [96, 60], [112, 58], [92, 76], [108, 72], [126, 66], [74, 84]] as const) {
        const [cx, cy] = A(x, y);
        dots += ellipse(cx, cy, 0.7, 0.55);
      }
      paint(dr, dots, '#3c4a32');
    });
    const [ex, ey] = A(122, 60);
    paint(dr, touch(ex, ey, 3.8, 2, -6), '#f3e3b4');
    paint(dr, ellipse(ex + 0.4, ey, 0.75, 0.8), NEAR_BLACK);
    paint(dr, brush([A(56, 86), A(66, 96), A(74, 104)], 2.6, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }), '#c8302a');
    paint(dr, ellipse(...A(62, 92), 0.6, 0.6) + ellipse(...A(68, 99), 0.6, 0.6), '#f2c44a');
    // its own crown, a fan of gold petals striped with red, rising from the top of its head
    let fan = '';
    let edge = '';
    let stripes = '';
    const base = A(96, 50);
    for (let i = 0; i < 7; i++) {
      const a = ((196 + i * 22) * Math.PI) / 180;
      const tip: Pt = [base[0] + Math.cos(a) * 13.4, base[1] + Math.sin(a) * 10.6];
      const petal = tremble([base, [base[0] + Math.cos(a - 0.2) * 9, base[1] + Math.sin(a - 0.2) * 7.4], tip, [base[0] + Math.cos(a + 0.2) * 9, base[1] + Math.sin(a + 0.2) * 7.4]], rnd, 0.1);
      edge += outline(scaleAbout(petal, base[0], base[1], 1.1));
      fan += outline(petal);
      stripes += brush([[base[0] + Math.cos(a) * 3, base[1] + Math.sin(a) * 2.4], [base[0] + Math.cos(a) * 9.6, base[1] + Math.sin(a) * 7.6]], 0.9, rnd, { start: 0.4, end: 0.2, count: 4 });
    }
    paint(dr, edge, NEAR_BLACK);
    paint(dr, fan, '#f0c040');
    paint(dr, stripes, '#c8302a');
    paint(dr, outline(roundish(base[0], base[1] + 0.4, 4.4, 1.6, rnd, { count: 10 })), '#c8302a');
    // the queen: long black hair framing her face and falling behind it, her horns curving up from her crown with green
    // spirals and hanging drops, the tall crown with its leaves, her layered necklace and its heart
    const horn = (pts: Array<[number, number]>): void => paint(dr, brush(pts.map(([x, y]) => A(x, y)), 2.4, rnd, { start: 1, end: 0.05, peak: 0.05, count: 12 }), NEAR_BLACK);
    horn([[282, 88], [262, 52], [238, 24], [222, 10]]);
    horn([[326, 88], [346, 54], [370, 28], [386, 16]]);
    const spiral = (cx: number, cy: number, s: number): void => {
      const pts: Pt[] = [];
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * Math.PI * 3 * s - Math.PI / 2;
        const r = 3.3 * (1 - i / 17);
        pts.push([A(cx, cy)[0] + Math.cos(a) * r, A(cx, cy)[1] + Math.sin(a) * r * 0.95]);
      }
      paint(dr, brush(pts, 1.5, rnd, { start: 0.8, end: 0.4, peak: 0.2, count: 18 }), '#5f9a38');
      paint(dr, brush(pts.slice(2), 0.5, rnd, { start: 0.6, end: 0.2, count: 14 }), '#a8cf6a');
    };
    spiral(244, 66, 1);
    spiral(364, 70, -1);
    let drops = '';
    let beads = '';
    for (const [x, y, l] of [[236, 80, 22], [252, 82, 30], [356, 84, 30], [372, 82, 22]] as const) {
      drops += brush([A(x, y), A(x, y + l)], 0.35, rnd, { start: 1, end: 1, count: 4 });
      beads += ellipse(...A(x, y + l + 4), 0.9, 1.2);
    }
    paint(dr, drops, '#8a6a2a');
    paint(dr, beads, '#c8302a');
    paint(dr, outline(shape([[300, 70], [272, 84], [256, 110], [250, 148], [254, 188], [272, 192], [286, 176], [324, 176], [336, 192], [354, 188], [358, 148], [350, 110], [334, 84]])), '#141210');
    const face = shape([[303, 92], [322, 100], [330, 124], [324, 150], [304, 162], [284, 150], [278, 124], [286, 100]]);
    paint(dr, outline(face), '#f4e6d8');
    paint(dr, polygon(shape([[286, 100], [303, 90], [322, 100], [320, 110], [303, 104], [288, 110]], 0.05)), '#141210');
    const [lx, ly] = A(291, 124);
    const [rx, ry] = A(315, 124);
    paint(dr, touch(lx, ly, 3, 1.4, -6) + touch(rx, ry, 3, 1.4, 6), '#1e1410');
    paint(dr, ellipse(lx + 0.3, ly - 0.2, 0.3, 0.3) + ellipse(rx + 0.3, ry - 0.2, 0.3, 0.3), '#fbf3e4');
    paint(dr, brush([A(282, 114), A(290, 110), A(298, 113)], 0.4, rnd, { count: 4 }) + brush([A(308, 113), A(316, 110), A(324, 114)], 0.4, rnd, { count: 4 }) + brush([A(303, 124), A(304, 136), A(301, 138)], 0.3, rnd, { count: 4 }), '#6a4030');
    paint(dr, touch(...A(303, 147), 2.8, 1.3, 0), '#c23a36');
    paint(dr, touch(...A(288, 138), 2.6, 1.4, 0) + touch(...A(318, 138), 2.6, 1.4, 0), '#e8998a', 0.5);
    paint(dr, polygon(shape([[294, 160], [312, 160], [314, 176], [292, 176]], 0.05)), '#f4e6d8');
    for (const [sag, colour] of [[180, '#c8302a'], [188, '#e0aa3e'], [196, '#c8302a']] as const) {
      paint(dr, brush([A(282, 168), A(303, sag), A(326, 168)], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 8 }), colour);
    }
    const [hxp, hyp] = A(303, 206);
    paint(dr, `M${hxp.toFixed(1)} ${(hyp + 2).toFixed(1)}c-2.6 -1.6 -3 -3.6 -1.4 -4.2c0.8 -0.3 1.2 0.2 1.4 0.6c0.2 -0.4 0.6 -0.9 1.4 -0.6c1.6 0.6 1.2 2.6 -1.4 4.2Z`, '#c8302a');
    // the crown, tall: a band of red and gold on her brow, a gold body banded with red, green leaves round its top, a
    // gold cup at its peak
    const crown = shape([[276, 92], [282, 58], [292, 42], [314, 42], [324, 58], [330, 92]]);
    paint(dr, outline(crown), '#e2ad38');
    within(dr, outline(crown), () => paint(dr, polygon([A(270, 76), A(336, 76), A(336, 84), A(270, 84)]) + polygon([A(270, 58), A(336, 58), A(336, 64), A(270, 64)]), '#c8302a'));
    paint(dr, polygon([A(274, 86), A(332, 86), A(332, 96), A(274, 96)]), '#c8302a');
    let gems = '';
    for (const x of [282, 293, 303, 313, 324]) gems += ellipse(...A(x, 91), 0.7, 0.7);
    paint(dr, gems, '#f2c44a');
    let leaves = '';
    for (const [x, deg] of [[286, -120], [294, -105], [303, -90], [312, -75], [320, -60]] as const) {
      const a = (deg * Math.PI) / 180;
      const [bx, by] = A(x, 44);
      leaves += touch(bx + Math.cos(a) * 2.6, by + Math.sin(a) * 2.6, 6, 1.8, deg);
    }
    paint(dr, leaves, '#5f9a38');
    const [cx, cy] = A(303, 22);
    paint(dr, polygon([[cx - 2.2, cy - 2], [cx + 2.2, cy - 2], [cx + 1, cy + 1.6], [cx + 0.4, cy + 3.6], [cx - 0.4, cy + 3.6], [cx - 1, cy + 1.6]]), '#e2ad38');
    paint(dr, ellipse(cx, cy - 2.6, 1, 0.9), '#c8302a');
  });
}
