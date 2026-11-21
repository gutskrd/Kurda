import { lessonExercises, type LearnGameId } from '@kurda/shared';
import { HeadphonesIcon, TilesIcon } from '../components/icons';
import { useAvailability, useGameDialect } from '../games/soloRounds';
import type { MessageKey } from '../i18n/en';

/**
 * The two lesson exercises that used to be games, Build a Sentence and Hear It, Find It: which have a page here, for
 * the practice hub's list. They are solo-kit rounds from approved lesson content, offered only in a variety with
 * enough of it (GET /games/availability); a short one is hidden rather than "coming soon".
 */

export interface WebExercise {
  href: string;
  nameKey: MessageKey;
  /** One line, as the other tools have. */
  bodyKey: MessageKey;
  Icon: (p: { size?: number }) => React.JSX.Element;
}

const WEB_LESSON_EXERCISES: Partial<Record<LearnGameId, WebExercise>> = {
  'build-sentence': { href: '/app/learn/practice/build-sentence', nameKey: 'games.sentence.name', bodyKey: 'learn.tools.sentence', Icon: TilesIcon },
  'hear-it': { href: '/app/learn/practice/hear-it', nameKey: 'games.hear.name', bodyKey: 'learn.tools.hear', Icon: HeadphonesIcon },
};

const PLAYABLE = Object.keys(WEB_LESSON_EXERCISES) as LearnGameId[];

/** The exercises offered in the learner's variety, each with its page; none until availability answers. */
export function useLessonExercises(): Array<{ id: LearnGameId; web: WebExercise }> {
  const dialect = useGameDialect();
  return lessonExercises(useAvailability(dialect), PLAYABLE).flatMap(({ id }) => {
    const web = WEB_LESSON_EXERCISES[id];
    return web ? [{ id, web }] : [];
  });
}
