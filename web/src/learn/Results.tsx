import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BURST,
  NO_LESSON_MOMENTS,
  RESULTS_TIMING,
  STREAK_LEAVE_MS,
  celebrationPlan,
  endMoment,
  flameMoment,
  justDone,
  practisableMistakes,
  questRows,
  reactionDelayMs,
  resultsActions,
  resultsGrade,
  resultsOutcome,
  streakMilestone,
  streakReveal,
  toLeagueTier,
  withOpened,
  type DeliveredExercise,
  type LessonMoments,
  type QuestRow,
  type ResultsAction,
  type ResultsGrade,
  type ResultsOutcome,
} from '@kurda/shared';
import { HevaloWindow } from '../characters/HevaloWindow';
import { sayReactionLater } from '../characters/reactions';
import { Button } from '../components/Button';
import { AccuracyIcon, CheckIcon, StarIcon, TimerIcon, UpIcon, XpIcon } from '../components/icons';
import { WaterDrop } from '../tree/TreeArt';
import { CelebrationArt, useCelebrationHold } from '../ranks/Celebration';
import { leagueName } from '../ranks/names';
import { playLessonSound } from '../lib/sounds';
import { prefersReducedMotion, useCelebrationMoment, useCountUp } from '../lib/motion';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { ChestScreen } from '../quests/ChestScreen';
import { QuestList } from '../quests/QuestList';
import { useQuestDay } from '../quests/useQuestDay';
import { ShareWin } from '../share/ShareWin';
import { lessonShare, streakShare } from '../share/winText';
import { ActionBar, BarRow } from './ActionBar';
import { KURDISH_ANSWER } from './FeedbackPanel';
import { kurdishText } from './map';
import { StreakFlame, StreakWeek } from './StreakMoment';
import type { SessionResults } from './types';
import './end.css';

/** A kind word for the first-time accuracy, never a negative one (`resultsGrade`), as the accuracy card's label. */
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

/** Mistakes show open while there are at most this many; more start folded. */
const MISTAKES_OPEN = 3;

/** The lesson after this one in the course, to go straight on to. */
export interface NextLesson {
  lessonId: string;
  title: string;
}

/** The screens after a session, in order: results, the streak kept (flame, then week), today's quests. */
type Stage = 'results' | 'flame' | 'week' | 'quests';

/** Whether a key belongs elsewhere: pressed on a control, typed in a field, or inside a dialog over the page. */
function ownedElsewhere(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.closest?.('button, a, input, textarea, select, summary, [contenteditable], [role="dialog"]');
}

/**
 * The end of a lesson or review: the celebration (ranks/Celebration.tsx), three counting cards (XP, right first time,
 * time) read to screen readers as one sentence, today's goal, league and level, and every mistake with its answer; put
 * off items are left out of the score and counted. Then, a tap at a time, the streak (StreakMoment.tsx) and today's
 * quests. The way on sits in the action bar where Check was, with a quiet Share (share/ShareWin.tsx) beside it on a
 * lesson's results and the streak's big days.
 */
export function Results({
  title,
  lessonName = null,
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
  /** The page's name for screen readers: the lesson's, or "Review". */
  title: string;
  /** The lesson's own name when the page was told it, for sharing. */
  lessonName?: string | null;
  results: SessionResults;
  exercises: DeliveredExercise[];
  /** Exercises put off and never answered this session. */
  skipped?: number;
  kind: 'lesson' | 'practice';
  dialect: string | null | undefined;
  /** What else the lesson did: today's goal, the streak, a new level, the league. */
  moments?: LessonMoments;
  /** The course's next lesson, when there is one. */
  next?: NextLesson | null;
  /** How long this sitting took, from opening the player to its last answer. */
  elapsedMs: number;
  exitTo: string;
  exitLabel: string;
  onNext: (lesson: NextLesson) => void;
  /** Starts a practice session of these exercises. */
  onPractise: (exerciseIds: string[]) => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  const moment = useCelebrationMoment();
  useCelebrationHold(moment.playing);
  // Hevalo cheers once, as the buzz lands (`hapticAtMs`).
  const [cheer, setCheer] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setCheer(true), celebrationPlan(prefersReducedMotion()).hapticAtMs);
    return () => window.clearTimeout(id);
  }, []);
  // Heard as it opens: four notes rising to the octave (lib/sounds.ts), then Hevalo's word once the title has landed.
  useEffect(() => playLessonSound('complete'), []);
  const [perfect] = useState(moments.perfect === true);
  useEffect(() => sayReactionLater(reactionDelayMs('celebration', prefersReducedMotion()), { moment: endMoment(perfect), character: 'hevalo', drawn: true }), [perfect]);

  const mistakes = results.mistakes ?? [];
  const practise = practisableMistakes(mistakes, exercises);
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  // A review mixes courses, so each item's own variety marks its answer.
  const byId = new Map(exercises.map((ex) => [ex.id, ex]));
  const goal = moments.goal ?? null;
  const goalDone = moments.goalMet || (goal !== null && goal.to >= goal.target);
  const league = moments.league ?? null;
  const tier = toLeagueTier(league?.tier);
  const actions = resultsActions({ next: next !== null, practise: practise.length > 0, goalDone });
  const grade = resultsGrade(results.accuracy);
  const outcome = resultsOutcome({ perfect: moments.perfect === true, accuracy: results.accuracy });

  // Today's quests, read while the results are on screen, for the screen after.
  const steps = results.quests ?? [];
  const questDay = useQuestDay(steps.length > 0);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const rows = withOpened(questRows(questDay.day, steps), opened);
  const chests = rows.filter((r) => r.claimable);
  const [chestOpen, setChestOpen] = useState(false);
  // Chests left shut for now; the way on takes the bar instead.
  const [later, setLater] = useState(false);
  // The button that opened the chests goes with the last one, and focus moves to the way on.
  const chestWasOpen = useRef(false);
  useEffect(() => {
    if (chestOpen) chestWasOpen.current = true;
    else if (chestWasOpen.current) {
      chestWasOpen.current = false;
      if (document.activeElement === document.body) document.querySelector<HTMLElement>('.lesson-bar .lesson-bar-go')?.focus({ preventScroll: true });
    }
  }, [chestOpen]);

  // The flame takes the screen only on the day the fire grew; otherwise the streak card is the whole moment.
  const fireGrew = moments.streakKept && flameMoment(results.streak.current).grew !== null;
  const stages: Stage[] = ['results'];
  if (moments.streakKept) stages.push(...(fireGrew ? (['flame', 'week'] as const) : (['week'] as const)));
  if (steps.length > 0) stages.push('quests');
  const [stage, setStage] = useState<Stage>('results');
  const following = stages[stages.indexOf(stage) + 1] ?? null;
  // The streak card: whether everything has arrived, and whether it is leaving.
  const [weekSettled, setWeekSettled] = useState(false);
  const [weekLeaving, setWeekLeaving] = useState(false);
  const leaveTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  /** Takes the way on from the streak card: the card leaves first, then `then`; elsewhere or under reduced motion, at once. */
  const leaving = (then: () => void): void => {
    if (stage !== 'week' || prefersReducedMotion()) {
      then();
      return;
    }
    if (weekLeaving) return;
    setWeekLeaving(true);
    leaveTimer.current = window.setTimeout(() => {
      setWeekLeaving(false);
      then();
    }, STREAK_LEAVE_MS);
  };

  useEffect(() => {
    // Each screen starts at its top; the ones after the results take focus themselves.
    if (stage === 'results') heading.current?.focus({ preventScroll: true });
    else document.scrollingElement?.scrollTo?.({ top: 0 });
  }, [stage]);

  // What Enter and Space do: the bar's current main button.
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

  const act = (action: ResultsAction): void =>
    leaving(() => {
      if (action === 'next' && next) onNext(next);
      else if (action === 'practise') onPractise(practise);
      else navigate(exitTo);
    });
  const label = (action: ResultsAction): string =>
    action === 'next' ? t('lesson.results.next') : action === 'practise' ? t('lesson.results.practise') : t('common.done');
  const share = (xpToday: number): number => (goal && goal.target > 0 ? Math.max(0, Math.min(1, xpToday / goal.target)) : 0);

  // The quiet Share for the screen in front: the lesson on its results, the streak on its big days, otherwise none.
  const shareButton =
    stage === 'results' && kind === 'lesson' ? (
      <ShareWin text={lessonShare(t, lessonName)} />
    ) : stage === 'week' && streakMilestone(results.streak.current) ? (
      <ShareWin text={streakShare(t, locale, results.streak.current)} />
    ) : null;

  let bar: React.ReactNode;
  if (stage === 'flame') {
    // The flame has the whole screen and moves on by itself.
    bar = null;
    primary.current = null;
  } else if (following) {
    const onward = (): void => leaving(() => setStage(following));
    primary.current = onward;
    bar = (
      <BarRow
        start={
          <>
            {stage === 'results' && practise.length > 0 && (
              <Button variant="secondary" onClick={() => onPractise(practise)}>
                {t('lesson.results.practise')}
              </Button>
            )}
            {shareButton}
          </>
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
              {shareButton}
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
          <StreakWeek streak={results.streak} afterFlame={fireGrew} leaving={weekLeaving} onSettled={() => setWeekSettled(true)} />
        ) : stage === 'quests' ? (
          <QuestsStage rows={rows} monthDone={questDay.day?.monthDone ?? null} />
        ) : (
          <section className="lesson-results" aria-labelledby="lesson-results-title">
            {/* A click while it plays skips to the end. */}
            <div
              className={`celebrate celebrate-inline tone-zer ${moment.playing ? 'is-playing' : 'is-done'}`}
              onClick={moment.playing ? moment.skip : undefined}
            >
              <CelebrationArt flecks={BURST.lesson} seed={results.correct * 31 + results.total} reach={150}>
                <HevaloWindow size={230} reaction={cheer ? 'cheer' : null} />
              </CelebrationArt>
              <div className="celebrate-details">
                {/* The page's h1 is the lesson's name; this is the part on screen now. */}
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

            {(goal || moments.goalMet || league || moments.level !== null || results.tree) && (
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
                {results.tree && (
                  <li className="lesson-moment lesson-row is-water">
                    <WaterDrop size={18} />
                    {t('tree.results.water', { count: number(results.tree.gained) })}
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
                    const kurdish = KURDISH_ANSWER.has(ex?.type);
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
      {bar &&
        (stage === 'week' ? (
          // The way on arrives last on the streak card (shared `streakReveal`), but its key works from the first frame.
          <div
            className={`end-bar-late${weekSettled ? ' is-settled' : ''}`}
            style={{ '--onward-at': `${streakReveal(prefersReducedMotion()).onwardAtMs}ms` } as React.CSSProperties}
          >
            <ActionBar>{bar}</ActionBar>
          </div>
        ) : (
          <ActionBar>{bar}</ActionBar>
        ))}
      {/* It keeps the chests it opened with, so opening one does not close it. */}
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

/** The three cards (XP, right first time, time taken), each counting up; hidden from screen readers, which hear one sentence. */
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
  // "80 %", "%80", "٨٠٪": the reader's own way of writing a percentage.
  const pct = (n: number): string => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(n / 100);
  const minutes = Math.floor(seconds / 60);
  return (
    <>
      <div className="end-stats" aria-hidden="true">
        <div className="end-stat is-xp">
          <p className="end-stat-label">{t('lesson.results.totalXp')}</p>
          <p className="end-stat-value">
            <XpIcon size={22} />
            {/* The sign stays before the number on a right-to-left page too. */}
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
 * Today's quests after a session that moved any: each bar filling from where it stood, a just-finished quest lifting and
 * glowing, and the month's count; the title says how many were finished just now.
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
