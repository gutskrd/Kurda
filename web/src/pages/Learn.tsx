import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fireLevel, type DailyGoalStatus } from '@kurda/shared';
import { useApiGet, type ApiState } from '../lib/useApi';
import { useGrowsFrom } from '../lib/viewTransition';
import { LinkButton } from '../components/Button';
import { ErrorState, EmptyState } from '../components/states';
import { CourseGridSkeleton, CourseMapSkeleton } from '../components/skeletons';
import { Skeleton } from '../components/Skeleton';
import { Fire } from '../components/Fire';
import { CheckIcon, DictionaryIcon } from '../components/icons';
import { useAuth } from '../auth/AuthProvider';
import { useLocale, useT } from '../i18n/I18nProvider';
import { courseProgress, dialectName } from '../learn/map';
import { CoursePath } from '../learn/CoursePath';
import { ExerciseTools } from '../learn/practiceTools';
import type { PracticeDue } from '../learn/types';
import type { MeProfile, StreakSummary } from '../lib/types';
import { useCourses, type CourseEntry } from '../learn/useCourses';
import { LearnHeader } from '../learn/LearnHeader';
import { StreakSheet } from '../learn/StreakSheet';
import { GoalRing, GoalSheet } from '../learn/GoalSheet';
import { WordOfDayTool } from '../learn/WordOfDayTool';
import { QuestsCard } from '../quests/QuestsCard';
import { EventCard } from '../events/EventCard';
import { TreeCard } from '../tree/TreeCard';
import { BookCard } from '../learn/BookCard';
import { publishedDictionary } from '../layouts/navLinks';

/** Three letters a beginner meets first: a familiar one, one with a cedilla, one with a circumflex. */
const ALPHABET_TEASER = 'Aa Çç Êê';

/**
 * Review among the practice tools: what is due and the way in. The count matches what a session will find
 * (GET /practice/due), and a review left part-way is offered first at its own address. Its button stays secondary, since
 * the path's "Start" or "Continue" is the page's one primary action.
 */
function ReviewEntry({ due }: { due: ApiState<PracticeDue> }): React.JSX.Element {
  const t = useT();
  const { data, error, loading } = due;
  let body: React.ReactNode;
  let action: React.ReactNode = null;
  if (loading && !data) {
    body = <Skeleton line w="60%" />;
  } else if (error || !data) {
    body = t('review.dueFailed');
    action = <LinkButton to="/app/learn/review" variant="secondary" size="sm">{t('review.start')}</LinkButton>;
  } else if (data.open) {
    body = t('review.open');
    action = (
      <LinkButton to={`/app/learn/review/${encodeURIComponent(data.open)}`} variant="secondary" size="sm">
        {t('review.continue')}
      </LinkButton>
    );
  } else if (data.available === 0) {
    body = t('review.none');
  } else if (data.due > 0) {
    body = t('review.due', { count: data.due });
    action = <LinkButton to="/app/learn/review" variant="secondary" size="sm">{t('review.start')}</LinkButton>;
  } else {
    body = t('review.notDue');
    action = <LinkButton to="/app/learn/review" variant="secondary" size="sm">{t('review.practise')}</LinkButton>;
  }
  return (
    <section className="learn-tool learn-review" aria-labelledby="learn-review-title">
      <div className="learn-review-text">
        <h3 className="learn-tool-title" id="learn-review-title">
          {t('review.title')}
        </h3>
        <p className="learn-review-body">{body}</p>
      </div>
      {action}
    </section>
  );
}

/**
 * Today in one row above the path: the streak (opening `StreakSheet`), today's goal as a ring with its XP (opening
 * `GoalSheet` to change it), and review's count as a chip. Nothing counts down or warns. It holds its shape until the
 * answers arrive, and a failed part is left out, since the path is the page.
 */
function TodayStrip({ due }: { due: ApiState<PracticeDue> }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const goal = useApiGet<DailyGoalStatus>('/me/daily-goal');
  const me = useApiGet<{ user: MeProfile }>('/me');
  const [streakOpen, setStreakOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  // A streak restored in the sheet becomes the strip's streak from then on.
  const [restored, setRestored] = useState<StreakSummary | null>(null);
  // Likewise a goal changed in its sheet, as the server answered the change.
  const [changed, setChanged] = useState<DailyGoalStatus | null>(null);
  const g = changed ?? goal.data;
  const summary = restored ?? me.data?.user?.streak;
  const streak = summary?.current;
  const number = (n: number): string => n.toLocaleString(locale);
  const waiting = (goal.loading && !g) || (me.loading && !me.data);
  const target = g ? g.effectiveGoal || g.goal : 0;
  // The goal shows once the server has answered with one; a reply without it leaves the strip without a ring.
  const goalShown = g && typeof g.earnedXp === 'number' && target > 0 ? g : null;
  const reviewHref = due.data?.open ? `/app/learn/review/${encodeURIComponent(due.data.open)}` : '/app/learn/review';
  return (
    <section className={`learn-strip${waiting ? ' skeleton-late' : ''}`} aria-labelledby="learn-today-title">
      <h2 className="sr-only" id="learn-today-title">
        {t('learn.today.title')}
      </h2>
      {waiting ? (
        <>
          <Skeleton w={64} h={28} radius="var(--r-pill)" />
          <Skeleton w={120} h={28} radius="var(--r-pill)" />
        </>
      ) : (
        <>
          {typeof streak === 'number' && (
            <button type="button" className="learn-strip-item learn-strip-streak" aria-haspopup="dialog" onClick={() => setStreakOpen(true)}>
              <Fire size={22} level={fireLevel(streak)} />
              <span aria-hidden="true">{number(streak)}</span>
              <span className="sr-only">{streak > 0 ? t('learn.today.streak', { count: streak }) : t('learn.today.noStreak')}</span>
            </button>
          )}
          {goalShown && (
            <button
              type="button"
              className="learn-strip-item learn-strip-goal"
              aria-haspopup="dialog"
              aria-label={goalShown.completed ? t('learn.today.done') : `${t('learn.today.goalLabel')}, ${t('learn.today.goal', { xp: number(goalShown.earnedXp), goal: number(target) })}`}
              onClick={() => setGoalOpen(true)}
            >
              <GoalRing share={goalShown.progress} met={goalShown.completed} />
              {/* A passed goal shows as done with what was earned, not "130/20 XP". */}
              {goalShown.completed ? (
                <>
                  <span aria-hidden="true">{t('leagues.result.xp', { xp: number(goalShown.earnedXp) })}</span>
                  <CheckIcon size={16} className="learn-strip-done" />
                </>
              ) : (
                <span aria-hidden="true">{t('learn.today.goalShort', { xp: number(goalShown.earnedXp), goal: number(target) })}</span>
              )}
            </button>
          )}
          {due.data && (due.data.open || due.data.due > 0) && (
            <Link to={reviewHref} className="learn-strip-item learn-strip-chip">
              {t('learn.today.dueChip', { count: number(due.data.due) })}
            </Link>
          )}
        </>
      )}
      <StreakSheet streak={streakOpen && summary ? summary : null} onClose={() => setStreakOpen(false)} onRestored={setRestored} />
      {goalShown && <GoalSheet status={goalShown} open={goalOpen} onClose={() => setGoalOpen(false)} onSaved={setChanged} />}
    </section>
  );
}

/**
 * Practice tools in one row: review, the alphabet, the words to know, the dictionary and today's word, then the two
 * lesson exercises where the variety has enough content (learn/practiceTools.tsx). Visitors get the published dictionary
 * but not review, today's word or the exercises, which are the learner's own.
 */
function Tools({ due }: { due: ApiState<PracticeDue> | null }): React.JSX.Element {
  const t = useT();
  // Review is the learner's own, so what is due is only passed for someone signed in.
  const signedIn = due !== null;
  const locale = useLocale();
  // A tool's card grows into its page's head and back (lib/viewTransition.tsx).
  const wordsCard = useGrowsFrom('learn:words', { shape: 'card' });
  const dictionaryCard = useGrowsFrom('learn:dictionary', { shape: 'card' });
  const dictionary = signedIn ? (
    <Link ref={dictionaryCard} to="/app/dictionary" className="learn-tool learn-tool-link">
      <DictionaryIcon size={24} />
      <span className="learn-tool-title">{t('nav.dictionary')}</span>
      <span className="learn-tool-body">{t('learn.tools.dictionary')}</span>
    </Link>
  ) : (
    <a href={publishedDictionary(locale)} className="learn-tool learn-tool-link">
      <DictionaryIcon size={24} />
      <span className="learn-tool-title">{t('nav.dictionary')}</span>
      <span className="learn-tool-body">{t('learn.tools.dictionary')}</span>
    </a>
  );
  return (
    <section className="learn-tools-section" aria-labelledby="learn-tools-title">
      <h2 className="learn-section-title" id="learn-tools-title">
        {t('learn.tools.title')}
      </h2>
      <div className={`learn-tools${signedIn ? '' : ' is-guest'}`}>
        {due && <ReviewEntry due={due} />}
        {/* The letters every course is written in, then the first words: one way in (pages/Words.tsx). */}
        <Link ref={wordsCard} to="/app/learn/words" className="learn-tool learn-tool-link">
          <span className="learn-tool-letters" lang="ku" aria-hidden="true">
            {ALPHABET_TEASER}
          </span>
          <span className="learn-tool-title">{t('words.title')}</span>
          <span className="learn-tool-body">{t('words.toolHint')}</span>
        </Link>
        {dictionary}
        {signedIn && <WordOfDayTool />}
        {signedIn && <ExerciseTools />}
      </div>
    </section>
  );
}

function CourseCard({ entry }: { entry: CourseEntry }): React.JSX.Element {
  const t = useT();
  const { course, map } = entry;
  const mapPath = `/app/learn/course/${encodeURIComponent(course.id)}`;
  const progress = map ? courseProgress(map) : null;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <article className="course-card">
      <span className="lp-chip">{dialectName(course.dialect)}</span>
      <h3 className="course-card-title">
        <Link to={mapPath} className="course-card-link">
          {course.title}
        </Link>
      </h3>
      {progress ? (
        <>
          <div className="course-progress">
            <div
              className="course-progress-bar"
              role="progressbar"
              aria-label={t('learn.progressLabel', { course: course.title })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="course-progress-text">{t('learn.progress', { done: progress.done, total: progress.total })}</span>
          </div>
          {progress.next ? (
            <p className="course-next">
              {t('learn.next')} <strong>{progress.next.title}</strong>
            </p>
          ) : (
            progress.total > 0 && progress.done === progress.total && <p className="course-next">{t('learn.finished')}</p>
          )}
        </>
      ) : (
        <p className="course-next">{t('learn.mapFailed')}</p>
      )}
      <div className="course-card-actions">
        {progress?.next && (
          <LinkButton
            to={`/app/learn/lesson/${progress.next.lessonId}?course=${encodeURIComponent(course.id)}`}
            state={{ title: progress.next.title }}
            variant="secondary"
            size="sm"
          >
            {progress.done === 0 ? t('learn.start') : t('learn.continue')}
          </LinkButton>
        )}
        <LinkButton to={mapPath} variant="ghost" size="sm">
          {t('learn.openMap')}
        </LinkButton>
      </div>
    </article>
  );
}

/** What a visitor sees where the courses would be: asked in place, since a course needs someone to keep progress for. */
function GuestCourses(): React.JSX.Element {
  const t = useT();
  return (
    <section className="learn-guest" aria-labelledby="learn-guest-title">
      <h2 className="learn-guest-title" id="learn-guest-title">
        {t('learn.title')}
      </h2>
      <p className="learn-guest-body">{t('learn.guest.body')}</p>
      <div className="gate-actions">
        <Link to="/register" className="btn btn-primary" state={{ from: '/app/learn' }}>
          {t('auth.login.createAccount')}
        </Link>
        <Link to="/login" className="btn btn-secondary" state={{ from: '/app/learn' }}>
          {t('nav.login')}
        </Link>
      </div>
    </section>
  );
}

/** Whose path Learn shows: the course asked for (`?course=`), else the furthest, else the first with anything open, else the first. */
function pickCourse(entries: CourseEntry[], asked: string | null): CourseEntry | null {
  const chosen = entries.find((e) => e.course.id === asked);
  if (chosen) return chosen;
  const withNext = entries.map((entry) => ({ entry, progress: entry.map ? courseProgress(entry.map) : null })).filter((e) => e.progress?.next);
  return (withNext.find((e) => e.progress!.done > 0) ?? withNext[0])?.entry ?? entries[0] ?? null;
}

function Lessons(): React.JSX.Element {
  const t = useT();
  const [params] = useSearchParams();
  const { entries, error, reload } = useCourses();
  // What review has waiting is fetched once here, for the strip, the path and the review tool.
  const due = useApiGet<PracticeDue>('/practice/due');
  const picked = entries ? pickCourse(entries, params.get('course')) : null;
  // A lesson opened from here returns here, on the same course.
  const home = picked && entries && entries.length > 1 ? `/app/learn?course=${encodeURIComponent(picked.course.id)}` : '/app/learn';
  // The path gets the map and courses this page already holds, so it does not fetch them again.
  const courses = useMemo(() => (entries ?? []).map((e) => e.course), [entries]);
  return (
    <>
      <TodayStrip due={due} />
      <QuestsCard />
      <EventCard />
      <TreeCard />
      <BookCard />
      {entries && entries.length > 1 && (
        <nav className="lp-courses learn-courses-switch" aria-label={t('coursemap.courses')}>
          {entries.map(({ course }) => (
            <Link
              key={course.id}
              to={`/app/learn?course=${encodeURIComponent(course.id)}`}
              replace
              className={`lp-course${course.id === picked?.course.id ? ' is-on' : ''}`}
              aria-current={course.id === picked?.course.id ? 'page' : undefined}
            >
              {course.title}
            </Link>
          ))}
        </nav>
      )}
      {/* The path is Learn's home: the picked course, its lessons a tap away. */}
      {picked ? (
        <section className="learn-path" aria-label={picked.course.title}>
          <CoursePath
            key={picked.course.id}
            courseId={picked.course.id}
            showHeader={false}
            home={home}
            given={{ map: picked.map, courses, due }}
          />
        </section>
      ) : (
        !entries && !error && <CourseMapSkeleton />
      )}
      <Tools due={due} />
      <section aria-labelledby="learn-courses-title">
        <h2 className="learn-section-title" id="learn-courses-title">
          {t('learn.courses.title')}
        </h2>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !entries ? (
          <CourseGridSkeleton />
        ) : entries.length === 0 ? (
          <EmptyState title={t('learn.noCourses')} message={t('learn.noCoursesBody')} />
        ) : (
          <div className="learn-courses">
            {entries.map((entry) => (
              <CourseCard key={entry.course.id} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/**
 * Learn (/app/learn), Lessons half: today's row, the quests card (quests/QuestsCard.tsx) and an event's while one runs
 * (events/EventCard.tsx), the current course's path, the practice tools, and every course with its progress. The Games
 * half is pages/Games.tsx, under the same header.
 */
export function Learn(): React.JSX.Element {
  const { status } = useAuth();
  return (
    <div className="container learn-page">
      <LearnHeader view="lessons" />
      {status === 'signedIn' ? (
        <Lessons />
      ) : status === 'restoring' ? (
        <CourseGridSkeleton />
      ) : (
        <>
          <Tools due={null} />
          <GuestCourses />
        </>
      )}
    </div>
  );
}
