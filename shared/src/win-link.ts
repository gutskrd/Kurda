/**
 * A win as a link: the address Share puts under its line.
 *
 *   https://hevalo.app/win/lesson
 *   https://hevalo.app/win/streak/30
 *   https://hevalo.app/win/badge
 *   https://hevalo.app/win/league/cem
 *   https://hevalo.app/win/peyvok
 *
 * A shared win used to end in the site's front door, which every chat draws
 * as the same grey card whatever was won. Each kind of win has an address of
 * its own now, and whatever unfurls it draws that win's picture (web:
 * worker.ts; the pictures are shared art, `shareCardSvg`). Somebody who taps
 * it lands on a page that says what their friend did and where to begin
 * (web: share/WinPage.tsx).
 *
 * The address says what was done and nothing about who did it: a kind from a
 * fixed list, and for two of them one detail from a fixed shape (a streak's
 * days, a league's name). There is no page here about a person and no way to
 * make one: anything else in the path is not a win's address.
 *
 * A file of its own, with nothing imported: the website's edge script reads
 * links with it, and must not carry the rest of the package for that.
 */

/** The wins that have an address, by the word each has in it. */
export const WIN_KINDS = ['lesson', 'streak', 'badge', 'league', 'peyvok'] as const;
export type WinKind = (typeof WIN_KINDS)[number];

/** The leagues, by the word each has in an address: the tiers' own names (leagues.ts holds them, and a test keeps the two lists the same). */
export const WIN_LEAGUES = ['dilop', 'kani', 'cem', 'gol', 'derya', 'okyanus'] as const;
export type WinLeague = (typeof WIN_LEAGUES)[number];

/**
 * The streaks whose card is drawn with their days on its stamp: the days the
 * fire grows, then each hundredth day and each full year for three years.
 * Those are the days a streak is offered for sharing; a streak of any other
 * length shares the card of the fire alone.
 */
export const WIN_STREAK_CARDS = [7, 14, 30, 100, 200, 300, 365, 400, 500, 600, 700, 730, 800, 900, 1000] as const;

/** The longest streak an address will say: four figures, which is twenty-seven years. */
const MOST_DAYS = 9999;

export type WinLink = { kind: 'lesson' | 'badge' | 'peyvok' } | { kind: 'streak'; days: number | null } | { kind: 'league'; tier: WinLeague | null };

function isWinKind(v: string): v is WinKind {
  return (WIN_KINDS as readonly string[]).includes(v);
}

export function isWinLeague(v: unknown): v is WinLeague {
  return typeof v === 'string' && (WIN_LEAGUES as readonly string[]).includes(v);
}

/** A streak's days as an address may say them: a whole number of days from one up, or nothing. */
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

/** The whole address, on the site at `origin` (no slash at its end). */
export function winLinkUrl(origin: string, win: WinLink): string {
  return `${origin.replace(/\/+$/, '')}${winLinkPath(win)}`;
}

/**
 * The win an address names, or null where it names none. A detail the kind
 * has no use for, or one that is not in its shape, is left out and the win is
 * still read: a link somebody mistyped the end of lands on the page of its
 * kind rather than on nothing.
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

/** Where a win's picture lives on the website: the card a link to it is drawn with (1200 by 630). */
export const WIN_CARD_DIR = '/share';

/** The file name, without its ending, of the card a win is drawn with. */
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

/**
 * Every win that has a picture of its own, each once: what the generator
 * draws (api: scripts/generate-share-art.ts) and the site serves. Any other
 * win is drawn with the card of its kind, which is in this list too.
 */
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
