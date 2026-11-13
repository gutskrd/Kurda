/**
 * What one search field is allowed to look through.
 *
 * Before this there were two searches in the app and they were in two places:
 * usernames on the Friends tab, headwords on the Dictionary tab. Neither found
 * a lesson or a game, so the only way to reach either was to remember which
 * tab it lived behind — which is the thing a search is for.
 *
 * Two of the scopes ask the server (`/users/search`, `/dictionary/search`) and
 * two are lists the app already has. This module is the part with no React in
 * it: the scopes, the two local lists, and the matching. The games come from
 * the games' own register (games/gameCards.ts), so every game with a card is
 * one a search finds.
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
  /** what else finds it: a game's own name where this is one way into it, and what the name means in the reader's language */
  alsoKeys?: readonly TranslationKey[];
  icon: IconName;
  /** A route on the root stack: one of a game's screens. */
  route: GameRoute;
  /** the way the screen opens on, where one screen holds every way to play (Who Am I?) */
  params?: { way: 'phone' | 'friends' };
}

/**
 * A way into a game that has a name of its own. Peyvok against a friend is
 * "Pêşbaziya Peyvan" everywhere else in the app, and is listed under that
 * name; a way without one is listed under its game's.
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
 * Every way into the games a search can turn up, from the cards the Games
 * screen shows (games/gameCards.ts).
 *
 * This was a list of its own, written out by hand: five ways into three
 * games, and none of the games added after it, so somebody typing "impostor"
 * or "who am i" was told nothing was found. One row for each way into each
 * card that can be played now: a game played two ways is two rows (alone,
 * with friends), each opening what its button on the card opens. A way with
 * no name of its own is told apart by the word on its button, which
 * `wayWord` hands back for the row's second line.
 */
export function gameDestinations(cards: readonly GameCard[]): Destination[] {
  return cards
    .filter((card) => !card.soon)
    .flatMap((card) =>
      card.ways.map((way) => ({
        key: way.key,
        labelKey: WAY_NAME[way.key] ?? card.name,
        // a game's name is Kurmancî in every language: somebody who types "impostor", or "peyvok" for its battle, still finds it
        alsoKeys: [card.name, ...(GAME_MEANING[card.emblem] ? [GAME_MEANING[card.emblem]!] : []), ...(WAY_MEANING[way.key] ? [WAY_MEANING[way.key]!] : [])],
        icon: way.label === 'games.mode.friends' ? 'people' : (GAME_GLYPH[card.key] ?? 'play'),
        route: way.route,
        ...(way.params ? { params: way.params } : null),
      })),
    );
}

/** The word that tells one way into a game from another under the same name ("On one phone", "With friends"); null for a game with one way in, or a way with its own name. */
export function wayWord(cards: readonly GameCard[], key: string): TranslationKey | null {
  const card = cards.find((c) => c.ways.some((w) => w.key === key));
  const way = card?.ways.find((w) => w.key === key);
  if (!card || !way || card.ways.length < 2 || WAY_NAME[key]) return null;
  return way.label;
}

/** The games with screens of their own, which need no answer from the server to be listed. */
export const GAMES: readonly Destination[] = gameDestinations(GAME_CARDS);

/**
 * Whether a piece of text answers a query.
 *
 * Folded on both sides, so "se" finds "sê" and "sev" finds "şev". That is the
 * same rule the dictionary's own server-side search uses, and typing the
 * diacritics is exactly what somebody searching on a phone will not do.
 *
 * An empty query matches nothing rather than everything: a search field with
 * nothing in it should show you nothing, not the whole app.
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

/**
 * Which scopes a search actually has to run.
 *
 * `all` is not a scope of its own — it is every other one — and writing it out
 * here is what keeps the screen from special-casing it in four places.
 */
export function scopesToRun(scope: Scope): readonly Exclude<Scope, 'all'>[] {
  return scope === 'all' ? ['people', 'words', 'lessons', 'games'] : [scope];
}

/**
 * Whether the query is worth sending.
 *
 * The username endpoint is rate-limited to thirty a minute and a single letter
 * matches most of the table, so both server scopes wait for two characters.
 * The local lists have no such cost and answer from one.
 */
export function readyForServer(query: string): boolean {
  return query.trim().length >= 2;
}

/**
 * What the people search is asked for: the name without the "@" the app
 * itself writes before a handle. Somebody copying "@dilan" off a profile, or
 * typing it the way they have always seen it, is looking for dilan.
 */
export function peopleQuery(query: string): string {
  return query.trim().replace(/^@+/, '').trim();
}

