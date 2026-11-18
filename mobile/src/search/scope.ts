/**
 * What the app-wide search field looks through. Two scopes ask the server (`/users/search`, `/dictionary/search`)
 * and two are local lists. This module holds the React-free parts: the scopes, the local lists and the matching.
 * Games come from the games' register (games/gameCards.ts), so every game with a card is searchable.
 */
import { foldDiacritics } from '@kurda/shared';
import { GAME_CARDS, GAME_MEANING, type GameCard, type GameRoute } from '../games/gameCards';
import type { TranslationKey } from '../i18n/translations';
import type { IconName } from '../theme/icon-paths';

export type Scope = 'all' | 'people' | 'words' | 'lessons' | 'games';

/** In the order the filter shows them, and `all` is first because it is the default. */
export const SCOPES: readonly Scope[] = ['all', 'people', 'words', 'lessons', 'games'] as const;

export const SCOPE_LABEL: Record<Scope, TranslationKey> = {
  all: 'search.scope.all',
  people: 'search.scope.people',
  words: 'search.scope.words',
  lessons: 'search.scope.lessons',
  games: 'search.scope.games',
};

/** A place in the app that a search can turn up, rather than a row of data. */
export interface Destination {
  key: string;
  labelKey: TranslationKey;
  /** Other text that finds it: the game's own name where this is one way into it, and what the name means in the reader's language. */
  alsoKeys?: readonly TranslationKey[];
  icon: IconName;
  /** A route on the root stack: one of a game's screens. */
  route: GameRoute;
  /** The way the screen opens on, where one screen holds every way to play (Who Am I?). */
  params?: { way: 'phone' | 'friends' };
}

/**
 * A way into a game with its own name: Peyvok against a friend is "Pêşbaziya Peyvan" elsewhere in the app and is
 * listed so; a way without one uses its game's name.
 */
const WAY_NAME: Partial<Record<string, TranslationKey>> = {
  battle: 'games.battle.name',
  rhymeMatch: 'games.rhymeMatch.name',
};

/** What those names mean in the reader's language: "battle" still finds the battle. */
const WAY_MEANING: Partial<Record<string, TranslationKey>> = {
  battle: 'games.battle.meaning',
  rhymeMatch: 'games.rhymeMatch.meaning',
};

/** The glyph beside a game in the results: its own where it has one, the games' own otherwise. */
const GAME_GLYPH: Partial<Record<string, IconName>> = {
  wordle: 'grid',
  rhyme: 'speaker',
  race: 'bolt',
};

/**
 * Every way into the games a search can find, from the Games screen's cards (games/gameCards.ts): one row per
 * playable way into each card (alone, with friends), opening what that card button opens. A way without its own
 * name is told apart by its button word, which `wayWord` returns for the row's second line.
 */
export function gameDestinations(cards: readonly GameCard[]): Destination[] {
  return cards
    .filter((card) => !card.soon)
    .flatMap((card) =>
      card.ways.map((way) => ({
        key: way.key,
        labelKey: WAY_NAME[way.key] ?? card.name,
        // Game names are Kurmancî in every language, so "impostor", or "peyvok" for its battle, still finds them.
        alsoKeys: [card.name, ...(GAME_MEANING[card.emblem] ? [GAME_MEANING[card.emblem]!] : []), ...(WAY_MEANING[way.key] ? [WAY_MEANING[way.key]!] : [])],
        icon: way.label === 'games.mode.friends' ? 'people' : (GAME_GLYPH[card.key] ?? 'play'),
        route: way.route,
        ...(way.params ? { params: way.params } : null),
      })),
    );
}

/**
 * The word telling apart ways into one game under the same name ("On one phone", "With friends"); null for a
 * single way, or a way with its own name.
 */
export function wayWord(cards: readonly GameCard[], key: string): TranslationKey | null {
  const card = cards.find((c) => c.ways.some((w) => w.key === key));
  const way = card?.ways.find((w) => w.key === key);
  if (!card || !way || card.ways.length < 2 || WAY_NAME[key]) return null;
  return way.label;
}

/** The games with screens of their own, which need no answer from the server to be listed. */
export const GAMES: readonly Destination[] = gameDestinations(GAME_CARDS);

/**
 * Whether text matches a query, folded on both sides so "se" finds "sê" and "sev" finds "şev", as the
 * dictionary's server search does. An empty query matches nothing.
 */
export function matches(text: string, query: string): boolean {
  const q = foldDiacritics(query).toLowerCase();
  if (q.length === 0) return false;
  return foldDiacritics(text).toLowerCase().includes(q);
}

/** The rows of a local list whose label answers the query, in the list's own order. */
export function filterByLabel<T>(rows: readonly T[], label: (row: T) => string, query: string): T[] {
  return rows.filter((row) => matches(label(row), query));
}

/** The scopes a search must run; `all` expands to every other scope so the screen need not special-case it. */
export function scopesToRun(scope: Scope): readonly Exclude<Scope, 'all'>[] {
  return scope === 'all' ? ['people', 'words', 'lessons', 'games'] : [scope];
}

/** Whether a query is worth sending: the server scopes are rate-limited and wait for two characters; local lists answer from one. */
export function readyForServer(query: string): boolean {
  return query.trim().length >= 2;
}

/** The people query without the "@" the app writes before handles, so "@dilan" copied from a profile finds dilan. */
export function peopleQuery(query: string): string {
  return query.trim().replace(/^@+/, '').trim();
}

