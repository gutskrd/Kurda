import { useEffect, useRef } from 'react';
import { practisableMistakes, type DeliveredExercise } from '@kurda/shared';
import { Button, LinkButton } from '../components/Button';
import { FlameIcon } from '../components/icons';
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
 * An exercise put off ("Can't listen now") is not a mistake, but the server
 * counts every exercise of the session, so it is not right either: the
 * accuracy is out of all of them. Saying how many were put off keeps "8 of
 * 10" from reading as two wrong answers.
 */
export function Results({
  results,
  exercises,
  skipped = 0,
  kind,
  dialect,
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
  exitTo: string;
  exitLabel: string;
  /** start a practice session of these exercises */
  onPractise: (exerciseIds: string[]) => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  const mistakes = results.mistakes ?? [];
  const practise = practisableMistakes(mistakes, exercises);
  // "80 %", "%80", "٨٠٪": the reader's own way of writing a percentage
  const accuracy = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(results.accuracy);
  const typeOf = new Map(exercises.map((ex) => [ex.id, ex.type]));
  const { lang, dir } = kurdishText(dialect);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section className="lesson-results" aria-labelledby="lesson-results-title">
      {/* the page's h1 is the lesson's name; this is the part of it on screen now */}
      <h2 className="lesson-results-title" id="lesson-results-title" tabIndex={-1} ref={heading}>
        {kind === 'lesson' ? t('lesson.results.lessonDone') : t('lesson.results.reviewDone')}
      </h2>

      <dl className="lesson-stats">
        <div className="lesson-stat">
          <dt>{t('lesson.results.accuracy')}</dt>
          <dd>{accuracy}</dd>
          <dd className="lesson-stat-sub">{t('lesson.results.firstTries', { correct: results.correct, total: results.total })}</dd>
        </div>
        <div className="lesson-stat">
          <dt>{t('lesson.results.xp')}</dt>
          <dd>+{results.xpAwarded}</dd>
        </div>
        <div className="lesson-stat">
          <dt>{t('lesson.results.streak')}</dt>
          <dd>
            <FlameIcon size={20} />
            {results.streak.current}
          </dd>
        </div>
      </dl>
      {skipped > 0 && <p className="lesson-results-note">{t('lesson.results.skipped', { count: skipped })}</p>}

      {mistakes.length === 0 ? (
        <p className="lesson-results-note">{t('lesson.results.noMistakes')}</p>
      ) : (
        <div className="lesson-mistakes">
          <h3 className="lesson-mistakes-title">{t('lesson.results.mistakes')}</h3>
          <ul>
            {mistakes.map((m) => {
              const kurdish = KURDISH_ANSWER.has(typeOf.get(m.exerciseId) ?? '');
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
