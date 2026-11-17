/**
 * What a win says when it is sent to somebody outside Hevalo.
 *
 * One modest line in the sharer's language, ended on a small mark of what it
 * was, and under it the win's own address: a finished lesson, a streak on one
 * of its big days, a badge, a league week that went well, the word game's
 * result. Wherever the address is pasted it is drawn as the postcard of that
 * win (shared: art/share-card.ts), and whoever taps it lands on the page of
 * it (WinPage.tsx). The line is this catalogue's; the mark, the address and
 * the layout are the shared builders' (`win-share.ts`, `win-link.ts`), so the
 * phone sends the same message.
 *
 * Nothing here is given the account, and nothing here could say whose win it
 * is: no name, no profile, no place, nobody else. Some of the people sharing
 * are children, and a message passed on is out of anybody's hands. The
 * address says what kind of win it was and at most how many days or which
 * league, never a page about a person.
 */
import { shareMessage, winLine, winLinkUrl, wordGameShareText, type LeagueWin, type WinLink } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import type { WordleGame } from '../lib/types';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * The word game's name over its grid. It is a name, not a sentence, and the
 * same in every language: a grid pasted into a chat is known by it.
 */
export const WORD_GAME_NAME = 'Hevalo Peyvok';

/** The site a shared win's address is on: the one the sharer is reading, as anybody can open it. */
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

/** A streak on one of its big days: the count in the reader's own figures, and the address of the card with those days on its stamp. */
export function streakShare(t: Translate, locale: string, days: number): string {
  const count = new Intl.NumberFormat(locale).format(days);
  return shareMessage({ line: winLine(t('share.win.streak', { count }), 'streak'), link: linkTo({ kind: 'streak', days }) });
}

/** A badge, by its own name. */
export function badgeShare(t: Translate, badge: string): string {
  return shareMessage({ line: winLine(t('share.win.badge', { badge }), 'badge'), link: linkTo({ kind: 'badge' }) });
}

/** A league week that went well: the league moved up to, or the place taken in one. `tier` is the league's own name. */
export function leagueShare(t: Translate, win: LeagueWin, tier: string): string {
  const line = win.kind === 'promoted' ? t('share.win.leagueUp', { tier }) : t('share.win.leaguePlace', { rank: win.rank, tier });
  return shareMessage({ line: winLine(line, 'league'), link: linkTo({ kind: 'league', tier: win.tier }) });
}

/**
 * The word game's result: the game's name with how it went, and the guesses
 * as rows of fruit. `words` are the catalogue's for a practice game and for
 * how hard it was.
 */
export function wordGameShare(
  game: Pick<WordleGame, 'guesses' | 'status' | 'remainingAttempts' | 'mode'>,
  words: { practice: string; difficulty: string },
): string {
  return wordGameShareText(
    {
      rows: game.guesses.map((g) => g.feedback),
      solved: game.status === 'won',
      // as many rows as the board draws: the guesses made and the ones left
      maxAttempts: game.guesses.length + game.remainingAttempts,
      name: WORD_GAME_NAME,
      practice: game.mode === 'practice' ? words.practice : undefined,
      difficulty: words.difficulty,
    },
    linkTo({ kind: 'peyvok' }),
  );
}
