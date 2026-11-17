/**
 * A win as a link, the address Share puts under its line:
 *
 *   https://hevalo.app/win/lesson
 *   https://hevalo.app/win/streak/30
 *   https://hevalo.app/win/badge
 *   https://hevalo.app/win/league/cem
 *   https://hevalo.app/win/peyvok
 *
 * Each kind of win has its own address, which chats unfurl with that win's picture (web: worker.ts, drawn by the shared
 * `shareCardSvg`), and which opens a page saying what the friend did (web: share/WinPage.tsx). The address names a kind
 * from a fixed list and at most one detail of a fixed shape, and never who did it.
 *
 * Nothing is imported: the website's edge script reads links with this file and must not carry the rest of the package.
 */

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

export type WinLink = { kind: 'lesson' | 'badge' | 'peyvok' } | { kind: 'streak'; days: number | null } | { kind: 'league'; tier: WinLeague | null };

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

/** `/win/<kind>`, with the streak's days or the league's name after it where there is one to say. */
export function winLinkPath(win: WinLink): string {
  if (win.kind === 'streak') {
    const days = daysOf(win.days);
    return days === null ? '/win/streak' : `/win/streak/${days}`;
  }
  if (win.kind === 'league') return isWinLeague(win.tier) ? `/win/league/${win.tier}` : '/win/league';
  return `/win/${win.kind}`;
}

/** The whole address on the site at `origin` (without a trailing slash). */
export function winLinkUrl(origin: string, win: WinLink): string {
  return `${origin.replace(/\/+$/, '')}${winLinkPath(win)}`;
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
  return { kind };
}

/** Where win pictures live on the website: the 1200 by 630 cards links are drawn with. */
export const WIN_CARD_DIR = '/share';

/** The file name, without extension, of a win's card. */
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
    { kind: 'peyvok' },
  ];
}

/** Every card there is a picture of, by its file name. */
export function winCardNames(): string[] {
  return winCards().map(winCardName);
}
