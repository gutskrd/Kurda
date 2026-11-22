/**
 * Impostor's pictures: one per word category, one for "any category", one per way to play, and the game's emblems,
 * where every player who holds the word is a deer and the impostor is a wolf.
 * They use the cut-out style (cutout.ts) of the Letters and words cards: one familiar object per category, with no text
 * or numerals (numbers are counted in beads). Categories are named by slug (api/src/games/word-categories.ts lists the
 * starter ones); a slug with no picture here gets the generic label tag, so a tile is never empty. Each picture has its
 * own tile tint (`impostorCategoryTone`).
 */
import { GAME_NAMES } from '../games/names.js';
import { bead, dot, fill, form, line, ring, rr, tones, turned, type Tones } from './cutout.js';
import { letter, letterWidth } from './ink.js';
import { Drawing, checkSize, n, prefixFor, tint } from './svg.js';

export type ImpostorWay = 'classic' | 'blind' | 'odd';
export type ImpostorEmblem = 'cards' | 'back' | 'wolf' | 'deer';

export interface ImpostorArtOptions {
  /** Size in pixels; the drawing is square. */
  size?: number;
  /** The accessible label; the apps print the name beside it and hide the picture from screen readers. */
  title?: string;
  idPrefix?: string;
}

// ───────────────────────────────────────────────────────────── the colours

const RED = '#d8493b';
const GOLD = '#f2b632';
const GREEN = '#3fa45b';
const BLUE = '#3d8bd9';
const SKY = '#74bdea';
const PURPLE = '#8a5bd6';
const PINK = '#e96a9c';
const ORANGE = '#f08a34';
const TEAL = '#2fa7a0';
const BROWN = '#a8683a';
const STEEL = '#9aa5b4';
const NIGHT = '#3b2f63';
/** The deep tone for lines and pupils, never black. */
const INK = '#3a2b4d';
const CREAM: Tones = { light: '#fffaf1', base: '#f6ead6', shade: '#cdb898' };
const WHITE: Tones = { light: '#ffffff', base: '#eef2f7', shade: '#bcc6d4' };
const WOOD: Tones = { light: '#f3cf9c', base: '#dba869', shade: '#a2733c' };
const SKIN: Tones = { light: '#fbe3c8', base: '#f0c9a0', shade: '#c79a6c' };


/** A four-pointed sparkle about a point, its arms `r` long. */
const sparkle = (cx: number, cy: number, r: number): string => {
  const k = r * 0.16;
  return (
    `M${n(cx)} ${n(cy - r)}C${n(cx + k)} ${n(cy - k * 2.6)} ${n(cx + k * 2.6)} ${n(cy - k)} ${n(cx + r)} ${n(cy)}` +
    `C${n(cx + k * 2.6)} ${n(cy + k)} ${n(cx + k)} ${n(cy + k * 2.6)} ${n(cx)} ${n(cy + r)}` +
    `C${n(cx - k)} ${n(cy + k * 2.6)} ${n(cx - k * 2.6)} ${n(cy + k)} ${n(cx - r)} ${n(cy)}` +
    `C${n(cx - k * 2.6)} ${n(cy - k)} ${n(cx - k)} ${n(cy - k * 2.6)} ${n(cx)} ${n(cy - r)}Z`
  );
};
/** A five-pointed star about a point. */
const star = (cx: number, cy: number, r: number): string => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${n(cx + rad * Math.cos(a))} ${n(cy + rad * Math.sin(a))}`);
  }
  return `M${pts.join('L')}Z`;
};
/** A person as a playing piece: a round head on rounded shoulders, with no face. */
function piece(dr: Drawing, cx: number, top: number, head: number, width: number, height: number, hex: string): void {
  form(dr, rr(cx - width / 2, top + head * 2 - 2, width, height, width / 2), tones(hex), 4, 2.2);
  form(dr, ring(cx, top + head, head), SKIN, 3, 2);
}

// ─────────────────────────────────────────────────────────── the categories

type Draw = (dr: Drawing) => void;

/** A paw: the pad and four toes. */
const animals: Draw = (dr) => {
  const fur = tones(BROWN);
  form(dr, 'M60 56C76 56 90 70 90 84C90 97 78 102 60 99C42 102 30 97 30 84C30 70 44 56 60 56Z', fur, 4, 2.4);
  for (const [x, y, a] of [[27, 50, -24], [47, 31, -8], [73, 31, 8], [93, 50, 24]] as const) {
    turned(dr, a, x, y, () => form(dr, `M${x} ${y - 13}C${x + 8} ${y - 13} ${x + 10} ${y - 2} ${x + 10} ${y + 3}C${x + 10} ${y + 9} ${x + 5} ${y + 13} ${x} ${y + 13}C${x - 5} ${y + 13} ${x - 10} ${y + 9} ${x - 10} ${y + 3}C${x - 10} ${y - 2} ${x - 8} ${y - 13} ${x} ${y - 13}Z`, fur, 3, 2));
  }
};

/** A loaf of bread, scored three times across its crust. */
const food: Draw = (dr) => {
  const crust: Tones = { light: '#f6cf94', base: '#e2a95c', shade: '#a9742f' };
  form(dr, 'M14 72C14 48 34 34 60 34C86 34 106 48 106 72C106 82 98 88 88 88H32C22 88 14 82 14 72Z', crust, 6, 2.8);
  for (const x of [36, 56, 76]) {
    turned(dr, 24, x + 4, 56, () => form(dr, rr(x, 46, 9, 22, 4.5), { light: '#fbe7c2', base: '#f7dcae', shade: '#c9924a' }, 0, 1.4));
  }
};

/** An apple, its stalk and one leaf. */
const fruit: Draw = (dr) => {
  line(dr, 'M60 42C60 33 63 26 69 21', '#7a4a22', 5);
  form(dr, 'M67 31C73 20 86 19 93 24C89 35 76 38 67 31Z', tones(GREEN), 2.4, 1.8);
  form(dr, 'M60 42C50 31 24 35 24 62C24 84 41 104 52 104C56 104 58 102 60 102C62 102 64 104 68 104C79 104 96 84 96 62C96 35 70 31 60 42Z', tones(RED), 5, 2.6);
  dr.add('<ellipse cx="41" cy="58" rx="6" ry="10" fill="#f08b7e" transform="rotate(18 41 58)"/>');
};

/** A carrot pulled from the bed, its green still on. */
const vegetables: Draw = (dr) => {
  for (const [a, h] of [[-26, 30], [0, 36], [26, 30]] as const) {
    turned(dr, a, 60, 44, () => form(dr, `M60 46C52 36 52 ${44 - h + 8} 60 ${44 - h}C68 ${44 - h + 8} 68 36 60 46Z`, tones(GREEN), 2.4, 1.8));
  }
  form(dr, 'M44 44C44 38 76 38 76 44C78 62 68 94 60 108C52 94 42 62 44 44Z', tones(ORANGE), 4, 2.6);
  line(dr, 'M50 60H60M62 74H70M54 86H60', tint(ORANGE, -0.28), 3);
};

/** A glass of tea on its saucer: the tulip glass, the tea dark and red. */
const drinks: Draw = (dr) => {
  form(dr, 'M26 98C26 92 94 92 94 98C94 104 26 104 26 98Z', WHITE, 4, 2);
  const glass = 'M43 26H77C77 44 71 50 71 60C71 70 79 74 79 84C79 93 70 98 60 98C50 98 41 93 41 84C41 74 49 70 49 60C49 50 43 44 43 26Z';
  form(dr, glass, { light: '#ffffff', base: '#e6f1f6', shade: '#b4c8d4' }, 0, 2);
  const inside = dr.clip(glass);
  dr.add(`<g clip-path="url(#${inside})"><path d="M36 38H84V100H36Z" fill="#b8431c"/><path d="M36 38H84V44H36Z" fill="#dd6a34"/><path d="M47 44C49 56 53 60 53 72C53 80 47 82 47 88" fill="none" stroke="#e98a56" stroke-width="3" stroke-linecap="round"/></g>`);
  fill(dr, 'M43 26H77V30H43Z', '#ffffff', ' fill-opacity="0.7"');
};

/** A family: two grown-ups and a child between them. */
const family: Draw = (dr) => {
  piece(dr, 36, 22, 12, 30, 52, RED);
  piece(dr, 84, 22, 12, 30, 52, BLUE);
  piece(dr, 60, 52, 9.5, 24, 34, GOLD);
};

/** An eye, for the body. */
const body: Draw = (dr) => {
  form(dr, 'M12 60C28 36 46 28 60 28C74 28 92 36 108 60C92 84 74 92 60 92C46 92 28 84 12 60Z', WHITE, 4, 2.4);
  form(dr, ring(60, 60, 21), tones('#7a5236'), 0, 3);
  dot(dr, 60, 60, 10, INK);
  dot(dr, 53, 53, 4.5, '#ffffff');
};

/** A shirt. */
const clothes: Draw = (dr) => {
  form(dr, 'M40 22L50 20C53 28 67 28 70 20L80 22L104 40L94 58L82 50V98C82 101 80 102 78 102H42C40 102 38 101 38 98V50L26 58L16 40Z', tones(BLUE), 5, 2.6);
  line(dr, 'M50 21C53 31 67 31 70 21', tint(BLUE, -0.3), 3);
  for (const y of [48, 62, 76]) dot(dr, 60, y, 2.6, tint(BLUE, 0.6));
};

/** A house: its roof, its door and a lit window. */
const home: Draw = (dr) => {
  form(dr, rr(28, 54, 64, 46, 6), CREAM, 5, 2.4);
  form(dr, rr(52, 70, 17, 30, 4), tones(BROWN), 0, 2);
  form(dr, rr(34, 66, 12, 13, 3), tones(GOLD), 0, 1.6);
  form(dr, rr(75, 66, 12, 13, 3), tones(GOLD), 0, 1.6);
  form(dr, 'M14 60L55 24Q60 20 65 24L106 60Q108 64 104 64H16Q12 64 14 60Z', tones(RED), 4, 2.6);
  form(dr, rr(78, 26, 10, 20, 2), tones(BROWN), 0, 1.6);
};

/** A worker's helmet. */
const jobs: Draw = (dr) => {
  form(dr, 'M24 80C24 52 40 32 60 32C80 32 96 52 96 80Z', tones(GOLD), 0, 2.6);
  form(dr, rr(54, 26, 12, 34, 6), tones(tint(GOLD, 0.2)), 0, 2);
  form(dr, rr(12, 76, 96, 14, 7), tones(tint(GOLD, -0.12)), 5, 2.4);
};

/** Two mountains under the sun, snow on the far one. */
const nature: Draw = (dr) => {
  bead(dr, 86, 34, 13, GOLD, 3);
  form(dr, 'M40 98L72 40Q76 34 80 40L112 98Z', tones('#6f8fb0'), 0, 2.6);
  fill(dr, 'M72 40Q76 34 80 40L89 56L81 52L76 59L70 52L63 56Z', '#ffffff');
  form(dr, 'M6 98L40 48Q44 42 48 48L82 98Z', tones(GREEN), 0, 2.6);
  form(dr, rr(6, 94, 108, 10, 5), tones(tint(GREEN, -0.18)), 4, 2);
};

/** A town's roofline: three houses of different heights, their windows lit. */
const town: Draw = (dr) => {
  const lit = '#ffe9a8';
  form(dr, rr(16, 50, 28, 52, 4), tones(BLUE), 4, 2.4);
  form(dr, rr(46, 24, 30, 78, 4), tones(PURPLE), 4, 2.4);
  form(dr, rr(78, 58, 26, 44, 4), tones(ORANGE), 4, 2.4);
  for (const [x, y] of [[22, 58], [33, 58], [22, 72], [33, 72], [53, 32], [64, 32], [53, 46], [64, 46], [53, 60], [64, 60], [84, 66], [93, 66], [84, 80], [93, 80]] as const) {
    fill(dr, rr(x, y, 6, 8, 1.5), lit);
  }
};

/** A car, seen from the side. */
const transport: Draw = (dr) => {
  form(dr, 'M34 62L45 42Q47 38 52 38H76Q81 38 83 42L94 62Z', tones(tint(RED, -0.1)), 0, 2.4);
  fill(dr, 'M44 60L51 46H61V60ZM66 60V46H76L84 60Z', '#cfe8f7');
  form(dr, rr(12, 58, 96, 28, 12), tones(RED), 4, 2.6);
  dot(dr, 100, 68, 3.6, '#ffe9a8');
  for (const x of [36, 84]) {
    dot(dr, x, 88, 12, INK);
    dot(dr, x, 88, 5, STEEL);
  }
};

/** Three dabs of paint, where they meet. */
const colours: Draw = (dr) => {
  bead(dr, 42, 46, 26, RED, 4);
  bead(dr, 78, 46, 26, GOLD, 4);
  bead(dr, 60, 76, 26, BLUE, 4);
};

/** An open book, its lines of writing. */
const school: Draw = (dr) => {
  form(dr, rr(12, 34, 96, 64, 8), tones(BLUE), 5, 2.4);
  form(dr, 'M60 38C50 30 32 30 20 34V88C32 84 50 84 60 92Z', CREAM, 0, 2);
  form(dr, 'M60 38C70 30 88 30 100 34V88C88 84 70 84 60 92Z', CREAM, 0, 2);
  line(dr, 'M28 48C36 46 44 46 52 50M28 60C36 58 44 58 52 62M28 72C36 70 44 70 52 74M68 50C76 46 84 46 92 48M68 62C76 58 84 58 92 60M68 74C76 70 84 70 92 72', '#c3ad8b', 2.6);
  line(dr, 'M60 38V92', '#cdb898', 2.4);
};

/** A clock at ten past ten. */
const time: Draw = (dr) => {
  form(dr, ring(60, 60, 44), tones(RED), 5, 2.6);
  form(dr, ring(60, 60, 34), CREAM, 0, 2.2);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    dot(dr, 60 + 27 * Math.sin(a), 60 - 27 * Math.cos(a), i % 3 === 0 ? 2.6 : 1.5, '#b79f7c');
  }
  line(dr, 'M60 60L46 42M60 60L78 46', INK, 5);
  dot(dr, 60, 60, 4.5, RED);
};

/** A cooking pot with its lid on. */
const kitchen: Draw = (dr) => {
  form(dr, rr(10, 56, 18, 11, 5.5), tones(STEEL), 3, 1.8);
  form(dr, rr(92, 56, 18, 11, 5.5), tones(STEEL), 3, 1.8);
  form(dr, rr(24, 48, 72, 50, 16), tones(TEAL), 5, 2.6);
  form(dr, 'M26 50C26 38 42 32 60 32C78 32 94 38 94 50Z', tones(STEEL), 0, 2.4);
  form(dr, rr(22, 46, 76, 8, 4), tones(tint(STEEL, -0.12)), 0, 1.8);
  bead(dr, 60, 28, 6.5, INK, 2);
};

/** A heart. */
const feelings: Draw = (dr) => {
  form(dr, 'M60 102C22 76 12 56 12 42C12 27 24 16 38 16C47 16 55 21 60 29C65 21 73 16 82 16C96 16 108 27 108 42C108 56 98 76 60 102Z', tones(RED), 5, 2.8);
  dr.add('<ellipse cx="36" cy="38" rx="8" ry="11" fill="#f39386" transform="rotate(-28 36 38)"/>');
};

/** A ball in three colours. */
const play: Draw = (dr) => {
  const ball = ring(60, 60, 42);
  form(dr, ball, tones(GOLD), 5, 2.6);
  const inside = dr.clip(ball);
  dr.add(
    `<g clip-path="url(#${inside})"><path d="M60 60L8 30V-6H60Z" fill="${RED}"/><path d="M60 60L112 30V110H70Z" fill="${BLUE}"/>` +
      `<path d="M60 60L8 30V120H52Z" fill="${tint(GOLD, 0.25)}" fill-opacity="0.35"/></g>`,
  );
  dot(dr, 60, 60, 7, CREAM.light);
  dr.add('<ellipse cx="42" cy="38" rx="9" ry="6" fill="#ffffff" fill-opacity="0.45" transform="rotate(-32 42 38)"/>');
};

/** A def, the frame drum: wooden hoop, stretched skin, the jingling rings inside and a kilim diamond at its heart. */
const music: Draw = (dr) => {
  form(dr, ring(60, 56, 47), WOOD, 9, 2.8);
  form(dr, ring(60, 56, 37), CREAM, 0, 2.2);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    line(dr, ring(60 + 31 * Math.cos(a), 56 + 31 * Math.sin(a), 3.4), STEEL, 2.2);
  }
  fill(dr, 'M60 38L78 56L60 74L42 56Z', tint(RED, -0.04));
  fill(dr, 'M60 46L70 56L60 66L50 56Z', GOLD);
  fill(dr, 'M60 52L64 56L60 60L56 56Z', tint(RED, -0.04));
};

/** The Newroz fire: a stack of logs, leaping flames and sparks. */
const celebrations: Draw = (dr) => {
  turned(dr, -15, 60, 98, () => form(dr, rr(20, 92, 80, 13, 6.5), WOOD, 3, 1.8));
  turned(dr, 15, 60, 98, () => form(dr, rr(20, 92, 80, 13, 6.5), tones(tint(BROWN, 0.12)), 3, 1.8));
  form(dr, 'M60 8C64 26 84 34 88 56C92 78 79 96 60 96C41 96 28 79 32 58C34 45 43 39 45 26C51 34 53 41 55 48C58 34 56 21 60 8Z', tones(RED), 0, 2.6);
  form(dr, 'M61 32C64 45 77 53 77 69C77 84 70 92 60 92C50 92 43 84 43 71C43 62 49 57 51 49C54 55 56 59 57 62C60 53 59 43 61 32Z', tones(ORANGE), 0, 2.2);
  form(dr, 'M60 58C62 66 69 70 69 79C69 86 65 91 60 91C55 91 51 86 51 80C51 73 56 70 57 65C58 68 59 69 60 70Z', tones(GOLD), 0, 1.6);
  for (const [x, y, r] of [[28, 30, 2.8], [92, 22, 2.4], [99, 44, 2], [21, 52, 2]] as const) dot(dr, x, y, r, GOLD);
};

/** A hammer. */
const tools: Draw = (dr) => {
  turned(dr, -32, 60, 60, () => {
    form(dr, rr(53, 40, 14, 70, 7), WOOD, 4, 2.2);
    form(dr, 'M26 20H82Q88 20 88 26V40Q88 46 82 46H26Q22 46 22 42V24Q22 20 26 20Z', tones(STEEL), 4, 2.4);
    fill(dr, rr(70, 20, 6, 26, 0), tint(STEEL, -0.22));
  });
};

/** An ear of wheat. */
const village: Draw = (dr) => {
  line(dr, 'M60 110V40', '#b8862e', 5);
  const grain = (x: number, y: number, a: number): void => {
    turned(dr, a, x, y, () => form(dr, `M${x} ${y - 12}C${x + 8} ${y - 6} ${x + 8} ${y + 6} ${x} ${y + 12}C${x - 8} ${y + 6} ${x - 8} ${y - 6} ${x} ${y - 12}Z`, tones(GOLD), 2.4, 1.8));
  };
  for (const y of [84, 66, 48]) {
    grain(46, y, -32);
    grain(74, y, 32);
  }
  grain(60, 24, 0);
};

/** One bead, then two, then three: the numbers counted. */
const numbers: Draw = (dr) => {
  bead(dr, 60, 28, 13, RED, 3);
  bead(dr, 44, 58, 13, GOLD, 3);
  bead(dr, 76, 58, 13, GOLD, 3);
  bead(dr, 28, 88, 13, GREEN, 3);
  bead(dr, 60, 88, 13, GREEN, 3);
  bead(dr, 92, 88, 13, GREEN, 3);
};

/** The sun coming out from behind a cloud. */
const weather: Draw = (dr) => {
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    line(dr, `M${n(80 + 27 * Math.cos(a))} ${n(40 + 27 * Math.sin(a))}L${n(80 + 34 * Math.cos(a))} ${n(40 + 34 * Math.sin(a))}`, '#f6a82c', 5);
  }
  form(dr, ring(80, 40, 20), tones('#ffc93c'), 3, 2.6);
  form(dr, 'M30 96C17 96 10 87 10 78C10 67 19 60 29 61C32 49 43 42 55 42C68 42 79 51 81 63C92 62 100 70 100 80C100 89 93 96 84 96Z', WHITE, 5, 2.6);
};

/** A capsule, half and half. */
const health: Draw = (dr) => {
  turned(dr, -38, 60, 60, () => {
    form(dr, 'M36 40H60V80H36A20 20 0 0 1 36 40Z', tones(RED), 5, 2.6);
    form(dr, 'M60 40H84A20 20 0 0 1 84 80H60Z', CREAM, 5, 2.6);
    fill(dr, 'M32 48H56V54H30Z', '#f39386');
  });
};

/** Two people side by side. */
const people: Draw = (dr) => {
  piece(dr, 40, 20, 14, 38, 54, TEAL);
  piece(dr, 82, 30, 13, 34, 46, ORANGE);
};

/** A slice of lemon. */
const taste: Draw = (dr) => {
  form(dr, ring(60, 60, 44), tones('#f4c430'), 5, 2.6);
  dot(dr, 60, 60, 36, '#fff6cf');
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const p = (r: number, da: number): string => `${n(60 + r * Math.cos(a + da))} ${n(60 + r * Math.sin(a + da))}`;
    fill(dr, `M${p(7, 0)}L${p(31, -0.32)}Q${p(34, 0)} ${p(31, 0.32)}Z`, '#ffd94a');
  }
};

/** A crown, a jewel on each point. */
const stories: Draw = (dr) => {
  form(dr, 'M22 86L14 40L40 60L60 28L80 60L106 40L98 86Z', tones(GOLD), 0, 2.6);
  form(dr, rr(20, 80, 80, 16, 6), tones(tint(GOLD, -0.14)), 5, 2.4);
  bead(dr, 14, 38, 6.5, RED, 2);
  bead(dr, 60, 26, 7.5, BLUE, 2);
  bead(dr, 106, 38, 6.5, RED, 2);
  for (const x of [38, 60, 82]) dot(dr, x, 88, 3.6, x === 60 ? RED : BLUE);
};

/** Two coins. */
const money: Draw = (dr) => {
  const coin = (cx: number, cy: number, r: number): void => {
    form(dr, ring(cx, cy, r), tones(GOLD), r * 0.16, 2.4);
    line(dr, ring(cx, cy, r * 0.68), tint(GOLD, -0.22), 2.6);
    fill(dr, star(cx, cy, r * 0.36), tint(GOLD, -0.22));
  };
  coin(74, 76, 26);
  coin(46, 46, 32);
};

/** A sparkle and a smaller one: what a thing is like. */
const qualities: Draw = (dr) => {
  form(dr, sparkle(54, 62, 42), tones(GOLD), 4, 2.6);
  form(dr, sparkle(94, 26, 15), tones(SKY), 2, 1.6);
};

/** A face with a smile on it. */
const character: Draw = (dr) => {
  form(dr, ring(60, 60, 44), tones('#ffc93c'), 5, 2.8);
  dr.add(`<ellipse cx="45" cy="52" rx="5" ry="7.5" fill="${INK}"/><ellipse cx="75" cy="52" rx="5" ry="7.5" fill="${INK}"/>`);
  line(dr, 'M40 70C48 84 72 84 80 70', INK, 5);
  dot(dr, 32, 68, 6, '#f6935f');
  dot(dr, 88, 68, 6, '#f6935f');
};

/** A bolt of lightning: something happening. */
const actions: Draw = (dr) => {
  form(dr, 'M70 10L24 66Q22 70 27 70H50L42 108Q42 114 47 109L96 52Q98 48 93 48H68L76 14Q77 6 70 10Z', tones(ORANGE), 5, 2.8);
};

/** A kilim's medallion: a stepped diamond inside a diamond, a small one at its heart. */
const culture: Draw = (dr) => {
  form(dr, 'M60 8L112 60L60 112L8 60Z', tones(RED), 4, 2.8);
  fill(dr, `${rr(52, 24, 16, 72, 0)}${rr(24, 52, 72, 16, 0)}${rr(38, 38, 44, 44, 0)}`, CREAM.base);
  fill(dr, `${rr(54, 36, 12, 48, 0)}${rr(36, 54, 48, 12, 0)}${rr(45, 45, 30, 30, 0)}`, tint(BLUE, -0.1));
  fill(dr, 'M60 49L71 60L60 71L49 60Z', GOLD);
};

/** A speech bubble, three dots in it. */
const language: Draw = (dr) => {
  form(dr, 'M24 20H96Q108 20 108 32V70Q108 82 96 82H58L38 102Q34 105 34 100V82H24Q12 82 12 70V32Q12 20 24 20Z', tones(TEAL), 5, 2.6);
  for (const x of [40, 60, 80]) dot(dr, x, 51, 6.5, CREAM.light);
};

/** A briefcase. */
const work: Draw = (dr) => {
  line(dr, 'M44 44V34Q44 26 52 26H68Q76 26 76 34V44', tint(BROWN, -0.3), 7);
  form(dr, rr(12, 42, 96, 58, 10), tones(BROWN), 5, 2.6);
  fill(dr, rr(12, 64, 96, 6, 0), tint(BROWN, -0.28));
  form(dr, rr(51, 58, 18, 16, 4), tones(GOLD), 2, 1.8);
};

/** A pin in the map. */
const travel: Draw = (dr) => {
  dr.add(`<ellipse cx="60" cy="106" rx="20" ry="5" fill="${INK}" fill-opacity="0.18"/>`);
  form(dr, 'M60 106C38 80 24 64 24 46C24 26 40 10 60 10C80 10 96 26 96 46C96 64 82 80 60 106Z', tones(RED), 3, 2.8);
  form(dr, ring(60, 46, 15), CREAM, 0, 2.2);
};

/** A box, seen from its corner. */
const things: Draw = (dr) => {
  fill(dr, 'M20 42L60 60V110L20 92Z', WOOD.base);
  fill(dr, 'M100 42L60 60V110L100 92Z', WOOD.shade);
  fill(dr, 'M60 22L100 42L60 60L20 42Z', WOOD.light);
  fill(dr, 'M52 26L92 46L84 50L44 30Z', tint(RED, 0.05));
  fill(dr, 'M84 50L92 46V62L84 66Z', tint(RED, -0.25));
};

/** A medal on its ribbon. */
const sports: Draw = (dr) => {
  form(dr, 'M30 10H50L66 54H46Z', tones(BLUE), 0, 2.2);
  form(dr, 'M90 10H70L54 54H74Z', tones(RED), 0, 2.2);
  form(dr, ring(60, 76, 30), tones(GOLD), 5, 2.6);
  fill(dr, star(60, 76, 15), tint(GOLD, -0.24));
};

/** The globe: sea and land. */
const world: Draw = (dr) => {
  const sea = ring(60, 60, 44);
  form(dr, sea, tones(BLUE), 5, 2.8);
  const inside = dr.clip(sea);
  dr.add(
    `<g clip-path="url(#${inside})"><path d="M22 34C34 24 52 24 58 34C62 42 52 48 46 56C42 62 46 72 38 76C30 80 20 70 16 58C14 48 16 40 22 34Z" fill="${GREEN}"/>` +
      `<path d="M72 44C82 38 98 42 106 54C110 64 102 78 94 86C86 92 76 88 76 78C76 70 68 66 66 58C64 52 66 48 72 44Z" fill="${GREEN}"/>` +
      `<path d="M44 90C50 86 60 88 62 96C62 104 50 108 44 102C40 98 40 94 44 90Z" fill="${GREEN}"/></g>`,
  );
};

/** The flag of Kurdistan on its pole: red, white and green with the golden sun of twenty-one rays. */
const kurdistan: Draw = (dr) => {
  line(dr, 'M22 14V110', tint(BROWN, -0.18), 6);
  dot(dr, 22, 12, 5.5, GOLD);
  const cloth = 'M25 18C48 12 70 26 104 18V76C70 84 48 70 25 76Z';
  fill(dr, cloth, tint(GREEN, -0.34), ' transform="translate(0 4)"');
  fill(dr, 'M25 18C48 12 70 26 104 18V37C70 45 48 31 25 37Z', RED);
  fill(dr, 'M25 37C48 31 70 45 104 37V57C70 65 48 51 25 57Z', WHITE.light);
  fill(dr, 'M25 57C48 51 70 65 104 57V76C70 84 48 70 25 76Z', GREEN);
  fill(dr, 'M25 19C48 13 70 27 104 19V22C70 30 48 16 25 22Z', tint(RED, 0.3));
  // The sun in the middle of the cloth, half as tall as it: twenty-one rays, one straight up, notched half way in.
  const [cx, cy, tip] = [64.5, 47.75, 14.5];
  const points: string[] = [];
  for (let k = 0; k < 42; k++) {
    const a = (k * Math.PI) / 21 - Math.PI / 2;
    const r = k % 2 === 0 ? tip : tip * 0.51;
    points.push(`${n(cx + r * Math.cos(a))} ${n(cy + r * Math.sin(a))}`);
  }
  fill(dr, `M${points.join('L')}Z`, GOLD);
};

/** Şahmaran, queen of the snakes: a coiled green snake with a crown. */
const legends: Draw = (dr) => {
  const body = 'M18 96C34 106 72 106 88 94C102 84 94 68 76 68C58 68 46 70 40 60C33 49 43 38 60 38C69 38 74 34 76 28';
  const skin = tones('#3c9a5f');
  dr.add(`<path d="${body}" fill="none" stroke="${skin.shade}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 3.5)"/>`);
  line(dr, body, skin.base, 17);
  dr.add(`<path d="${body}" fill="none" stroke="${skin.light}" stroke-width="3.6" stroke-linecap="round" transform="translate(-2.2 -4)"/>`);
  for (const [x, y] of [[36, 101], [58, 102], [80, 97], [90, 80], [62, 69], [43, 58], [54, 40]] as const) fill(dr, `M${x} ${y - 3.4}L${x + 3} ${y}L${x} ${y + 3.4}L${x - 3} ${y}Z`, GOLD);
  turned(dr, -14, 84, 26, () => form(dr, 'M71 26C71 18 78 15 85 15C93 15 99 20 99 26C99 32 93 37 85 37C78 37 71 34 71 26Z', skin, 3, 2));
  dot(dr, 89, 23, 2.4, INK);
  line(dr, 'M98 31L105 33M105 33L109 30M105 33L108 37', RED, 1.8);
  form(dr, 'M73 15L75 3L80 9L85 0L90 9L95 3L97 15Z', tones(GOLD), 2, 1.6);
};

/** Three fanned cards with a sparkle on the front one: whatever comes. */
const any: Draw = (dr) => {
  turned(dr, -20, 60, 104, () => form(dr, rr(38, 24, 44, 62, 8), tones(RED), 4, 2.4));
  turned(dr, 20, 60, 104, () => form(dr, rr(38, 24, 44, 62, 8), tones(BLUE), 4, 2.4));
  form(dr, rr(38, 20, 44, 62, 8), CREAM, 5, 2.4);
  fill(dr, sparkle(60, 51, 17), GOLD);
};

/** A tag on a string, for a category with no picture of its own yet. */
const label: Draw = (dr) => {
  form(dr, `M18 34H70Q74 34 77 37L104 60L77 83Q74 86 70 86H18Q12 86 12 80V40Q12 34 18 34Z${ring(30, 60, 6)}`, tones(TEAL), 5, 2.6, true);
  line(dr, 'M30 60C22 48 12 40 8 28', '#b79f7c', 3);
};

const CATEGORIES: Readonly<Record<string, { draw: Draw; tone: string; title: string }>> = {
  animals: { draw: animals, tone: BROWN, title: 'Animals' },
  food: { draw: food, tone: '#e0a352', title: 'Food and drink' },
  fruit: { draw: fruit, tone: RED, title: 'Fruit' },
  vegetables: { draw: vegetables, tone: ORANGE, title: 'Vegetables' },
  drinks: { draw: drinks, tone: '#c8551f', title: 'Drinks' },
  family: { draw: family, tone: BLUE, title: 'Family' },
  body: { draw: body, tone: '#7a5236', title: 'The body' },
  clothes: { draw: clothes, tone: BLUE, title: 'Clothes' },
  home: { draw: home, tone: RED, title: 'Home' },
  jobs: { draw: jobs, tone: GOLD, title: 'Jobs' },
  nature: { draw: nature, tone: GREEN, title: 'Nature' },
  town: { draw: town, tone: PURPLE, title: 'Town' },
  kurdistan: { draw: kurdistan, tone: RED, title: 'Kurdistan' },
  transport: { draw: transport, tone: RED, title: 'Transport' },
  colours: { draw: colours, tone: PINK, title: 'Colours' },
  school: { draw: school, tone: BLUE, title: 'School' },
  time: { draw: time, tone: RED, title: 'Time' },
  kitchen: { draw: kitchen, tone: TEAL, title: 'Kitchen' },
  feelings: { draw: feelings, tone: PINK, title: 'Feelings' },
  play: { draw: play, tone: GOLD, title: 'Play' },
  music: { draw: music, tone: PURPLE, title: 'Music' },
  celebrations: { draw: celebrations, tone: RED, title: 'Celebrations' },
  tools: { draw: tools, tone: STEEL, title: 'Tools' },
  village: { draw: village, tone: GOLD, title: 'The village' },
  numbers: { draw: numbers, tone: GREEN, title: 'Numbers' },
  weather: { draw: weather, tone: SKY, title: 'Weather' },
  health: { draw: health, tone: RED, title: 'Health' },
  people: { draw: people, tone: TEAL, title: 'People' },
  taste: { draw: taste, tone: '#f4c430', title: 'Taste' },
  stories: { draw: stories, tone: GOLD, title: 'Stories' },
  legends: { draw: legends, tone: '#3c9a5f', title: 'Legends' },
  money: { draw: money, tone: GOLD, title: 'Money' },
  qualities: { draw: qualities, tone: SKY, title: 'Qualities' },
  character: { draw: character, tone: '#ffc93c', title: 'Character' },
  actions: { draw: actions, tone: ORANGE, title: 'Actions' },
  culture: { draw: culture, tone: RED, title: 'Culture' },
  language: { draw: language, tone: TEAL, title: 'Language' },
  work: { draw: work, tone: BROWN, title: 'Work' },
  travel: { draw: travel, tone: RED, title: 'Travel' },
  things: { draw: things, tone: '#dba869', title: 'Things' },
  sports: { draw: sports, tone: BLUE, title: 'Sports' },
  world: { draw: world, tone: BLUE, title: 'The world' },
};
const ANY = { draw: any, tone: GOLD, title: 'Any category' };
const LABEL = { draw: label, tone: TEAL, title: 'Category' };

/** The slugs that have a picture of their own. */
export const IMPOSTOR_CATEGORY_PICTURES: readonly string[] = Object.keys(CATEGORIES);

const categoryOf = (slug: string | null | undefined): { draw: Draw; tone: string; title: string } => {
  if (slug === null || slug === undefined || slug === '') return ANY;
  return Object.hasOwn(CATEGORIES, slug) ? CATEGORIES[slug]! : LABEL;
};

/**
 * A category's place in a list: the order drawn above, which starts with what beginners name most easily (animals,
 * food, fruit) and ends with the abstract ones. Categories not drawn here come last.
 */
export function impostorCategoryRank(slug: string): number {
  const at = IMPOSTOR_CATEGORY_PICTURES.indexOf(slug);
  return at < 0 ? IMPOSTOR_CATEGORY_PICTURES.length : at;
}

/** Categories in list order (`impostorCategoryRank`), undrawn ones last in their given order. */
export function impostorCategoriesInOrder<T extends { slug: string }>(categories: readonly T[]): T[] {
  return categories.map((c, i) => ({ c, i })).sort((a, b) => impostorCategoryRank(a.c.slug) - impostorCategoryRank(b.c.slug) || a.i - b.i).map((x) => x.c);
}

/** A category's tile tint: its picture's own colour. */
export function impostorCategoryTone(slug: string | null | undefined): string {
  return categoryOf(slug).tone;
}

/** A category's picture by slug; "any category" for none, and the label for a slug that is not drawn. */
export function impostorCategorySvg(opts: ImpostorArtOptions & { category: string | null }): string {
  const size = checkSize(opts.size, 56);
  const picture = categoryOf(opts.category);
  const known = picture === LABEL ? 'label' : (opts.category ?? '') || 'any';
  const dr = new Drawing(prefixFor(opts.idPrefix, 'impostor-category', known));
  picture.draw(dr);
  return dr.svg(size, opts.title ?? picture.title);
}

// ────────────────────────────────────────────────────────── the ways to play

/**
 * Who everyone is at the table: a deer for each player who holds the word, and a wolf for the impostor among them. Both
 * are drawn facing out about (cx, cy), about 60 units across at `scale` 1, so a card, a disc or a cover can hold them.
 */
const FAWN: Tones = { light: '#e3a868', base: '#c9874a', shade: '#8f5a2c' };
const ANTLER: Tones = { light: '#f6e6c6', base: '#e4c896', shade: '#b39462' };
const MUZZLE: Tones = { light: '#fffaf1', base: '#f4e6cf', shade: '#d6c3a2' };
const PELT: Tones = { light: '#aab3c2', base: '#8a93a4', shade: '#5c6474' };
const FROST: Tones = { light: '#ffffff', base: '#eef0f4', shade: '#c4cad5' };

function head(dr: Drawing, cx: number, cy: number, scale: number, draw: () => void): void {
  dr.add(`<g transform="translate(${n(cx)} ${n(cy)}) scale(${n(scale)})">`);
  draw();
  dr.add('</g>');
}

/** A player: a deer's face with its antlers, ears out to the sides, a pale muzzle and a dark nose. */
export function deerHead(dr: Drawing, cx: number, cy: number, scale = 1): void {
  head(dr, cx, cy, scale, () => {
    for (const side of [-1, 1]) {
      const x = (v: number): number => v * side;
      const beam = `M${n(x(6))} -15C${n(x(9))} -22 ${n(x(12))} -27 ${n(x(17))} -33`;
      const tines = `M${n(x(10.5))} -23C${n(x(15))} -24 ${n(x(19))} -23 ${n(x(23))} -27M${n(x(13.5))} -28.5C${n(x(13))} -32 ${n(x(11))} -35 ${n(x(9))} -37`;
      line(dr, beam + tines, ANTLER.shade, 4.4, ' transform="translate(0 1.4)"');
      line(dr, beam + tines, ANTLER.base, 4.4);
      // The ear, out to the side and a little down, with its pale inside.
      const ear = `M${n(x(12))} -12C${n(x(20))} -19 ${n(x(29))} -18 ${n(x(31))} -13C${n(x(28))} -6 ${n(x(19))} -3 ${n(x(13))} -5Z`;
      form(dr, ear, FAWN, 2, 1.4);
      fill(dr, `M${n(x(15))} -10.5C${n(x(20))} -14.5 ${n(x(25.5))} -14 ${n(x(27))} -12.5C${n(x(25))} -8.6 ${n(x(19.5))} -7 ${n(x(15.5))} -8Z`, '#f1c9a4');
    }
    form(dr, 'M0 -19C11 -19 17 -11 16 -1C15 8 10 15 7 20C5 23.5 2.5 25 0 25C-2.5 25 -5 23.5 -7 20C-10 15 -15 8 -16 -1C-17 -11 -11 -19 0 -19Z', FAWN, 3, 2);
    // A pale blaze down the brow, then the muzzle.
    fill(dr, 'M0 -15C2.6 -15 3.6 -9 3 -2C2.2 3 1 6 0 6C-1 6 -2.2 3 -3 -2C-3.6 -9 -2.6 -15 0 -15Z', '#dca26a');
    form(dr, 'M0 6C6 6 10 10 10 15C10 21 5 25 0 25C-5 25 -10 21 -10 15C-10 10 -6 6 0 6Z', MUZZLE, 0, 1.2);
    fill(dr, 'M-3.8 11.6C-3.8 9.8 3.8 9.8 3.8 11.6C3.8 14 1.6 15.6 0 15.6C-1.6 15.6 -3.8 14 -3.8 11.6Z', INK);
    line(dr, 'M0 15.6V18M-3.4 18.6C-1.6 20.4 1.6 20.4 3.4 18.6', INK, 1.3);
    for (const side of [-1, 1]) {
      dr.add(`<ellipse cx="${n(7 * side)}" cy="-2" rx="2.8" ry="3.4" fill="${INK}"/>`);
      dot(dr, 7 * side + 0.9, -3.3, 1, '#ffffff');
    }
  });
}

/** The impostor: a wolf's face with its ears up, a ruff of fur at the cheeks, a pale snout and sly amber eyes. */
export function wolfHead(dr: Drawing, cx: number, cy: number, scale = 1): void {
  head(dr, cx, cy, scale, () => {
    for (const side of [-1, 1]) {
      const x = (v: number): number => v * side;
      form(dr, `M${n(x(4))} -17C${n(x(8))} -24 ${n(x(12))} -31 ${n(x(16))} -36C${n(x(19))} -30 ${n(x(21))} -21 ${n(x(20))} -11Z`, PELT, 2, 1.4);
      fill(dr, `M${n(x(9))} -17C${n(x(11))} -22 ${n(x(13.5))} -27 ${n(x(15.5))} -30C${n(x(17))} -25 ${n(x(17.6))} -19 ${n(x(17))} -13Z`, '#5c5468');
    }
    // The head, broad at the brow, with the fur of the cheeks standing out in points.
    form(dr, 'M0 -21C12 -21 19 -13 21 -3L27 1L21 4.5L24 9L16 10.5C13 17 7 23 0 25C-7 23 -13 17 -16 10.5L-24 9L-21 4.5L-27 1L-21 -3C-19 -13 -12 -21 0 -21Z', PELT, 3, 2);
    // A darker cap over the brow, coming down between the eyes.
    fill(dr, 'M0 -21C8 -21 14 -16 16 -9C11 -10 6 -8 3 -4C2 -2 1 0 0 0C-1 0 -2 -2 -3 -4C-6 -8 -11 -10 -16 -9C-14 -16 -8 -21 0 -21Z', '#6f7889');
    // The pale cheeks and the long snout.
    form(dr, 'M0 1C7 1 13 5 15 10.5C12 17 6.5 22.5 0 24.5C-6.5 22.5 -12 17 -15 10.5C-13 5 -7 1 0 1Z', FROST, 0, 1.2);
    fill(dr, 'M-4.4 11.6C-4.4 9.6 4.4 9.6 4.4 11.6C4.4 14.2 1.8 16 0 16C-1.8 16 -4.4 14.2 -4.4 11.6Z', INK);
    // A sly smile, a little higher on one side.
    line(dr, 'M0 16V18.2M-5.2 18.6C-2.6 21.4 2.4 21.6 5.6 17.8', INK, 1.3);
    for (const side of [-1, 1]) {
      const x = (v: number): number => v * side;
      // Narrowed amber eyes under brows that slant down to the middle.
      fill(dr, `M${n(x(3))} -4.5C${n(x(5))} -7 ${n(x(9.5))} -7.6 ${n(x(12))} -5.8C${n(x(10))} -3.4 ${n(x(5.6))} -2.8 ${n(x(3))} -4.5Z`, GOLD);
      dr.add(`<ellipse cx="${n(x(7.6))}" cy="-5.1" rx="1.1" ry="2.1" fill="${INK}"/>`);
      line(dr, `M${n(x(2.6))} -7.8L${n(x(12.4))} -10.2`, '#4a4458', 2.2);
    }
  });
}

/** A standing playing card with its face in `face`, turned `angle` about the foot of the fan. */
function card(dr: Drawing, x: number, y: number, w: number, h: number, face: Tones, angle = 0, mark?: () => void): void {
  turned(dr, angle, 60, 118, () => {
    form(dr, rr(x, y, w, h, 7), face, 4, 2.4);
    mark?.();
  });
}

/** Classic: everyone holds the same word, deer all, and one card is the wolf's. */
const classic: Draw = (dr) => {
  card(dr, 43, 38, 34, 50, CREAM, -27, () => deerHead(dr, 60, 64, 0.44));
  card(dr, 43, 38, 34, 50, CREAM, 27, () => deerHead(dr, 60, 64, 0.44));
  card(dr, 40, 22, 40, 58, tones(NIGHT), 0, () => wolfHead(dr, 60, 52, 0.56));
};

/** In the dark: the impostor is told nothing. A night with a moon. */
const blind: Draw = (dr) => {
  form(dr, ring(60, 60, 46), tones(NIGHT), 5, 2.8);
  form(dr, 'M70 26C52 30 42 46 46 64C50 80 66 90 84 86C76 96 62 100 48 96C30 90 20 72 26 52C30 36 48 24 70 26Z', tones(GOLD), 0, 2.4);
  fill(dr, sparkle(78, 50, 9), '#fff1b8');
  fill(dr, sparkle(92, 70, 5.5), '#fff1b8');
  dot(dr, 64, 40, 2, '#fff1b8');
};

/** Odd word out: three alike and one different. */
const odd: Draw = (dr) => {
  bead(dr, 34, 36, 19, TEAL, 4);
  bead(dr, 86, 36, 19, TEAL, 4);
  bead(dr, 34, 86, 19, TEAL, 4);
  form(dr, star(86, 86, 25), tones(ORANGE), 4, 2.6);
};

const WAYS: Readonly<Record<ImpostorWay, { draw: Draw; tone: string; title: string }>> = {
  classic: { draw: classic, tone: PURPLE, title: 'Classic' },
  blind: { draw: blind, tone: NIGHT, title: 'In the dark' },
  odd: { draw: odd, tone: TEAL, title: 'Odd word out' },
};

/** A way's card tint. */
export function impostorWayTone(way: ImpostorWay): string {
  return WAYS[way].tone;
}

/** The picture of one way to play. */
export function impostorWaySvg(opts: ImpostorArtOptions & { way: ImpostorWay }): string {
  if (!Object.hasOwn(WAYS, opts.way)) throw new RangeError(`art: no way to play called ${String(opts.way)}`);
  const size = checkSize(opts.size, 72);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'impostor-way', opts.way));
  WAYS[opts.way].draw(dr);
  return dr.svg(size, opts.title ?? WAYS[opts.way].title);
}

// ──────────────────────────────────────────────────────────── the emblem

/** The game itself: five cards, four deer and the wolf in the middle. */
const cards: Draw = (dr) => {
  for (const a of [-34, -17, 17, 34]) {
    card(dr, 44, 38, 32, 46, CREAM, a, () => deerHead(dr, 60, 62, 0.42));
  }
  card(dr, 41, 20, 38, 56, tones(NIGHT), 0, () => wolfHead(dr, 60, 50, 0.54));
};

/** A card's back: a gold question on the night, the same for everyone, so it gives nothing away. */
const back: Draw = (dr) => {
  form(dr, ring(60, 60, 44), tones(NIGHT), 4, 2.6);
  line(dr, ring(60, 60, 36), tint(GOLD, -0.1), 2);
  dr.add(letter('?', 60 - letterWidth(44) / 2, 38, 44, GOLD, 8.4));
};

/** The impostor's own card: the wolf on the night, ringed in gold. */
const wolf: Draw = (dr) => {
  form(dr, ring(60, 60, 44), tones(NIGHT), 4, 2.6);
  line(dr, ring(60, 60, 36), tint(GOLD, -0.1), 2);
  wolfHead(dr, 60, 64, 1.12);
};

/** A player's card: a deer on a meadow green, ringed in cream. */
const deer: Draw = (dr) => {
  form(dr, ring(60, 60, 44), tones(GREEN), 4, 2.6);
  line(dr, ring(60, 60, 36), CREAM.base, 2);
  deerHead(dr, 60, 66, 1.08);
};

const EMBLEMS: Readonly<Record<ImpostorEmblem, { draw: Draw; title: string }>> = {
  cards: { draw: cards, title: GAME_NAMES.impostor },
  // Every card's back wears it, so its label gives nothing away.
  back: { draw: back, title: 'A card, face down' },
  wolf: { draw: wolf, title: 'The wolf: the impostor' },
  deer: { draw: deer, title: 'A deer: one of the players' },
};

/** The game's emblem: the hand of cards for its start, the back every card shows, and the wolf and the deer on a card's face. */
export function impostorEmblemSvg(opts: ImpostorArtOptions & { emblem: ImpostorEmblem }): string {
  if (!Object.hasOwn(EMBLEMS, opts.emblem)) throw new RangeError(`art: no emblem called ${String(opts.emblem)}`);
  const size = checkSize(opts.size, 120);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'impostor-emblem', opts.emblem));
  EMBLEMS[opts.emblem].draw(dr);
  return dr.svg(size, opts.title ?? EMBLEMS[opts.emblem].title);
}

/** Every way and emblem drawn, for a page that shows them all. */
export const IMPOSTOR_WAYS_DRAWN: readonly ImpostorWay[] = ['classic', 'blind', 'odd'];
export const IMPOSTOR_EMBLEMS_DRAWN: readonly ImpostorEmblem[] = ['cards', 'back', 'wolf', 'deer'];
