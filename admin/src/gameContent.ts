/**
 * The learning games' content as the Game content page uses it: the calls, the names it shows, and a blank of each
 * kind to start from.
 *
 *   GET    /admin/game-content?game&kind&dialect&level&status&review&source&q&limit&offset   { rows, total }
 *   GET    /admin/game-content/readiness      what each game can be played with per variety, and every row's state
 *   GET    /admin/game-content/:id
 *   POST   /admin/game-content                { kind, dialect, level, payload }: a new draft
 *   PUT    /admin/game-content/:id            { level, payload, lockVersion }
 *   POST   /admin/game-content/:id/{submit|publish|unpublish|archive}   { lockVersion }
 *   POST   /admin/game-content/:id/review     { approved, note?, lockVersion }
 *   DELETE /admin/game-content/:id?lockVersion=
 *   POST   /admin/game-content/import         { from: 'lessons' | 'stories' | 'vocabulary', dialect }: drafts from approved content
 *   GET    /admin/game-content/vocabulary?dialect&q&limit   published vocabulary, for a card's words to be picked from
 *   GET    /admin/game-content/lines?dialect=&q=   published lines to copy into a case, never typed again
 *   PUT    /admin/game-content/:id/translations/:locale          { payload }: a riddle's or a proverb's text in one language
 *   POST   /admin/game-content/:id/translations/:locale/review   { status, note? }: that language read, or to be read again
 *
 * The rules are the stories': every change names its version (409 STALE), publishing needs approval (409
 * NOT_REVIEWED), and changing approved content takes the approval away. The page runs `checkGameContent`
 * (@kurda/shared) while typing, so what the server would refuse shows first. The Stories' riddles and proverbs are
 * rows here too; their translations are saved and reviewed one language at a time, which keeps the row's approval.
 */
import {
  GAME_NAMES,
  GAME_CONTENT_KINDS,
  type AdminGameContent,
  type AppLocale,
  type LoreKind,
  type LoreTradition,
  type ProverbTheme,
  type RiddleCategory,
  type RiddleDifficulty,
  type TranslationReview,
  type GameContentKind,
  type GameContentReadiness,
  type GameContentReview,
  type GameContentStatus,
  type GameDialect,
  type LearnGameId,
  type PublishedLine,
} from '@kurda/shared';
import { api } from './api';

export type GameContentAction = 'submit' | 'publish' | 'unpublish' | 'archive';

export interface GameContentFilter {
  game: LearnGameId | 'all';
  kind: GameContentKind | 'all';
  dialect: GameDialect | 'all';
  level: number | 'all';
  status: GameContentStatus | 'all';
  review: GameContentReview | 'all';
  query: string;
}

export const DEFAULT_GAME_FILTER: GameContentFilter = { game: 'all', kind: 'all', dialect: 'all', level: 'all', status: 'all', review: 'all', query: '' };

export const GAME_PAGE_SIZE = 50;

/** Each game by its own Kurmancî name, as players see it; the lessons' two exercises are not games and keep plain names. */
export const GAME_NAME: Record<LearnGameId, string> = {
  'build-sentence': 'Build a Sentence',
  'memory-thief': GAME_NAMES['memory-thief'],
  'hear-it': 'Hear It, Find It',
  detective: GAME_NAMES.detective,
  'last-letter': GAME_NAMES['last-letter'],
  impostor: GAME_NAMES.impostor,
  'who-am-i': GAME_NAMES['who-am-i'],
};

export const KIND_NAME: Record<GameContentKind, string> = {
  sentence: 'Sentence',
  passage: 'Passage',
  case_file: 'Case file',
  word_category: 'Word category',
  word_card: 'Word card',
  identity: 'Identity',
  question_template: 'Question template',
  riddle: 'Riddle',
  proverb: 'Proverb',
};

/** Where a kind that belongs to no game is shown to learners: the riddles and proverbs are the Stories'. */
export const COLLECTION_NAME = 'Stories';

export const RIDDLE_DIFFICULTY_LABEL: Record<RiddleDifficulty, string> = { easy: 'Easy (level 1)', medium: 'Medium (level 3)', hard: 'Hard (level 5)' };
export const RIDDLE_CATEGORY_LABEL: Record<RiddleCategory, string> = {
  nature: 'Nature',
  everyday: 'Everyday things',
  wordplay: 'Wordplay',
  logic: 'Logic',
  funny: 'Funny',
  culture: 'Culture',
  children: 'For children',
};
export const TRADITION_LABEL: Record<LoreTradition, string> = { traditional: 'Traditional', regional: 'Regional form', new: 'Newly written' };
export const THEME_LABEL: Record<ProverbTheme, string> = {
  wisdom: 'Wisdom',
  patience: 'Patience',
  friendship: 'Friendship',
  family: 'Family',
  respect: 'Respect',
  courage: 'Courage',
  knowledge: 'Knowledge',
  'life-experience': 'Life experience',
  trust: 'Trust',
  'hard-work': 'Hard work',
  'human-nature': 'Human nature',
  mistakes: 'Mistakes and learning',
};
export const TRANSLATION_REVIEW_LABEL: Record<TranslationReview, string> = { unreviewed: 'Needs review', reviewed: 'Reviewed' };


export const GAME_DIALECT_NAME: Record<GameDialect, string> = { kmr: 'Kurmancî', ckb: 'Soranî' };

export const STATUS_LABEL: Record<GameContentStatus, string> = { draft: 'Draft', in_review: 'In review', published: 'Published', archived: 'Archived' };
export const REVIEW_LABEL: Record<GameContentReview, string> = { unreviewed: 'Unreviewed', approved: 'Approved' };

/** A blank of each kind, every field present and empty; the Kurdish is the editor's to write or an import's to copy. */
export function blankPayload(kind: GameContentKind): Record<string, unknown> {
  const meanings = { en: '' };
  switch (kind) {
    case 'sentence':
      return { ku: '', meanings, orders: [], glosses: [] };
    case 'passage':
      return { title: '', text: '', hidden: [{ term: '', meanings }, { term: '', meanings }] };
    case 'case_file':
      return {
        title: meanings,
        intro: meanings,
        suspects: [
          { id: 'suspect-1', name: '', about: meanings },
          { id: 'suspect-2', name: '', about: meanings },
        ],
        evidence: [1, 2, 3].map((n) => ({ id: `evidence-${n}`, kind: 'statement', ku: '', meanings })),
        steps: [{ prompt: meanings, options: [meanings, meanings], correctIndex: 0, evidence: ['evidence-1'] }],
        culprit: 'suspect-1',
        solution: meanings,
        hints: [],
      };
    case 'word_category':
      return { slug: '', ku: '', meanings };
    case 'word_card':
      return { word: '', meanings, category: '', hint: { ku: '', meanings }, forms: [] };
    case 'identity':
      return { word: '', meanings, category: '', facts: {} };
    case 'question_template':
      return { ku: '', meanings, fact: '' };
    case 'riddle':
      return { slug: '', difficulty: 'easy', category: 'nature', tradition: 'new', question: '', hints: [''], answer: '', accepted: [''], explanation: '', sources: [] };
    case 'proverb':
      return { slug: '', text: '', themes: [], tradition: 'traditional', variants: [], exampleKu: '', sources: [] };
  }
}

/** A blank translation of a kind: a riddle's with one empty line per hint of its Kurdish. */
export function blankTranslation(kind: LoreKind, hints = 1): Record<string, unknown> {
  return kind === 'riddle'
    ? { question: '', hints: Array.from({ length: hints }, () => ''), answer: '', explanation: '' }
    : { translation: '', meaning: '', explanation: '', example: '' };
}

export function isKind(v: string): v is GameContentKind {
  return (GAME_CONTENT_KINDS as readonly string[]).includes(v);
}

function params(filter: GameContentFilter, page: number): string {
  const p = new URLSearchParams();
  if (filter.game !== 'all') p.set('game', filter.game);
  if (filter.kind !== 'all') p.set('kind', filter.kind);
  if (filter.dialect !== 'all') p.set('dialect', filter.dialect);
  if (filter.level !== 'all') p.set('level', String(filter.level));
  if (filter.status !== 'all') p.set('status', filter.status);
  if (filter.review !== 'all') p.set('review', filter.review);
  if (filter.query.trim()) p.set('q', filter.query.trim());
  p.set('limit', String(GAME_PAGE_SIZE));
  p.set('offset', String(page * GAME_PAGE_SIZE));
  return p.toString();
}

const BASE = '/admin/game-content';
const at = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

export const listGameContent = (filter: GameContentFilter, page: number): Promise<{ rows: AdminGameContent[]; total: number }> =>
  api(`${BASE}?${params(filter, page)}`);

export const gameContentReadiness = (): Promise<GameContentReadiness> => api(`${BASE}/readiness`);

export const getGameContent = (id: string): Promise<AdminGameContent> => api(at(id));

export const createGameContent = (input: { kind: GameContentKind; dialect: GameDialect; level: number; payload: unknown }): Promise<AdminGameContent> =>
  api(BASE, { method: 'POST', body: input });

export const saveGameContent = (id: string, input: { level: number; payload: unknown; lockVersion: number }): Promise<AdminGameContent> =>
  api(at(id), { method: 'PUT', body: input });

export const actOnGameContent = (id: string, action: GameContentAction, lockVersion: number): Promise<AdminGameContent> =>
  api(`${at(id)}/${action}`, { method: 'POST', body: { lockVersion } });

export const reviewGameContent = (id: string, approved: boolean, note: string | null, lockVersion: number): Promise<AdminGameContent> =>
  api(`${at(id)}/review`, { method: 'POST', body: { approved, note, lockVersion } });

export const deleteGameContent = (id: string, lockVersion: number): Promise<{ id: string; deleted: true }> =>
  api(`${at(id)}?lockVersion=${lockVersion}`, { method: 'DELETE' });

export const saveTranslation = (id: string, locale: AppLocale, payload: unknown): Promise<AdminGameContent> =>
  api(`${at(id)}/translations/${locale}`, { method: 'PUT', body: { payload } });

export const reviewTranslation = (id: string, locale: AppLocale, status: TranslationReview, note: string | null): Promise<AdminGameContent> =>
  api(`${at(id)}/translations/${locale}/review`, { method: 'POST', body: { status, note } });

/** Where an import takes its drafts from: lessons' sentences, stories' paragraphs, or published vocabulary's starter word cards. */
export type GameContentImport = 'lessons' | 'stories' | 'vocabulary';

export const importGameContent = (from: GameContentImport, dialect: GameDialect): Promise<{ created: number; skipped: number }> =>
  api(`${BASE}/import`, { method: 'POST', body: { from, dialect } });

/** A published word a card's Kurdish can be picked from (api/src/games/sources.ts `VocabularyWord`). */
export interface VocabularyPick {
  key: string;
  ku: string;
  meanings: Partial<Record<string, string>>;
}

/** Published vocabulary of a variety, by its Kurdish or by what it means. */
export const searchVocabulary = (dialect: GameDialect, q: string): Promise<{ words: VocabularyPick[]; total: number }> => {
  const p = new URLSearchParams({ dialect, limit: '20' });
  if (q.trim()) p.set('q', q.trim());
  return api(`${BASE}/vocabulary?${p.toString()}`);
};

/** The categories of a variety the word cards can be filed under (every one, whatever its state: the card is reviewed itself). */
export const listWordCategories = (dialect: GameDialect): Promise<{ rows: AdminGameContent[]; total: number }> =>
  api(`${BASE}?kind=word_category&dialect=${dialect}&limit=100`);

/** Published lines of a variety, for a case's Kurdish to be copied from. */
export const publishedLines = (dialect: GameDialect, q: string): Promise<{ lines: PublishedLine[] }> =>
  api(`${BASE}/lines?dialect=${dialect}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`);
