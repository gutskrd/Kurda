/**
 * What a win says when shared outside Hevalo: one line in the sharer's language ending on a small mark, then the
 * win's address on the site, which unfurls as its postcard (shared art/share-card.ts). The mark, address and
 * layout come from the shared builders (`win-share.ts`, `win-link.ts`), so the web app sends the same message.
 *
 * Nothing here identifies the sharer: no name, profile or place. Some sharers are children. The address carries
 * only the kind of win and at most a day count or a league.
 */
import { shareMessage, winLine, winLinkUrl, wordGameShareText, type LeagueWin, type LetterFeedback, type WinLink } from '@kurda/shared';
import { SITE_ORIGIN } from '../feed/api';
import { formatNumber } from '../i18n/format';
import type { Locale, TranslationKey } from '../i18n/translations';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** The word game's name over its grid: a name, the same in every language, so a pasted grid is recognised. */
export const WORD_GAME_NAME = 'Hevalo Peyvok';

/** The site a shared win's address points to. */
export const SITE_URL = SITE_ORIGIN;

/** A win's own address on the site. */
function linkTo(win: WinLink): string {
  return winLinkUrl(SITE_URL, win);
}

/** A finished lesson, by its name when the player was told it. */
export function lessonShare(t: Translate, title?: string | null): string {
  const name = title?.trim();
  return shareMessage({ line: winLine(name ? t('share.win.lesson', { title: name }) : t('share.win.lessonPlain'), 'lesson'), link: linkTo({ kind: 'lesson' }) });
}

/** A streak milestone: the count in the reader's own digits, and the address of the card with those days. */
export function streakShare(t: Translate, locale: Locale, days: number): string {
  const count = formatNumber(days, locale);
  return shareMessage({ line: winLine(t('share.win.streak', { count }), 'streak'), link: linkTo({ kind: 'streak', days }) });
}

/** A badge, by its own name. */
export function badgeShare(t: Translate, badge: string): string {
  return shareMessage({ line: winLine(t('share.win.badge', { badge }), 'badge'), link: linkTo({ kind: 'badge' }) });
}

/** A good league week: the league moved up to, or the place taken. `tier` is the league's own name. */
export function leagueShare(t: Translate, win: LeagueWin, tier: string): string {
  const line = win.kind === 'promoted' ? t('share.win.leagueUp', { tier }) : t('share.win.leaguePlace', { rank: win.rank, tier });
  return shareMessage({ line: winLine(line, 'league'), link: linkTo({ kind: 'league', tier: win.tier }) });
}

/** The word game's result: its name, how it went, and the guesses as rows of fruit. `words` come from the catalogue. */
export function wordGameShare(
  game: { guesses: ReadonlyArray<{ feedback: readonly LetterFeedback[] }>; status: 'playing' | 'won' | 'lost'; mode: 'daily' | 'practice'; remainingAttempts: number },
  words: { practice: string; difficulty: string },
): string {
  return wordGameShareText(
    {
      rows: game.guesses.map((g) => g.feedback),
      solved: game.status === 'won',
      // As many rows as the board draws: the guesses made and the ones left.
      maxAttempts: game.guesses.length + game.remainingAttempts,
      name: WORD_GAME_NAME,
      practice: game.mode === 'practice' ? words.practice : undefined,
      difficulty: words.difficulty,
    },
    linkTo({ kind: 'peyvok' }),
  );
}
