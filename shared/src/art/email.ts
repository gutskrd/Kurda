/**
 * The pictures of Hevalo's emails: one small object for what each email is
 * about, drawn as the app's other object pictures are (cutout.ts), so a
 * letter from Hevalo looks like it came from the same place as the app.
 *
 * An email shows its picture on a tile of the picture's own pale colour
 * (`emailPictureTone`), above the heading. Email programs do not draw SVG,
 * so the pictures are also written out as images
 * (scripts/generate-email-art.mjs, into web/public/email/), and those are
 * what a message points at; this file is where they are drawn.
 *
 *   letter     an envelope with a tick on its seal: confirming an address
 *   key        a key: setting or resetting a password
 *   lock       a closed padlock: a password that was changed
 *   badge      a name badge: a username that was changed
 *   device     a phone with a tick: a sign-in from somewhere new
 *   shield     a shield: something about the account's safety
 *   hourglass  an hourglass: an account that will be deleted in some days
 *   flag       a flag: a report waiting for a moderator
 *   document   a page with a seal: a copyright notice
 *   bubbles    two speech bubbles: an answer from a person
 */
import { dab, form, ring, rr, type Tones } from './cutout.js';
import { Drawing, checkSize, n, prefixFor, tint } from './svg.js';

export const EMAIL_PICTURES = ['letter', 'key', 'lock', 'badge', 'device', 'shield', 'hourglass', 'flag', 'document', 'bubbles'] as const;
export type EmailPicture = (typeof EMAIL_PICTURES)[number];

export interface EmailArtOptions {
  /** how big it is drawn, in pixels (it is square) */
  size?: number;
  /** its text label; an email says what it is about in words, so the picture is decoration there */
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

const line = (dr: Drawing, d: string, hex: string, width: number): void => {
  dr.add(`<path d="${d}" fill="none" stroke="${hex}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`);
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

type Draw = (dr: Drawing) => void;

// ───────────────────────────────────────────────────────────── the pictures

/** An envelope, its flap closed, with a green seal that carries a tick. */
const letter: Draw = (dr) => {
  form(dr, rr(18, 34, 84, 58, 9), WHITE, 5, 2.4);
  // the flap, folded down over the front
  form(dr, 'M22 38H98L64.5 66.5Q60 70 55.5 66.5Z', CREAM, 3, 2);
  line(dr, 'M24 86L46 66M96 86L74 66', tint(WHITE.shade, 0.25), 2.4);
  bead(dr, 88, 84, 15, GREEN, 3);
  tick(dr, 88, 84, 1.05);
};

/** A gold key, lying at a slant: a round bow with its hole, a stem and two teeth. */
const key: Draw = (dr) => {
  dr.add('<g transform="rotate(-38 60 60)">');
  form(dr, `${rr(52, 54, 56, 12, 5)}${rr(88, 62, 9, 14, 3)}${rr(100, 62, 7, 10, 3)}`, tones(GOLD), 4, 2.2);
  form(dr, `${ring(36, 60, 24)}${ring(36, 60, 9.5)}`, tones(GOLD), 4, 2.6, true);
  dr.add('</g>');
};

/** A closed padlock: a steel shackle and a purple body with its keyhole. */
const lock: Draw = (dr) => {
  line(dr, 'M42 60V44A18 18 0 0 1 78 44V60', tint(STEEL, -0.3), 11);
  line(dr, 'M42 56V44A18 18 0 0 1 78 44V56', STEEL, 11);
  line(dr, 'M40.5 50V44A19.5 19.5 0 0 1 60 24.5', tint(STEEL, 0.45), 2.6);
  form(dr, rr(28, 52, 64, 52, 12), tones(PURPLE), 5, 2.6);
  dot(dr, 60, 74, 7.5, INK);
  dr.add(`<path d="${rr(56.5, 74, 7, 16, 3)}" fill="${INK}"/>`);
};

/** A name badge on its clip: a face, and the two lines a name is written on. */
const badge: Draw = (dr) => {
  form(dr, rr(50, 12, 20, 18, 5), tones(STEEL), 3, 1.8);
  form(dr, rr(18, 26, 84, 74, 12), WHITE, 5, 2.6);
  form(dr, 'M18 38A12 12 0 0 1 30 26H90A12 12 0 0 1 102 38V46H18Z', tones(ORANGE), 0, 2.4);
  dot(dr, 60, 36, 3.6, tint(ORANGE, -0.36));
  bead(dr, 42, 70, 11, PURPLE, 2.6);
  line(dr, 'M62 64H88', INK, 5);
  line(dr, 'M62 78H80', tint(INK, 0.55), 5);
};

/** A phone, its screen lit, with a green tick on it. */
const device: Draw = (dr) => {
  form(dr, rr(36, 12, 48, 96, 11), tones(NIGHT), 5, 2.6);
  dr.add(`<path d="${rr(41, 20, 38, 74, 6)}" fill="${tint(SKY, 0.35)}"/>`);
  dr.add(`<path d="${rr(54, 98, 12, 3.6, 1.8)}" fill="${tint(NIGHT, 0.5)}"/>`);
  bead(dr, 60, 56, 15, GREEN, 3);
  tick(dr, 60, 56, 1.05);
};

/** A shield, blue, with a tick. */
const shield: Draw = (dr) => {
  const outline = 'M60 14L96 26V56C96 80 80 97 60 106C40 97 24 80 24 56V26Z';
  form(dr, outline, tones(BLUE), 5, 2.8);
  line(dr, 'M60 24L88 33V56C88 75 76 88.5 60 96.5', tint(BLUE, -0.16), 2.4);
  tick(dr, 60, 59, 1.9, '#ffffff', 8);
};

/** An hourglass between two wooden ends, the sand half run through. */
const hourglass: Draw = (dr) => {
  form(dr, 'M38 24H82V34C82 46 70 52 66 60C70 68 82 74 82 86V96H38V86C38 74 50 68 54 60C50 52 38 46 38 34Z', WHITE, 4, 2.4);
  dr.add(`<path d="M45 40H75C73 47 66 51 62.5 57H57.5C54 51 47 47 45 40Z" fill="${GOLD}"/>`);
  dr.add(`<path d="M44 94C44 84 52 78 60 76C68 78 76 84 76 94Z" fill="${GOLD}"/>`);
  line(dr, 'M60 58V76', GOLD, 2.4);
  form(dr, rr(30, 14, 60, 12, 5), WOOD, 3, 2);
  form(dr, rr(30, 94, 60, 12, 5), WOOD, 3, 2);
};

/** A red flag on its pole, flying to the right. */
const flag: Draw = (dr) => {
  form(dr, 'M40 22H94L82 42L94 62H40Z', tones(RED), 4, 2.6);
  form(dr, rr(32, 14, 9, 92, 4.5), tones(STEEL), 3, 1.8);
  bead(dr, 36.5, 14, 6.5, GOLD, 2);
};

/** A written page with its corner folded, and a gold seal on its ribbons. */
const document: Draw = (dr) => {
  form(dr, 'M36 14H74L92 32V98A8 8 0 0 1 84 106H36A8 8 0 0 1 28 98V22A8 8 0 0 1 36 14Z', WHITE, 5, 2.4);
  dr.add(`<path d="M74 14L92 32H80A6 6 0 0 1 74 26Z" fill="${WHITE.shade}"/>`);
  line(dr, 'M40 44H72', INK, 4.4);
  line(dr, 'M40 57H80', tint(INK, 0.55), 4.4);
  line(dr, 'M40 70H66', tint(INK, 0.55), 4.4);
  dr.add(`<path d="M70 88L64 108L74 102L80 110L84 90Z" fill="${RED}"/>`);
  dr.add(`<path d="M84 88L92 106L82 102L76 110L72 90Z" fill="${tint(RED, -0.2)}"/>`);
  bead(dr, 78, 84, 13, GOLD, 2.6);
  dot(dr, 78, 84, 5.5, tint(GOLD, -0.2));
};

/** Two speech bubbles, one answering the other. */
const bubbles: Draw = (dr) => {
  form(dr, 'M50 18H92A12 12 0 0 1 104 30V52A12 12 0 0 1 92 64H90L92 76L78 64H50A12 12 0 0 1 38 52V30A12 12 0 0 1 50 18Z', tones(SKY), 4, 2.4);
  form(dr, 'M28 46H72A12 12 0 0 1 84 58V82A12 12 0 0 1 72 94H44L30 106L32 94H28A12 12 0 0 1 16 82V58A12 12 0 0 1 28 46Z', tones(PURPLE), 5, 2.6);
  for (const x of [36, 50, 64]) dot(dr, x, 70, 4.6, '#ffffff');
};

/** Each picture, the pale colour of the tile it stands on, and what it is. */
const PICTURES: Readonly<Record<EmailPicture, { draw: Draw; tone: string; title: string }>> = {
  letter: { draw: letter, tone: '#e3f3e6', title: 'An envelope with a tick on its seal' },
  key: { draw: key, tone: '#fdf0cd', title: 'A key' },
  lock: { draw: lock, tone: '#ebe3fa', title: 'A closed padlock' },
  badge: { draw: badge, tone: '#fde6d2', title: 'A name badge' },
  device: { draw: device, tone: '#dfeefa', title: 'A phone with a tick on its screen' },
  shield: { draw: shield, tone: '#dde9f8', title: 'A shield with a tick' },
  hourglass: { draw: hourglass, tone: '#fbecd0', title: 'An hourglass' },
  flag: { draw: flag, tone: '#fbe0dc', title: 'A flag' },
  document: { draw: document, tone: '#eef0f4', title: 'A page with a seal' },
  bubbles: { draw: bubbles, tone: '#e6e0f8', title: 'Two speech bubbles' },
};

/** The pale colour of the tile a picture stands on in an email. */
export function emailPictureTone(picture: EmailPicture): string {
  if (!Object.hasOwn(PICTURES, picture)) throw new RangeError(`art: no email picture called ${String(picture)}`);
  return PICTURES[picture].tone;
}

/** One email picture, on nothing: the tile under it is the email's (or the image's) own. */
export function emailPictureSvg(opts: EmailArtOptions & { picture: EmailPicture }): string {
  if (!Object.hasOwn(PICTURES, opts.picture)) throw new RangeError(`art: no email picture called ${String(opts.picture)}`);
  const size = checkSize(opts.size, 120);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'email', opts.picture));
  PICTURES[opts.picture].draw(dr);
  return dr.svg(size, opts.title ?? PICTURES[opts.picture].title);
}
