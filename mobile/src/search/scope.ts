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
 * it: the scopes, the two local lists, and the matching.
 */
import { foldDiacritics } from '@kurda/shared';
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

/**
 * The game routes, all of which take no parameters.
 *
 * Spelled out rather than keyed off `RootStackParamList`, so this module
 * stays free of navigation types and the test can import it.
 */
export type GameRoute = 'Wordle' | 'WordleBattle' | 'Rhyme' | 'RhymeMatch' | 'Race';

/** A place in the app that a search can turn up, rather than a row of data. */
export interface Destination {
  key: string;
  labelKey: TranslationKey;
  icon: IconName;
  /** A param-less route on the root stack. */
  route: GameRoute;
}

/**
 * The games, as the Play screen lists them.
 *
 * Written out rather than read from that screen because the screen builds them
 * inside JSX with a card and a blurb each, and a search needs a name and a
 * route. If a game is added there and not here it simply will not be findable,
 * which is a smaller failure than this file importing a screen.
 */
export const GAMES: readonly Destination[] = [
  { key: 'wordle', labelKey: 'games.wordle.name', icon: 'grid', route: 'Wordle' },
  { key: 'battle', labelKey: 'games.battle.name', icon: 'people', route: 'WordleBattle' },
  { key: 'rhyme', labelKey: 'games.rhyme.name', icon: 'sparkle', route: 'Rhyme' },
  { key: 'rhymeMatch', labelKey: 'games.rhymeMatch.name', icon: 'people', route: 'RhymeMatch' },
  { key: 'race', labelKey: 'games.race.name', icon: 'bolt', route: 'Race' },
];

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
