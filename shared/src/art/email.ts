/**
 * The pictures of Hevalo's emails: one small scene for what each email is
 * about, drawn as the app's other object pictures are (cutout.ts), so a
 * letter from Hevalo looks like it came from the same place as the app.
 *
 * Each picture is a loop: it is drawn for a moment `at` of its turn, from 0
 * up to 1, and the last moment leads back into the first, so it can play for
 * as long as the email is open. The motion says what the email says — the
 * envelope opens on a letter with a tick, the code is typed in, the padlock
 * closes — and stays small: nothing flashes, nothing crosses the tile.
 * Every picture also has one moment it rests on (`emailPictureStill`), which
 * is the picture where nothing moves.
 *
 * An email shows its picture on a tile of the picture's own pale colour
 * (`emailPictureTone`), above the heading. Email programs do not draw SVG,
 * so the pictures are written out as images, the loop and the still
 * (api/scripts/generate-email-art.ts, into web/public/email/), and those are
 * what a message points at; this file is where they are drawn.
 *
 *   letter     an envelope opening on a letter with a tick: confirming an address
 *   code       a card the six places of a code are typed into: a code to enter
 *   key        a key swinging on its nail: setting or resetting a password
 *   lock       a padlock clicking shut: a password that was changed
 *   shield     a shield, its guard spreading round it: sign-ins held back
 *   badge      a name badge a new name is written on: a username that was changed
 *   device     a phone answering with a tick: a sign-in from somewhere new
 *   hourglass  an hourglass running and turning over: an account to be deleted in some days
 *   flag       a flag flying: a report waiting for a moderator
 *   document   a page a seal is set on: a copyright notice
 *   scales     a pair of scales weighing: a decision on a notice
 *   bell       a bell ringing: something that needs looking at now
 */
import { dab, form, ring, rr, type Tones } from './cutout.js';
import { Drawing, checkSize, n, n2, prefixFor, tint } from './svg.js';

export const EMAIL_PICTURES = ['letter', 'code', 'key', 'lock', 'shield', 'badge', 'device', 'hourglass', 'flag', 'document', 'scales', 'bell'] as const;
export type EmailPicture = (typeof EMAIL_PICTURES)[number];

export interface EmailArtOptions {
  /** how big it is drawn, in pixels (it is square) */
  size?: number;
  /** its text label; an email says what it is about in words, so the picture is decoration there */
  title?: string;
  idPrefix?: string;
  /** the moment of its loop it is drawn at, from 0 up to 1; left out, the moment it rests on */
  at?: number;
}

// ───────────────────────────────────────────────────────────── the colours

const RED = '#d8493b';
const GOLD = '#f2b632';
const GREEN = '#3fa45b';
const BLUE = '#3d8bd9';
const SKY = '#74bdea';
const PURPLE = '#8a5bd6';
const ORANGE = '#f08a34';
const STEEL = '#9aa5b4';
const NIGHT = '#3b2f63';
/** The deep tone lines are drawn in: never black. */
const INK = '#3a2b4d';
const CREAM: Tones = { light: '#fffaf1', base: '#f6ead6', shade: '#cdb898' };
const WHITE: Tones = { light: '#ffffff', base: '#eef2f7', shade: '#bcc6d4' };
const WOOD: Tones = { light: '#f3cf9c', base: '#dba869', shade: '#a2733c' };

/** A colour as a form's three tones. */
const tones = (hex: string): Tones => ({ light: tint(hex, 0.32), base: hex, shade: tint(hex, -0.32) });

// ───────────────────────────────────────────────────────────── the pen

const line = (dr: Drawing, d: string, hex: string, width: number, more = ''): void => {
  dr.add(`<path d="${d}" fill="none" stroke="${hex}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${more}/>`);
};
const dot = (dr: Drawing, cx: number, cy: number, r: number, hex: string): void => {
  dr.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${hex}"/>`);
};
/** A round bead: a dab as wide as it is tall. */
const bead = (dr: Drawing, cx: number, cy: number, r: number, hex: string, drop = 2.4): void => dab(dr, cx, cy, r, r, hex, drop);
/** A tick, in the light of the thing it is drawn on. */
const tick = (dr: Drawing, cx: number, cy: number, k: number, hex = '#ffffff', width = 5): void => {
  line(dr, `M${n(cx - 7 * k)} ${n(cy + 0.5 * k)}L${n(cx - 2 * k)} ${n(cy + 5.5 * k)}L${n(cx + 7.5 * k)} ${n(cy - 5 * k)}`, hex, width);
};
/** A closed shape through points. */
const poly = (points: ReadonlyArray<readonly [number, number]>): string => `${points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`).join('')}Z`;
/** A small four-pointed glint. */
const glint = (dr: Drawing, x: number, y: number, s: number, hex = GOLD): void => {
  if (s < 0.6) return;
  const c = s * 0.2;
  dr.add(
    `<path d="M${n(x)} ${n(y - s)}Q${n(x + c)} ${n(y - c)} ${n(x + s)} ${n(y)}Q${n(x + c)} ${n(y + c)} ${n(x)} ${n(y + s)}` +
      `Q${n(x - c)} ${n(y + c)} ${n(x - s)} ${n(y)}Q${n(x - c)} ${n(y - c)} ${n(x)} ${n(y - s)}Z" fill="${hex}"/>`,
  );
};
/** What a thing stands on: a flat patch of the tile's own colour, a little deeper, smaller when the thing is lifted. */
const ground = (dr: Drawing, tone: string, cx: number, rx: number, k = 1): void => {
  dr.add(`<ellipse cx="${n(cx)}" cy="109" rx="${n(rx * k)}" ry="${n(4.4 * k)}" fill="${tint(tone, -0.09)}"/>`);
};
/** Draw inside a moved, turned or scaled group. */
const within = (dr: Drawing, transform: string, draw: () => void): void => {
  dr.add(`<g transform="${transform}">`);
  draw();
  dr.add('</g>');
};
const faded = (dr: Drawing, opacity: number, draw: () => void): void => {
  if (opacity <= 0.01) return;
  dr.add(`<g opacity="${n2(Math.min(1, opacity))}">`);
  draw();
  dr.add('</g>');
};
const n3 = (v: number): string => String(Math.round(v * 1000) / 1000);
const move = (dx: number, dy: number): string => `translate(${n(dx)} ${n(dy)})`;
const turn = (degrees: number, cx: number, cy: number): string => `rotate(${n2(degrees)} ${n(cx)} ${n(cy)})`;
const grow = (kx: number, ky: number, cx: number, cy: number): string => `translate(${n(cx)} ${n(cy)}) scale(${n3(kx)} ${n3(ky)}) translate(${n(-cx)} ${n(-cy)})`;

// ───────────────────────────────────────────────────────────── the clock

const TAU = Math.PI * 2;
/** A swing back and forth, once a loop: 0 at the start, there at a quarter, back, the other way, back. */
const sway = (t: number, shift = 0): number => Math.sin(TAU * (t + shift));
/** There and back, once a loop: 0, up to 1 at the half, 0 again. */
const swell = (t: number, shift = 0): number => 0.5 - 0.5 * Math.cos(TAU * (t + shift));
const clamp = (x: number): number => Math.min(1, Math.max(0, x));
/** How far `t` is through the stretch from `a` to `b`, eased at both ends; 0 before it and 1 after. */
const through = (t: number, a: number, b: number): number => {
  const x = clamp((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
/** A quick rise and settle after `at`, for something that lands: 0, a little over 1, then 1. */
const land = (t: number, at: number, takes: number): number => {
  const x = clamp((t - at) / takes);
  return x === 0 ? 0 : 1 + 0.28 * Math.sin(x * Math.PI) * (1 - x) - (1 - x) ** 3;
};
/** The moment within the loop, whatever number was asked for. */
const moment = (at: number): number => ((at % 1) + 1) % 1;

type Draw = (dr: Drawing, t: number, tone: string) => void;

// ───────────────────────────────────────────────────────────── the pictures

/** An envelope opens, and a letter with a green tick comes up out of it and goes back in. */
const letter: Draw = (dr, t, tone) => {
  const open = swell(t, 0.5);
  const flap = through(open, 0, 0.42);
  const rise = through(open, 0.28, 1);
  const lift = 1.6 * rise;
  ground(dr, tone, 60, 36, 1 - 0.04 * rise);
  within(dr, move(0, -lift), () => {
    // the flap turns over its hinge: down over the front when shut, standing up behind the letter when open
    const hinge = 1 - 2 * flap;
    const drawFlap = (): void => {
      if (Math.abs(hinge) < 0.04) return;
      within(dr, `translate(0 51) scale(1 ${n3(hinge)}) translate(0 -51)`, () => {
        dr.add(`<path d="M21 51H99L65 80Q60 84 55 80Z" fill="${hinge > 0 ? tint(CREAM.base, -0.07) : CREAM.light}"/>`);
        line(dr, 'M21 51H99L65 80Q60 84 55 80Z', tint(CREAM.shade, 0.1), 1.6);
      });
    };
    if (hinge < 0) drawFlap();
    // the letter
    const top = 56 - 38 * rise;
    form(dr, rr(31, top, 58, 54, 7), WHITE, 0, 2);
    line(dr, `M41 ${n(top + 36)}H79M47 ${n(top + 44)}H73`, tint(INK, 0.78), 3);
    bead(dr, 60, top + 18, 11, GREEN, 2.4);
    tick(dr, 60, top + 18, 0.78, '#ffffff', 4);
    // the envelope's front
    form(dr, rr(19, 47, 82, 55, 10), CREAM, 5, 2.4);
    line(dr, 'M22 98L47 75M98 98L73 75', tint(CREAM.shade, 0.2), 2.2);
    if (hinge >= 0) drawFlap();
  });
  glint(dr, 96, 30, 6.5 * swell(t, 0.5) * rise);
  glint(dr, 25, 38, 4.5 * swell(t, 0.35) * rise);
};

/** A message with six places, typed into one after another; then a green tick says the code is whole. */
const code: Draw = (dr, t, tone) => {
  const typed = clamp((t - 0.06) / 0.46) * 6;
  const done = land(t, 0.56, 0.16);
  const away = 1 - through(t, 0.9, 1);
  ground(dr, tone, 60, 38);
  form(dr, rr(11, 22, 98, 78, 16), WHITE, 5, 2.6);
  // who it is from and what it is, as two lines over the code
  line(dr, 'M24 39H58', tint(INK, 0.45), 4.6);
  line(dr, 'M24 50H76', tint(INK, 0.74), 4.6);
  for (let i = 0; i < 6; i++) {
    const x = 20 + i * 13.8;
    dr.add(`<path d="${rr(x, 60, 11.4, 28, 4.6)}" fill="${tint(INK, 0.88)}"/>`);
    const here = clamp(typed - i);
    if (here > 0) {
      faded(dr, away, () => dot(dr, x + 5.7, 74, 3.9 * (0.5 + 0.5 * Math.min(1, here * 2.2)), INK));
    } else if (typed > i - 1 && typed < 6 && away === 1 && Math.floor(typed * 2.4) % 2 === 0) {
      // the place being typed into shows where the next one goes
      dr.add(`<path d="${rr(x + 4.6, 66.5, 2.2, 15, 1.1)}" fill="${PURPLE}"/>`);
    }
  }
  if (done > 0) {
    faded(dr, away, () => {
      within(dr, grow(done, done, 96, 26), () => {
        bead(dr, 96, 26, 13.5, GREEN, 2.6);
        tick(dr, 96, 26, 0.92, '#ffffff', 4.4);
      });
    });
  }
  glint(dr, 20, 14, 5 * swell(t, 0.25) * clamp(done) * away);
};

/** A gold key hanging on a nail, swinging a little, a glint on it now and then. */
const key: Draw = (dr, t, tone) => {
  const swing = 9 * sway(t);
  ground(dr, tone, 60 - swing * 0.9, 22);
  within(dr, turn(swing, 60, 17), () => {
    line(dr, ring(60, 23, 7.5), tint(STEEL, -0.18), 3.4);
    form(dr, `${rr(54, 60, 12, 44, 5)}${rr(64, 84, 14, 8, 3)}${rr(64, 96, 10, 7.5, 3)}`, tones(GOLD), 4, 2.2);
    form(dr, `${ring(60, 47, 20)}${ring(60, 47, 8.5)}`, tones(GOLD), 4, 2.6, true);
  });
  bead(dr, 60, 15, 4.6, STEEL, 1.6);
  glint(dr, 91, 40, 7 * swell(t, 0.1));
  glint(dr, 27, 70, 4.5 * swell(t, 0.6));
};

/** A padlock: the shackle comes down, the body takes the click, and it stays shut. */
const lock: Draw = (dr, t, tone) => {
  const shut = through(t, 0.16, 0.27) - through(t, 0.9, 1);
  const up = 12 * (1 - shut);
  const click = Math.sin(Math.PI * clamp((t - 0.27) / 0.16)) * (t < 0.43 ? 1 : 0);
  const done = land(t, 0.3, 0.16) * (1 - through(t, 0.84, 0.92));
  ground(dr, tone, 60, 34, 1 + 0.03 * click);
  within(dr, move(0, -up + 1.5 * click), () => {
    line(dr, 'M42 62V46A18 18 0 0 1 78 46V62', tint(STEEL, -0.3), 11);
    line(dr, 'M42 58V46A18 18 0 0 1 78 46V58', STEEL, 11);
    line(dr, 'M40.5 52V46A19.5 19.5 0 0 1 60 26.5', tint(STEEL, 0.45), 2.6);
  });
  within(dr, grow(1 + 0.035 * click, 1 - 0.045 * click, 60, 106), () => {
    form(dr, rr(27, 54, 66, 50, 13), tones(PURPLE), 5, 2.6);
    dot(dr, 60, 75, 7.5, INK);
    dr.add(`<path d="${rr(56.5, 75, 7, 16, 3)}" fill="${INK}"/>`);
  });
  if (done > 0) {
    within(dr, grow(done, done, 91, 54), () => {
      bead(dr, 91, 54, 12, GREEN, 2.4);
      tick(dr, 91, 54, 0.82, '#ffffff', 4.2);
    });
  }
  glint(dr, 24, 44, 5.5 * click);
};

/** A shield with a tick, its guard spreading out round it and fading, again and again. */
const shield: Draw = (dr, t, tone) => {
  const outline = 'M60 16L94 27.5V56C94 79 79 95 60 104C41 95 26 79 26 56V27.5Z';
  ground(dr, tone, 60, 30);
  for (const shift of [0, 0.5]) {
    const p = moment(t + shift);
    const k = 1 + 0.3 * p;
    dr.add(`<g transform="${grow(k, k, 60, 60)}" opacity="${n2(0.5 * (1 - p) * Math.min(1, p * 6))}"><path d="${outline}" fill="none" stroke="${BLUE}" stroke-width="${n(3 / k)}" stroke-linejoin="round"/></g>`);
  }
  // the shield itself stands still: it is what does not move
  form(dr, outline, tones(BLUE), 5, 2.8);
  line(dr, 'M60 26L86 34.5V56C86 74 75 87 60 94.5', tint(BLUE, -0.16), 2.4);
  tick(dr, 60, 59, 1.8, '#ffffff', 8);
  glint(dr, 99, 26, 6 * swell(t, 0.2));
};

/** A name badge swaying on its clip, a new name being written on its line. */
const badge: Draw = (dr, t, tone) => {
  const swing = 3.6 * sway(t);
  const written = through(t, 0.1, 0.46);
  const away = 1 - through(t, 0.88, 1);
  ground(dr, tone, 60 - swing * 1.4, 36);
  within(dr, turn(swing, 60, 12), () => {
    form(dr, rr(50, 10, 20, 20, 5), tones(STEEL), 3, 1.8);
    form(dr, rr(16, 26, 88, 76, 13), WHITE, 5, 2.6);
    form(dr, 'M16 39A13 13 0 0 1 29 26H91A13 13 0 0 1 104 39V47H16Z', tones(ORANGE), 0, 2.4);
    dot(dr, 60, 36.5, 3.6, tint(ORANGE, -0.36));
    bead(dr, 40, 72, 12, PURPLE, 2.6);
    if (written > 0.02) faded(dr, away, () => line(dr, `M62 66H${n(62 + 30 * written)}`, INK, 5.4));
    // the pen's place, while the name is being written
    if (written > 0.02 && written < 0.98) dr.add(`<path d="${rr(63.5 + 30 * written, 59.5, 2.4, 13, 1.2)}" fill="${PURPLE}"/>`);
    line(dr, 'M62 80H82', tint(INK, 0.6), 5.4);
  });
};

/** A phone whose screen answers with a green tick, the answer spreading across it. */
const device: Draw = (dr, t, tone) => {
  const bob = 1.4 * sway(t);
  ground(dr, tone, 60, 26, 1 - 0.03 * sway(t));
  within(dr, move(0, -bob), () => {
    form(dr, rr(35, 10, 50, 96, 12), tones(NIGHT), 5, 2.6);
    const screen = rr(40, 18, 40, 76, 7);
    dr.add(`<path d="${screen}" fill="${tint(SKY, 0.42)}"/>`);
    dr.add(`<g clip-path="url(#${dr.clip(screen)})">`);
    for (const shift of [0, 0.5]) {
      const p = moment(t + shift);
      dr.add(`<circle cx="60" cy="54" r="${n(13 + 26 * p)}" fill="none" stroke="${GREEN}" stroke-width="2.6" opacity="${n2(0.6 * (1 - p))}"/>`);
    }
    dr.add('</g>');
    dr.add(`<path d="${rr(54, 98, 12, 3.6, 1.8)}" fill="${tint(NIGHT, 0.5)}"/>`);
    const beat = 1 + 0.05 * swell(t * 2);
    within(dr, grow(beat, beat, 60, 54), () => {
      bead(dr, 60, 54, 14, GREEN, 3);
      tick(dr, 60, 54, 1, '#ffffff', 4.8);
    });
  });
};

/**
 * An hourglass: the sand runs through, and then the glass turns over and it
 * runs again. Its parts are turned as points and drawn where they land, so
 * the light stays where it is while the glass turns under it.
 */
const hourglass: Draw = (dr, t, tone) => {
  const run = clamp(t / 0.72);
  const over = through(t, 0.76, 1) * Math.PI;
  const at = ([x, y]: readonly [number, number]): [number, number] => {
    const dx = x - 60;
    const dy = y - 60;
    return [60 + dx * Math.cos(over) - dy * Math.sin(over), 60 + dx * Math.sin(over) + dy * Math.cos(over)];
  };
  const turned = (points: ReadonlyArray<readonly [number, number]>): string => poly(points.map(at));
  /** half the glass's inner width at a height: wide at the ends, a neck in the middle */
  const half = (y: number): number => 2.4 + 15.6 * (Math.abs(y - 60) - 3) / 25;
  ground(dr, tone, 60, 30, 1 - 0.12 * Math.sin(over));
  form(dr, turned([[38, 27], [82, 27], [82, 31], [64, 58], [64, 62], [82, 89], [82, 93], [38, 93], [38, 89], [56, 62], [56, 58], [38, 31]]), WHITE, 4, 2.4);
  // the sand above, sinking, and the sand below, rising; all of one is all of the other, turned over
  const above = 32 + 25 * run;
  const below = 88 - 25 * run;
  if (run < 0.99) dr.add(`<path d="${turned([[60 - half(above), above], [60 + half(above), above], [62.4, 57], [57.6, 57]])}" fill="${GOLD}"/>`);
  if (run > 0.01) dr.add(`<path d="${turned([[60 - half(below), below], [60 + half(below), below], [78, 88], [42, 88]])}" fill="${GOLD}"/>`);
  if (run > 0.01 && run < 0.99 && over === 0) line(dr, `M60 57V${n(below)}`, GOLD, 2.2);
  const end = (y: number): string => turned([[32, y], [88, y], [90, y + 2], [90, y + 9], [88, y + 11], [32, y + 11], [30, y + 9], [30, y + 2]]);
  form(dr, end(16), WOOD, 3, 2);
  form(dr, end(93), WOOD, 3, 2);
};

/** A red flag on its pole, flying: the cloth runs in waves from the pole to its tails. */
const flag: Draw = (dr, t, tone) => {
  const edge = (x: number, y: number, shift: number): [number, number] => {
    const far = (x - 41) / 55;
    return [x, y + 5.2 * far * Math.sin(TAU * (far * 1.1 - t + shift))];
  };
  const xs = [41, 46, 51, 56, 61, 66, 71, 76, 81, 86, 91, 96];
  const cloth = poly([...xs.map((x) => edge(x, 24, 0)), edge(85, 43, 0.04), ...[...xs].reverse().map((x) => edge(x, 62, 0.08))]);
  ground(dr, tone, 52, 24);
  form(dr, cloth, tones(RED), 4, 2.6);
  form(dr, rr(32, 14, 9, 94, 4.5), tones(STEEL), 3, 1.8);
  bead(dr, 36.5, 13, 6.5, GOLD, 2);
};

/** A written page, its corner folded, and a gold seal set down on it, its ribbons settling and the light catching it. */
const document: Draw = (dr, t, tone) => {
  const set = land(t, 0.14, 0.2);
  const away = 1 - through(t, 0.9, 1);
  const press = Math.sin(Math.PI * clamp((t - 0.16) / 0.14)) * (t < 0.3 ? 1 : 0);
  // the ribbons swing from the seal after it lands, less and less
  const settle = 9 * Math.sin(TAU * 2.5 * (t - 0.3)) * (1 - through(t, 0.3, 0.86)) * (t > 0.3 ? 1 : 0);
  ground(dr, tone, 60, 32);
  within(dr, grow(1, 1 - 0.012 * press, 60, 106), () => {
    form(dr, 'M36 14H74L92 32V98A8 8 0 0 1 84 106H36A8 8 0 0 1 28 98V22A8 8 0 0 1 36 14Z', WHITE, 5, 2.4);
    dr.add(`<path d="M74 14L92 32H80A6 6 0 0 1 74 26Z" fill="${WHITE.shade}"/>`);
    line(dr, 'M40 44H72', INK, 4.4);
    line(dr, 'M40 57H80', tint(INK, 0.6), 4.4);
    line(dr, 'M40 70H66', tint(INK, 0.6), 4.4);
  });
  if (set > 0) {
    faded(dr, away * Math.min(1, set * 3), () => {
      const k = 1 + 0.5 * (1 - Math.min(1, set));
      within(dr, grow(k * Math.max(1, set), k * Math.max(1, set), 78, 86), () => {
        within(dr, turn(settle, 78, 88), () => {
          dr.add(`<path d="M70 90L64 110L74 104L80 112L84 92Z" fill="${RED}"/>`);
          dr.add(`<path d="M84 90L92 108L82 104L76 112L72 92Z" fill="${tint(RED, -0.2)}"/>`);
        });
        bead(dr, 78, 86, 13.5, GOLD, 2.6);
        dot(dr, 78, 86, 5.8, tint(GOLD, -0.2));
      });
    });
  }
  glint(dr, 98, 68, 6 * press);
  glint(dr, 97, 72, 5.5 * swell(t, 0.42) * clamp(set) * away * (t > 0.4 ? 1 : 0));
  glint(dr, 22, 30, 4 * swell(t, 0.2) * clamp(set) * away * (t > 0.4 ? 1 : 0));
};

/** A pair of scales, the beam tipping one way and the other as it weighs. */
const scales: Draw = (dr, t, tone) => {
  const tip = (7 * sway(t) * Math.PI) / 180;
  const arm = 34;
  const ends: ReadonlyArray<readonly [number, number]> = [
    [60 - arm * Math.cos(tip), 34 - arm * Math.sin(tip)],
    [60 + arm * Math.cos(tip), 34 + arm * Math.sin(tip)],
  ];
  ground(dr, tone, 60, 34);
  form(dr, rr(56.5, 30, 7, 66, 3.5), tones(STEEL), 3, 1.8);
  form(dr, rr(36, 94, 48, 11, 5.5), tones(STEEL), 3, 2);
  for (const [x, y] of ends) {
    line(dr, `M${n(x)} ${n(y)}L${n(x - 14)} ${n(y + 30)}M${n(x)} ${n(y)}L${n(x + 14)} ${n(y + 30)}`, tint(STEEL, -0.22), 1.8);
    form(dr, `M${n(x - 17)} ${n(y + 30)}H${n(x + 17)}A17 10 0 0 1 ${n(x - 17)} ${n(y + 30)}Z`, tones(GOLD), 3, 2);
  }
  line(dr, `M${n(ends[0]![0])} ${n(ends[0]![1] + 2.6)}L${n(ends[1]![0])} ${n(ends[1]![1] + 2.6)}`, tint(GOLD, -0.34), 6);
  line(dr, `M${n(ends[0]![0])} ${n(ends[0]![1])}L${n(ends[1]![0])} ${n(ends[1]![1])}`, GOLD, 6);
  for (const [x, y] of ends) bead(dr, x, y, 4.4, tint(GOLD, -0.14), 1.6);
  bead(dr, 60, 31, 7, GOLD, 2.2);
};

/** A bell rings: it swings fast, its clapper a beat behind, the sound going out each side; then it hangs still. */
const bell: Draw = (dr, t, tone) => {
  // it starts from hanging still and comes back to it, so the loop closes on a bell at rest
  const loud = through(t, 0, 0.07) * (1 - through(t, 0.42, 0.72));
  const swing = 13 * loud * Math.sin(TAU * 3 * t);
  const clapper = 22 * loud * Math.sin(TAU * 3 * t - 1.1);
  ground(dr, tone, 60, 32);
  within(dr, turn(clapper, 60, 44), () => bead(dr, 60, 99, 7.5, tint(GOLD, -0.3), 2));
  within(dr, turn(swing, 60, 20), () => {
    line(dr, ring(60, 20, 6), tint(GOLD, -0.3), 4);
    form(dr, 'M60 24C43 24 37 39 37 56V71L28 85H92L83 71V56C83 39 77 24 60 24Z', tones(GOLD), 4, 2.8);
    form(dr, rr(25, 83, 70, 10, 5), tones(tint(GOLD, -0.12)), 3, 2);
  });
  const ringing = loud * Math.abs(Math.sin(TAU * 3 * t));
  for (const side of [-1, 1]) {
    faded(dr, 0.85 * ringing, () => {
      line(dr, `M${n(60 + side * 44)} ${n(42)}Q${n(60 + side * 52)} ${n(58)} ${n(60 + side * 44)} ${n(74)}`, tint(GOLD, -0.18), 3.2);
      line(dr, `M${n(60 + side * 52)} ${n(34)}Q${n(60 + side * 63)} ${n(58)} ${n(60 + side * 52)} ${n(82)}`, tint(GOLD, -0.18), 3.2, ' opacity="0.55"');
    });
  }
};

/** Each picture: how it is drawn, its tile's pale colour, how long its loop takes, the moment it rests on, and what it is. */
const PICTURES: Readonly<Record<EmailPicture, { draw: Draw; tone: string; loopMs: number; still: number; title: string }>> = {
  letter: { draw: letter, tone: '#e3f3e6', loopMs: 3600, still: 0, title: 'An envelope open on a letter with a tick' },
  code: { draw: code, tone: '#ebe5fa', loopMs: 3600, still: 0.78, title: 'A code typed into its six places' },
  key: { draw: key, tone: '#fdf0cd', loopMs: 2600, still: 0.04, title: 'A key hanging on a nail' },
  lock: { draw: lock, tone: '#ebe3fa', loopMs: 3400, still: 0.6, title: 'A closed padlock' },
  shield: { draw: shield, tone: '#dde9f8', loopMs: 2800, still: 0.3, title: 'A shield with a tick' },
  badge: { draw: badge, tone: '#fde6d2', loopMs: 3600, still: 0.68, title: 'A name badge' },
  device: { draw: device, tone: '#dfeefa', loopMs: 2600, still: 0.3, title: 'A phone with a tick on its screen' },
  hourglass: { draw: hourglass, tone: '#fbecd0', loopMs: 4200, still: 0.3, title: 'An hourglass' },
  flag: { draw: flag, tone: '#fbe0dc', loopMs: 2000, still: 0, title: 'A flag' },
  document: { draw: document, tone: '#eef0f4', loopMs: 3600, still: 0.6, title: 'A page with a seal' },
  scales: { draw: scales, tone: '#e6efe2', loopMs: 3400, still: 0.2, title: 'A pair of scales' },
  bell: { draw: bell, tone: '#fdeccb', loopMs: 3000, still: 1 / 12, title: 'A bell ringing' },
};

function known(picture: EmailPicture): (typeof PICTURES)[EmailPicture] {
  if (!Object.hasOwn(PICTURES, picture)) throw new RangeError(`art: no email picture called ${String(picture)}`);
  return PICTURES[picture];
}

/** The pale colour of the tile a picture stands on in an email. */
export function emailPictureTone(picture: EmailPicture): string {
  return known(picture).tone;
}

/** How long one turn of a picture's loop takes, in milliseconds. */
export function emailPictureLoopMs(picture: EmailPicture): number {
  return known(picture).loopMs;
}

/** The moment of its loop a picture rests on: what is shown where nothing moves. */
export function emailPictureStill(picture: EmailPicture): number {
  return known(picture).still;
}

/** One email picture at a moment of its loop, on nothing: the tile under it is the email's (or the image's) own. */
export function emailPictureSvg(opts: EmailArtOptions & { picture: EmailPicture }): string {
  const picture = known(opts.picture);
  const size = checkSize(opts.size, 120);
  if (opts.at !== undefined && !Number.isFinite(opts.at)) throw new RangeError(`art: a moment of a loop is a number, got ${String(opts.at)}`);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'email', opts.picture));
  picture.draw(dr, moment(opts.at ?? picture.still), picture.tone);
  return dr.svg(size, opts.title ?? picture.title);
}
