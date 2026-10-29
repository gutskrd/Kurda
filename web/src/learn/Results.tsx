import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BURST,
  NO_LESSON_MOMENTS,
  RESULTS_TIMING,
  celebrationPlan,
  justDone,
  practisableMistakes,
  questRows,
  resultsActions,
  resultsGrade,
  resultsOutcome,
  toLeagueTier,
  withOpened,
  type DeliveredExercise,
  type LessonMoments,
  type QuestRow,
  type ResultsAction,
  type ResultsGrade,
  type ResultsOutcome,
} from '@kurda/shared';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { Button } from '../components/Button';
import { AccuracyIcon, CheckIcon, StarIcon, TimerIcon, UpIcon, XpIcon } from '../components/icons';
import { CelebrationArt, useCelebrationHold } from '../ranks/Celebration';
import { leagueName } from '../ranks/names';
import { playLessonSound } from '../lib/sounds';
import { prefersReducedMotion, useCelebrationMoment, useCountUp } from '../lib/motion';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { ChestScreen } from '../quests/ChestScreen';
import { QuestList } from '../quests/QuestList';
import { useQuestDay } from '../quests/useQuestDay';
import { ActionBar, BarRow } from './ActionBar';
import { kurdishText } from './map';
import { StreakFlame, StreakWeek } from './StreakMoment';
import type { SessionResults } from './types';
import './end.css';

/** Answers that are Kurdish (a multiple-choice option, the answer to a conversation's question or a set of pairs may be in any language). */
const KURDISH_ANSWER = new Set(['translate', 'writing', 'listening', 'speaking']);

/** A kind word for how many were right first time, never a negative one (`resultsGrade`): the accuracy card's label. */
const GRADE: Record<ResultsGrade, MessageKey> = {
  excellent: 'lesson.results.grade.excellent',
  solid: 'lesson.results.grade.solid',
  practice: 'lesson.results.grade.practice',
};

/** The warm line under the title, by how it went. */
const SUBTITLE: Record<ResultsOutcome, MessageKey> = {
  perfect: 'lesson.results.sub.perfect',
  great: 'lesson.results.sub.great',
  done: 'lesson.results.sub.done',
};

/** The mistakes open at once while they are few; more than this wait folded. */
const MISTAKES_OPEN = 3;

/** The lesson after this one in the course, to go straight on to. */
export interface NextLesson {
  lessonId: string;
  title: string;
}

/** The screens after a session, in order: the results, the streak kept (its flame, then its week), today's quests. */
type Stage = 'results' | 'flame' | 'week' | 'quests';

/** Not a key for moving on: one pressed on a control, typed in a field or inside a dialog over the page. */
function ownedElsewhere(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.closest?.('button, a, input, textarea, select, summary, [contenteditable], [role="dialog"]');
}

/**
 * The end of a lesson or a review: what changed, then what comes next.
 *
 * The results open as the app's one celebration (ranks/Celebration.tsx), with
 * Hevalo standing tall and cheering as the buzz lands, a title by how it went
 * — perfect, great, or simply done — and a warm line under it. Three framed
 * cards follow, each with its colour's band holding its label: the XP earned
 * (gold), how many were right first time with a kind word for it (green), and
 * how long this sitting took (blue), each number counting up. Today's goal
 * moves from where it stood to where it is now, the week's league place and a
 * new level after them. A click on the celebration skips to the end, and
 * nothing moves on by itself. A screen reader hears the three in one sentence.
 *
 * Every mistake is listed with its question and its right answer — a list of
 * misses without their answers tells the learner what went wrong and not what
 * is right — open while there are few. An exercise put off ("Can't listen
 * now") is neither a mistake nor a right answer: the server leaves it out of
 * the score, so "8 of 8" with two put off is a perfect score of the eight
 * answered, and the results say how many were put off.
 *
 * Then, one tap at a time: the streak kept today, when this lesson is what
 * kept it (StreakMoment.tsx), and today's quests, when the session moved any
 * — their bars filling as they are watched, and "Open chest" when one is done
 * (quests/). What to do next is in the action bar, where Check was, on the
 * last of these: the next lesson while today's goal is still to meet; once it
 * is met, "Done" — a good place to stop — with the next lesson beside it;
 * practising the mistakes whenever there are any. Enter or Space moves on
 * from anywhere that has no use of its own for them.
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
  elapsedMs,
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
  /** how long this sitting took, from opening the player to its last answer */
  elapsedMs: number;
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
  // Hevalo cheers as the buzz lands (`hapticAtMs`), once
  const [cheer, setCheer] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setCheer(true), celebrationPlan(prefersReducedMotion()).hapticAtMs);
    return () => window.clearTimeout(id);
  }, []);
  // heard as it opens: four notes rising to the octave (lib/sounds.ts)
  useEffect(() => playLessonSound('complete'), []);

  const mistakes = results.mistakes ?? [];
  const practise = practisableMistakes(mistakes, exercises);
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  // a review mixes courses, so each item's own variety marks its answer
  const byId = new Map(exercises.map((ex) => [ex.id, ex]));
  const goal = moments.goal ?? null;
  const goalDone = moments.goalMet || (goal !== null && goal.to >= goal.target);
  const league = moments.league ?? null;
  const tier = toLeagueTier(league?.tier);
  const actions = resultsActions({ next: next !== null, practise: practise.length > 0, goalDone });
  const grade = resultsGrade(results.accuracy);
  const outcome = resultsOutcome({ perfect: moments.perfect === true, accuracy: results.accuracy });

  // today's quests, read in full while the results are looked at, for the screen after them
  const steps = results.quests ?? [];
  const questDay = useQuestDay(steps.length > 0);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const rows = withOpened(questRows(questDay.day, steps), opened);
  const chests = rows.filter((r) => r.claimable);
  const [chestOpen, setChestOpen] = useState(false);
  // chests left shut for now: the way on takes the bar instead
  const [later, setLater] = useState(false);
  // the button that opened the chests goes with the last of them: the way on takes the focus then
  const chestWasOpen = useRef(false);
  useEffect(() => {
    if (chestOpen) chestWasOpen.current = true;
    else if (chestWasOpen.current) {
      chestWasOpen.current = false;
      if (document.activeElement === document.body) document.querySelector<HTMLElement>('.lesson-bar .lesson-bar-go')?.focus({ preventScroll: true });
    }
  }, [chestOpen]);

  const stages: Stage[] = ['results'];
  if (moments.streakKept) stages.push('flame', 'week');
  if (steps.length > 0) stages.push('quests');
  const [stage, setStage] = useState<Stage>('results');
  const following = stages[stages.indexOf(stage) + 1] ?? null;

  useEffect(() => {
    // each screen starts at its top; the one after the results takes the focus itself
    if (stage === 'results') heading.current?.focus({ preventScroll: true });
    else document.scrollingElement?.scrollTo?.({ top: 0 });
  }, [stage]);

  // what Enter and Space do: the bar's main button, whichever it is now
  const primary = useRef<(() => void) | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.key !== 'Enter' && e.key !== ' ') || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) return;
      if (ownedElsewhere(e.target) || !primary.current) return;
      e.preventDefault();
      primary.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const act = (action: ResultsAction): void => {
    if (action === 'next' && next) onNext(next);
    else if (action === 'practise') onPractise(practise);
    else navigate(exitTo);
  };
  const label = (action: ResultsAction): string =>
    action === 'next' ? t('lesson.results.next') : action === 'practise' ? t('lesson.results.practise') : t('common.done');
  const share = (xpToday: number): number => (goal && goal.target > 0 ? Math.max(0, Math.min(1, xpToday / goal.target)) : 0);

  let bar: React.ReactNode;
  if (stage === 'flame') {
    // the flame has the whole screen, and moves on by itself
    bar = null;
    primary.current = null;
  } else if (following) {
    const onward = (): void => setStage(following);
    primary.current = onward;
    bar = (
      <BarRow
        start={
          stage === 'results' &&
          practise.length > 0 && (
            <Button variant="secondary" onClick={() => onPractise(practise)}>
              {t('lesson.results.practise')}
            </Button>
          )
        }
      >
        <Button size="lg" className="lesson-bar-go" onClick={onward}>
          {t('lesson.continue')}
        </Button>
      </BarRow>
    );
  } else if (stage === 'quests' && chests.length > 0 && !later) {
    const openChest = (): void => setChestOpen(true);
    primary.current = openChest;
    bar = (
      <BarRow
        start={
          <button type="button" className="link-btn end-later" onClick={() => setLater(true)}>
            {t('quests.later')}
          </button>
        }
      >
        <Button size="lg" className="lesson-bar-go" onClick={openChest}>
          {t('quests.openChest')}
        </Button>
      </BarRow>
    );
  } else {
    primary.current = () => act(actions.primary);
    bar = (
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
  }

  return (
    <>
      <div className="lesson-body">
        <h1 className="sr-only">{title}</h1>
        {stage === 'flame' ? (
          <StreakFlame streak={results.streak} onDone={() => setStage('week')} />
        ) : stage === 'week' ? (
          <StreakWeek streak={results.streak} />
        ) : stage === 'quests' ? (
          <QuestsStage rows={rows} monthDone={questDay.day?.monthDone ?? null} />
        ) : (
          <section className="lesson-results" aria-labelledby="lesson-results-title">
            {/* a click on it while it plays skips to the end */}
            <div
              className={`celebrate celebrate-inline tone-zer ${moment.playing ? 'is-playing' : 'is-done'}`}
              onClick={moment.playing ? moment.skip : undefined}
            >
              <CelebrationArt flecks={BURST.lesson} seed={results.correct * 31 + results.total} reach={150}>
                <SpeakingCharacter speaker="hevalo" audio={null} crop="full" size={220} decorative reaction={cheer ? 'cheer' : null} />
              </CelebrationArt>
              <div className="celebrate-details">
                {/* the page's h1 is the lesson's name; this is the part of it on screen now */}
                <h2 className="lesson-results-title" id="lesson-results-title" tabIndex={-1} ref={heading}>
                  {outcome === 'perfect'
                    ? t('lesson.results.perfect')
                    : outcome === 'great'
                      ? t('lesson.results.great')
                      : kind === 'lesson'
                        ? t('lesson.results.lessonDone')
                        : t('lesson.results.reviewDone')}
                </h2>
                <p className="lesson-results-sub">{t(SUBTITLE[outcome])}</p>
              </div>
            </div>

            <ResultCards results={results} grade={grade} elapsedMs={elapsedMs} />

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
      {bar && <ActionBar>{bar}</ActionBar>}
      {/* it keeps the chests it opened with, so one opened does not close it */}
      {chestOpen && (
        <ChestScreen
          chests={chests}
          onOpened={(id) => setOpened((s) => new Set(s).add(id))}
          onClose={() => setChestOpen(false)}
          doneLabel={t('lesson.continue')}
        />
      )}
    </>
  );
}

/** "1:52", or "1:02:05" past the hour, in the reader's digits. */
function clock(seconds: number, locale: string): string {
  const two = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 });
  const one = new Intl.NumberFormat(locale);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${one.format(h)}:${two.format(m)}:${two.format(s)}` : `${one.format(m)}:${two.format(s)}`;
}

/**
 * The three cards: XP earned, right first time with its kind word as the
 * label, and the time this sitting took — each a band of its colour holding
 * the label over a framed number that counts up as the words land. Hidden
 * from a screen reader, which hears them in one sentence instead.
 */
function ResultCards({ results, grade, elapsedMs }: { results: SessionResults; grade: ResultsGrade; elapsedMs: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const seconds = Math.max(0, Math.round(elapsedMs / 1000));
  const percent = Math.round(results.accuracy * 100);
  const { xpAtMs, tileStaggerMs } = RESULTS_TIMING;
  const xp = useCountUp(results.xpAwarded, { delayMs: xpAtMs });
  const right = useCountUp(percent, { delayMs: xpAtMs + tileStaggerMs });
  const time = useCountUp(seconds, { delayMs: xpAtMs + 2 * tileStaggerMs });
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  // "80 %", "%80", "٨٠٪": the reader's own way of writing a percentage
  const pct = (n: number): string => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(n / 100);
  const minutes = Math.floor(seconds / 60);
  return (
    <>
      <div className="end-stats" aria-hidden="true">
        <div className="end-stat is-xp">
          <p className="end-stat-label">{t('lesson.results.totalXp')}</p>
          <p className="end-stat-value">
            <XpIcon size={22} />
            {/* the sign before the number in a right-to-left page too */}
            <span dir="ltr">+{number(xp)}</span>
          </p>
        </div>
        <div className="end-stat is-accuracy">
          <p className="end-stat-label">{t(GRADE[grade])}</p>
          <p className="end-stat-value">
            <AccuracyIcon size={22} />
            <span>{pct(right)}</span>
          </p>
        </div>
        <div className="end-stat is-time">
          <p className="end-stat-label">{t('lesson.results.time')}</p>
          <p className="end-stat-value">
            <TimerIcon size={22} weight="bold" />
            <span dir="ltr">{clock(time, locale)}</span>
          </p>
        </div>
      </div>
      <p className="sr-only">
        {t('lesson.results.summary', {
          xp: number(results.xpAwarded),
          accuracy: pct(percent),
          grade: t(GRADE[grade]),
          correct: number(results.correct),
          total: number(results.total),
          time: t('lesson.results.timeSpoken', { min: number(minutes), sec: number(seconds % 60) }),
        })}
      </p>
    </>
  );
}

/**
 * Today's quests after a session that moved any: the three as rows, each bar
 * filling from where it stood before the session, a quest just finished lifting
 * and glowing, and the month's count under them. The title says how many were
 * finished just now.
 */
function QuestsStage({ rows, monthDone }: { rows: QuestRow[]; monthDone: number | null }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  const fresh = rows.filter(justDone).length;
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className="end-quests" aria-labelledby="end-quests-title">
      <h2 className="end-quests-title" id="end-quests-title" tabIndex={-1} ref={heading}>
        {fresh === 0 ? t('quests.title') : fresh === 1 ? t('quests.doneOne') : t('quests.doneMany', { count: new Intl.NumberFormat(locale).format(fresh) })}
      </h2>
      <QuestList rows={rows} moving startMs={RESULTS_TIMING.xpAtMs} />
      {monthDone !== null && <p className="quests-month">{t('quests.month', { count: new Intl.NumberFormat(locale).format(monthDone) })}</p>}
    </section>
  );
}
