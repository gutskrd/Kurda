/**
 * The picture on a shared win's link preview: a postcard scene with the characters, the letter bird carrying the news
 * and a cancelled stamp in the corner. One scene per kind (lesson, streak, badge, league, peyvok). It carries no words,
 * since fonts and languages differ; the only marks are a streak's days in the badge figures. It never says who sent it.
 * Everything is placed from existing drawings (the book's poses via `bookCastSvg`, the lesson road's landmarks, the
 * stamp, postmark and medal). Drawn at 1200 × 630, what link previews show uncropped, and the same at any size.
 */
import { HUES, type HueName, type HueSteps } from '../hues.js';
import type { LeagueTier } from '../leagues.js';
import type { PathLandmark } from '../path-world.js';
import { bookAppleSvg, bookCastSvg, bookPostmarkSvg, type BookPose } from './book.js';
import { gameEmblemSvg } from './games.js';
import { leagueEmblemSvg } from './leagues.js';
import { letterBirdSvg } from './letters.js';
import { streakMedalSvg } from './medals.js';
import { numeral } from './numerals.js';
import { pathLandmarkSvg } from './path-landmark.js';
import { stampOutline, stampShapeFor } from './stamp.js';
import { Drawing, n2 as num, prefixFor } from './svg.js';

/** One colour taken `share` of the way to another, for ground that stands in front of other ground. */
function blend(from: string, to: string, share: number): string {
  const part = (hex: string, at: number): number => parseInt(hex.slice(at, at + 2), 16);
  const mix = (at: number): string => Math.round(part(from, at) + (part(to, at) - part(from, at)) * share).toString(16).padStart(2, '0');
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

/** The card's size: what a link preview shows without cropping. */
export const SHARE_CARD = { width: 1200, height: 630 } as const;

/** The wins that have a card of their own. */
export const SHARE_CARD_KINDS = ['lesson', 'streak', 'badge', 'league', 'peyvok'] as const;
export type ShareCardKind = (typeof SHARE_CARD_KINDS)[number];

export function isShareCardKind(v: unknown): v is ShareCardKind {
  return (SHARE_CARD_KINDS as readonly unknown[]).includes(v);
}

export interface ShareCardOptions {
  kind: ShareCardKind;
  /** A streak's days, drawn on its stamp; without them the stamp shows the fire alone. */
  days?: number;
  /** The league a week was won in; the first league when omitted. */
  tier?: LeagueTier;
  /** The accessible label; without one the picture is decorative and hidden. */
  title?: string;
  idPrefix?: string;
}

/** A card's scene: its hue, whether the sun is up, what stands on the hill, and the two friends' poses. */
interface Scene {
  hue: HueName;
  night: boolean;
  landmark: PathLandmark;
  hamo: BookPose<'hamo'>;
  hevalo: BookPose<'hevalo'>;
}

const SCENES: Readonly<Record<ShareCardKind, Scene>> = {
  lesson: { hue: 'blue', night: false, landmark: 'gate', hamo: 'proud', hevalo: 'caught' },
  streak: { hue: 'indigo', night: true, landmark: 'newroz', hamo: 'laughing', hevalo: 'pleased' },
  badge: { hue: 'gold', night: false, landmark: 'hives', hamo: 'proud', hevalo: 'pleased' },
  league: { hue: 'teal', night: false, landmark: 'bridge', hamo: 'proud', hevalo: 'pleased' },
  peyvok: { hue: 'green', night: false, landmark: 'school', hamo: 'telling', hevalo: 'curious' },
};

/** Where the near hill's crest runs, and where feet stand on it. */
const HORIZON = 448;
const FEET = 596;

/** The stamp's own measures, before it is tilted into its corner. */
const STAMP = { w: 216, h: 264, x: 908, y: 46, margin: 20, tilt: 5 } as const;

/** A whole drawing placed into a box of the card, keeping its proportions and standing on the box's foot. */
function placed(svg: string, x: number, y: number, width: number, height: number): string {
  return svg
    .replace(/ width="[\d.]+" height="[\d.]+"(?= viewBox)/, '')
    // Nested inside the card, it needs no namespace of its own.
    .replace(' xmlns="http://www.w3.org/2000/svg"', '')
    // The card is one picture, labelled once or not at all, so its parts carry no names.
    .replace(/ role="img" aria-labelledby="[^"]*"/, '')
    .replace(/<title[^>]*>[^<]*<\/title>/, '')
    // A tilting head leans out of its own box; let it overflow rather than clip an ear.
    .replace('<svg ', `<svg x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}" preserveAspectRatio="xMidYMax meet" overflow="visible" `);
}

/** A drawing's aspect ratio, read from its own size. */
function ratioOf(svg: string): number {
  const box = / width="([\d.]+)" height="([\d.]+)"/.exec(svg);
  return box ? Number(box[1]) / Number(box[2]) : 1;
}

/** The sky, what hangs in it, and the two hills, in flat planes. */
function backdrop(scene: Scene, hue: HueSteps, dark: HueSteps): string {
  const { width: w, height: h } = SHARE_CARD;
  const far = `M0 ${HORIZON - 4}C190 ${HORIZON - 78} 400 ${HORIZON - 72} 590 ${HORIZON - 20}C780 ${HORIZON + 30} 980 ${HORIZON - 44} ${w} ${HORIZON - 66}V${h}H0Z`;
  const near = `M0 ${HORIZON + 50}C230 ${HORIZON - 14} 480 ${HORIZON + 2} 690 ${HORIZON + 34}C890 ${HORIZON + 62} 1050 ${HORIZON + 38} ${w} ${HORIZON + 10}V${h}H0Z`;
  if (scene.night) {
    const stars = [
      [330, 62, 3.4], [452, 150, 2.4], [560, 56, 3], [668, 176, 2.2], [742, 84, 3.2], [836, 232, 2.4], [612, 268, 2.2], [398, 236, 2.6], [282, 170, 2.2], [88, 262, 2.6],
      [498, 318, 2], [716, 330, 2.2], [246, 304, 2], [848, 356, 2.2], [56, 120, 2.2], [1150, 380, 2.4], [1060, 420, 2],
    ]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`)
      .join('');
    return (
      // A night in the hue's colour, deep but not black, so the fire has something to light.
      `<rect width="${w}" height="${h}" fill="${dark.wash}"/>` +
      `<g fill="${dark.deep}">${stars}</g>` +
      // The moon is the part of one circle that another does not cover.
      `<path d="M150 70a58 58 0 1 0 66 94a48 48 0 0 1 -66 -94Z" fill="${HUES.dark.gold.deep}"/>` +
      `<path d="${far}" fill="${dark.tint}" opacity="0.7"/>` +
      `<path d="${near}" fill="${dark.tint}"/>`
    );
  }
  const cloud = (x: number, y: number, s: number): string =>
    `<path transform="translate(${x} ${y}) scale(${s})" d="M-26 26a26 26 0 0 1 4 -51a36 36 0 0 1 68 -6a30 30 0 0 1 52 31a13 13 0 0 1 0 26Z"/>`;
  return (
    `<rect width="${w}" height="${h}" fill="${hue.wash}"/>` +
    `<g fill="#ffffff">${cloud(120, 110, 1.25)}${cloud(470, 76, 0.9)}${cloud(720, 210, 0.7)}</g>` +
    `<path d="${far}" fill="${HUES.light.green.wash}"/>` +
    `<path d="${near}" fill="#a6ddb3"/>`
  );
}

/** A landmark of the lesson road standing on the hill, `size` across, its foot at `FEET`. */
function landmark(which: PathLandmark, cx: number, size: number, dark: boolean, id: string): string {
  // A landmark stands a little above the foot of its own canvas, on its own shade.
  return placed(pathLandmarkSvg({ landmark: which, dark, idPrefix: `${id}lm` }), cx - size / 2, FEET + size * 0.07 - size, size, size);
}

/** Hamo standing on the hill, `height` tall, his middle at `cx`. */
function hamo(pose: BookPose<'hamo'>, cx: number, height: number, id: string): string {
  const svg = bookCastSvg({ who: 'hamo', pose, crop: 'full', idPrefix: `${id}hamo` });
  const width = height * ratioOf(svg);
  return placed(svg, cx - width / 2, FEET - height, width, height);
}

/** Hevalo from the chest up, rising into the picture from its lower edge. */
function hevalo(pose: BookPose<'hevalo'>, cx: number, size: number, id: string): string {
  const svg = bookCastSvg({ who: 'hevalo', pose, idPrefix: `${id}deer` });
  // High enough that what he holds in his mouth is in the picture; the rise in front hides where his chest ends.
  return placed(svg, cx - size / 2, SHARE_CARD.height - size - RISE, size, size);
}

/** How far Hevalo rises out of the card's lower edge, behind the near rise of ground. */
const RISE = 30;

/** The nearest rise of ground, which he looks over. */
function rise(fill: string): string {
  const { width: w, height: h } = SHARE_CARD;
  return `<path d="M${w - 600} ${h}C${w - 520} ${h - RISE - 22} ${w - 250} ${h - RISE - 26} ${w} ${h - RISE - 4}V${h}Z" fill="${fill}"/>`;
}

/** The letter bird in the sky, off with the news. */
function bird(cx: number, cy: number, size: number, id: string): string {
  return placed(letterBirdSvg({ bird: 2, pose: 'wings-up', letter: true, shadow: false, idPrefix: `${id}bird` }), cx - size / 2, cy - size / 2, size, size);
}

/** What a card's stamp shows beyond its kind: a streak's days, if any, and the league whose stone it carries. */
interface News {
  days: number | null;
  tier: LeagueTier;
}

/** The longest streak whose days fit on the stamp: four figures. */
const MOST_DAYS = 9999;

/** The request as drawn: days that are not a valid count are dropped, and a league week with no tier uses the first. */
function newsOf(opts: ShareCardOptions): News {
  const counted = opts.kind === 'streak' && typeof opts.days === 'number' && Number.isFinite(opts.days) && opts.days >= 1;
  return { days: counted ? Math.min(MOST_DAYS, Math.floor(opts.days!)) : null, tier: opts.kind === 'league' && opts.tier ? opts.tier : 'dilop' };
}

/** A stamp's face: a picture in the middle of its paper and, for a streak, the days below it. */
function stampFace(kind: ShareCardKind, news: News, hue: HueSteps, dr: Drawing, id: string): string {
  const { w, h, margin } = STAMP;
  const inner = { x: margin, y: margin, w: w - margin * 2, h: h - margin * 2 };
  const { days } = news;
  const picture = (svg: string, size: number, lift = 0): string => placed(svg, w / 2 - size / 2, inner.y + (inner.h - size) / 2 - lift, size, size);
  let face: string;
  if (kind === 'lesson') face = picture(bookAppleSvg({ bites: 0, idPrefix: `${id}apple` }), 150);
  else if (kind === 'badge') face = picture(streakMedalSvg({ idPrefix: `${id}medal` }), 164);
  else if (kind === 'league') face = picture(leagueEmblemSvg({ tier: news.tier, idPrefix: `${id}tier` }), 164);
  else if (kind === 'peyvok') {
    // A game cover is square to its own edges, so it is cut round here as it is everywhere it is shown.
    const size = 152;
    const x = w / 2 - size / 2;
    const y = inner.y + (inner.h - size) / 2;
    const cut = dr.clip(`M${x + 32} ${y}h${size - 64}a32 32 0 0 1 32 32v${size - 64}a32 32 0 0 1 -32 32h${-(size - 64)}a32 32 0 0 1 -32 -32v${-(size - 64)}a32 32 0 0 1 32 -32Z`);
    face = `<g clip-path="url(#${cut})">${placed(gameEmblemSvg({ game: 'peyvok', idPrefix: `${id}game` }), x, y, size, size)}</g>`;
  } else if (days === null) face = picture(pathLandmarkSvg({ landmark: 'newroz', idPrefix: `${id}fire` }), 176);
  else {
    // The fire above, its days below like a stamp's price.
    const figures = String(days);
    const tall = figures.length > 3 ? 46 : 58;
    face =
      picture(pathLandmarkSvg({ landmark: 'newroz', idPrefix: `${id}fire` }), 136, 34) +
      numeral(dr, figures, w / 2, inner.y + inner.h - tall - 14, tall, { edge: hue.deep, top: '#ffffff', bottom: hue.tint });
  }
  return `<rect x="${inner.x}" y="${inner.y}" width="${inner.w}" height="${inner.h}" rx="12" fill="${hue.tint}"/>` + face;
}

/** Hevalo's cancelled stamp in the card's corner: its shade, paper, print and the postmark over its corner. */
function stamp(kind: ShareCardKind, news: News, scene: Scene, hue: HueSteps, dr: Drawing, id: string): string {
  const { w, h, x, y, tilt } = STAMP;
  const outline = stampOutline(w, h, stampShapeFor(w));
  // One ink that shows on the white paper and the sky alike, day or night.
  const ink = scene.night ? HUES.dark[scene.hue].base : hue.deep;
  const mark = bookPostmarkSvg({ ink, idPrefix: `${id}pm` });
  return (
    `<g transform="translate(${x} ${y}) rotate(${tilt} ${w / 2} ${h / 2})">` +
    `<path d="${outline}" transform="translate(7 11)" fill="#14112e" fill-opacity="${scene.night ? 0.35 : 0.14}"/>` +
    `<path d="${outline}" fill="#ffffff"/>` +
    stampFace(kind, news, hue, dr, id) +
    `</g>` +
    // Struck over the stamp's upper corner and onto the card, as a postmark is.
    placed(mark, x - 168, y - 78, 236, 236)
  );
}

/** A whole card as one picture. */
export function shareCardSvg(opts: ShareCardOptions): string {
  if (!isShareCardKind(opts.kind)) throw new RangeError(`art: no share card called ${String(opts.kind)}`);
  const { width: w, height: h } = SHARE_CARD;
  const scene = SCENES[opts.kind];
  const hue = HUES.light[scene.hue];
  const dark = HUES.dark[scene.hue];
  const news = newsOf(opts);
  // Identical requests give identical drawings, ids included.
  const id = prefixFor(opts.idPrefix, 'share-card', opts.kind, news.days ?? '', opts.kind === 'league' ? news.tier : '');
  const dr = new Drawing(id);
  const corner = stamp(opts.kind, news, scene, hue, dr, id);
  const body =
    backdrop(scene, hue, dark) +
    landmark(scene.landmark, 428, 404, scene.night, id) +
    hamo(scene.hamo, 150, 430, id) +
    bird(600, 128, 170, id) +
    corner +
    // He stands clear of the stamp, whose print is the news.
    hevalo(scene.hevalo, 760, 388, id) +
    rise(scene.night ? blend(dark.tint, '#000000', 0.18) : '#93d2a3');
  const { defs } = dr.parts();
  const label = opts.title ? `role="img" aria-label="${opts.title.replace(/[<>&"]/g, '')}"` : 'aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${label}>${defs}${body}</svg>`;
}
