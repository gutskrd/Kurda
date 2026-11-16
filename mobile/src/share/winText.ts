/**
 * What a win says when it is sent to somebody outside Hevalo.
 *
 * One modest line in the sharer's language, the picture of the effort where
 * there is one, and the site's address: a finished lesson, a streak on one of
 * its big days, a badge, a league week that went well, the word game's
 * result. The line is this catalogue's; the picture and the layout are the
 * shared builder's (`win-share.ts`), so the website sends the same message.
 *
 * Nothing here is given the account, and nothing here could say whose win it
 * is: no name, no profile, no place, nobody else. Some of the people sharing
 * are children, and a guest shares as anybody does, since there is nothing of
 * them in it. The address is the site's front door, never a page about a
 * person.
 */
import {
  lessonMarks,
  lessonStrip,
  shareMessage,
  streakRow,
  wordGameShareText,
  type LeagueWin,
  type LetterFeedback,
} from '@kurda/shared';
import { SITE_ORIGIN } from '../feed/api';
import { formatNumber } from '../i18n/format';
import type { Locale, TranslationKey } from '../i18n/translations';
import type { Exercise, SessionResults } from '../lesson/types';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/**
 * The word game's name over its grid. It is a name, not a sentence, and the
 * same in every language: a grid pasted into a chat is known by it.
 */
export const WORD_GAME_NAME = 'Hevalo Peyvok';

/** Where a shared win points: the site itself, as anybody can open it. */
export const SITE_URL = SITE_ORIGIN;

/**
 * A finished lesson: its name when the player was told it, and a square for
 * each exercise in the order it was asked, right the first time or not. The
 * results name the exercises the first answer missed and the player knows
 * which were put off, so the strip is the lesson as it went.
 */
export function lessonShare(
  t: Translate,
  {
    title,
    exercises,
    results,
    putOff = [],
  }: {
    title?: string | null;
    exercises: readonly Pick<Exercise, 'id'>[];
    results: Pick<SessionResults, 'correct' | 'total' | 'mistakes'>;
    /** the exercises put off and never answered */
    putOff?: readonly string[];
  },
): string {
  const name = title?.trim();
  const marks = lessonMarks({
    exerciseIds: exercises.map((ex) => ex.id),
    missedIds: (results.mistakes ?? []).map((m) => m.exerciseId),
    putOffIds: putOff,
    correct: results.correct,
    total: results.total,
  });
  return shareMessage({
    line: name ? t('share.win.lesson', { title: name }) : t('share.win.lessonPlain'),
    picture: lessonStrip(marks),
    link: SITE_URL,
  });
}

/** A streak on one of its big days: the count in the reader's own figures, and the week of squares. */
export function streakShare(t: Translate, locale: Locale, days: number): string {
  const count = formatNumber(days, locale);
  return shareMessage({ line: t('share.win.streak', { count }), picture: streakRow(days, count), link: SITE_URL });
}

/** A badge, by its own name. */
export function badgeShare(t: Translate, badge: string): string {
  return shareMessage({ line: t('share.win.badge', { badge }), link: SITE_URL });
}

/** A league week that went well: the league moved up to, or the place taken in one. `tier` is the league's own name. */
export function leagueShare(t: Translate, win: LeagueWin, tier: string): string {
  const line = win.kind === 'promoted' ? t('share.win.leagueUp', { tier }) : t('share.win.leaguePlace', { rank: win.rank, tier });
  return shareMessage({ line, link: SITE_URL });
}

/**
 * The word game's result: the game's name with how it went, and the grid of
 * squares. `words` are the catalogue's for a practice game and for how hard
 * it was.
 */
export function wordGameShare(
  game: { guesses: ReadonlyArray<{ feedback: readonly LetterFeedback[] }>; status: 'playing' | 'won' | 'lost'; mode: 'daily' | 'practice'; remainingAttempts: number },
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
    SITE_URL,
  );
}
