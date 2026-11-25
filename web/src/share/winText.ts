/**
 * The message a win is shared with: one warm line in the sharer's language telling a friend the news and asking them
 * along, ending on a small mark, then the win's address, which previews as its postcard in that same language and opens
 * WinPage.tsx. The mark, address and layout come from the shared builders, so the phone sends the same message. Nothing
 * here knows the account: the message never says whose win it is, since some sharers are children.
 */
import { shareMessage, winLine, winLinkUrl, wordGameResult, wordGameShareText, type AppLocale, type LeagueWin, type WinLink, type WordGameShare } from '@kurda/shared';
import type { Translate } from '../i18n/I18nProvider';
import type { WordleGame } from '../lib/types';

/** The site a shared win's address points at: the one the sharer is using. */
export function siteUrl(): string {
  return window.location.origin;
}

/** A win's own address on the site, naming the sharer's language so its card is written in it. */
function linkTo(win: WinLink, locale: AppLocale): string {
  return winLinkUrl(siteUrl(), win, locale);
}

/** A finished lesson, by its name when the page knows it. */
export function lessonShare(t: Translate, locale: AppLocale, title?: string | null): string {
  const name = title?.trim();
  const line = name ? t('share.win.lesson', { title: name }) : t('share.win.lessonPlain');
  return shareMessage({ line: winLine(line, 'lesson'), link: linkTo({ kind: 'lesson' }, locale) });
}

/** A streak milestone, with the count in the reader's own digits; offered only from a week on, so never a single day. */
export function streakShare(t: Translate, locale: AppLocale, days: number): string {
  const count = new Intl.NumberFormat(locale).format(days);
  return shareMessage({ line: winLine(t('share.win.streak', { count }), 'streak'), link: linkTo({ kind: 'streak', days }, locale) });
}

/** A badge, by its own name. */
export function badgeShare(t: Translate, locale: AppLocale, badge: string): string {
  return shareMessage({ line: winLine(t('share.win.badge', { badge }), 'badge'), link: linkTo({ kind: 'badge' }, locale) });
}

/** A good league week: the league moved up to, or the place taken. `tier` is the league's name. */
export function leagueShare(t: Translate, locale: AppLocale, win: LeagueWin, tier: string): string {
  const line = win.kind === 'promoted' ? t('share.win.leagueUp', { tier }) : t('share.win.leaguePlace', { rank: win.rank, tier });
  return shareMessage({ line: winLine(line, 'league'), link: linkTo({ kind: 'league', tier: win.tier }, locale) });
}

/**
 * The word game's result: how it went, then the guesses as rows of fruit, then the address, which carries the score so
 * the card can tell it. The difficulty is named only for a hard word, where it is worth a boast and reads naturally.
 */
export function wordGameShare(t: Translate, locale: AppLocale, game: Pick<WordleGame, 'guesses' | 'status' | 'remainingAttempts' | 'mode' | 'difficulty'>): string {
  const share: WordGameShare = {
    rows: game.guesses.map((g) => g.feedback),
    solved: game.status === 'won',
    // As many rows as the board draws: the guesses made and the ones left.
    maxAttempts: game.guesses.length + game.remainingAttempts,
    practice: game.mode === 'practice',
  };
  const n = new Intl.NumberFormat(locale);
  const score = `${n.format(share.rows.length)}/${n.format(share.maxAttempts)}`;
  const hard = game.difficulty === 'hard';
  const line = !share.solved
    ? t(share.practice ? 'share.win.peyvokPracticeLost' : 'share.win.peyvokLost')
    : share.practice
      ? t(hard ? 'share.win.peyvokPracticeHard' : 'share.win.peyvokPractice', { score })
      : t(hard ? 'share.win.peyvokHard' : 'share.win.peyvok', { score });
  return wordGameShareText(winLine(line, 'peyvok'), share, linkTo({ kind: 'peyvok', result: wordGameResult(share) }, locale));
}
