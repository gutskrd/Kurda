/**
 * The picture a shared win carries: a postcard from Sêvan.
 *
 * Somebody who finishes a lesson, keeps a streak, earns a badge, has a good
 * league week or solves the day's word may share it. What goes out is a line
 * in their own words and a link, and wherever that link is pasted it is drawn
 * as a card with a picture. This is the picture: a small scene of the village
 * with the people of the road in it, the letter bird on its way out with the
 * news, and in the corner Hevalo's stamp, cancelled, because letters in
 * Hevalo travel by bird and a win sent to somebody is a postcard.
 *
 *   lesson   the blue gate by day: Hamo pleased with you, and Hevalo caught
 *            with the apple that was meant to be yours
 *   streak   the fire on its hill by night, with the days kept on the stamp
 *   badge    the hives in flower, and a medal on the stamp
 *   league   the old bridge, and the league's own stone on the stamp
 *   peyvok   the school, and the day's word game on the stamp
 *
 * Nothing on it is written: a drawing has no words (a font is not drawn the
 * same everywhere, and a word is read in one language), so the only marks
 * are a streak's days, in the figures the badges use. Nothing on it is about
 * who sent it, either: a card says what was done, never by whom.
 *
 * Everything in it is drawn already and is only placed here: the friends in
 * the book's poses (`bookCastSvg`, their rigs unchanged), the landmarks of
 * the lesson road, the stamp's outline, the postmark, the medal, the letter
 * bird. It is drawn for 1200 by 630, which is what a link preview shows
 * without cropping, and is the same picture at any size.
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

/** One colour taken part of the way to another: a shade of a hue's own step, for ground that stands in front of other ground. */
function blend(from: string, to: string, share: number): string {
  const part = (hex: string, at: number): number => parseInt(hex.slice(at, at + 2), 16);
  const mix = (at: number): string => Math.round(part(from, at) + (part(to, at) - part(from, at)) * share).toString(16).padStart(2, '0');
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

/** The card's size: what a link preview draws without cropping. */
export const SHARE_CARD = { width: 1200, height: 630 } as const;

/** The wins that have a card of their own. */
export const SHARE_CARD_KINDS = ['lesson', 'streak', 'badge', 'league', 'peyvok'] as const;
export type ShareCardKind = (typeof SHARE_CARD_KINDS)[number];

export function isShareCardKind(v: unknown): v is ShareCardKind {
  return (SHARE_CARD_KINDS as readonly unknown[]).includes(v);
}

export interface ShareCardOptions {
  kind: ShareCardKind;
  /** a streak's days, drawn on its stamp; left off, the stamp carries the fire alone */
  days?: number;
  /** the league a week was won in; the first league's stone without one */
  tier?: LeagueTier;
  /** its name for a screen reader; without one the picture is decorative and hidden */
  title?: string;
  idPrefix?: string;
}

/** A card's own scene: its hue, whether the sun is up, what stands on the hill and how the two friends take the news. */
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

/** A drawing that is a whole picture of its own, laid into a box of the card: it keeps its proportions and stands on the box's foot. */
function placed(svg: string, x: number, y: number, width: number, height: number): string {
  return svg
    .replace(/ width="[\d.]+" height="[\d.]+"(?= viewBox)/, '')
    // inside the card it is the card's own kind of thing already, and need not say so again
    .replace(' xmlns="http://www.w3.org/2000/svg"', '')
    // nor does a part of the picture have a name of its own: the card is one picture, named once or not at all
    .replace(/ role="img" aria-labelledby="[^"]*"/, '')
    .replace(/<title[^>]*>[^<]*<\/title>/, '')
    // a head that tilts leans out of its own box, and is not to lose an ear to it
    .replace('<svg ', `<svg x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}" preserveAspectRatio="xMidYMax meet" overflow="visible" `);
}

/** How wide a picture is for its height, read from its own size. */
function ratioOf(svg: string): number {
  const box = / width="([\d.]+)" height="([\d.]+)"/.exec(svg);
  return box ? Number(box[1]) / Number(box[2]) : 1;
}

/** The sky, what hangs in it, and the two hills. Flat planes: a far hill, a near one, and nothing shaded. */
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
      // a night the colour of the hue, deep but not black, so the fire has something to light
      `<rect width="${w}" height="${h}" fill="${dark.wash}"/>` +
      `<g fill="${dark.deep}">${stars}</g>` +
      // the moon is the part of one round that another does not cover
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
  // a landmark stands a little above the foot of its own canvas, on its own shade
  return placed(pathLandmarkSvg({ landmark: which, dark, idPrefix: `${id}lm` }), cx - size / 2, FEET + size * 0.07 - size, size, size);
}

/** Hamo standing on the hill, `height` tall, his middle at `cx`. */
function hamo(pose: BookPose<'hamo'>, cx: number, height: number, id: string): string {
  const svg = bookCastSvg({ who: 'hamo', pose, crop: 'full', idPrefix: `${id}hamo` });
  const width = height * ratioOf(svg);
  return placed(svg, cx - width / 2, FEET - height, width, height);
}

/** Hevalo close to, from the chest up, coming into the picture from its lower edge as he comes into everything. */
function hevalo(pose: BookPose<'hevalo'>, cx: number, size: number, id: string): string {
  const svg = bookCastSvg({ who: 'hevalo', pose, idPrefix: `${id}deer` });
  // high enough that what he holds in his mouth is in the picture; the rise in front of him hides where his chest ends
  return placed(svg, cx - size / 2, SHARE_CARD.height - size - RISE, size, size);
}

/** How far Hevalo stands up out of the card's lower edge, behind the rise of ground in front of him. */
const RISE = 30;

/** The rise of ground nearest of all, which he looks over. */
function rise(fill: string): string {
  const { width: w, height: h } = SHARE_CARD;
  return `<path d="M${w - 600} ${h}C${w - 520} ${h - RISE - 22} ${w - 250} ${h - RISE - 26} ${w} ${h - RISE - 4}V${h}Z" fill="${fill}"/>`;
}

/** The letter bird in the sky, off with the news. */
function bird(cx: number, cy: number, size: number, id: string): string {
  return placed(letterBirdSvg({ bird: 2, pose: 'wings-up', letter: true, shadow: false, idPrefix: `${id}bird` }), cx - size / 2, cy - size / 2, size, size);
}

/** What a card's stamp has to say beyond its kind: a streak's days, or none to draw, and the league it is the stone of. */
interface News {
  days: number | null;
  tier: LeagueTier;
}

/** The longest streak whose days fit on the stamp: four figures. */
const MOST_DAYS = 9999;

/** What was asked for, as it will be drawn: days that are no count of days are left off, and a week with no league named is the first league's. */
function newsOf(opts: ShareCardOptions): News {
  const counted = opts.kind === 'streak' && typeof opts.days === 'number' && Number.isFinite(opts.days) && opts.days >= 1;
  return { days: counted ? Math.min(MOST_DAYS, Math.floor(opts.days!)) : null, tier: opts.kind === 'league' && opts.tier ? opts.tier : 'dilop' };
}

/** What a stamp shows: a picture in the middle of its paper, and under it, for a streak, its days. */
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
    // a game's cover is a square to its own edges: it is cut round, as it is wherever it is shown
    const size = 152;
    const x = w / 2 - size / 2;
    const y = inner.y + (inner.h - size) / 2;
    const cut = dr.clip(`M${x + 32} ${y}h${size - 64}a32 32 0 0 1 32 32v${size - 64}a32 32 0 0 1 -32 32h${-(size - 64)}a32 32 0 0 1 -32 -32v${-(size - 64)}a32 32 0 0 1 32 -32Z`);
    face = `<g clip-path="url(#${cut})">${placed(gameEmblemSvg({ game: 'peyvok', idPrefix: `${id}game` }), x, y, size, size)}</g>`;
  } else if (days === null) face = picture(pathLandmarkSvg({ landmark: 'newroz', idPrefix: `${id}fire` }), 176);
  else {
    // the fire above, and its days under it as a stamp has its price
    const figures = String(days);
    const tall = figures.length > 3 ? 46 : 58;
    face =
      picture(pathLandmarkSvg({ landmark: 'newroz', idPrefix: `${id}fire` }), 136, 34) +
      numeral(dr, figures, w / 2, inner.y + inner.h - tall - 14, tall, { edge: hue.deep, top: '#ffffff', bottom: hue.tint });
  }
  return `<rect x="${inner.x}" y="${inner.y}" width="${inner.w}" height="${inner.h}" rx="12" fill="${hue.tint}"/>` + face;
}

/** Hevalo's stamp in the card's corner, cancelled: its shade, its paper, what is printed on it, and the postmark struck over its corner. */
function stamp(kind: ShareCardKind, news: News, scene: Scene, hue: HueSteps, dr: Drawing, id: string): string {
  const { w, h, x, y, tilt } = STAMP;
  const outline = stampOutline(w, h, stampShapeFor(w));
  // one ink that shows on the white paper and on the sky alike, by day and by night
  const ink = scene.night ? HUES.dark[scene.hue].base : hue.deep;
  const mark = bookPostmarkSvg({ ink, idPrefix: `${id}pm` });
  return (
    `<g transform="translate(${x} ${y}) rotate(${tilt} ${w / 2} ${h / 2})">` +
    `<path d="${outline}" transform="translate(7 11)" fill="#14112e" fill-opacity="${scene.night ? 0.35 : 0.14}"/>` +
    `<path d="${outline}" fill="#ffffff"/>` +
    stampFace(kind, news, hue, dr, id) +
    `</g>` +
    // struck over the stamp's upper corner and on to the card, as a postmark is
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
  // two cards that are drawn the same are the same drawing, to the letter
  const id = prefixFor(opts.idPrefix, 'share-card', opts.kind, news.days ?? '', opts.kind === 'league' ? news.tier : '');
  const dr = new Drawing(id);
  const corner = stamp(opts.kind, news, scene, hue, dr, id);
  const body =
    backdrop(scene, hue, dark) +
    landmark(scene.landmark, 428, 404, scene.night, id) +
    hamo(scene.hamo, 150, 430, id) +
    bird(600, 128, 170, id) +
    corner +
    // he stands clear of the stamp: what is printed on it is the news
    hevalo(scene.hevalo, 760, 388, id) +
    rise(scene.night ? blend(dark.tint, '#000000', 0.18) : '#93d2a3');
  const { defs } = dr.parts();
  const label = opts.title ? `role="img" aria-label="${opts.title.replace(/[<>&"]/g, '')}"` : 'aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${label}>${defs}${body}</svg>`;
}
