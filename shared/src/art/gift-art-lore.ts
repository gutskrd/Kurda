/**
 * The gifts from the old stories (gift-art.ts): Kawa's hammer, from the Newroz legend of the smith who rose against the
 * tyrant, forged in Damascus steel with the sun of Kurdistan on its plate; and Şahmaran, queen of the serpents, as the
 * owner's folk painting shows her, framed to hang on a wall and painted afresh rather than traced.
 */
import { type Drawing, type Pt } from './svg.js';
import { along, brush, ellipse, floor, FLOOR, outline, paint, polygon, roundish, runs, scaleAbout, streaks, touch, tremble, within, type Rnd, type Tone } from './gift-paint.js';

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
/** A number to a tenth, as a path writes it. */
const n1 = (v: number): string => String(Math.round(v * 10) / 10);
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
  const K = W / 410;
  const A = (x: number, y: number): Pt => [X0 + x * K, Y0 + (y / 307) * H];
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
    // her body is one thick curve: up from under the queen, along the bottom and round, rising on the left to the head.
    // It is laid along its middle line, each point with its half-width, so the outline and the rows of scales follow
    // the same curve; N is the side away from the bend
    const spine: Array<[number, number, number]> = [[100, 86, 16], [84, 100, 22], [62, 122, 27], [48, 154, 30], [50, 188, 33], [66, 216, 36], [100, 232, 39], [150, 230, 40], [210, 229, 40], [270, 228, 40], [320, 226, 38], [356, 222, 32]];
    const SAMPLES = 64;
    const line = along(spine.map(([x, y]) => A(x, y)), SAMPLES);
    const widths = along(spine.map(([, , w], i): Pt => [i, w * K]), SAMPLES).map(([, w]) => w);
    const frames = line.map((p, i) => {
      const a = line[Math.max(0, i - 1)]!;
      const b = line[Math.min(SAMPLES, i + 1)]!;
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const T: Pt = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
      return { p, T, N: [-T[1], T[0]] as Pt, w: widths[i]! };
    });
    const coarse = frames.filter((_, i) => i % 2 === 0);
    const offset = (grow: number): Pt[] => [
      ...coarse.map(({ p, N, w }): Pt => [p[0] + N[0] * (w + grow), p[1] + N[1] * (w + grow)]),
      ...coarse.slice().reverse().map(({ p, N, w }): Pt => [p[0] - N[0] * (w + grow), p[1] - N[1] * (w + grow)]),
    ];
    // the row of small feet under its bottom run, each curling like a wave
    let feet = '';
    for (const i of [22, 27, 32, 37, 42, 47, 52]) {
      const { p, N, w } = frames[i]!;
      const [bx, by] = [p[0] + N[0] * w, p[1] + N[1] * w];
      feet += outline(tremble([[bx - 1.2, by - 0.6], [bx - 0.6, by + 2.6], [bx + 1.6, by + 4.8], [bx + 4.4, by + 4.2], [bx + 3, by + 3.4], [bx + 2.2, by + 1.8], [bx + 2.6, by - 0.6]], rnd, 0.08));
    }
    paint(dr, feet, NEAR_BLACK);
    const body = tremble(offset(0), rnd, 0.12);
    paint(dr, outline(tremble(offset(0.9), rnd, 0.12)), NEAR_BLACK);
    paint(dr, outline(body), SCALE_GOLD);
    within(dr, outline(body), () => {
      // the scales in rows across the body, spaced evenly along it, each one's round edge toward the tail, mostly green
      // with gold ones among them
      const r = 1.5;
      const STEP = 2.5;
      const run = [0];
      for (let i = 1; i <= SAMPLES; i++) run.push(run[i - 1]! + Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]));
      let greens = '';
      let scallops = '';
      for (let d = 1, i = 0; d < run[SAMPLES]!; d += STEP) {
        while (i < SAMPLES - 1 && run[i + 1]! < d) i++;
        const { p, T, N, w } = frames[i]!;
        const rows = Math.max(2, Math.round(w / (r * 1.15)));
        for (let j = -rows; j <= rows; j++) {
          const o = (j / rows) * w * 0.98;
          const slide = (j % 2 ? 0.5 : 0) * STEP;
          const x0 = p[0] + N[0] * (o - r) + T[0] * slide;
          const y0 = p[1] + N[1] * (o - r) + T[1] * slide;
          const arc = `M${n1(x0)} ${n1(y0)}a${r} ${r} 0 0 1 ${n1(N[0] * 2 * r)} ${n1(N[1] * 2 * r)}`;
          if (rnd() < 0.6) greens += `${arc}Z`;
          scallops += arc;
        }
      }
      paint(dr, greens, SCALE_GREEN);
      dr.add(`<path d="${scallops}" fill="none" stroke="${NEAR_BLACK}" stroke-width="0.38"/>`);
    });
    // the head rising at the left, level with the queen's crown and facing her: dark, its jaw open on a red forked
    // tongue that reaches across toward her, white teeth, a gold eye, a beaded collar where its neck begins
    paint(dr, brush([A(140, 61), A(184, 54), A(222, 46)], 0.8, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }) + brush([A(216, 47), A(232, 40)], 0.6, rnd, { count: 4 }) + brush([A(216, 47), A(232, 52)], 0.6, rnd, { count: 4 }), '#c8302a');
    const head = shape([[56, 82], [62, 64], [82, 51], [108, 44], [134, 42], [156, 44], [173, 49], [166, 54], [150, 59], [137, 63], [152, 64], [166, 62], [158, 70], [134, 82], [110, 94], [88, 104], [66, 100]]);
    paint(dr, outline(scaleAbout(head, ...A(112, 72), 1.04)), NEAR_BLACK);
    paint(dr, outline(head), '#232a20');
    within(dr, outline(head), () => {
      let dots = '';
      for (const [x, y] of [[76, 70], [90, 60], [104, 54], [86, 82], [100, 74], [120, 68], [72, 88], [112, 86]] as const) dots += ellipse(...A(x, y), 0.65, 0.5);
      paint(dr, dots, '#4a5a3a');
    });
    let teeth = '';
    for (const x of [142, 150, 158, 165]) {
      const [tx, ty] = A(x, 57 - (x - 140) * 0.18);
      teeth += polygon([[tx - 0.6, ty], [tx + 0.6, ty], [tx, ty + 1.3]]);
    }
    paint(dr, teeth, '#f4eee0');
    const [ex, ey] = A(114, 56);
    paint(dr, touch(ex, ey, 3.6, 1.9, -8), '#f3e3b4');
    paint(dr, ellipse(ex + 0.4, ey, 0.75, 0.8), NEAR_BLACK);
    paint(dr, brush([A(58, 74), A(62, 92), A(70, 108)], 2.4, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }), '#c8302a');
    paint(dr, ellipse(...A(59, 80), 0.6, 0.6) + ellipse(...A(62, 92), 0.6, 0.6) + ellipse(...A(67, 103), 0.6, 0.6), '#f2c44a');
    // its own crown: a fan of gold petals striped with red, rising from the top of its head almost to the frame
    let fan = '';
    let edge = '';
    let stripes = '';
    const base = A(100, 46);
    for (const [x, y] of [[30, 36], [38, 18], [54, 6], [76, 1], [100, 2], [124, 5], [148, 10]] as const) {
      const tip = A(x, y);
      const [dx, dy] = [tip[0] - base[0], tip[1] - base[1]];
      const l = Math.hypot(dx, dy);
      const [nx, ny] = [-dy / l, dx / l];
      const petal = tremble([base, [base[0] + dx * 0.6 + nx * 1.7, base[1] + dy * 0.6 + ny * 1.7], tip, [base[0] + dx * 0.6 - nx * 1.7, base[1] + dy * 0.6 - ny * 1.7]], rnd, 0.08);
      edge += outline(scaleAbout(petal, base[0], base[1], 1.08));
      fan += outline(petal);
      stripes += brush([[base[0] + dx * 0.25, base[1] + dy * 0.25], [base[0] + dx * 0.72, base[1] + dy * 0.72]], 0.8, rnd, { start: 0.4, end: 0.2, count: 4 });
    }
    paint(dr, edge, NEAR_BLACK);
    paint(dr, fan, '#f0c040');
    paint(dr, stripes, '#c8302a');
    paint(dr, outline(roundish(base[0], base[1] + 0.3, 4.2, 1.6, rnd, { count: 10 })), '#c8302a');
    // the queen, large on the right: horns curving up from her crown with green spirals and hanging drops, her long
    // black hair falling past her shoulders into her body, her face, her layered necklace and its heart, the cape of
    // scales at her shoulders where her body begins, and the tall crown
    const horn = (pts: Array<[number, number]>): void => paint(dr, brush(pts.map(([x, y]) => A(x, y)), 2.6, rnd, { start: 1, end: 0.05, peak: 0.05, count: 12 }), NEAR_BLACK);
    horn([[278, 96], [250, 58], [224, 22], [206, 4]]);
    horn([[328, 96], [352, 60], [372, 28], [388, 12]]);
    const spiral = (cx: number, cy: number, s: number): void => {
      const pts: Pt[] = [];
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * Math.PI * 3 * s - Math.PI / 2;
        const r = 4.2 * (1 - i / 17);
        pts.push([A(cx, cy)[0] + Math.cos(a) * r, A(cx, cy)[1] + Math.sin(a) * r * 0.95]);
      }
      paint(dr, brush(pts, 1.8, rnd, { start: 0.8, end: 0.4, peak: 0.2, count: 18 }), '#5f9a38');
      paint(dr, brush(pts.slice(2), 0.6, rnd, { start: 0.6, end: 0.2, count: 14 }), '#a8cf6a');
    };
    spiral(244, 78, 1);
    spiral(364, 76, -1);
    let drops = '';
    let beads = '';
    for (const [x, y, l] of [[238, 98, 18], [256, 100, 26], [350, 100, 34], [368, 98, 20]] as const) {
      drops += brush([A(x, y), A(x, y + l)], 0.35, rnd, { start: 1, end: 1, count: 4 });
      beads += ellipse(...A(x, y + l + 4), 0.9, 1.2);
    }
    paint(dr, drops, '#8a6a2a');
    paint(dr, beads, '#c8302a');
    paint(dr, outline(shape([[270, 92], [260, 114], [252, 142], [242, 168], [228, 190], [254, 194], [276, 184], [328, 184], [346, 204], [354, 232], [362, 212], [360, 178], [352, 140], [344, 112], [336, 92]])), '#141210');
    const cape = shape([[226, 186], [262, 176], [300, 188], [340, 182], [361, 198], [358, 234], [300, 240], [250, 230], [226, 212]]);
    paint(dr, outline(cape), NEAR_BLACK);
    const capeIn = scaleAbout(cape, ...A(292, 208), 0.95, 0.88);
    paint(dr, outline(capeIn), '#e0802c');
    within(dr, outline(capeIn), () => {
      let yellow = '';
      let red = '';
      let edges = '';
      for (let row = 0; row < 4; row++) {
        for (let i = 0; i < 12; i++) {
          const [x, y] = A(222 + i * 13 + (row % 2) * 6.5, 186 + row * 13);
          const arc = `M${(x - 1.5).toFixed(1)} ${y.toFixed(1)}a1.5 1.5 0 0 0 3 0`;
          if (row === 0) yellow += `${arc}Z`;
          if (row === 3) red += `${arc}Z`;
          edges += arc;
        }
      }
      paint(dr, polygon([A(220, 170), A(366, 170), A(366, 188), A(220, 188)]) + yellow, '#f2c44a');
      paint(dr, polygon([A(220, 228), A(366, 226), A(366, 250), A(220, 250)]) + red, '#c3372c');
      dr.add(`<path d="${edges}" fill="none" stroke="#a82a22" stroke-width="0.45"/>`);
    });
    paint(dr, polygon(shape([[286, 156], [318, 156], [330, 184], [274, 184]], 0.05)), '#f4e6d8');
    const face = shape([[302, 92], [324, 100], [331, 126], [325, 154], [303, 168], [281, 154], [275, 126], [281, 100]]);
    paint(dr, outline(face), '#f4e6d8');
    paint(dr, polygon(shape([[281, 102], [302, 92], [324, 102], [320, 110], [302, 105], [285, 110]], 0.05)), '#141210');
    const [lx, ly] = A(290, 124);
    const [rx, ry] = A(315, 124);
    paint(dr, touch(lx, ly, 3.4, 1.6, -6) + touch(rx, ry, 3.4, 1.6, 6), '#1e1410');
    paint(dr, ellipse(lx + 0.3, ly - 0.2, 0.32, 0.32) + ellipse(rx + 0.3, ry - 0.2, 0.32, 0.32), '#fbf3e4');
    paint(dr, brush([A(280, 114), A(289, 110), A(298, 113)], 0.42, rnd, { count: 4 }) + brush([A(307, 113), A(316, 110), A(325, 114)], 0.42, rnd, { count: 4 }) + brush([A(303, 124), A(304, 138), A(300, 140)], 0.32, rnd, { count: 4 }), '#6a4030');
    paint(dr, touch(...A(302, 151), 3, 1.4, 0), '#c23a36');
    paint(dr, touch(...A(287, 140), 2.8, 1.5, 0) + touch(...A(318, 140), 2.8, 1.5, 0), '#e8998a', 0.5);
    for (const [sag, colour] of [[176, '#c8302a'], [184, '#e0aa3e'], [192, '#c8302a']] as const) {
      paint(dr, brush([A(282, 162), A(302, sag), A(324, 162)], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 8 }), colour);
    }
    const [hxp, hyp] = A(302, 204);
    paint(dr, `M${hxp.toFixed(1)} ${(hyp + 2.2).toFixed(1)}c-2.8 -1.7 -3.2 -3.9 -1.5 -4.5c0.9 -0.3 1.3 0.2 1.5 0.6c0.2 -0.4 0.6 -0.9 1.5 -0.6c1.7 0.6 1.3 2.8 -1.5 4.5Z`, '#c8302a');
    // the crown, tall, reaching almost to the frame: a band of red and gold over her brow, a gold body banded with red,
    // green and gold leaves round its top, a gold cup at its peak
    const crown = shape([[274, 96], [280, 58], [290, 38], [314, 38], [324, 58], [330, 96]]);
    paint(dr, outline(crown), '#e2ad38');
    within(dr, outline(crown), () => paint(dr, polygon([A(268, 78), A(336, 78), A(336, 86), A(268, 86)]) + polygon([A(268, 56), A(336, 56), A(336, 62), A(268, 62)]), '#c8302a'));
    paint(dr, polygon([A(272, 88), A(332, 88), A(332, 100), A(272, 100)]), '#c8302a');
    let gems = '';
    for (const x of [280, 291, 302, 313, 324]) gems += ellipse(...A(x, 94), 0.75, 0.75);
    paint(dr, gems, '#f2c44a');
    let leaves = '';
    let golds = '';
    for (const [x, deg] of [[283, -122], [291, -106], [302, -90], [313, -74], [321, -58]] as const) {
      const a = (deg * Math.PI) / 180;
      const [bx, by] = A(x, 40);
      leaves += touch(bx + Math.cos(a) * 3, by + Math.sin(a) * 3, 6.6, 1.9, deg);
      golds += touch(bx + Math.cos(a) * 2, by + Math.sin(a) * 2, 3.4, 0.8, deg);
    }
    paint(dr, leaves, '#5f9a38');
    paint(dr, golds, '#f2c44a');
    const [cx, cy] = A(303, 16);
    paint(dr, polygon([[cx - 2.4, cy - 2.4], [cx + 2.4, cy - 2.4], [cx + 1.1, cy + 1.6], [cx + 0.4, cy + 4], [cx - 0.4, cy + 4], [cx - 1.1, cy + 1.6]]), '#e2ad38');
    paint(dr, ellipse(cx, cy - 3, 1.1, 1), '#c8302a');
  });
}
