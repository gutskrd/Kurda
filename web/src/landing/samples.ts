/**
 * All the Kurdish the front page shows, in one file so it can be checked in one place. Every word and phrase is taught
 * in the first two units of the Kurmanji Road (`api/content/lessons/road`), with the meaning the course gives it; the
 * meanings are in the catalogues under `landing.gloss.*`. Nothing uncertain goes on the page.
 */
import type { MessageKey } from '../i18n/en';
import { avatarAssetUrl } from '../lib/cosmetics';

/** The word the product is named after. */
export const HEVAL = 'heval';

/** A phrase and where its meaning is. */
export interface Phrase {
  ku: string;
  gloss: MessageKey;
}

/** What Hevalo says when he is tapped, in turn. */
export const GREETINGS: readonly Phrase[] = [
  { ku: 'Silav!', gloss: 'landing.gloss.silav' },
  { ku: 'Tu çawa yî?', gloss: 'landing.gloss.tuCawaYi' },
  { ku: 'Bi xêr hatî!', gloss: 'landing.gloss.biXerHati' },
];

/**
 * The three words a visitor learns on the page: each with its meaning, the meanings offered beside it (in the order
 * shown), and a line about it once answered.
 */
export const FIRST_WORDS: ReadonlyArray<{ ku: string; options: readonly MessageKey[]; right: MessageKey; note: MessageKey }> = [
  {
    ku: HEVAL,
    options: ['landing.gloss.mal', 'landing.gloss.heval', 'landing.gloss.xwisk'],
    right: 'landing.gloss.heval',
    note: 'landing.words.note.heval',
  },
  {
    ku: 'dapîr',
    options: ['landing.gloss.dapir', 'landing.gloss.ciran', 'landing.gloss.bapir'],
    right: 'landing.gloss.dapir',
    note: 'landing.words.note.dapir',
  },
  {
    ku: 'Bi xêr hatî!',
    options: ['landing.gloss.sevBas', 'landing.gloss.spas', 'landing.gloss.biXerHati'],
    right: 'landing.gloss.biXerHati',
    note: 'landing.words.note.biXerHati',
  },
];

/** What Hamo says at his table, in the order he says it: a welcome, how are you, tea, the meal, and thanks for it. */
export const TABLE: readonly Phrase[] = [
  { ku: 'Bi xêr hatî!', gloss: 'landing.gloss.biXerHati' },
  { ku: 'Tu çawa yî?', gloss: 'landing.gloss.tuCawaYi' },
  { ku: 'Ez baş im, spas.', gloss: 'landing.gloss.ezBasIm' },
  { ku: 'Fermo!', gloss: 'landing.gloss.fermo' },
  { ku: 'Noşî can be!', gloss: 'landing.gloss.nosiCanBe' },
  { ku: 'Destê te sax be!', gloss: 'landing.gloss.desteTeSaxBe' },
];

/**
 * A Peyvok Battle ending on `heval`, scored by the real rules. `dayik` (mother) and `silav` (hello) are from the
 * first units.
 */
export const BATTLE_GUESSES: ReadonlyArray<{ word: string; marks: ReadonlyArray<'green' | 'yellow' | 'gray'> }> = [
  { word: 'dayik', marks: ['gray', 'yellow', 'gray', 'gray', 'gray'] },
  { word: 'silav', marks: ['gray', 'gray', 'yellow', 'green', 'yellow'] },
  { word: HEVAL, marks: ['green', 'green', 'green', 'green', 'green'] },
];

/** What a friend says when you win: "well done!" */
export const WELL_DONE: Phrase = { ku: 'Aferîn!', gloss: 'landing.gloss.aferin' };

/** A pen pal's letter, line by line: "Hello, friend! How are you? I’m fine, thanks." */
export const LETTER: readonly Phrase[] = [
  { ku: 'Silav heval!', gloss: 'landing.gloss.silavHeval' },
  { ku: 'Tu çawa yî?', gloss: 'landing.gloss.tuCawaYi' },
  { ku: 'Ez baş im, spas.', gloss: 'landing.gloss.ezBasIm' },
];

/** The first unit of the Kurmanji Road, by the name its band shows, and its lessons' stops. */
export const ROAD_UNIT = 'Silav';

/** The people in the scenes: the app's default deer avatars (`public/cosmetics/avatars/`) and common Kurdish names. */
export const PEOPLE = {
  you: { avatar: avatarAssetUrl('default-03') },
  rojin: { name: 'Rojîn', avatar: avatarAssetUrl('default-09') },
  dilan: { name: 'Dilan', avatar: avatarAssetUrl('default-07') },
} as const;

/** The five legends painted for the story library (`shared/src/story-covers.ts`), with their Kurmancî titles. */
export const LEGENDS: ReadonlyArray<{ cover: string; ku: string; name: MessageKey }> = [
  { cover: 'kawa', ku: 'Kawayê Hesinkar', name: 'landing.legends.kawa' },
  { cover: 'sahmaran', ku: 'Şahmaran', name: 'landing.legends.sahmaran' },
  { cover: 'mem-u-zin', ku: 'Mem û Zîn', name: 'landing.legends.memUZin' },
  { cover: 'siyabend', ku: 'Siyabend û Xecê', name: 'landing.legends.siyabend' },
  { cover: 'dimdim', ku: 'Kela Dimdimê', name: 'landing.legends.dimdim' },
];
