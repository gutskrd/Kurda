import { Link } from 'react-router-dom';
import { lessonExercises, type LearnGameId } from '@kurda/shared';
import { HeadphonesIcon, TilesIcon } from '../components/icons';
import { useAvailability, useGameDialect } from '../games/soloRounds';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { useGrowsFrom } from '../lib/viewTransition';

/**
 * The two lesson exercises that used to be games, Build a Sentence and Hear It, Find It: which have a page here, and
 * their cards among Learn's practice tools. They are solo-kit rounds from approved lesson content, offered only in a
 * variety with enough of it (GET /games/availability). Unlike games, a short one is hidden rather than "coming soon",
 * and nothing is drawn until the answer arrives so the row does not gain and then lose a card.
 */

interface WebExercise {
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

/** One exercise's card, its own component because each card names its own journey to its page (lib/viewTransition.tsx). */
function ExerciseTool({ id, web }: { id: LearnGameId; web: WebExercise }): React.JSX.Element {
  const t = useT();
  const card = useGrowsFrom(`learn:${id}`, { shape: 'card' });
  const { Icon } = web;
  return (
    <Link ref={card} to={web.href} className="learn-tool learn-tool-link">
      <Icon size={24} />
      <span className="learn-tool-title">{t(web.nameKey)}</span>
      <span className="learn-tool-body">{t(web.bodyKey)}</span>
    </Link>
  );
}

/** The exercises' cards for the practice tools row; signed-in only, since rounds are made and checked against the learner. */
export function ExerciseTools(): React.JSX.Element {
  const dialect = useGameDialect();
  const offered = lessonExercises(useAvailability(dialect), PLAYABLE);
  return (
    <>
      {offered.map(({ id }) => {
        const web = WEB_LESSON_EXERCISES[id];
        return web ? <ExerciseTool key={id} id={id} web={web} /> : null;
      })}
    </>
  );
}
