import { Link } from 'react-router-dom';
import { lessonExercises, type LearnGameId } from '@kurda/shared';
import { HeadphonesIcon, TilesIcon } from '../components/icons';
import { useAvailability, useGameDialect } from '../games/soloRounds';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/**
 * The lessons' two exercises that were games once: Build a Kurdish Sentence
 * and Hear It, Find It. Which of the registry's exercises this app has a page
 * for, and the card each wears among Learn's practice tools.
 *
 * They are rounds of the solo kit, made from the lessons' own approved
 * sentences and people's recordings, so they are offered the way a game is:
 * only in a variety that has enough of that content now (GET
 * /games/availability). Unlike a game, one that is short of content is not
 * shown as "coming soon": the practice tools are things to reach for, and a
 * card that opens nothing is not one. Nothing is drawn until the answer has
 * arrived, so the row of tools does not gain a card and then lose it.
 */

interface WebExercise {
  href: string;
  nameKey: MessageKey;
  /** one line, as the other tools have */
  bodyKey: MessageKey;
  Icon: (p: { size?: number }) => React.JSX.Element;
}

export const WEB_LESSON_EXERCISES: Partial<Record<LearnGameId, WebExercise>> = {
  'build-sentence': { href: '/app/learn/practice/build-sentence', nameKey: 'games.sentence.name', bodyKey: 'learn.tools.sentence', Icon: TilesIcon },
  'hear-it': { href: '/app/learn/practice/hear-it', nameKey: 'games.hear.name', bodyKey: 'learn.tools.hear', Icon: HeadphonesIcon },
};

const PLAYABLE = Object.keys(WEB_LESSON_EXERCISES) as LearnGameId[];

/**
 * The exercises' cards, to sit in the row of practice tools. For somebody
 * signed in only: a round is made and checked on the server against the
 * learner, so the caller does not draw this for a visitor.
 */
export function ExerciseTools(): React.JSX.Element {
  const t = useT();
  const dialect = useGameDialect();
  const offered = lessonExercises(useAvailability(dialect), PLAYABLE);
  return (
    <>
      {offered.map(({ id }) => {
        const web = WEB_LESSON_EXERCISES[id];
        if (!web) return null;
        const { Icon } = web;
        return (
          <Link key={id} to={web.href} className="learn-tool learn-tool-link">
            <Icon size={24} />
            <span className="learn-tool-title">{t(web.nameKey)}</span>
            <span className="learn-tool-body">{t(web.bodyKey)}</span>
          </Link>
        );
      })}
    </>
  );
}
