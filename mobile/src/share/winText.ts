/**
 * What a win says when shared outside Hevalo: one warm line in the sharer's language telling a friend the news and
 * asking them along, ending on a small mark, then the win's address on the site, which unfurls as its postcard in that
 * same language (shared art/share-card.ts, win-words.ts). The mark, address and layout come from the shared builders
 * (`win-share.ts`, `win-link.ts`), so the web app sends the same message.
 *
 * Nothing here identifies the sharer: no name, profile or place. Some sharers are children. The address carries only
 * the kind of win, at most a day count, a league or a word game's score, and the language the app is in.
 */
import { shareMessage, winLine, winLinkUrl, wordGameResult, wordGameShareText } from '@kurda/shared';
import type { LeagueWin, LetterFeedback, WinLink, WordGameShare } from '@kurda/shared';
import { SITE_ORIGIN } from '../feed/api';
import { formatNumber } from '../i18n/format';
import type { Locale, TranslationKey } from '../i18n/translations';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** The site a shared win's address points to. */
export const SITE_URL = SITE_ORIGIN;

/** A win's own address on the site, naming the sharer's language so its card is written in it. */
function linkTo(win: WinLink, locale: Locale): string {
  return winLinkUrl(SITE_URL, win, locale);
}

/** A finished lesson, by its name when the player was told it. */
export function lessonShare(t: Translate, locale: Locale, title?: string | null): string {
  const name = title?.trim();
  const line = name ? t('share.win.lesson', { title: name }) : t('share.win.lessonPlain');
  return shareMessage({ line: winLine(line, 'lesson'), link: linkTo({ kind: 'lesson' }, locale) });
}

/** A streak milestone: the count in the reader's own digits, and the address of the card with those days. Offered only from a week on, so never a single day. */
export function streakShare(t: Translate, locale: Locale, days: number): string {
  const count = formatNumber(days, locale);
  return shareMessage({ line: winLine(t('share.win.streak', { count }), 'streak'), link: linkTo({ kind: 'streak', days }, locale) });
}

/** A badge, by its own name. */
export function badgeShare(t: Translate, locale: Locale, badge: string): string {
  return shareMessage({ line: winLine(t('share.win.badge', { badge }), 'badge'), link: linkTo({ kind: 'badge' }, locale) });
}

/** A good league week: the league moved up to, or the place taken. `tier` is the league's own name. */
export function leagueShare(t: Translate, locale: Locale, win: LeagueWin, tier: string): string {
  const line = win.kind === 'promoted' ? t('share.win.leagueUp', { tier }) : t('share.win.leaguePlace', { rank: win.rank, tier });
  return shareMessage({ line: winLine(line, 'league'), link: linkTo({ kind: 'league', tier: win.tier }, locale) });
}

/**
 * The word game's result: how it went, then the guesses as rows of fruit, then the address, which carries the score so
 * the card can tell it. The difficulty is named only for a hard word, where it is worth a boast and reads naturally.
 */
export function wordGameShare(
  t: Translate,
  locale: Locale,
  game: {
    guesses: ReadonlyArray<{ feedback: readonly LetterFeedback[] }>;
    status: 'playing' | 'won' | 'lost';
    mode: 'daily' | 'practice';
    difficulty: 'easy' | 'medium' | 'hard';
    remainingAttempts: number;
  },
): string {
  const share: WordGameShare = {
    rows: game.guesses.map((g) => g.feedback),
    solved: game.status === 'won',
    // As many rows as the board draws: the guesses made and the ones left.
    maxAttempts: game.guesses.length + game.remainingAttempts,
    practice: game.mode === 'practice',
  };
  const score = `${formatNumber(share.rows.length, locale)}/${formatNumber(share.maxAttempts, locale)}`;
  const hard = game.difficulty === 'hard';
  const line = !share.solved
    ? t(share.practice ? 'share.win.peyvokPracticeLost' : 'share.win.peyvokLost')
    : share.practice
      ? t(hard ? 'share.win.peyvokPracticeHard' : 'share.win.peyvokPractice', { score })
      : t(hard ? 'share.win.peyvokHard' : 'share.win.peyvok', { score });
  return wordGameShareText(winLine(line, 'peyvok'), share, linkTo({ kind: 'peyvok', result: wordGameResult(share) }, locale));
}
