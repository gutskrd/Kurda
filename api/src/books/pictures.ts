/**
 * Which drawing goes with what in the book: word pictures, the scene each lesson opens with, a person's emblem, and
 * each chapter's colour. Pure: it names drawings (pdf.ts draws them), so every choice is testable without printing.
 *
 * A word's picture is the one the lessons show for it (the right card of a "pick the picture" item) or the word picture
 * of that exact word; numbers get their figure, colours a dab of paint, and a few road words have book-only drawings. A
 * word without a drawing of exactly that thing gets none: a picture dictionary that guesses teaches the wrong word.
 *
 * A scene is composed from the lesson's beat: which friends are in it and their mood, the time of day or snow, and the
 * two or three named things that have drawings, so a retold lesson's scene follows. The sky has one light (sun or moon,
 * never both), and nothing covers it (`sceneLayout` places every part and keeps the sky clear).
 */
import { readFileSync } from 'node:fs';
import {
  BOOK_BACKDROP,
  BOOK_POSES,
  BOOK_SETTINGS,
  BOOK_SPOTS,
  PATH_LANDMARKS,
  WORD_PICTURES,
  bookRidgeAt,
  characterArt,
  cropBox,
  type BookPaint,
  type BookPose,
  type BookSetting,
  type BookSilhouette,
  type BookSpot,
  type CharacterId,
  type HueName,
  type PathLandmark,
  type WordPictureId,
} from '@kurda/shared';
import type { BookLesson, BookWord } from './road-book.js';

/** A drawing the book can show, by what draws it. */
export type BookPicture =
  | { kind: 'word'; id: WordPictureId }
  | { kind: 'spot'; spot: BookSpot }
  | { kind: 'paint'; colour: BookPaint }
  | { kind: 'landmark'; landmark: PathLandmark }
  | { kind: 'cast'; who: CharacterId; pose: string }
  | { kind: 'sapling' }
  /** one of the road's people the book has no portrait for, as a profile silhouette */
  | { kind: 'silhouette'; who: BookSilhouette }
  /** a number, set as its figure in the book's own type */
  | { kind: 'figure'; text: string };

const word = (id: WordPictureId): BookPicture => ({ kind: 'word', id });
const spot = (id: BookSpot): BookPicture => ({ kind: 'spot', spot: id });
const landmark = (id: PathLandmark): BookPicture => ({ kind: 'landmark', landmark: id });
const cast = <K extends CharacterId>(who: K, pose: BookPose<K>): BookPicture => ({ kind: 'cast', who, pose: pose as string });
const silhouette = (who: BookSilhouette): BookPicture => ({ kind: 'silhouette', who });

const isWordPicture = (id: string): id is WordPictureId => Object.hasOwn(WORD_PICTURES, id);

/** The word picture drawn for each Kurdish word. */
const BY_WORD = new Map<string, WordPictureId>((Object.keys(WORD_PICTURES) as WordPictureId[]).map((id) => [WORD_PICTURES[id].ku, id]));

/** The words that have a drawing of their own in the book, or in the valley: each is that very thing. */
const DRAWN: Readonly<Record<string, BookPicture>> = {
  simbêl: spot('moustache'),
  bilûr: spot('flute'),
  wêne: spot('photo'),
  gol: spot('lake'),
  sobe: spot('stove'),
  defter: spot('notebook'),
  nêrdewan: spot('ladder'),
  tûr: spot('sack'),
  çira: spot('lamp'),
  şop: spot('hoofprints'),
  bajar: spot('town'),
  şitil: { kind: 'sapling' },
  bazar: landmark('bazaar'),
  dergeh: landmark('gate'),
  qehwexane: landmark('teahouse'),
  // the teacher of the road is Xezo; a friend is not drawn as the deer, so that no one learns heval as "deer"
  mamoste: cast('xezo', 'smiling'),
};

/** The colour words, by their English meaning in the plan. */
const PAINTS: Readonly<Record<string, BookPaint>> = { red: 'red', blue: 'blue', green: 'green', yellow: 'yellow', black: 'black', white: 'white' };

/** The numbers the plan teaches, by their English meaning. */
const FIGURES: Readonly<Record<string, string>> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19',
  twenty: '20', thirty: '30', forty: '40', fifty: '50', 'a hundred': '100', 'a thousand': '1000', first: '1.', second: '2.',
};

/**
 * A word's picture, or null when nothing drawn is exactly that word: the lessons' own picture, then the word picture of
 * that word, a number's figure, a colour's paint, and the book's own drawings.
 */
export function pictureForWord(w: Pick<BookWord, 'ku' | 'en' | 'pos' | 'picture'>): BookPicture | null {
  if (w.picture && isWordPicture(w.picture)) return word(w.picture);
  const own = BY_WORD.get(w.ku);
  if (own) return word(own);
  if (w.pos === 'num' && Object.hasOwn(FIGURES, w.en)) return { kind: 'figure', text: FIGURES[w.en]! };
  if (w.pos === 'adj' && Object.hasOwn(PAINTS, w.en)) return { kind: 'paint', colour: PAINTS[w.en]! };
  return Object.hasOwn(DRAWN, w.ku) ? DRAWN[w.ku]! : null;
}

/**
 * What stands beside each of the road's people and animals: the three friends' portraits, a profile silhouette for every
 * other person (a person is never shown as a thing), and each animal itself.
 */
const EMBLEMS: Readonly<Record<string, BookPicture>> = {
  Hamo: cast('hamo', 'proud'),
  Xezo: cast('xezo', 'smiling'),
  Hevalo: cast('hevalo', 'caught'),
  Nazê: silhouette('woman'),
  Baran: silhouette('boy'),
  Hêvî: silhouette('girl'),
  Şemsê: silhouette('grandmother'),
  Ferhad: silhouette('farmer'),
  Mîrza: silhouette('seller'),
  Azad: silhouette('doctor'),
  Bişar: silhouette('shepherd'),
  Bozo: word('donkey'),
  Şêro: word('dog'),
  // the doe of the summer pastures has no antlers: she is not the deer of the word ask
  Zerê: spot('doe'),
  Kawa: silhouette('smith'),
  Şengê: word('kid'),
  Pengê: word('kid'),
};

/** The emblem of one of the road's people or animals, or null for someone it has no drawing for. */
export function pictureForName(name: string): BookPicture | null {
  return Object.hasOwn(EMBLEMS, name) ? EMBLEMS[name]! : null;
}

// ───────────────────────────────────────────────────────────── chapter colours

/**
 * Each chapter's hue from the app's nine families. No chapter repeats the previous chapter's hue or its neighbour on
 * the wheel, so each new chapter visibly changes colour.
 */
export const CHAPTER_HUES: readonly HueName[] = ['blue', 'orange', 'green', 'red', 'indigo', 'teal', 'gold', 'pink', 'blue', 'green', 'orange', 'violet'];

/** The hue of a chapter, by its number from 1; a road longer than twelve chapters starts the colours again. */
export function chapterHue(chapter: number): HueName {
  const at = (((Math.floor(chapter) - 1) % CHAPTER_HUES.length) + CHAPTER_HUES.length) % CHAPTER_HUES.length;
  return CHAPTER_HUES[at]!;
}

/**
 * The drawing a chapter is known by: its landmark beside the lesson path, except the sixth, whose road leads to Kobanî.
 */
export function chapterEmblem(chapter: number): BookPicture {
  if (chapter === 6) return spot('town');
  const at = (((Math.floor(chapter) - 1) % PATH_LANDMARKS.length) + PATH_LANDMARKS.length) % PATH_LANDMARKS.length;
  return landmark(PATH_LANDMARKS[at]!);
}

// ───────────────────────────────────────────────────────────── telling a beat

/** Stands for a space inside a quotation while a text is split into sentences: a character no course text has. */
const HELD = '\ue000';

/**
 * A beat's sentences. A closing quote belongs to the sentence it ends, and sentences inside a quotation never end the
 * sentence quoting them.
 */
export function sentencesOf(text: string): string[] {
  return text
    .trim()
    .replace(/“[^”]*”/g, (said) => said.replace(/\s/g, HELD))
    .split(/(?<=[.!?…][”’)]?)\s+(?=[“‘(]?\p{Lu})/u)
    .map((s) => s.replaceAll(HELD, ' ').trim())
    .filter(Boolean);
}

/** How much of its opening a telling keeps before it skips on to the ending: enough to say where we are and who is there. */
const OPENING = 48;

/** The least room an ending must leave for the opening: with less, the beat is told from its start instead. */
const OPENING_AT_LEAST = 34;

/** An ending shorter than this does not stand by itself (“Hevalo looks at the sky.”): it takes what leads up to it along. */
const ENDING_ALONE = 42;

/** Where a sentence may be cut: between two of its clauses. */
const CLAUSE = /(, |; |: | — )/g;

/** Where a sentence with no such place may be left off instead: before a word that joins the rest of it on. */
const JOINED = / (?=(?:and|but|who|which|where|when|while|because|until) )/g;

/** Words a cut-off sentence does not end on: they only lead on to what was cut. */
const LEADING_ON = new Set([
  'a', 'an', 'and', 'as', 'at', 'because', 'but', 'by', 'for', 'from', 'he', 'her', 'his', 'how', 'if', 'in', 'into', 'is', 'it', 'not', 'of', 'on', 'or', 'she', 'so',
  'than', 'that', 'the', 'their', 'then', 'through', 'to', 'what', 'when', 'where', 'which', 'while', 'who', 'with',
]);

/** How a clause begins when it carries a sentence on, so that it reads on naturally after an ellipsis. */
const CARRIES_ON = /^(and|but|so|then|because|until|while|when|where|which|who) /;

const HEVALO = /Hevalo|the deer/;
const count = (text: string, mark: string): number => text.split(mark).length - 1;
/** Whether a piece of a sentence closes every quotation and bracket it opens, and opens every one it closes. */
const balanced = (text: string): boolean => count(text, '“') === count(text, '”') && count(text, '(') === count(text, ')');

/**
 * The start of an over-long sentence in at most `max` characters: up to the last clause ending in that room, or the
 * last join point (either is `clean`), else up to a word that can end a line; never into an unclosed quotation or
 * bracket.
 */
function cutShort(sentence: string, max: number): { cut: string; clean: boolean } {
  const head = sentence.slice(0, Math.max(0, max - 1));
  const last = (marks: RegExp): number => Math.max(...[...sentence.slice(0, max + 8).matchAll(marks)].map((m) => m.index).filter((at) => at >= 12 && at < head.length), -1);
  const clause = last(CLAUSE) >= 0 ? last(CLAUSE) : last(JOINED);
  const clean = clause >= 0;
  let cut = head.slice(0, clean ? clause : Math.max(0, head.lastIndexOf(' '))).trimEnd();
  for (const [open, close] of [['“', '”'], ['(', ')']] as const) {
    const opened = cut.lastIndexOf(open);
    if (opened > cut.lastIndexOf(close)) cut = cut.slice(0, opened).trimEnd();
  }
  let words = cut.split(' ');
  // a cut made between clauses ends where the clause does; only a cut in the middle of one is pulled back off a word that leads on
  while (!clean && words.length > 1 && LEADING_ON.has(words.at(-1)!.toLowerCase())) words = words.slice(0, -1);
  return { cut: `${words.join(' ').replace(/[,:;—]$/, '').trimEnd()}…`, clean };
}

/**
 * The endings of an over-long sentence that fit in `room` characters, longest first: each from the start of a clause,
 * as long as it still says something and opens no unclosed quotation.
 */
function tailsOf(sentence: string, room: number): string[] {
  return [...sentence.matchAll(CLAUSE)].map((m) => sentence.slice(m.index + m[0].length)).filter((tail) => tail.length <= room && tail.length >= 24 && balanced(tail));
}

/**
 * A beat told in at most `max` characters: whole if short enough, else its opening and its ending. The ending is the
 * last thing said of Hevalo (who usually has the last word) or the last sentence, told whole where possible, with what
 * leads up to it if too short alone, and from a clause on if too long. The opening is as many whole sentences as fit,
 * the last cut at a clause if even one is too long. An ellipsis marks every omission.
 */
export function tellBeat(beat: string, max: number): string {
  const all = sentencesOf(beat);
  const whole = all.join(' ');
  if (whole.length <= max) return whole;
  /** The beat from its start, in whole sentences up to (not including) sentence `end`, as far as `room` goes; the first that does not fit is cut where that helps. */
  const opening = (end: number, room: number): { told: string; reached: boolean; clean: boolean } => {
    let told = '';
    let at = 0;
    while (at < end && told.length + (told ? 1 : 0) + all[at]!.length <= room) told += `${told ? ' ' : ''}${all[at++]}`;
    if (at === end) return { told, reached: true, clean: true };
    // a cut sentence earns its place only where the telling would otherwise hardly begin, or would waste most of its room
    const left = room - told.length - (told ? 1 : 0);
    if (told.length >= OPENING && left < room * 0.4) return { told, reached: false, clean: true };
    const { cut, clean } = left >= 24 ? cutShort(all[at]!, left) : { cut: '', clean: true };
    return cut.length > 12 ? { told: `${told}${told ? ' ' : ''}${cut}`, reached: false, clean } : { told, reached: false, clean: told !== '' };
  };
  /** The ways the beat may end at sentence `end` in at most `room` characters: each with the sentence it starts in, and `partly` when that sentence is not told from its start. */
  const closings = (end: number, room: number): Array<{ ending: string; from: number; partly: boolean }> => {
    let ending = all[end]!;
    let from = end;
    // only what Hevalo does is worth coming in on halfway through a sentence
    if (ending.length > room) return HEVALO.test(ending) ? tailsOf(ending, room).map((tail) => ({ ending: tail, from, partly: true })) : [];
    while (ending.length < ENDING_ALONE && from > 1) {
      const before = all[from - 1]!;
      if (before.length + 1 + ending.length > room) {
        const tails = tailsOf(before, room - ending.length - 1).map((tail) => ({ ending: `${tail} ${ending}`, from: from - 1, partly: true }));
        return tails.length > 0 ? tails : [{ ending, from, partly: false }];
      }
      ending = `${before} ${ending}`;
      from -= 1;
    }
    return [{ ending, from, partly: false }];
  };
  let hevalo = all.length - 1;
  while (hevalo > 0 && !HEVALO.test(all[hevalo]!)) hevalo -= 1;
  for (const end of [hevalo, all.length - 1]) {
    if (end < 1) continue;
    let best: { told: string; score: number } | null = null;
    for (const close of closings(end, max - OPENING_AT_LEAST - 3)) {
      // an ending chosen for what Hevalo does in it still says that it was him
      if (HEVALO.test(all[end]!) && !HEVALO.test(close.ending)) continue;
      const { told, reached, clean } = opening(close.from, max - close.ending.length - 3);
      if (told === '') continue;
      // an ellipsis where something was left out, unless the telling already trails off there; never a full stop and then an ellipsis:
      // a whole sentence is followed by the next whole one, and a stop before what only carries a sentence on becomes the ellipsis
      const joined =
        (reached && !close.partly) || /…[”’]?$/.test(told) || (/[.!?][”’)]?$/.test(told) && /^[“‘(]?\p{Lu}/u.test(close.ending))
          ? `${told} ${close.ending}`
          : /[.!?]$/.test(told)
            ? `${told.slice(0, -1)}… ${close.ending}`
            : `${told}… ${close.ending}`;
      // best where the opening ends where a clause does and the ending begins where one does; of two as good, the one that tells more
      const score = (clean ? 2 : 0) + (!close.partly || CARRIES_ON.test(close.ending) ? 1 : 0);
      if (!best || score > best.score) best = { told: joined, score };
    }
    if (best) return best.told;
  }
  // no ending fits beside an opening: the beat as far as it goes
  return opening(all.length, max).told || cutShort(all[0] ?? '', max).cut;
}

// ───────────────────────────────────────────────────────────── scenes

/** How near a scene is seen: everyone whole in their place (`wide`), head to waist across a table (`mid`), or head and shoulders (`close`). */
export type SceneShot = 'wide' | 'mid' | 'close';

/**
 * Where a thing stands in a scene: on the floor among the people (`ground`), set back where the land begins (`back`),
 * at the near edge (`front`), in someone's hands or the deer's mouth (`hand`, `mouth`), on someone's head (`head`), on
 * another thing (`on`), on a room's wall or sill (`wall`, `sill`), or in the sky.
 */
export type ScenePlace = 'ground' | 'back' | 'front' | 'hand' | 'mouth' | 'head' | 'on' | 'wall' | 'sill' | 'sky';

/** One of the three friends in a scene: who, how they hold themselves, and where they stand. */
export interface SceneFigure {
  who: CharacterId;
  pose: string;
  /** their middle across the panel, from 0 (its left edge) to 1; by default the sides */
  x?: number;
  /** set back where the land begins, small, behind everything nearer */
  back?: boolean;
  /** turned to look the other way; Hamo, who looks to his left, is turned by default on the right of a scene so he looks into it */
  flip?: boolean;
  /** how many points lower they stand than the others, as someone half hidden behind a stove or a wall does */
  down?: number;
}

/** A thing in a scene, and where it is. */
export interface SceneThing {
  picture: BookPicture;
  at: ScenePlace;
  /** its middle across the panel from 0 to 1; on another thing, from -1 to 1 across that thing's top; on the sill, across the window */
  x?: number;
  /** in the sky or on the wall: its middle down the panel, from 0 to 1 */
  y?: number;
  /** whose hands, mouth or head it is in or on */
  of?: CharacterId;
  /** what it stands on: the place of that thing in the scene's list */
  on?: number;
  /** times the size it would have there */
  size?: number;
}

/** A room a scene is set in: where its window is across the panel (none, for a room without one), and whether a kilim lies on its floor. */
export interface SceneRoom {
  window: number | null;
  rug?: boolean;
}

export interface BookScene {
  setting: BookSetting;
  /** what lights its sky and is in the picture: the sun, the moon (full when the beat says so), or nothing */
  orb: 'sun' | 'moon' | 'full moon' | null;
  shot: SceneShot;
  /** indoors, the setting is what the window shows */
  room: SceneRoom | null;
  /** who of the three friends is in it, from the left, and how each holds themselves */
  cast: SceneFigure[];
  /** the things of the beat there is a drawing of, in the order it names them */
  props: BookPicture[];
  /** where each thing of the scene is */
  things: SceneThing[];
}

/** A word or a phrase where the beat has it as whole words (Kurdish letters count as letters: "tenûr" is not in "Miştenûr"). */
const named = (pattern: string): RegExp => new RegExp(`(?<![\\p{L}])(?:${pattern})(?![\\p{L}])`, 'iu');

/** How Hevalo takes a scene, by what the beat says of him: the first that fits. */
const HEVALO_MOODS: ReadonlyArray<readonly [RegExp, BookPose<'hevalo'>]> = [
  // what he is chewing when the speech goes missing is not an apple, and he has never seen it
  [named('chewing something papery|papery'), 'innocent'],
  [named('looks? at the sky|gazing at the mountain|not hungry|doesn’t want anything|shakes his head|pretends?|lying very still|innocent|says nothing|looks away'), 'innocent'],
  [named('asleep|sleeps|dreaming'), 'asleep'],
  [named('sad|sorry|offended|bolts|bolting'), 'sad'],
  [named('takes three|your apple|apple in (each|his)|eats?|eaten|ate|eating|bite|crunching|crunches|peel|all over his face|chewing|round belly|has six|Hevalo is gone|walks in with an apple'), 'caught'],
  [named('sniffs?|nose|ears|inspects|watches|looks? (straight|back)|cannot keep still|has heard|drops|hides'), 'curious'],
  [named('drinks?|milk|blows'), 'munching'],
  [named('hops?|pleased|happy|agrees|nods|loves|votes|friend|leads|races|trots|stamps|offers|sharing|brings|eyes for|gets the last apple|with an apple'), 'pleased'],
];

/** How Hamo takes a scene: the first that fits. Quiet ways of telling are read before the alarms, so a calm beat is never drawn as a shock. */
const HAMO_MOODS: ReadonlyArray<readonly [RegExp, BookPose<'hamo'>]> = [
  [named('nap|goes to sleep|five minutes'), 'asleep'],
  [named('without a word|quietly|sits beside|tells a story|from his childhood|remembers|softly'), 'telling'],
  [named('shocked|goes pale|astonished|forgot|is lost|gets lost|jumps up|cannot find|alarms?|afraid|sheepishly|with both hands|cannot get out of bed'), 'shocked'],
  [named('laughs?|delighted|beams|joker|happily|laughter'), 'laughing'],
  [named('admits|nizanim|never seen|swears|eyebrow|detective|has to admit|does not know|doesn’t know|nothing to say|listens'), 'doubtful'],
  [named('moustache|proud|proudly|pleased|solemn|solemnly|announces|declares|magnificent|ceremony|promises?|is sure|the best|wisely|graciously'), 'proud'],
  [named('tells?|explains|reads|story|tale|describes|practises|speech|teaches'), 'telling'],
];

const XEZAL_MOODS: ReadonlyArray<readonly [RegExp, BookPose<'xezo'>]> = [[named('teaching|tells|says|speech|decided|stands up|turns to'), 'telling']];

/**
 * What beats name that has a drawing small enough to read in a scene; a thing's place among the props is where the beat
 * first names it. The land itself (mountain, river, town) is the backdrop, never a prop, and a thing only used in a
 * comparison ("as big as a horse") is not there.
 */
const PROPS: ReadonlyArray<readonly [RegExp, BookPicture]> = (
  [
    ['walnut tree', spot('walnutTree')],
    ['apple trees?|orchard', spot('appleTree')],
    ['apples?', word('apple')],
    ['tea ?house|teahouse', landmark('teahouse')],
    ['tea|glass(es)? of tea', word('tea')],
    ['bread|crusts?', word('bread')],
    ['gate', landmark('gate')],
    ['milk', spot('jug')],
    ['water', word('water')],
    ['sugars?|spoonful', word('sugar')],
    ['honey', word('honey')],
    ['hens?|rooster', word('hen')],
    ['eggs?', word('egg')],
    ['cheese', word('cheese')],
    ['yoghurt', word('yoghurt')],
    ['Bozo|donkeys?|mule', word('donkey')],
    ['Şêro|dogs?', word('dog')],
    ['cats?', word('cat')],
    ['white goat', spot('whiteGoat')],
    ['goat', word('goat')],
    ['kids?|Şengê', word('kid')],
    ['lambs?', word('lamb')],
    ['ram', spot('ram')],
    ['sheep|flocks?|ewes?', word('ewe')],
    ['cow', word('cow')],
    ['horse', word('horse')],
    ['wolf|wolves', word('wolf')],
    ['bear', word('bear')],
    ['fox', word('fox')],
    ['snake', word('snake')],
    ['Zerê|doe|two deer', spot('doe')],
    ['fish', word('fish')],
    ['eagle|crow', spot('eagle')],
    ['birds?', spot('flyingBird')],
    ['flute', spot('flute')],
    ['photos?', spot('photo')],
    ['maps?', word('map')],
    ['tin|marbles', spot('tin')],
    ['lake', spot('lake')],
    ['stove', spot('stove')],
    ['calendar', spot('calendar')],
    ['notebook', spot('notebook')],
    ['ladders?', spot('ladder')],
    ['sacks?', spot('sack')],
    ['lamp', spot('lamp')],
    ['tracks', spot('hoofprints')],
    ['bus', word('bus')],
    ['tractor', word('tractor')],
    ['train', word('train')],
    ['plane', word('plane')],
    ['taxi', word('taxi')],
    ['tickets?', word('ticket')],
    ['clocks?|alarms?|o’clock|noon|at one', word('clock')],
    ['phones?', word('phone')],
    ['books?|bookshop', word('book')],
    ['the letter', word('letter')],
    ['baskets?|crates?', word('basket')],
    ['money|prices?|pays?|haggling', word('money')],
    ['grapes', word('grapes')],
    ['tomatoes', word('tomato')],
    ['potatoes', word('potato')],
    ['onions?', word('onion')],
    ['meat', word('meat')],
    ['walnuts?', word('walnut')],
    ['flowers?|blossom', word('flower')],
    ['roses?', word('rose')],
    ['school', landmark('school')],
    ['(from|by|at) the spring|here is the spring|the shop, the spring', word('spring')],
    ['trees?', word('tree')],
    ['stone house|ruins?', spot('ruin')],
    ['flat roof|roof', spot('houseLadder')],
    ['house', spot('flatHouse')],
    ['(?<!next )doors?', spot('flatHouse')],
    ['windows?', word('window')],
    ['table', spot('lowTable')],
    ['chair', word('chair')],
    ['tenûr', word('tenur')],
    ['tents?', word('tent')],
    ['fires?|firewood', word('fire')],
    ['snow|snowflakes', word('snow')],
    ['rain', word('rain')],
    ['clouds?|storm', word('cloud')],
    ['stars', word('star')],
    ['moon', word('moon')],
    ['sun|sunshine|sunset', word('sun')],
    ['stones?|rocks?', spot('rock')],
    ['drum', word('drum')],
    ['medicine|pills', word('medicine')],
    ['leather bag|doctor’s bag|Doctor Azad', spot('doctorBag')],
    ['tooth', word('tooth')],
    ['muddy|boots', spot('boots')],
    ['shoes?', word('shoe')],
    ['bags?|parcels|saddlebags', word('bag')],
    ['cap', word('cap')],
    ['present|birthday', word('gift')],
    ['spoon', word('spoon')],
    ['wheat', word('wheat')],
    ['maize', word('corn')],
    ['in love', word('heart')],
    ['meal cloth|breakfast cloth|a cloth', spot('cloth')],
    ['churn', spot('churn')],
    ['saj', spot('saj')],
  ] as const
).map(([pattern, picture]) => [named(pattern), picture] as const);

/** A thing a beat only likens something to, which is not in the scene: "as big as a horse", "like a drum", "eats like five deer". */
const LIKENED = /(?:\b(?:like|as big as|as tall as|as soft as|as thin as|as cold as)\s+(?:a |an |the |five |two |three )?)([\p{L}’-]+)/giu;

const same = (a: BookPicture, b: BookPicture): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The sentences of a beat that speak of someone. */
function about(sentences: readonly string[], who: RegExp): string {
  return sentences.filter((s) => who.test(s)).join(' ');
}

/** The things a text names that there is a drawing of, in the order it names them, each once; what it only likens something to is left out. */
export function propsOf(text: string): BookPicture[] {
  const plain = text.replace(LIKENED, (whole) => whole.replace(/[\p{L}’-]+$/u, ''));
  const found: Array<{ at: number; end: number; picture: BookPicture }> = [];
  for (const [test, picture] of PROPS) {
    // the first place the text names it that a longer name has not already taken: "white goat" is not also a goat, nor "walnut tree" a walnut
    const hit = [...plain.matchAll(new RegExp(test.source, `${test.flags}g`))].find((m) => !found.some((f) => m.index < f.end && m.index + m[0].length > f.at));
    if (hit && !found.some((f) => same(f.picture, picture))) found.push({ at: hit.index, end: hit.index + hit[0].length, picture });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.picture);
}

/** How many things a scene composed from its words alone shows: one between two people, where there is little room, and three beside one. */
const PROPS_MAX = { alone: 3, together: 1 } as const;

/** The time of day or the weather a beat sets its scene in. The weather of a memory is not the scene's, and the time words count before a word like "night" that only states a rule. */
function settingOf(beat: string): BookSetting {
  // what happened long ago, or what someone remembers, is told here and now: its weather stays in the telling
  const now = beat.replace(/(remembers?|when he was|when she was|his first winter|her youth|as a boy|as a girl|at (eight|nine|ten)\b)[^.!?]*[.!?]?/giu, '');
  if (named('snow melts|thaws?|sun is back|sun returns').test(now)) return 'day';
  if (named('snowy night|snow|snowflakes|winter|snowed in').test(now)) return 'snow';
  if (named('dusk|sunset|sun goes down|evening|dying fire|late one evening').test(now)) return 'dusk';
  if (named('the next morning|morning|dawn|at breakfast').test(now)) return 'day';
  const night = now.replace(/at night|a whole night of|morning to night|when the stars came out|nine at night/giu, '');
  return named('night|stars|moon|midnight|dark').test(night) ? 'night' : 'day';
}

/** Things that hang in the sky of a scene rather than stand on its ground. */
const ALOFT = new Set(['word:sun', 'word:moon', 'word:star', 'word:cloud', 'word:rain', 'word:snow', 'word:plane', 'spot:flyingBird', 'spot:eagle']);
const keyOf = (p: BookPicture): string =>
  p.kind === 'word' ? `word:${p.id}` : p.kind === 'spot' ? `spot:${p.spot}` : p.kind === 'landmark' ? `landmark:${p.landmark}` : p.kind === 'cast' ? `cast:${p.who}` : p.kind === 'silhouette' ? `silhouette:${p.who}` : p.kind;
export const aloft = (p: BookPicture): boolean => ALOFT.has(keyOf(p));

/** A stove, a table, a bed or a calendar leading a scene puts it indoors. */
const INDOORS = new Set(['spot:stove', 'spot:calendar', 'spot:lowTable', 'spot:bedding', 'word:chair', 'word:honey', 'spot:frames', 'spot:lamp']);

/** What the land and the buildings are: set back on the scene's floor, never held or put on a table. */
const SET_BACK = new Set([
  'word:house', 'word:tree', 'word:orchard', 'word:tent', 'word:school', 'word:mill', 'word:spring', 'word:tenur', 'word:bus', 'word:train', 'word:taxi', 'word:tractor', 'word:car',
  'spot:appleTree', 'spot:walnutTree', 'spot:flatHouse', 'spot:houseLadder', 'spot:ruin', 'spot:lake', 'spot:town', 'spot:ladder', 'spot:churn',
]);

/**
 * The scene a lesson opens with, composed from its printed text and new words: who is in it and how they stand, time of
 * day or snow, indoors or out, and the named things with drawings (the lesson's pictured words among them), each where
 * such a thing goes: small things in Hamo's hands, animals on the ground, buildings and trees set back.
 */
export function sceneFor(beat: string, words: ReadonlyArray<Pick<BookWord, 'ku' | 'en' | 'pos' | 'picture'>> = []): BookScene {
  const sentences = sentencesOf(beat);
  const setting = settingOf(beat);

  const who: Array<{ who: CharacterId; at: number; pose: string }> = [];
  const mood = <P extends string>(moods: ReadonlyArray<readonly [RegExp, P]>, text: string, fallback: P): P => moods.find(([test]) => test.test(text))?.[1] ?? fallback;
  const hevalo = beat.search(named('Hevalo|the deer'));
  if (hevalo >= 0) who.push({ who: 'hevalo', at: hevalo, pose: mood(HEVALO_MOODS, about(sentences, named('Hevalo|the deer')), 'plain') });
  const xezal = beat.search(named('Xezo|teacher'));
  if (xezal >= 0) who.push({ who: 'xezo', at: xezal, pose: mood(XEZAL_MOODS, about(sentences, named('Xezo|teacher')), 'smiling') });
  // Hamo is the voice of the whole road: a beat that names him, or names none of the three, is his to tell
  const hamo = beat.search(named('Hamo|moustache'));
  if (hamo >= 0 || who.length === 0) who.push({ who: 'hamo', at: Math.max(hamo, 0), pose: mood(HAMO_MOODS, about(sentences, named('Hamo|moustache')) || beat, 'plain') });
  // Hamo stands on the left, looking into the scene; the deer and Xezo face the reader from its right
  const cast = who
    .sort((a, b) => a.at - b.at)
    .slice(0, 2)
    .sort((a, b) => Number(b.who === 'hamo') - Number(a.who === 'hamo'))
    .map(({ who: id, pose }) => ({ who: id, pose }));

  const props = propsOf(beat);
  // the lesson's own pictured words belong in its scene, after what the beat names; a colour is paint and a number a figure, neither a thing to stand in a scene
  for (const w of words) {
    const picture = pictureForWord(w);
    if (picture && picture.kind !== 'cast' && picture.kind !== 'figure' && picture.kind !== 'paint' && !props.some((p) => same(p, picture))) props.push(picture);
  }
  // an apple in a scene the deer was caught in is the one in his mouth, and when he looks at the sky its core lies beside him
  const eaten = cast.some((c) => c.who === 'hevalo' && (c.pose === 'caught' || c.pose === 'innocent'));
  // the sky keeps to one light: the moon by night, the sun going down at dusk, and by day or in the snow the sun only when the beat names it
  const sunny = props.some((p) => same(p, word('sun')));
  const orb: BookScene['orb'] = setting === 'night' ? (/full moon/i.test(beat) ? 'full moon' : 'moon') : setting === 'dusk' || sunny ? 'sun' : null;
  // so the sky's own things are not drawn again as pictures, nor a weather the sky is not having
  const skyborne = new Set(['sun', 'moon', 'star', ...(orb || setting === 'snow' ? ['rain'] : []), ...(setting === 'snow' ? ['snow'] : [])]);
  const shown = props.filter((p) => !(eaten && same(p, word('apple'))) && !(p.kind === 'word' && skyborne.has(p.id)));
  const kept = shown.slice(0, cast.length > 1 ? PROPS_MAX.together : PROPS_MAX.alone);
  const room: SceneRoom | null = kept.length > 0 && INDOORS.has(keyOf(kept[0]!)) ? { window: cast.length > 1 ? 0.5 : 0.72, rug: true } : null;
  return { setting, orb, shot: shotFor(cast.length, kept, room), room, cast, props: kept, things: placeThings(kept, cast, room) };
}

/** How near a scene composed from its words is seen: across a table indoors, close up where one person has little to show, and whole otherwise. */
function shotFor(people: number, props: readonly BookPicture[], room: SceneRoom | null): SceneShot {
  if (room) return 'mid';
  if (props.length === 0) return people > 1 ? 'mid' : 'close';
  return 'wide';
}

/** Where each thing of a scene composed from its words goes: the land set back, the sky's things in the sky, a small thing in Hamo's hands or on a table indoors, and the rest on the ground between the people. */
function placeThings(props: readonly BookPicture[], cast: readonly SceneFigure[], room: SceneRoom | null): SceneThing[] {
  const things: SceneThing[] = [];
  const hamo = cast.some((c) => c.who === 'hamo');
  let handFree = hamo;
  const ground: BookPicture[] = [];
  for (const picture of props) {
    const key = keyOf(picture);
    if (aloft(picture)) things.push({ picture, at: 'sky', x: 0.5, y: 0.2 });
    else if (SET_BACK.has(key) || picture.kind === 'landmark') things.push({ picture, at: 'back', x: 0.5 });
    else if (room && (key === 'spot:calendar' || key === 'spot:lamp' || key === 'spot:frames')) things.push({ picture, at: 'wall', x: 0.62, y: 0.3 });
    else if (realSize(picture) <= 0.45 && handFree && !room) {
      things.push({ picture, at: 'hand', of: 'hamo' });
      handFree = false;
    } else ground.push(picture);
  }
  if (room && ground.length > 0) {
    const table = things.push({ picture: spot('lowTable'), at: 'front', x: 0.5 }) - 1;
    ground.forEach((picture, i) => things.push(realSize(picture) <= 0.6 ? { picture, at: 'on', on: table, x: ground.length > 1 ? -0.5 + i : 0 } : { picture, at: 'ground', x: 0.3 + i * 0.4 }));
  } else ground.forEach((picture, i) => things.push({ picture, at: 'ground', x: ground.length > 1 ? 0.38 + i * 0.24 : 0.5 }));
  return things;
}

// ───────────────────────────────────────────────────────────── scenes composed by hand

/** A lesson as the scene of its opening needs it. */
type SceneLesson = Pick<BookLesson, 'key' | 'beat' | 'words'> & { told?: string };

/** One scene as book-scenes.json writes it. */
interface SceneSpec {
  shot: SceneShot;
  set?: BookSetting;
  orb?: 'sun' | 'moon' | 'full moon' | null;
  room?: { window?: number | null; rug?: boolean };
  cast: Array<{ who: CharacterId; pose: string; x?: number; back?: boolean; flip?: boolean; down?: number }>;
  things?: Array<{ show: string; at: ScenePlace; x?: number; y?: number; of?: CharacterId; on?: number; size?: number }>;
}

/** The file of composed scenes, beside the road's plan: one for every lesson whose own words would make a poor picture. */
const SCENES_FILE = new URL('../../content/lessons/road/book-scenes.json', import.meta.url);

let composed: Map<string, BookScene> | null = null;

/** The drawing a scene file names: one of the book's spots, a word picture, the sapling, or a landmark, written `landmark:` where a word picture has the same name. */
export function pictureNamed(name: string): BookPicture | null {
  if (name.startsWith('landmark:')) {
    const id = name.slice(9);
    return (PATH_LANDMARKS as readonly string[]).includes(id) ? landmark(id as PathLandmark) : null;
  }
  if ((BOOK_SPOTS as readonly string[]).includes(name)) return spot(name as BookSpot);
  if (isWordPicture(name)) return word(name);
  if (name === 'sapling') return { kind: 'sapling' };
  return (PATH_LANDMARKS as readonly string[]).includes(name) ? landmark(name as PathLandmark) : null;
}

/** A scene as the file writes it, checked: every drawing and pose it names is one there is, and everything it puts on something puts it on a thing before it. */
export function sceneFromSpec(key: string, spec: SceneSpec): BookScene {
  const fail = (why: string): never => {
    throw new Error(`book-scenes.json ${key}: ${why}`);
  };
  if (!['wide', 'mid', 'close'].includes(spec.shot)) fail(`no shot called ${String(spec.shot)}`);
  const setting = spec.set ?? 'day';
  if (!BOOK_SETTINGS.includes(setting)) fail(`no setting called ${String(setting)}`);
  const cast = spec.cast.map((c): SceneFigure => {
    const poses = Object.hasOwn(BOOK_POSES, c.who) ? (BOOK_POSES[c.who] as readonly string[]) : fail(`nobody called ${String(c.who)}`);
    if (!poses.includes(c.pose)) fail(`${c.who} has no pose called ${c.pose}`);
    return { ...c };
  });
  if (cast.length > 3 || new Set(cast.map((c) => c.who)).size !== cast.length) fail('each of the three friends at most once');
  const things = (spec.things ?? []).map((t, i): SceneThing => {
    const picture = pictureNamed(t.show) ?? fail(`no drawing called ${t.show}`);
    if (t.at === 'on' && !(t.on !== undefined && t.on >= 0 && t.on < i)) fail(`${t.show} is put on nothing before it`);
    if ((t.at === 'hand' || t.at === 'mouth' || t.at === 'head') && !cast.some((c) => c.who === t.of)) fail(`${t.show} is held by someone not there`);
    if ((t.at === 'wall' || t.at === 'sill') && !spec.room) fail(`${t.show} is on a wall out of doors`);
    return { picture, at: t.at, x: t.x, y: t.y, of: t.of, on: t.on, size: t.size };
  });
  const orb = spec.orb !== undefined ? spec.orb : setting === 'night' ? 'moon' : setting === 'dusk' ? 'sun' : null;
  const room = spec.room ? { window: spec.room.window === undefined ? 0.7 : spec.room.window, rug: spec.room.rug ?? false } : null;
  const props = things.map((t) => t.picture).filter((p, i, all) => all.findIndex((q) => same(p, q)) === i);
  return { setting, orb, shot: spec.shot, room, cast, props, things };
}

/** Every composed scene, by its lesson's key, read once. */
export function composedScenes(): ReadonlyMap<string, BookScene> {
  if (!composed) {
    const file = JSON.parse(readFileSync(SCENES_FILE, 'utf8')) as { scenes: Record<string, SceneSpec> };
    composed = new Map(Object.entries(file.scenes).map(([key, spec]) => [key, sceneFromSpec(key, spec)]));
  }
  return composed;
}

/**
 * The scene a lesson opens with: its hand-composed one, else the one its printed text and new words make, so the
 * drawing shows what the text says.
 */
export function lessonScene(lesson: SceneLesson): BookScene {
  return composedScenes().get(lesson.key) ?? sceneFor(lesson.told ?? lesson.beat, lesson.words);
}

// ───────────────────────────────────────────────────────────── a scene laid out

/** The panel a lesson's scene is drawn in, in points. */
export const PANEL = { w: 124, h: 64, r: 10 } as const;

/** How many points of the panel one unit of the backdrop's canvas is: the backdrop is laid across the panel's whole width. */
export const BACKDROP_SCALE = (PANEL.w + 1) / BOOK_BACKDROP.w;

/** A box on the panel, in points from its top left. */
export interface PanelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One thing drawn in a scene: one of the friends, cropped as the shot shows them, or a drawing. */
export type ScenePart =
  | { kind: 'cast'; who: CharacterId; pose: string; crop: 'full' | 'half' | 'bust'; flip: boolean; box: PanelBox }
  | { kind: 'picture'; picture: BookPicture; box: PanelBox };

/** Where everything of a scene goes in its panel, in points from the panel's top left. */
export interface SceneLayout {
  /** everything drawn over the backdrop, from the farthest to the nearest */
  parts: ScenePart[];
  /** each of the friends in it, as the box their picture fills (it may run off the panel) */
  cast: Array<{ who: CharacterId; pose: string; box: PanelBox; crop: 'full' | 'half' | 'bust'; flip: boolean; face: PanelBox }>;
  /** each thing, as the square it is drawn in */
  props: Array<{ picture: BookPicture; box: PanelBox; aloft: boolean }>;
  /** the round the lesson's number is set on, in the corner on the page's outer side */
  badge: { x: number; y: number; r: number };
  /** the sun or the moon, if the sky has room for it */
  orb: { x: number; y: number; r: number; full: boolean } | null;
  /** what the sky keeps its stars, flakes and clouds clear of: everything above */
  clear: PanelBox[];
  /** what the backdrop is drawn with besides its colours, on its own canvas: hand it to `bookBackdropSvg` as it is */
  backdrop: {
    setting: BookSetting;
    orb: { x: number; y: number; r: number; full: boolean } | null;
    clear: PanelBox[];
    room: { window: PanelBox | null; rug: boolean } | null;
    shadows: Array<{ x: number; y: number; rx: number }>;
  };
}

/** How wide the friends are drawn in a close scene, from the chest up. */
const CAST_WIDTH = 52;

/** How tall each of the three stands, head to foot (the deer to the tips of his antlers), in metres: the measure everything else in a scene is drawn to. */
const TALL: Readonly<Record<CharacterId, number>> = { hamo: 1.76, xezo: 1.66, hevalo: 1.42 };

/** Where on each figure's whole height (from its crown) its hands are held, or the deer's mouth is: a thing held is drawn there. */
const HOLD: Readonly<Record<CharacterId, { x: number; y: number }>> = { hamo: { x: 0.5, y: 0.44 }, xezo: { x: 0.46, y: 0.48 }, hevalo: { x: 0.5, y: 0.27 } };

/**
 * Each shot's measure: points per metre on the near floor (`near`), at the near edge (`front`) and where the land
 * begins (`back`), and how far down each stands. In a wide shot people stand whole; in a mid shot the panel cuts them
 * at the waist; in a close shot only head and shoulders show.
 */
const SHOTS: Readonly<Record<SceneShot, { people: number; feet: number; near: { ppm: number; foot: number }; front: { ppm: number; foot: number }; back: { ppm: number } }>> = {
  wide: { people: 24.5, feet: 61, near: { ppm: 24.5, foot: 61 }, front: { ppm: 30, foot: 66 }, back: { ppm: 9.5 } },
  mid: { people: 61, feet: 116, near: { ppm: 24, foot: 59 }, front: { ppm: 50, foot: 69 }, back: { ppm: 8.5 } },
  close: { people: 0, feet: 0, near: { ppm: 30, foot: 62 }, front: { ppm: 56, foot: 70 }, back: { ppm: 8 } },
};

/**
 * How big each drawing's 120-unit canvas is in the world, in metres (an apple's is a hand's width, a house's a
 * street's), so things keep their relative size, never smaller than reads on the page.
 */
const WORLD: Readonly<Record<string, number>> = {
  'word:apple': 0.16, 'word:tea': 0.2, 'word:water': 0.3, 'word:sugar': 0.14, 'word:house': 6, 'word:hen': 0.65, 'word:dog': 1, 'word:cat': 0.55, 'word:donkey': 1.8,
  'word:orchard': 4.5, 'word:bread': 0.42, 'word:flower': 0.45, 'word:tree': 5, 'word:pen': 0.2, 'word:shoe': 0.3, 'word:bag': 0.55, 'word:book': 0.4, 'word:cap': 0.3,
  'word:heart': 0.3, 'word:gift': 0.45, 'word:basket': 0.6, 'word:sock': 0.35, 'word:horse': 2.2, 'word:cow': 2.2, 'word:ewe': 1.3, 'word:goat': 1.15, 'word:lamb': 0.9,
  'word:phone': 0.22, 'word:car': 4, 'word:money': 0.25, 'word:cheese': 0.3, 'word:egg': 0.14, 'word:meat': 0.35, 'word:yoghurt': 0.3, 'word:chest': 0.9, 'word:key': 0.2,
  'word:letter': 0.3, 'word:map': 0.6, 'word:door': 2.6, 'word:window': 1.6, 'word:table': 1.3, 'word:chair': 1.1, 'word:tenur': 1.5, 'word:grapes': 0.35, 'word:walnut': 0.1,
  'word:glasses': 0.2, 'word:stone': 0.9, 'word:spring': 2.4, 'word:ball': 0.35, 'word:school': 12, 'word:mill': 8, 'word:watermelon': 0.4, 'word:tomato': 0.14,
  'word:potato': 0.16, 'word:onion': 0.16, 'word:pomegranate': 0.16, 'word:cucumber': 0.3, 'word:honey': 0.22, 'word:milk': 0.4, 'word:olive': 0.2, 'word:fish': 0.5,
  'word:glass': 0.2, 'word:cup': 0.2, 'word:spoon': 0.22, 'word:teapot': 0.4, 'word:fire': 1.3, 'word:bird': 0.35, 'word:rose': 0.5, 'word:clock': 0.25, 'word:bus': 4.2,
  'word:tractor': 3.4, 'word:train': 5, 'word:taxi': 3.2, 'word:bicycle': 1.6, 'word:ticket': 0.2, 'word:wolf': 1.25, 'word:bear': 2, 'word:fox': 0.85, 'word:deer': 1.6,
  'word:gazelle': 1.4, 'word:snake': 0.5, 'word:kid': 0.75, 'word:tent': 5, 'word:medicine': 0.22, 'word:drum': 1, 'word:wheat': 1.2, 'word:corn': 2, 'word:leaf': 0.2, 'word:cloud': 2.6, 'word:rain': 2.6, 'word:plane': 2.2, 'word:snow': 1.5,
  'spot:moustache': 0.3, 'spot:flute': 0.7, 'spot:photo': 0.3, 'spot:lake': 7, 'spot:stove': 1.5, 'spot:calendar': 0.6, 'spot:notebook': 0.35, 'spot:ladder': 4,
  'spot:sack': 1.2, 'spot:lamp': 0.55, 'spot:hoofprints': 0.8, 'spot:town': 7.5, 'spot:lowTable': 1.3, 'spot:tray': 0.9, 'spot:cloth': 1.8, 'spot:rock': 1.5,
  'spot:stoneWall': 2.6, 'spot:bedding': 2.4, 'spot:appleTree': 5, 'spot:walnutTree': 9, 'spot:flatHouse': 7, 'spot:houseLadder': 7, 'spot:ruin': 7, 'spot:doe': 1.6,
  'spot:whiteGoat': 1.15, 'spot:ram': 1.4, 'spot:flyingBird': 1.3, 'spot:eagle': 2.4, 'spot:tin': 0.35, 'spot:doctorBag': 0.6, 'spot:boots': 0.55, 'spot:jug': 0.55,
  'spot:churn': 2.2, 'spot:saj': 1.1, 'spot:snowDeer': 1.3, 'spot:frames': 1.3, sapling: 1.6,
};

/** The world size of a drawing's canvas, in metres; a landmark is a whole place drawn small. */
function realSize(p: BookPicture): number {
  if (p.kind === 'landmark') return 8;
  return WORLD[keyOf(p)] ?? 0.5;
}

/** Where on its canvas each drawing stands: the foot of a word picture or a spot is at 104 of 120, a landmark's at 114. */
const footOf = (p: BookPicture): number => (p.kind === 'landmark' ? 114 / 120 : p.kind === 'sapling' ? 112 / 120 : 104 / 120);

/** Where a thing can be set down on another, as share of that thing's canvas: how far down its top is, and how far its top reaches each side of its middle. */
const TOPS: Readonly<Record<string, { y: number; half: number }>> = {
  'spot:lowTable': { y: 71, half: 36 },
  'spot:tray': { y: 98, half: 38 },
  'spot:cloth': { y: 96, half: 38 },
  'spot:rock': { y: 69, half: 28 },
  'spot:stoneWall': { y: 60, half: 54 },
  'spot:bedding': { y: 66, half: 40 },
  'spot:stove': { y: 47, half: 24 },
  'word:chest': { y: 44, half: 30 },
  'word:donkey': { y: 49, half: 14 },
  'word:basket': { y: 60, half: 24 },
  'word:table': { y: 50, half: 36 },
  'spot:sack': { y: 48, half: 12 },
  'word:tenur': { y: 34, half: 10 },
};

/** How many points a metre is drawn against a room's back wall, for each shot. */
const ROOM_BACK: Readonly<Record<SceneShot, number>> = { wide: 17, mid: 24, close: 26 };

/** How far apart the sun or the moon keeps from everything else in a scene, in points. */
export const ORB_ROOM = 2.4;

/** How big the sun and the moon are drawn, in points, and where they may hang, in the order they are tried. */
const ORBS: Readonly<Record<'sun' | 'moon' | 'dusk', { r: number; at: ReadonlyArray<readonly number[]> }>> = {
  // the sun by day stands high on the left, where the light of every drawing comes from
  sun: { r: 5.8, at: [[26, 10], [40, 9], [54, 11], [68, 9.4], [84, 10.4], [98, 9.2], [112, 10], [18, 18], [60, 17]] },
  // the moon high on the right, else wherever the sky is open, highest first
  moon: { r: 6.2, at: [[100, 10], [86, 9], [72, 10.6], [58, 9], [44, 10.2], [30, 10.8], [112, 12], [18, 12], [62, 19], [92, 19], [36, 19], [110, 21], [16, 21]] },
  // the setting sun sits on the far mountains wherever they show between the people and the things, else as low in the open sky as it can
  dusk: { r: 7.4, at: [[86], [64], [44], [104], [24], [74], [54], [94], [34], [112], [14], [100, 21], [24, 21], [62, 18], [84, 12], [40, 12], [112, 12], [14, 12], [62, 9]] },
};

/** Whether a round comes within `margin` of a box. */
function roundMeetsBox(cx: number, cy: number, r: number, b: PanelBox, margin: number): boolean {
  const dx = Math.max(b.x - cx, 0, cx - (b.x + b.w));
  const dy = Math.max(b.y - cy, 0, cy - (b.y + b.h));
  return Math.hypot(dx, dy) < r + margin;
}

/** Where on each figure's whole height (from its crown) the top of its head is: a cap is worn there. */
const CROWN: Readonly<Record<CharacterId, { x: number; y: number }>> = { hamo: { x: 0.49, y: 0.035 }, xezo: { x: 0.5, y: 0.03 }, hevalo: { x: 0.5, y: 0.1 } };

/** Where a figure is, as the box of its whole height from crown to foot: everything about it (its crop, its face, its hands) is a part of that box. */
function figureAt(who: CharacterId, crop: 'full' | 'half' | 'bust', whole: PanelBox): { box: PanelBox; face: PanelBox; hold: { x: number; y: number }; crown: { x: number; y: number } } {
  const art = characterArt(who);
  const all = cropBox(art, 'full');
  const k = whole.h / all.h;
  const at = (b: { x: number; y: number; w: number; h: number }): PanelBox => ({ x: whole.x + (b.x - all.x) * k, y: whole.y + (b.y - all.y) * k, w: b.w * k, h: b.h * k });
  const point = (p: { x: number; y: number }): { x: number; y: number } => ({ x: whole.x + whole.w * p.x, y: whole.y + whole.h * p.y });
  return { box: at(cropBox(art, crop)), face: at(art.bust), hold: point(HOLD[who]), crown: point(CROWN[who]) };
}

/** The whole-height box of a figure standing with its feet at (x, foot), `tall` points tall. */
function standingBox(who: CharacterId, x: number, foot: number, tall: number): PanelBox {
  const all = cropBox(characterArt(who), 'full');
  const w = (all.w * tall) / all.h;
  return { x: x - w / 2, y: foot - tall, w, h: tall };
}

/** The whole-height box of a figure whose head and shoulders fill `bust`. */
function bustBox(who: CharacterId, bust: PanelBox): PanelBox {
  const art = characterArt(who);
  const all = cropBox(art, 'full');
  const k = bust.w / art.bust.w;
  return { x: bust.x - (art.bust.x - all.x) * k, y: bust.y - (art.bust.y - all.y) * k, w: all.w * k, h: all.h * k };
}

/** The window of a room on the backdrop's canvas, from where it is across the panel. */
function windowBox(across: number): PanelBox {
  const w = 34;
  const x = Math.max(8, Math.min(BOOK_BACKDROP.w - w - 8, across * BOOK_BACKDROP.w - w / 2));
  return { x, y: 12, w, h: 29 };
}

/**
 * Where everything in a scene goes in its panel, for a panel on the given `side` (the lesson number goes in the outer
 * corner). Everything is drawn to the shot's one measure, so sizes stay true: floor things stand on the floor with
 * their shade, set-back things where the land begins, held things at the hands holding them, and things put on a table,
 * tray or rock on its top. The sun or moon then goes in the first of its places nothing comes near; if none is free the
 * sky goes without.
 */
export function sceneLayout(scene: BookScene, side: 'left' | 'right'): SceneLayout {
  const { w, h } = PANEL;
  const k = BACKDROP_SCALE;
  const shot = SHOTS[scene.shot];
  const roomBox = scene.room ? (scene.room.window === null ? null : windowBox(scene.room.window)) : null;
  // the back of the floor: where a room's wall meets it, or where the land outside begins
  const backFoot = (x: number): number => (scene.room ? (bookRidgeAt(0, 'room') + 1.5) * k : (bookRidgeAt(Math.max(0, Math.min(BOOK_BACKDROP.w, x / k)), 'floor') + 2.5) * k);

  // the friends: where each stands, by default at the sides, the deer and Xezo on the right
  const defaults = scene.cast.length === 1 ? [scene.cast[0]!.who === 'hamo' ? 0.28 : 0.72] : scene.cast.length === 2 ? [0.2, 0.8] : [0.16, 0.5, 0.84];
  const figures = scene.cast.map((c, i) => {
    const x = (c.x ?? defaults[i]!) * w;
    const flip = c.flip ?? (c.who === 'hamo' && x > w / 2);
    if (scene.shot === 'close' && !c.back) {
      const frame = cropBox(characterArt(c.who), 'bust');
      const bust = { x: x - CAST_WIDTH / 2, y: h - CAST_WIDTH + 4 + (c.down ?? 0), w: CAST_WIDTH, h: (CAST_WIDTH * frame.h) / frame.w };
      return { c, crop: 'bust' as const, flip, ...figureAt(c.who, 'bust', bustBox(c.who, bust)), foot: h + 60, back: false };
    }
    const back = c.back === true || scene.shot === 'close';
    const foot = back ? backFoot(x) + 0.5 : shot.feet + (c.down ?? 0);
    const tall = TALL[c.who] * (back ? SHOTS[scene.shot].back.ppm * 1.25 : shot.people);
    const crop = back || scene.shot === 'wide' ? ('full' as const) : ('half' as const);
    return { c, crop, flip, ...figureAt(c.who, crop, standingBox(c.who, x, foot, tall)), foot, back };
  });

  // the things: each its own size where it is
  const sizeAt = (p: BookPicture, ppm: number, least: number, scale = 1): number => Math.max(least, Math.min(80, realSize(p) * ppm * scale));
  const boxes: PanelBox[] = [];
  const things = scene.things.map((t, i) => {
    let box: PanelBox;
    const x = (t.x ?? 0.5) * w;
    const near = shot.near;
    if (t.at === 'sky') {
      const s = sizeAt(t.picture, 9, 6, t.size ?? 1);
      box = { x: x - s / 2, y: (t.y ?? 0.2) * h - s / 2, w: s, h: s };
    } else if (t.at === 'back') {
      // a room is small: what stands against its wall is only a few steps behind the people, not out where the land begins
      const s = sizeAt(t.picture, scene.room ? ROOM_BACK[scene.shot] : SHOTS[scene.shot].back.ppm, 8, t.size ?? 1);
      box = { x: x - s / 2, y: backFoot(x) - s * footOf(t.picture), w: s, h: s };
    } else if (t.at === 'front') {
      const s = sizeAt(t.picture, shot.front.ppm, 12, t.size ?? 1);
      box = { x: x - s / 2, y: shot.front.foot - s * footOf(t.picture), w: s, h: s };
      // what is low and flat (a tray, a cloth) is brought up until what stands on it is in the picture
      const top = TOPS[keyOf(t.picture)];
      if (top) box.y = Math.min(box.y, h - 6 - (s * top.y) / 120);
    } else if (t.at === 'ground') {
      const s = sizeAt(t.picture, near.ppm, 9, t.size ?? 1);
      box = { x: x - s / 2, y: near.foot - s * footOf(t.picture), w: s, h: s };
    } else if (t.at === 'hand' || t.at === 'mouth' || t.at === 'head') {
      const holder = figures.find((f) => f.c.who === t.of)!;
      // the holder's own measure: how many points a metre is where they stand
      const ppm = (holder.box.h / cropBox(characterArt(t.of!), holder.crop).h) * (cropBox(characterArt(t.of!), 'full').h / TALL[t.of!]);
      // a little larger than life, so it reads at the size of a page; and never more than a share of the one holding it
      const s = Math.min(sizeAt(t.picture, ppm, holder.back ? 5 : 8, (t.size ?? 1) * (t.at === 'head' ? 1.1 : 1)), holder.box.w * (holder.crop === 'bust' ? 0.4 : 0.46) * (t.size ?? 1));
      // held at the hands, its foot a little below them so the hands are round it; worn on the crown, sitting down over it
      box = t.at === 'head' ? { x: holder.crown.x - s / 2, y: holder.crown.y - s * 0.52, w: s, h: s } : { x: holder.hold.x - s / 2, y: holder.hold.y - s * 0.66, w: s, h: s };
      // head and shoulders show no hands: what they hold is raised into the picture at its foot
      if (t.at === 'hand' && holder.crop === 'bust') box.y = Math.min(box.y, h - s * 0.84);
    } else if (t.at === 'on') {
      const under = scene.things[t.on!]!;
      const base = boxes[t.on!]!;
      const top = TOPS[keyOf(under.picture)] ?? { y: 60, half: 30 };
      const ppm = base.w / realSize(under.picture);
      const s = sizeAt(t.picture, ppm, 7, t.size ?? 1);
      const cx = base.x + base.w / 2 + ((t.x ?? 0) * base.w * top.half) / 120;
      box = { x: cx - s / 2, y: base.y + (base.h * top.y) / 120 - s * footOf(t.picture), w: s, h: s };
    } else if (t.at === 'sill') {
      const win = roomBox ?? windowBox(0.7);
      const s = sizeAt(t.picture, 26, 8, t.size ?? 1);
      const cx = (win.x + win.w / 2 + ((t.x ?? 0) * win.w) / 2) * k;
      box = { x: cx - s / 2, y: (win.y + win.h) * k - s * footOf(t.picture) + 0.6, w: s, h: s };
    } else {
      const s = sizeAt(t.picture, ROOM_BACK[scene.shot] * 1.45, 9, t.size ?? 1);
      box = { x: x - s / 2, y: (t.y ?? 0.32) * h - s / 2, w: s, h: s };
    }
    boxes[i] = box;
    return { t, box, index: i };
  });

  // drawn from the farthest to the nearest: what is set back and on the walls, the people set back, the sky, then the floor's things and people by where they stand, then what is in front, then what is held
  const parts: Array<{ order: number; part: ScenePart }> = [];
  const castPart = (f: (typeof figures)[number]): ScenePart => ({ kind: 'cast', who: f.c.who, pose: f.c.pose, crop: f.crop, flip: f.flip, box: f.box });
  const depthOf = (t: SceneThing): number => {
    if (t.at === 'back' || t.at === 'wall' || t.at === 'sill') return 0;
    if (t.at === 'sky') return 2;
    if (t.at === 'ground') return 3;
    if (t.at === 'front') return 5;
    if (t.at === 'on') return depthOf(scene.things[t.on!]!) + 0.1;
    return 6;
  };
  for (const thing of things) parts.push({ order: depthOf(thing.t) + thing.index * 0.001, part: { kind: 'picture', picture: thing.t.picture, box: thing.box } });
  figures.forEach((f, i) => parts.push({ order: (f.back ? 1 : 4) + i * 0.001, part: castPart(f) }));
  const ordered = parts.sort((a, b) => a.order - b.order).map((p) => p.part);

  const badge = { x: side === 'left' ? 10 : w - 10, y: 10, r: 7 };
  const badgeBox = { x: badge.x - badge.r, y: badge.y - badge.r, w: 2 * badge.r, h: 2 * badge.r };
  const inPanel = (b: PanelBox): PanelBox => {
    const x0 = Math.max(0, b.x);
    const y0 = Math.max(0, b.y);
    return { x: x0, y: y0, w: Math.max(0, Math.min(w, b.x + b.w) - x0), h: Math.max(0, Math.min(h, b.y + b.h) - y0) };
  };
  // what the sky keeps clear of: each figure, and each thing as much of its square as its drawing fills (a landmark's sky is its own top quarter)
  const drawn = (t: (typeof things)[number]): PanelBox => {
    const b = t.box;
    const top = t.t.picture.kind === 'landmark' ? 0.24 : 0.06;
    return { x: b.x + b.w * 0.08, y: b.y + b.h * top, w: b.w * 0.84, h: b.h * (1 - top) };
  };
  const taken = [...figures.map((f) => inPanel(f.box)), ...things.map((t) => inPanel(drawn(t))), badgeBox].filter((b) => b.w > 0 && b.h > 0);

  let orb: SceneLayout['orb'] = null;
  if (scene.orb && scene.room) {
    // indoors the sun or the moon is seen through the window, high in it
    if (roomBox) orb = { x: (roomBox.x + roomBox.w * 0.68) * k, y: (roomBox.y + roomBox.h * 0.3) * k, r: 3.6, full: scene.orb === 'full moon' };
  } else if (scene.orb) {
    const kind = scene.setting === 'dusk' ? ORBS.dusk : scene.orb === 'sun' ? ORBS.sun : ORBS.moon;
    for (const at of kind.at) {
      // a setting sun sits just over the far mountains where it is, its lower part behind them
      const x = at[0]!;
      const y = at.length > 1 ? at[1]! : bookRidgeAt(x / k) * k - kind.r * 0.3;
      const inside = x - kind.r >= ORB_ROOM && x + kind.r <= w - ORB_ROOM && y - kind.r >= ORB_ROOM;
      if (inside && !taken.some((b) => roundMeetsBox(x, y, kind.r, b, ORB_ROOM))) {
        orb = { x, y, r: kind.r, full: scene.orb === 'full moon' };
        break;
      }
    }
  }
  // each person standing whole has a patch of shade under their feet
  const shadows = figures
    .filter((f) => f.crop === 'full')
    .map((f) => ({ x: (f.box.x + f.box.w * 0.52) / k, y: (f.foot - 0.4) / k, rx: (f.box.w * (f.c.who === 'hevalo' ? 0.36 : 0.46)) / k }));
  const toBackdrop = (b: PanelBox): PanelBox => ({ x: b.x / k, y: b.y / k, w: b.w / k, h: b.h / k });
  return {
    parts: ordered,
    cast: figures.map((f) => ({ who: f.c.who, pose: f.c.pose, box: f.box, crop: f.crop, flip: f.flip, face: f.face })),
    props: things.map((t) => ({ picture: t.t.picture, box: t.box, aloft: t.t.at === 'sky' })),
    badge,
    orb,
    clear: taken,
    backdrop: {
      setting: scene.setting,
      orb: orb ? { x: orb.x / k, y: orb.y / k, r: orb.r / k, full: orb.full } : null,
      clear: taken.map(toBackdrop),
      room: scene.room ? { window: roomBox, rug: scene.room.rug ?? false } : null,
      shadows,
    },
  };
}
