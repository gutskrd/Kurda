import { useEffect, useRef } from 'react';
import { BURST, NO_LESSON_MOMENTS, practisableMistakes, type DeliveredExercise, type LessonMoments } from '@kurda/shared';
import { Button, LinkButton } from '../components/Button';
import { CheckIcon, FlameIcon, StarIcon, TrophyIcon } from '../components/icons';
import { CelebrationArt, useCelebrationHold } from '../ranks/Celebration';
import { useCelebrationMoment, useCountUp } from '../lib/motion';
import { useLocale, useT } from '../i18n/I18nProvider';
import { kurdishText } from './map';
import type { SessionResults } from './types';

/** Answers that are Kurdish (a multiple-choice option or a set of pairs may be in any language). */
const KURDISH_ANSWER = new Set(['translate', 'writing', 'listening', 'speaking']);

/**
 * The end of a lesson or a review: how it went (accuracy on first tries, the
 * XP it earned, the streak), then every mistake with its question and its
 * right answer — a list of misses without their answers tells the learner
 * what went wrong and not what is right — and a way to practise them straight
 * away.
 *
 * An exercise put off ("Can't listen now", "Can't speak now") is neither a
 * mistake nor a right answer: the server leaves it out of the score, so "8 of
 * 8" with two put off is a perfect score of the eight answered. Saying how many
 * were put off keeps a lesson of ten from reading as "8 of 8" with two lost.
 *
 * It opens as the app's one celebration (ranks/Celebration.tsx): the trophy
 * springs in, a ring widens once, a light handful of gold flecks, one buzz on
 * a touch screen — however many things the lesson did at once (finished,
 * today's goal, the streak, a new level), it is one moment — then the numbers
 * fade in and the XP counts up. A click on it skips to the end, and while it
 * plays a badge the lesson earned waits its turn.
 */
export function Results({
  results,
  exercises,
  skipped = 0,
  kind,
  dialect,
  moments = NO_LESSON_MOMENTS,
  exitTo,
  exitLabel,
  onPractise,
}: {
  results: SessionResults;
  exercises: DeliveredExercise[];
  /** exercises put off and never answered in this session */
  skipped?: number;
  kind: 'lesson' | 'practice';
  dialect: string | null | undefined;
  /** what else the lesson did: today's goal, the streak, a new level */
  moments?: LessonMoments;
  exitTo: string;
  exitLabel: string;
  /** start a practice session of these exercises */
  onPractise: (exerciseIds: string[]) => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  const moment = useCelebrationMoment();
  useCelebrationHold(moment.playing);
  // counts up as the numbers arrive, after the trophy has landed
  const xp = useCountUp(results.xpAwarded, { delayMs: 420 });
  const mistakes = results.mistakes ?? [];
  const practise = practisableMistakes(mistakes, exercises);
  // "80 %", "%80", "٨٠٪": the reader's own way of writing a percentage
  const accuracy = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(results.accuracy);
  // a review mixes courses, so each item's own variety marks its answer
  const byId = new Map(exercises.map((ex) => [ex.id, ex]));

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section className="lesson-results" aria-labelledby="lesson-results-title">
      {/* a click on it while it plays skips to the end */}
      <div
        className={`celebrate celebrate-inline tone-zer ${moment.playing ? 'is-playing' : 'is-done'}`}
        onClick={moment.playing ? moment.skip : undefined}
      >
        <CelebrationArt flecks={BURST.lesson} seed={results.correct * 31 + results.total} reach={120}>
          <TrophyIcon size={72} className="lesson-trophy" />
        </CelebrationArt>
        <div className="celebrate-details">
          {/* the page's h1 is the lesson's name; this is the part of it on screen now */}
          <h2 className="lesson-results-title" id="lesson-results-title" tabIndex={-1} ref={heading}>
            {kind === 'lesson' ? t('lesson.results.lessonDone') : t('lesson.results.reviewDone')}
          </h2>
        </div>
      </div>

      <dl className="lesson-stats">
        <div className="lesson-stat">
          <dt>{t('lesson.results.accuracy')}</dt>
          <dd>{accuracy}</dd>
          <dd className="lesson-stat-sub">{t('lesson.results.firstTries', { correct: results.correct, total: results.total })}</dd>
        </div>
        <div className="lesson-stat">
          <dt>{t('lesson.results.xp')}</dt>
          {/* read out as the number it ends on, not every number on the way */}
          <dd aria-label={`+${results.xpAwarded}`}>
            <span aria-hidden="true">+{xp}</span>
          </dd>
        </div>
        <div className={`lesson-stat${moments.streakKept ? ' is-kept' : ''}`}>
          <dt>{t('lesson.results.streak')}</dt>
          <dd>
            <FlameIcon size={20} />
            {results.streak.current}
          </dd>
        </div>
      </dl>
      {(moments.goalMet || moments.level !== null) && (
        <ul className="lesson-moments" aria-live="polite">
          {moments.goalMet && (
            <li className="lesson-moment is-goal">
              <CheckIcon size={18} />
              {t('learn.today.done')}
            </li>
          )}
          {moments.level !== null && (
            <li className="lesson-moment">
              <StarIcon size={18} weight="fill" />
              {t('lesson.results.levelUp', { level: new Intl.NumberFormat(locale).format(moments.level) })}
            </li>
          )}
        </ul>
      )}
      {skipped > 0 && <p className="lesson-results-note">{t('lesson.results.skipped', { count: skipped })}</p>}

      {mistakes.length === 0 ? (
        <p className="lesson-results-note">{t('lesson.results.noMistakes')}</p>
      ) : (
        <div className="lesson-mistakes">
          <h3 className="lesson-mistakes-title">{t('lesson.results.mistakes')}</h3>
          <ul>
            {mistakes.map((m) => {
              const ex = byId.get(m.exerciseId);
              const kurdish = KURDISH_ANSWER.has(ex?.type ?? '');
              const { lang, dir } = kurdishText(ex?.dialect ?? dialect);
              return (
                <li key={m.exerciseId}>
                  {m.prompt && (
                    <span className="lesson-mistake-prompt" dir="auto">
                      {m.prompt}
                    </span>
                  )}
                  {m.correction && (
                    <span className="lesson-mistake-answer">
                      {t('lesson.fb.answer')}{' '}
                      <strong lang={kurdish ? lang : undefined} dir={kurdish ? dir : 'auto'}>
                        {m.correction}
                      </strong>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="lesson-results-actions">
        {practise.length > 0 && <Button onClick={() => onPractise(practise)}>{t('lesson.results.practise')}</Button>}
        <LinkButton to={exitTo} variant={practise.length > 0 ? 'secondary' : 'primary'}>
          {exitLabel}
        </LinkButton>
      </div>
    </section>
  );
}
