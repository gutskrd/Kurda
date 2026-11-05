/**
 * The learning games' own content, as the admin's Game content page uses it:
 * the calls, the names it shows, and a blank of each kind to start from.
 *
 *   GET    /admin/game-content?game&kind&dialect&level&status&review&source&q&limit&offset   { rows, total }
 *   GET    /admin/game-content/readiness      what each game can be played with per variety, and every row's state
 *   GET    /admin/game-content/:id
 *   POST   /admin/game-content                { kind, dialect, level, payload }: a new draft
 *   PUT    /admin/game-content/:id            { level, payload, lockVersion }
 *   POST   /admin/game-content/:id/{submit|publish|unpublish|archive}   { lockVersion }
 *   POST   /admin/game-content/:id/review     { approved, note?, lockVersion }
 *   DELETE /admin/game-content/:id?lockVersion=
 *   POST   /admin/game-content/import         { from: 'lessons' | 'stories', dialect }: drafts from approved content
 *
 * The rules are the stories': every change names the version it was made on
 * (409 STALE when someone else changed it first), publishing needs a
 * reviewer's approval (409 NOT_REVIEWED), and a change to approved content
 * takes the approval away. What may be saved is `checkGameContent` in
 * @kurda/shared, which this page runs as the editor types, so the issues the
 * server would refuse a save for are shown before it is tried.
 */
import {
  GAME_CONTENT_KINDS,
  type AdminGameContent,
  type GameContentKind,
  type GameContentReadiness,
  type GameContentReview,
  type GameContentStatus,
  type GameDialect,
  type LearnGameId,
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

export const GAME_NAME: Record<LearnGameId, string> = {
  'build-sentence': 'Build a Kurdish Sentence',
  'memory-thief': 'The Memory Thief',
  'hear-it': 'Hear It, Find It',
  'what-would-you-say': 'What Would You Say?',
  detective: 'Kurdish Detective',
  'last-letter': 'The Last Letter',
  impostor: 'Kurdish Impostor',
  'dont-say': 'Don’t Say the Word!',
  bluff: 'Kurdish Bluff',
  'who-am-i': 'Who Am I?',
  kingdom: 'Kurdish Kingdom',
};

export const KIND_NAME: Record<GameContentKind, string> = {
  sentence: 'Sentence',
  passage: 'Passage',
  scenario: 'Scenario',
  case_file: 'Case file',
  word_category: 'Word category',
  word_card: 'Word card',
  taboo_card: 'Forbidden-words card',
  bluff_card: 'Bluff card',
  identity: 'Identity',
  question_template: 'Question template',
  building_name: 'Building name',
};

export const GAME_DIALECT_NAME: Record<GameDialect, string> = { kmr: 'Kurmancî', ckb: 'Soranî' };

export const STATUS_LABEL: Record<GameContentStatus, string> = { draft: 'Draft', in_review: 'In review', published: 'Published', archived: 'Archived' };
export const REVIEW_LABEL: Record<GameContentReview, string> = { unreviewed: 'Unreviewed', approved: 'Approved' };

/**
 * A blank of each kind, the way the editor opens a new row: every field there
 * and empty. Nothing Kurdish is filled in — that is the editor's to write, or
 * an importer's to copy from approved content.
 */
export function blankPayload(kind: GameContentKind): Record<string, unknown> {
  const meanings = { en: '' };
  switch (kind) {
    case 'sentence':
      return { ku: '', meanings, orders: [], glosses: [] };
    case 'passage':
      return { title: '', text: '', hidden: [{ term: '', meanings }, { term: '', meanings }] };
    case 'scenario':
      return {
        situation: meanings,
        line: { ku: '', meanings },
        reply: { ku: '', meanings, why: meanings },
        others: [
          { ku: '', meanings, why: meanings },
          { ku: '', meanings, why: meanings },
        ],
      };
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
      return { word: '', meanings, category: '', hint: { ku: '', meanings } };
    case 'taboo_card':
      return { target: '', meanings, forbidden: ['', '', ''], forms: [] };
    case 'bluff_card':
      return { word: '', definitions: { en: '' } };
    case 'identity':
      return { word: '', meanings, category: '', facts: {} };
    case 'question_template':
      return { ku: '', meanings, fact: '' };
    case 'building_name':
      return { building: 'houses', ku: '', meanings };
  }
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

export const importGameContent = (from: 'lessons' | 'stories', dialect: GameDialect): Promise<{ created: number; skipped: number }> =>
  api(`${BASE}/import`, { method: 'POST', body: { from, dialect } });
