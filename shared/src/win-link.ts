/**
 * A win as a link, the address Share puts under its line (`https://hevalo.app/win/lesson?l=ku`, `…/win/streak/30`,
 * `…/win/peyvok/4-6`). Chats unfurl it with that win's picture (`shareCardSvg`) and words (win-words.ts), and it opens a
 * page saying what the friend did. The address names a kind from a fixed list, at most one detail of a fixed shape, and
 * the language the sender's app is in, so the card speaks it; never who did it.
 *
 * Only the language list is imported, which imports nothing: the website's edge script reads links with this file and
 * must not carry the rest of the package.
 */
import { isAppLocale, type AppLocale } from './locales.js';

/** The wins that have an address, by the word each has in it. */
export const WIN_KINDS = ['lesson', 'streak', 'badge', 'league', 'peyvok'] as const;
export type WinKind = (typeof WIN_KINDS)[number];

/** The leagues by their address word: the tiers' own names (leagues.ts holds them; a test keeps the two in step). */
export const WIN_LEAGUES = ['dilop', 'kani', 'cem', 'gol', 'derya', 'okyanus'] as const;
export type WinLeague = (typeof WIN_LEAGUES)[number];

/**
 * The streaks whose card carries their days on its stamp: the days the fire grows, then each hundredth day and each full
 * year for three years. These are the days a streak is offered for sharing; other lengths share the plain fire card.
 */
export const WIN_STREAK_CARDS = [7, 14, 30, 100, 200, 300, 365, 400, 500, 600, 700, 730, 800, 900, 1000] as const;

/** The longest streak an address will say: four figures, about twenty-seven years. */
const MOST_DAYS = 9999;

/**
 * How a word game went, as its address says it (`4-6`, `x-6`, `practice-3-6`): the guesses it took of those allowed, or
 * null when the word was not found, and whether it was a practice word rather than the day's.
 */
export interface PeyvokResult {
  tries: number | null;
  of: number;
  practice: boolean;
}

export type WinLink =
  | { kind: 'lesson' | 'badge' }
  | { kind: 'streak'; days: number | null }
  | { kind: 'league'; tier: WinLeague | null }
  | { kind: 'peyvok'; result: PeyvokResult | null };

function isWinKind(v: string): v is WinKind {
  return (WIN_KINDS as readonly string[]).includes(v);
}

export function isWinLeague(v: unknown): v is WinLeague {
  return typeof v === 'string' && (WIN_LEAGUES as readonly string[]).includes(v);
}

/** A streak's days as an address may say them: a whole number from one up, or nothing. */
function daysOf(days: number | null | undefined): number | null {
  return typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= MOST_DAYS ? days : null;
}

/** A count an address may hold for a word game: one figure, from one to nine. */
function figure(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 9;
}

/** A word game's result as an address may say it, or nothing: never more guesses than were allowed. */
function resultOf(result: PeyvokResult | null | undefined): PeyvokResult | null {
  if (!result || !figure(result.of)) return null;
  if (result.tries !== null && !(figure(result.tries) && result.tries <= result.of)) return null;
  return { tries: result.tries, of: result.of, practice: result.practice === true };
}

const PEYVOK_DETAIL = /^(practice-)?([1-9]|x)-([1-9])$/;

function peyvokDetail(result: PeyvokResult): string {
  return `${result.practice ? 'practice-' : ''}${result.tries ?? 'x'}-${result.of}`;
}

function readPeyvokDetail(detail: string | null): PeyvokResult | null {
  const match = detail === null ? null : PEYVOK_DETAIL.exec(detail);
  if (!match) return null;
  return resultOf({ tries: match[2] === 'x' ? null : Number(match[2]), of: Number(match[3]), practice: match[1] !== undefined });
}

/** `/win/<kind>`, with the streak's days, the league's name or the word game's result after it where there is one to say. */
export function winLinkPath(win: WinLink): string {
  if (win.kind === 'streak') {
    const days = daysOf(win.days);
    return days === null ? '/win/streak' : `/win/streak/${days}`;
  }
  if (win.kind === 'league') return isWinLeague(win.tier) ? `/win/league/${win.tier}` : '/win/league';
  if (win.kind === 'peyvok') {
    const result = resultOf(win.result);
    return result === null ? '/win/peyvok' : `/win/peyvok/${peyvokDetail(result)}`;
  }
  return `/win/${win.kind}`;
}

/** The query that names the sender's language: a code from the app's own list, so it can only ever be one of nine words. */
const LANGUAGE = 'l';

/** The whole address on the site at `origin` (without a trailing slash), naming the sender's language when given. */
export function winLinkUrl(origin: string, win: WinLink, locale?: AppLocale | null): string {
  const language = isAppLocale(locale) ? `?${LANGUAGE}=${locale}` : '';
  return `${origin.replace(/\/+$/, '')}${winLinkPath(win)}${language}`;
}

/** The language a link's query names, or null for none or anything that is not one of the app's languages. */
export function winLinkLocale(search: string): AppLocale | null {
  const named = new URLSearchParams(search).get(LANGUAGE);
  return isAppLocale(named) ? named : null;
}

/**
 * The win an address names, or null. A detail the kind does not use or of the wrong shape is dropped and the win still
 * read, so a link with a mistyped end lands on its kind's page.
 */
export function parseWinLink(pathname: string): WinLink | null {
  const match = /^\/win\/([a-z]+)(?:\/([A-Za-z0-9-]{1,24}))?\/?$/.exec(pathname);
  if (!match) return null;
  const kind = match[1]!;
  if (!isWinKind(kind)) return null;
  const detail = match[2] ?? null;
  if (kind === 'streak') return { kind, days: detail !== null && /^[1-9]\d{0,3}$/.test(detail) ? Number(detail) : null };
  if (kind === 'league') return { kind, tier: isWinLeague(detail) ? detail : null };
  if (kind === 'peyvok') return { kind, result: readPeyvokDetail(detail) };
  return { kind };
}

/** Where win pictures live on the website: the 1200 by 630 cards links are drawn with. */
export const WIN_CARD_DIR = '/share';

/** The file name, without extension, of a win's card; a word game's is the same however it went. */
export function winCardName(win: WinLink): string {
  if (win.kind === 'streak') {
    const days = daysOf(win.days);
    return days !== null && (WIN_STREAK_CARDS as readonly number[]).includes(days) ? `streak-${days}` : 'streak';
  }
  if (win.kind === 'league') return isWinLeague(win.tier) ? `league-${win.tier}` : 'league';
  return win.kind;
}

/** The site path of a win's picture (`/share/streak-30.png`). */
export function winCardPath(win: WinLink): string {
  return `${WIN_CARD_DIR}/${winCardName(win)}.png`;
}

/** Every win with a picture of its own, once each: what the generator draws (api: scripts/generate-share-art.ts); other wins use their kind's card. */
export function winCards(): WinLink[] {
  return [
    { kind: 'lesson' },
    { kind: 'streak', days: null },
    ...WIN_STREAK_CARDS.map((days): WinLink => ({ kind: 'streak', days })),
    { kind: 'badge' },
    { kind: 'league', tier: null },
    ...WIN_LEAGUES.map((tier): WinLink => ({ kind: 'league', tier })),
    { kind: 'peyvok', result: null },
  ];
}

/** Every card there is a picture of, by its file name. */
export function winCardNames(): string[] {
  return winCards().map(winCardName);
}
