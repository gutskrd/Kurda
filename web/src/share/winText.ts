/**
 * The message a win is shared with: one line in the sharer's language ending on a small mark, then the win's address,
 * which previews as its postcard and opens WinPage.tsx. The mark, address and layout come from the shared builders, so
 * the phone sends the same message. Nothing here knows the account: the message never says whose win it is, since some
 * sharers are children.
 */
import { shareMessage, winLine, winLinkUrl, wordGameShareText, type LeagueWin, type WinLink } from '@kurda/shared';
import type { Translate } from '../i18n/I18nProvider';
import type { WordleGame } from '../lib/types';

/** The word game's name over its grid; a name, so the same in every language. */
const WORD_GAME_NAME = 'Hevalo Peyvok';

/** The site a shared win's address points at: the one the sharer is using. */
export function siteUrl(): string {
  return window.location.origin;
}

/** A win's own address on the site. */
function linkTo(win: WinLink): string {
  return winLinkUrl(siteUrl(), win);
}

/** A finished lesson, by its name when the page knows it. */
export function lessonShare(t: Translate, title?: string | null): string {
  const name = title?.trim();
  return shareMessage({ line: winLine(name ? t('share.win.lesson', { title: name }) : t('share.win.lessonPlain'), 'lesson'), link: linkTo({ kind: 'lesson' }) });
}

/** A streak milestone, with the count in the reader's own digits. */
export function streakShare(t: Translate, locale: string, days: number): string {
  const count = new Intl.NumberFormat(locale).format(days);
  return shareMessage({ line: winLine(t('share.win.streak', { count }), 'streak'), link: linkTo({ kind: 'streak', days }) });
}

/** A badge, by its own name. */
export function badgeShare(t: Translate, badge: string): string {
  return shareMessage({ line: winLine(t('share.win.badge', { badge }), 'badge'), link: linkTo({ kind: 'badge' }) });
}

/** A good league week: the league moved up to, or the place taken. `tier` is the league's name. */
export function leagueShare(t: Translate, win: LeagueWin, tier: string): string {
  const line = win.kind === 'promoted' ? t('share.win.leagueUp', { tier }) : t('share.win.leaguePlace', { rank: win.rank, tier });
  return shareMessage({ line: winLine(line, 'league'), link: linkTo({ kind: 'league', tier: win.tier }) });
}

/** The word game's result: its name and outcome, and the guesses as rows of fruit. `words` come from the catalogue. */
export function wordGameShare(
  game: Pick<WordleGame, 'guesses' | 'status' | 'remainingAttempts' | 'mode'>,
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
