/**
 * The Kurdish on the landing page.
 *
 * Every word and sentence the pictures of the product show is here, in one
 * place, so the Kurdish can be checked by reading one file rather than by
 * hunting through markup. None of it is decoration: each one is something the
 * product itself teaches or plays, and most come straight out of the first
 * course (`api/content/kurmanji-seed.json`) — the greetings, the days, the
 * drinks a lesson asks about.
 *
 * The Kurdish is not translated, because it is the thing being learned. What it
 * *means* is, and lives in the catalogues under `landing.gloss.*`, so a German
 * reader sees "heval — Freund" and a Soranî reader sees it glossed in Soranî.
 *
 * Nothing here is invented to sound Kurdish. If a phrase is not certain, it does
 * not go on the page.
 */

/** The word the whole page turns on: the one the product is named after. */
export const HEVAL = 'heval';

/**
 * A Wordle Battle that ends on `heval`, guess by guess.
 *
 * Scored by the real rules: a letter in the right place is green, a letter in
 * the word but elsewhere is yellow. `dayik` (mother) and `silav` (hello) are
 * both words from the first course.
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
  /** index into `sentence` of the word whose meaning is shown as a hint */
  hint: 2,
} as const;

/** The quiz question, as the course itself asks it: what does "çay" mean? */
export const QUIZ_PROMPT = '“çay” tê çi wateyê?';

/** A rhyme round: the prompt, and three real words that rhyme with it. */
export const RHYME = { prompt: 'dar', found: ['kar', 'bar', 'yar'] } as const;

/** What the typing race asks you to type — "I'm fine, thanks", from the course. */
export const RACE_TEXT = 'Ez baş im, spas.';
/** how much of it has been typed in the picture */
export const RACE_TYPED = 9;

/** The five letters Kurmancî adds to the Latin alphabet. */
export const KURDISH_LETTERS = ['ç', 'ê', 'î', 'ş', 'û'] as const;

/** The question a heritage learner has heard a thousand times. */
export const HOW_ARE_YOU = 'Tu çawa yî?';

/** A poem on the community wall: its title, "rain", and its first line, "it is raining". */
export const POEM = { title: 'Baran', line: 'Baran dibare.' } as const;

/**
 * The people in the pictures.
 *
 * Avatars are the app's own default deer (`public/cosmetics/avatars/`), so the
 * faces are the ones a new account actually chooses from. The names are
 * ordinary Kurdish given names, used the way any app shows example users.
 */
export const PEOPLE = {
  you: { avatar: '/cosmetics/avatars/default-03.png' },
  rojin: { name: 'Rojîn', avatar: '/cosmetics/avatars/default-09.png' },
  dilan: { name: 'Dilan', avatar: '/cosmetics/avatars/default-07.png' },
} as const;

/** A profile background from the shop — the deer in the forest. */
export const PROFILE_BACKGROUND = '/cosmetics/backgrounds/background-01.webp';
