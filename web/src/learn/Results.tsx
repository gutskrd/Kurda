import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BURST,
  NO_LESSON_MOMENTS,
  RESULTS_TIMING,
  celebrationPlan,
  practisableMistakes,
  resultsActions,
  resultsGrade,
  toLeagueTier,
  type DeliveredExercise,
  type LessonMoments,
  type ResultsAction,
  type ResultsGrade,
} from '@kurda/shared';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { Button } from '../components/Button';
import { CheckIcon, FlameIcon, StarIcon, UpIcon } from '../components/icons';
import { CelebrationArt, useCelebrationHold } from '../ranks/Celebration';
import { leagueName } from '../ranks/names';
import { playLessonSound } from '../lib/sounds';
import { prefersReducedMotion, useCelebrationMoment, useCountUp } from '../lib/motion';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { ActionBar, BarRow } from './ActionBar';
import { kurdishText } from './map';
import { StreakDay } from './StreakDay';
import type { SessionResults } from './types';

/** Answers that are Kurdish (a multiple-choice option, the answer to a conversation's question or a set of pairs may be in any language). */
const KURDISH_ANSWER = new Set(['translate', 'writing', 'listening', 'speaking']);

/** A kind word beside "right first time", never a negative one (`resultsGrade`). */
const GRADE: Record<ResultsGrade, MessageKey> = {
  excellent: 'lesson.results.grade.excellent',
  solid: 'lesson.results.grade.solid',
  practice: 'lesson.results.grade.practice',
};

/** The mistakes open at once while they are few; more than this wait folded. */
const MISTAKES_OPEN = 3;

/** The lesson after this one in the course, to go straight on to. */
export interface NextLesson {
  lessonId: string;
  title: string;
}

/**
 * The end of a lesson or a review, on one screen: what changed and what comes
 * next.
 *
 * It opens as the app's one celebration (ranks/Celebration.tsx), with Hevalo
 * cheering as the buzz lands rather than a trophy, then the words, then a row
 * of three tiles — the XP counting up, how many were right first time with a
 * kind word for it, and the days in a row — and today's goal moving from
 * where it stood to where it is now, the week's league place and a new level
 * after them. A click on it skips to the end, and nothing moves on by itself.
 *
 * Every mistake is listed with its question and its right answer — a list of
 * misses without their answers tells the learner what went wrong and not what
 * is right — open while there are few. An exercise put off ("Can't listen
 * now") is neither a mistake nor a right answer: the server leaves it out of
 * the score, so "8 of 8" with two put off is a perfect score of the eight
 * answered, and the results say how many were put off.
 *
 * What to do next is in the action bar, where Check was: the next lesson while
 * today's goal is still to meet; once it is met, "Done" — a good place to stop
 * — with the next lesson beside it for whoever wants to go on; practising the
 * mistakes whenever there are any. When this lesson is what kept the streak
 * today, Continue opens the "Day N" card first (StreakDay.tsx).
 */
export function Results({
  title,
  results,
  exercises,
  skipped = 0,
  kind,
  dialect,
  moments = NO_LESSON_MOMENTS,
  next = null,
  exitTo,
  exitLabel,
  onNext,
  onPractise,
}: {
  /** the page's name for a screen reader: the lesson's, or "Review" */
  title: string;
  results: SessionResults;
  exercises: DeliveredExercise[];
  /** exercises put off and never answered in this session */
  skipped?: number;
  kind: 'lesson' | 'practice';
  dialect: string | null | undefined;
  /** what else the lesson did: today's goal, the streak, a new level, the league */
  moments?: LessonMoments;
  /** the course's next lesson, when there is one */
  next?: NextLesson | null;
  exitTo: string;
  exitLabel: string;
  onNext: (lesson: NextLesson) => void;
  /** start a practice session of these exercises */
  onPractise: (exerciseIds: string[]) => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  const moment = useCelebrationMoment();
  useCelebrationHold(moment.playing);
  const [day, setDay] = useState(false);
  // Hevalo cheers as the buzz lands (`hapticAtMs`), once
  const [cheer, setCheer] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setCheer(true), celebrationPlan(prefersReducedMotion()).hapticAtMs);
    return () => window.clearTimeout(id);
  }, []);
  // heard as it opens: four notes rising to the octave (lib/sounds.ts)
  useEffect(() => playLessonSound('complete'), []);
  // counts up as the numbers arrive, after Hevalo has landed
  const xp = useCountUp(results.xpAwarded, { delayMs: RESULTS_TIMING.xpAtMs });
  const mistakes = results.mistakes ?? [];
  const practise = practisableMistakes(mistakes, exercises);
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  // "80 %", "%80", "٨٠٪": the reader's own way of writing a percentage
  const accuracy = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(results.accuracy);
  // a review mixes courses, so each item's own variety marks its answer
  const byId = new Map(exercises.map((ex) => [ex.id, ex]));
  const goal = moments.goal ?? null;
  const goalDone = moments.goalMet || (goal !== null && goal.to >= goal.target);
  const league = moments.league ?? null;
  const tier = toLeagueTier(league?.tier);
  const actions = resultsActions({ next: next !== null, practise: practise.length > 0, goalDone });

  useEffect(() => {
    if (!day) heading.current?.focus();
  }, [day]);

  const act = (action: ResultsAction): void => {
    if (action === 'next' && next) onNext(next);
    else if (action === 'practise') onPractise(practise);
    else navigate(exitTo);
  };
  const label = (action: ResultsAction): string =>
    action === 'next' ? t('lesson.results.next') : action === 'practise' ? t('lesson.results.practise') : t('common.done');
  const share = (xpToday: number): number => (goal && goal.target > 0 ? Math.max(0, Math.min(1, xpToday / goal.target)) : 0);

  // the bar: with the streak kept today, Continue to its card first
  const bar = moments.streakKept && !day ? (
    <BarRow
      start={
        practise.length > 0 && (
          <Button variant="secondary" onClick={() => onPractise(practise)}>
            {t('lesson.results.practise')}
          </Button>
        )
      }
    >
      <Button size="lg" className="lesson-bar-go" onClick={() => setDay(true)}>
        {t('lesson.continue')}
      </Button>
    </BarRow>
  ) : (
    <>
      {actions.stopHere && <p className="lesson-bar-note">{t('lesson.results.goalDoneStop')}</p>}
      <BarRow
        start={
          <>
            {actions.secondary && (
              <Button variant="secondary" onClick={() => act(actions.secondary!)}>
                {label(actions.secondary)}
              </Button>
            )}
            {actions.backLink && (
              <Link to={exitTo} className="link-btn lesson-results-back">
                {kind === 'lesson' ? t('lesson.results.backToPath') : exitLabel}
              </Link>
            )}
          </>
        }
      >
        <Button size="lg" className="lesson-bar-go" onClick={() => act(actions.primary)}>
          {label(actions.primary)}
        </Button>
      </BarRow>
    </>
  );

  return (
    <>
      <div className="lesson-body">
        <h1 className="sr-only">{title}</h1>
        {day ? (
          <StreakDay streak={results.streak} />
        ) : (
          <section className="lesson-results" aria-labelledby="lesson-results-title">
            {/* a click on it while it plays skips to the end */}
            <div
              className={`celebrate celebrate-inline tone-zer ${moment.playing ? 'is-playing' : 'is-done'}`}
              onClick={moment.playing ? moment.skip : undefined}
            >
              <CelebrationArt flecks={BURST.lesson} seed={results.correct * 31 + results.total} reach={120}>
                <SpeakingCharacter speaker="hevalo" audio={null} crop="half" size={168} decorative reaction={cheer ? 'cheer' : null} />
              </CelebrationArt>
              <div className="celebrate-details">
                {/* the page's h1 is the lesson's name; this is the part of it on screen now */}
                <h2 className="lesson-results-title" id="lesson-results-title" tabIndex={-1} ref={heading}>
                  {moments.perfect ? t('lesson.results.perfect') : kind === 'lesson' ? t('lesson.results.lessonDone') : t('lesson.results.reviewDone')}
                </h2>
              </div>
            </div>

            <dl className="lesson-stats">
              <div className="lesson-stat is-xp">
                <dt>{t('lesson.results.xp')}</dt>
                {/* read out as the number it ends on, not every number on the way */}
                <dd aria-label={`+${results.xpAwarded}`}>
                  <span aria-hidden="true">+{xp}</span>
                </dd>
              </div>
              <div className="lesson-stat is-accuracy">
                <dt>{t('lesson.results.accuracy')}</dt>
                <dd>{accuracy}</dd>
                <dd className="lesson-stat-sub">
                  {t(GRADE[resultsGrade(results.accuracy)])} · {t('lesson.results.firstTries', { correct: results.correct, total: results.total })}
                </dd>
              </div>
              <div className={`lesson-stat is-streak${moments.streakKept ? ' is-kept' : ''}`}>
                <dt>{t('lesson.results.streak')}</dt>
                <dd>
                  <FlameIcon size={20} weight={results.streak.current > 0 ? 'fill' : 'regular'} />
                  {number(results.streak.current)}
                </dd>
              </div>
            </dl>

            {(goal || moments.goalMet || league || moments.level !== null) && (
              <ul className="lesson-moments">
                {goal ? (
                  <li className={`lesson-moment lesson-goal${goalDone ? ' is-goal' : ''}`}>
                    {goalDone && <CheckIcon size={18} />}
                    <span className="lesson-goal-words">
                      {goalDone ? t('learn.today.done') : t('lesson.results.goal', { earned: number(goal.to), goal: number(goal.target) })}
                    </span>
                    <span
                      className="course-progress-bar lesson-goal-bar"
                      role="progressbar"
                      aria-label={t('learn.today.goalLabel')}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(share(goal.to) * 100)}
                    >
                      <span style={{ '--from': share(goal.from), '--to': share(goal.to) } as React.CSSProperties} />
                    </span>
                  </li>
                ) : (
                  moments.goalMet && (
                    <li className="lesson-moment is-goal">
                      <CheckIcon size={18} />
                      {t('learn.today.done')}
                    </li>
                  )
                )}
                {league && tier && (
                  <li className="lesson-moment lesson-row">
                    <span>{t('lesson.results.league', { xp: number(league.gainedXp), rank: number(league.toRank), league: leagueName(t, tier) })}</span>
                    {league.toRank < league.fromRank && (
                      <span className="lesson-league-up">
                        <UpIcon size={14} />
                        {t('lesson.results.leagueUp', { rank: number(league.toRank) })}
                      </span>
                    )}
                  </li>
                )}
                {moments.level !== null && (
                  <li className="lesson-moment lesson-row">
                    <StarIcon size={18} weight="fill" />
                    {t('lesson.results.levelUp', { level: number(moments.level) })}
                  </li>
                )}
              </ul>
            )}
            {skipped > 0 && <p className="lesson-results-note">{t('lesson.results.skipped', { count: skipped })}</p>}

            {mistakes.length === 0 ? (
              <p className="lesson-results-note">{t('lesson.results.noMistakes')}</p>
            ) : (
              <details className="lesson-mistakes" open={mistakes.length <= MISTAKES_OPEN}>
                <summary>
                  <h3 className="lesson-mistakes-title">{t('lesson.results.mistakes')}</h3>
                </summary>
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
              </details>
            )}
          </section>
        )}
      </div>
      <ActionBar>{bar}</ActionBar>
    </>
  );
}
