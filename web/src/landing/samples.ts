/**
 * All the Kurdish the landing page's pictures show, in one file so it can be checked in one place. Each item is
 * something the product teaches or plays, mostly from the first course (`api/content/kurmanji-seed.json`). The Kurdish
 * is not translated; its meanings are in the catalogues under `landing.gloss.*`. Nothing uncertain goes on the page.
 */
import type { StoryLevel } from '@kurda/shared';
import { avatarAssetUrl } from '../lib/cosmetics';

/** The word the product is named after. */
export const HEVAL = 'heval';

/**
 * A Peyvok Battle ending on `heval`, scored by the real rules. `dayik` (mother) and `silav` (hello) are from the
 * first course.
 */
export const BATTLE_GUESSES: ReadonlyArray<{ word: string; marks: ReadonlyArray<'green' | 'yellow' | 'gray'> }> = [
  { word: 'dayik', marks: ['gray', 'yellow', 'gray', 'gray', 'gray'] },
  { word: 'silav', marks: ['gray', 'gray', 'yellow', 'green', 'yellow'] },
  { word: HEVAL, marks: ['green', 'green', 'green', 'green', 'green'] },
];

/** A lesson from the course's "Dem" (time) skill: the sentence, and the word in it being taught. */
export const LESSON = {
  skill: 'Dem',
  sentence: ['Îro', 'çi', 'roj', 'e?'],
  /** Index into `sentence` of the word whose meaning is shown as a hint. */
  hint: 2,
} as const;

/** A rhyme round: the prompt, and three real words that rhyme with it. */
export const RHYME = { prompt: 'dar', found: ['kar', 'bar', 'yar'] } as const;

/** The typing race's text, "I'm fine, thanks", from the course. */
export const RACE_TEXT = 'Ez baş im, spas.';
/** How much of it has been typed in the picture. */
export const RACE_TYPED = 9;

/** The five letters Kurmancî adds to the Latin alphabet. */
export const KURDISH_LETTERS = ['ç', 'ê', 'î', 'ş', 'û'] as const;

/** "How are you?", familiar to every heritage learner. */
export const HOW_ARE_YOU = 'Tu çawa yî?';

/** A poem on the community wall: its title, "rain", and its first line, "it is raining". */
export const POEM = { title: 'Baran', line: 'Baran dibare.' } as const;

/** The people in the pictures: the app's default deer avatars (`public/cosmetics/avatars/`) and common Kurdish names. */
export const PEOPLE = {
  you: { avatar: avatarAssetUrl('default-03') },
  rojin: { name: 'Rojîn', avatar: avatarAssetUrl('default-09') },
  dilan: { name: 'Dilan', avatar: avatarAssetUrl('default-07') },
} as const;

/** A profile background from the shop: night on the high pastures. */
export const PROFILE_BACKGROUND = '/cosmetics/backgrounds/made-02-seva-zozanan.webp';

/** The first unit of the Kurmanji Road, by the name its band on the path shows. */
export const PATH_UNIT = 'Silav';

/**
 * Three starter stories (`api/content/stories/kurmanci.json`) with their levels for the library on the phone; the
 * covers come from the shared cover list, and the first is the one being read.
 */
export const STORIES: ReadonlyArray<{ title: string; level: StoryLevel; minutes: number; cover: string; read: number }> = [
  { title: 'Rêya Gund', level: 2, minutes: 4, cover: 'bihar', read: 0.45 },
  { title: 'Barana Newrozê', level: 2, minutes: 4, cover: 'agire-newroze', read: 0 },
  { title: 'Rovî û Hirç', level: 3, minutes: 5, cover: 'daristana-seve', read: 0 },
];
