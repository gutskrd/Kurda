/**
 * Which drawing goes with what in the Hevalo book: a word's picture, the
 * little scene a lesson opens with, a person's emblem, and each chapter's
 * colour. Pure: it names drawings (pdf.ts draws them), so every choice can be
 * tested without printing a page.
 *
 * A word's picture is the one the lessons themselves show for it (the right
 * card of a "pick the picture" item), or the word picture drawn for that very
 * word; a number is its figure and a colour a dab of its paint; and a few
 * words the road is fond of have a drawing made for the book (Hamo's
 * moustache, his father's flute). A word with no drawing of exactly that
 * thing gets none: a picture dictionary that guesses teaches the wrong word.
 *
 * A scene is composed from the lesson's own beat: who of the three friends is
 * in it and how they feel about it, by day, by night or in the snow, and the
 * two or three things it names that there is a drawing of. So when the plan
 * retells a lesson, its scene follows.
 */
import {
  HUE_NAMES,
  PATH_LANDMARKS,
  WORD_PICTURES,
  type BookPaint,
  type BookPose,
  type BookSetting,
  type BookSpot,
  type CharacterId,
  type HueName,
  type PathLandmark,
  type WordPictureId,
} from '@kurda/shared';
import type { BookWord } from './road-book.js';

/** A drawing the book can show, by what draws it. */
export type BookPicture =
  | { kind: 'word'; id: WordPictureId }
  | { kind: 'spot'; spot: BookSpot }
  | { kind: 'paint'; colour: BookPaint }
  | { kind: 'landmark'; landmark: PathLandmark }
  | { kind: 'cast'; who: CharacterId; pose: string }
  | { kind: 'sapling' }
  /** a number, set as its figure in the book's own type */
  | { kind: 'figure'; text: string };

const word = (id: WordPictureId): BookPicture => ({ kind: 'word', id });
const spot = (id: BookSpot): BookPicture => ({ kind: 'spot', spot: id });
const landmark = (id: PathLandmark): BookPicture => ({ kind: 'landmark', landmark: id });
const cast = <K extends CharacterId>(who: K, pose: BookPose<K>): BookPicture => ({ kind: 'cast', who, pose: pose as string });

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
  // the teacher of the road is Xezal, and its friend is the deer whose name means "friend"
  mamoste: cast('xezo', 'smiling'),
  heval: cast('hevalo', 'pleased'),
};

/** The colour words, by their English meaning in the plan. */
const PAINTS: Readonly<Record<string, BookPaint>> = { red: 'red', blue: 'blue', green: 'green', yellow: 'yellow', black: 'black', white: 'white' };

/** The numbers the plan teaches, by their English meaning. */
const FIGURES: Readonly<Record<string, string>> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19',
  twenty: '20', thirty: '30', forty: '40', fifty: '50', 'a hundred': '100', 'a thousand': '1000', first: '1st', second: '2nd',
};

/**
 * The picture that goes with a word, or null when nothing drawn is exactly
 * that word: the lessons' own picture for it first, then the word picture of
 * that very word, a number's figure, a colour's paint, and the few things
 * drawn for the book.
 */
export function pictureForWord(w: Pick<BookWord, 'ku' | 'en' | 'pos' | 'picture'>): BookPicture | null {
  if (w.picture && isWordPicture(w.picture)) return word(w.picture);
  const own = BY_WORD.get(w.ku);
  if (own) return word(own);
  if (w.pos === 'num' && Object.hasOwn(FIGURES, w.en)) return { kind: 'figure', text: FIGURES[w.en]! };
  if (w.pos === 'adj' && Object.hasOwn(PAINTS, w.en)) return { kind: 'paint', colour: PAINTS[w.en]! };
  return Object.hasOwn(DRAWN, w.ku) ? DRAWN[w.ku]! : null;
}

/** What stands for each of the road's people and animals beside their name: themselves, or the thing the road knows them by. */
const EMBLEMS: Readonly<Record<string, BookPicture>> = {
  Hamo: cast('hamo', 'proud'),
  Xezal: cast('xezo', 'smiling'),
  Hevalo: cast('hevalo', 'caught'),
  Nazê: word('bread'),
  Baran: word('book'),
  Hêvî: word('hen'),
  Şemsê: word('goat'),
  Ibrahîm: spot('flute'),
  Edûl: word('basket'),
  Lorîn: spot('photo'),
  Ferhad: word('tractor'),
  Mîrza: word('grapes'),
  Azad: word('medicine'),
  Bişar: word('tent'),
  Bozo: word('donkey'),
  Şêro: word('dog'),
  Zerê: word('deer'),
  Kawa: word('fire'),
  Şengê: word('kid'),
  Pengê: word('kid'),
};

/** The emblem of one of the road's people or animals, or null for someone it has no drawing for. */
export function pictureForName(name: string): BookPicture | null {
  return Object.hasOwn(EMBLEMS, name) ? EMBLEMS[name]! : null;
}

// ───────────────────────────────────────────────────────────── chapter colours

/**
 * Each chapter's hue, from the app's nine families: the blue of the gate,
 * the orange of tea, the green of the village, the red of market awnings,
 * the indigo of the clock's small hours, the teal of the town, the gold of
 * the Newroz fire, the pink of a heart that needs a doctor, the blue of the
 * river, the green of the pastures, the orange of the harvest and the violet
 * of winter tales. No chapter wears the hue of the one before it, nor the
 * hue beside that one on the wheel, so turning into a new chapter always
 * changes the page's colour.
 */
export const CHAPTER_HUES: readonly HueName[] = ['blue', 'orange', 'green', 'red', 'indigo', 'teal', 'gold', 'pink', 'blue', 'green', 'orange', 'violet'];

/** The hue of a chapter, by its number from 1; a road longer than twelve chapters starts the colours again. */
export function chapterHue(chapter: number): HueName {
  const at = (((Math.floor(chapter) - 1) % CHAPTER_HUES.length) + CHAPTER_HUES.length) % CHAPTER_HUES.length;
  return CHAPTER_HUES[at]!;
}

/** How far apart two hues sit on the wheel (`HUE_NAMES` in order, joined end to end): 0 the same, 1 neighbours. */
export function hueDistance(a: HueName, b: HueName): number {
  const d = Math.abs(HUE_NAMES.indexOf(a) - HUE_NAMES.indexOf(b));
  return Math.min(d, HUE_NAMES.length - d);
}

/**
 * The drawing a chapter is known by: its landmark beside the lesson path,
 * except the sixth, whose road now leads to Kobanî and not to a walled city.
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
 * A beat's sentences. A closing quote belongs to the sentence it ends, and
 * what is said inside a quotation never ends the sentence it is said in,
 * however many sentences are said there.
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
 * The start of a sentence too long to tell whole, in at most `max`
 * characters: up to the last clause that ends in that room, or the last
 * place the sentence is joined on from (either is `clean`), or, in a
 * sentence with neither, up to a word that can end a line; and never into
 * something said or bracketed, which would leave it open.
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
  while (words.length > 1 && LEADING_ON.has(words.at(-1)!.toLowerCase())) words = words.slice(0, -1);
  return { cut: `${words.join(' ').replace(/[,:;—]$/, '').trimEnd()}…`, clean };
}

/**
 * The ends of a sentence too long to tell whole that fit in `room`
 * characters, the longest first: each from the start of one of its clauses,
 * as long as that is still something to say and opens no quotation it does
 * not close.
 */
function tailsOf(sentence: string, room: number): string[] {
  return [...sentence.matchAll(CLAUSE)].map((m) => sentence.slice(m.index + m[0].length)).filter((tail) => tail.length <= room && tail.length >= 24 && balanced(tail));
}

/**
 * A beat told in a line or two, in at most `max` characters: all of it when
 * it is short enough, and otherwise how it opens and how it ends — with the
 * last thing it says of Hevalo, who usually has the last word, or with its
 * last sentence. The ending is told whole where it can be, with what leads
 * up to it when it is too short to stand alone, and what Hevalo does is
 * told from one of its clauses on when the whole sentence is too long; the
 * opening is as many whole sentences as fit before it, the last of them cut
 * at a clause where even one is too long. An ellipsis stands wherever
 * something is left out.
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
      // an ellipsis where something was left out, unless the telling already trails off there
      const joined = (reached && !close.partly) || told.endsWith('…') ? `${told} ${close.ending}` : `${told} … ${close.ending}`;
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

export interface BookScene {
  setting: BookSetting;
  /** who of the three friends is in it, in the order they stand, and how each holds themselves */
  cast: Array<{ who: CharacterId; pose: string }>;
  /** the things of the beat there is a drawing of, in the order it names them */
  props: BookPicture[];
}

/** A word or a phrase where the beat has it as whole words (Kurdish letters count as letters: "tenûr" is not in "Miştenûr"). */
const named = (pattern: string): RegExp => new RegExp(`(?<![\\p{L}])(?:${pattern})(?![\\p{L}])`, 'iu');

/** How Hevalo takes a scene, by what the beat says of him: the first that fits. */
const HEVALO_MOODS: ReadonlyArray<readonly [RegExp, BookPose<'hevalo'>]> = [
  [named('looks? at the sky|gazing at the mountain|not hungry|doesn’t want anything|shakes his head|pretends?|lying very still|innocent|says nothing|looks away'), 'innocent'],
  [named('asleep|sleeps|dreaming'), 'asleep'],
  [named('sad|sorry|offended|bolts|hides'), 'sad'],
  [named('takes three|your apple|apple in (each|his)|eats?|eaten|ate|eating|bite|crunching|peel|all over his face|chewing|round belly|has six|gone'), 'caught'],
  [named('sniffs?|nose|ears|inspects|watches|looks? (straight|back)|cannot keep still|has heard|drops'), 'curious'],
  [named('drinks?|milk|blows'), 'munching'],
  [named('hops?|pleased|happy|agrees|nods|loves|votes|friend|leads|races|trots|stamps|offers|sharing|brings|eyes for|gets the last apple|with an apple'), 'pleased'],
];

/** How Hamo takes a scene: the first that fits. */
const HAMO_MOODS: ReadonlyArray<readonly [RegExp, BookPose<'hamo'>]> = [
  [named('nap|goes to sleep|five minutes'), 'asleep'],
  [named('shocked|goes pale|astonished|forgot|is lost|gets lost|jumps up|cannot find|alarms?|afraid|sheepishly|with both hands|his back|cannot get out of bed'), 'shocked'],
  [named('laughs?|delighted|beams|joker|happily|laughter'), 'laughing'],
  [named('admits|nizanim|never seen|swears|eyebrow|detective|has to admit|does not know|doesn’t know|nothing to say|without a word|listens'), 'doubtful'],
  [named('moustache|proud|proudly|pleased|solemn|solemnly|announces|declares|magnificent|ceremony|promises?|is sure|the best|wisely|graciously'), 'proud'],
  [named('tells?|explains|reads|story|tale|describes|practises|speech|teaches'), 'telling'],
];

const XEZAL_MOODS: ReadonlyArray<readonly [RegExp, BookPose<'xezo'>]> = [[named('teaching|tells|says|speech|decided|stands up|turns to'), 'telling']];

/**
 * What the beats name that there is a drawing of, small enough to read in a
 * scene. Where a thing stands among the props is where the beat first names
 * it.
 */
const PROPS: ReadonlyArray<readonly [RegExp, BookPicture]> = (
  [
    ['apples?', word('apple')],
    ['tea|glass(es)? of tea', word('tea')],
    ['bread|crusts?', word('bread')],
    ['moustache contest', spot('moustache')],
    ['gate', word('door')],
    ['milk', word('milk')],
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
    ['goat', word('goat')],
    ['kids?|Şengê', word('kid')],
    ['lambs?', word('lamb')],
    ['sheep|flocks?|ewes?|ram', word('ewe')],
    ['cow', word('cow')],
    ['horse', word('horse')],
    ['wolf|wolves', word('wolf')],
    ['bear', word('bear')],
    ['fox', word('fox')],
    ['snake', word('snake')],
    ['Zerê|doe|two deer', word('deer')],
    ['fish', word('fish')],
    ['birds?|eagle|crow', word('bird')],
    ['flute', spot('flute')],
    ['photos?', spot('photo')],
    ['maps?', word('map')],
    ['tin|treasure|marbles', word('chest')],
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
    ['clocks?|alarms?|o’clock', word('clock')],
    ['phones?', word('phone')],
    ['books?|bookshop', word('book')],
    ['the letter', word('letter')],
    ['baskets?|crates?|market', word('basket')],
    ['money|prices?|pays?|haggling', word('money')],
    ['grapes', word('grapes')],
    ['tomatoes', word('tomato')],
    ['potatoes', word('potato')],
    ['onions?', word('onion')],
    ['meat', word('meat')],
    ['walnuts?', word('walnut')],
    ['flowers?|blossom', word('flower')],
    ['roses?', word('rose')],
    ['school', word('school')],
    ['(from|by|at) the spring|here is the spring|the shop, the spring', word('spring')],
    ['river|stream', word('river')],
    ['mountains?', word('mountain')],
    ['orchard|apple trees', word('orchard')],
    ['trees?', word('tree')],
    ['house|roof', word('house')],
    ['doors?', word('door')],
    ['windows?', word('window')],
    ['table', word('table')],
    ['chair', word('chair')],
    ['tenûr', word('tenur')],
    ['tents?', word('tent')],
    ['fires?|firewood', word('fire')],
    ['snow|snowflakes|frost', word('snow')],
    ['rain', word('rain')],
    ['clouds?|storm', word('cloud')],
    ['stars', word('star')],
    ['moon', word('moon')],
    ['sun|sunshine|sunset', word('sun')],
    ['stones?|rocks?', word('stone')],
    ['drum', word('drum')],
    ['doctor|medicine|pills', word('medicine')],
    ['tooth', word('tooth')],
    ['shoes?', word('shoe')],
    ['bags?|parcels|saddlebags', word('bag')],
    ['cap', word('cap')],
    ['present|birthday', word('gift')],
    ['spoon', word('spoon')],
    ['wheat', word('wheat')],
    ['maize', word('corn')],
    ['in love', word('heart')],
  ] as const
).map(([pattern, picture]) => [named(pattern), picture] as const);

const same = (a: BookPicture, b: BookPicture): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The sentences of a beat that speak of someone. */
function about(sentences: readonly string[], who: RegExp): string {
  return sentences.filter((s) => who.test(s)).join(' ');
}

/** How many things a scene shows: one between two people, where there is little room, and three beside one. */
const PROPS_MAX = { alone: 3, together: 1 } as const;

/**
 * The scene a lesson opens with, composed from its beat and its new words:
 * who is in it and how they hold themselves, by day, by night or in the
 * snow, and the things it names that there is a drawing of, the lesson's own
 * pictured words among them.
 */
export function sceneFor(beat: string, words: ReadonlyArray<Pick<BookWord, 'ku' | 'en' | 'pos' | 'picture'>> = []): BookScene {
  const sentences = sentencesOf(beat);
  const setting: BookSetting = named('snow|snowflakes|winter|frost|snowed in').test(beat) ? 'snow' : named('night|stars|moon|midnight|dusk|dark').test(beat) ? 'night' : 'day';

  const who: Array<{ who: CharacterId; at: number; pose: string }> = [];
  const mood = <P extends string>(moods: ReadonlyArray<readonly [RegExp, P]>, text: string, fallback: P): P => moods.find(([test]) => test.test(text))?.[1] ?? fallback;
  const hevalo = beat.search(named('Hevalo|the deer'));
  if (hevalo >= 0) who.push({ who: 'hevalo', at: hevalo, pose: mood(HEVALO_MOODS, about(sentences, named('Hevalo|the deer')), 'plain') });
  const xezal = beat.search(named('Xezal|Xezo|teacher'));
  if (xezal >= 0) who.push({ who: 'xezo', at: xezal, pose: mood(XEZAL_MOODS, about(sentences, named('Xezal|Xezo|teacher')), 'smiling') });
  // Hamo is the voice of the whole road: a beat that names him, or names none of the three, is his to tell
  const hamo = beat.search(named('Hamo|moustache'));
  if (hamo >= 0 || who.length === 0) who.push({ who: 'hamo', at: Math.max(hamo, 0), pose: mood(HAMO_MOODS, about(sentences, named('Hamo|moustache')) || beat, 'plain') });
  // Hamo stands on the left, looking into the scene; the deer and Xezal face the reader from its right
  const castOf = who
    .sort((a, b) => a.at - b.at)
    .slice(0, 2)
    .sort((a, b) => Number(b.who === 'hamo') - Number(a.who === 'hamo'))
    .map(({ who: id, pose }) => ({ who: id, pose }));

  const found: Array<{ at: number; picture: BookPicture }> = [];
  for (const [test, picture] of PROPS) {
    const at = beat.search(test);
    if (at >= 0 && !found.some((f) => same(f.picture, picture))) found.push({ at, picture });
  }
  const props = found.sort((a, b) => a.at - b.at).map((f) => f.picture);
  // the lesson's own pictured words belong in its scene, after what the beat names
  for (const w of words) {
    const picture = pictureForWord(w);
    if (picture && picture.kind !== 'cast' && picture.kind !== 'figure' && !props.some((p) => same(p, picture))) props.push(picture);
  }
  // an apple in a scene the deer was caught in is the one in his mouth, and when he looks at the sky its core lies beside him
  const eaten = castOf.some((c) => c.who === 'hevalo' && (c.pose === 'caught' || c.pose === 'innocent'));
  const shown = props.filter((p) => !(eaten && same(p, word('apple'))));
  return { setting, cast: castOf, props: shown.slice(0, castOf.length > 1 ? PROPS_MAX.together : PROPS_MAX.alone) };
}
