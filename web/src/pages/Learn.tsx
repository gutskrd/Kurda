import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fireLevel, type DailyGoalStatus } from '@kurda/shared';
import { useApiGet } from '../lib/useApi';
import { ErrorState, EmptyState } from '../components/states';
import { CourseMapSkeleton } from '../components/skeletons';
import { Skeleton } from '../components/Skeleton';
import { Fire } from '../components/Fire';
import { CheckIcon, DictionaryIcon, TextIcon } from '../components/icons';
import { useAuth } from '../auth/AuthProvider';
import { useLocale, useT } from '../i18n/I18nProvider';
import { useGlass } from '../glass/useGlass';
import { CoursePath } from '../learn/CoursePath';
import type { PracticeDue } from '../learn/types';
import type { MeProfile, StreakSummary } from '../lib/types';
import { useCourses, type CourseEntry } from '../learn/useCourses';
import { courseProgress } from '../learn/map';
import { LearnHeader } from '../learn/LearnHeader';
import { DailySheet } from '../daily/DailySheet';
import { useToday } from '../daily/today';
import { GoalRing, GoalSheet } from '../learn/GoalSheet';
import { publishedDictionary } from '../layouts/navLinks';

/**
 * Today at the head of the road: the streak (opening the daily view) and today's goal as a ring with its XP (opening
 * `GoalSheet` to change it). Nothing counts down or warns. It holds its shape until the answers arrive, and a failed
 * part is left out, since the road is the page.
 */
function TodayStrip(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const goal = useApiGet<DailyGoalStatus>('/me/daily-goal');
  const me = useApiGet<{ user: MeProfile }>('/me');
  const [streakOpen, setStreakOpen] = useState(false);
  const today = useToday(streakOpen);
  const [goalOpen, setGoalOpen] = useState(false);
  // A streak restored in the daily view becomes the strip's streak from then on.
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
        </>
      )}
      <DailySheet open={streakOpen} onClose={() => setStreakOpen(false)} today={today} onStreak={setRestored} />
      {goalShown && <GoalSheet status={goalShown} open={goalOpen} onClose={() => setGoalOpen(false)} onSaved={setChanged} />}
    </section>
  );
}

/**
 * The letters and first words, and the dictionary: two buttons in one pill at the head of the road, under the bell's
 * pill and drawn as it is. A visitor's dictionary is the published one.
 */
function LearnTools(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { status } = useAuth();
  const glass = useGlass<HTMLDivElement>();
  const words = t('words.title');
  const dictionary = t('nav.dictionary');
  return (
    <div ref={glass} className="learn-tools glass">
      <Link to="/app/learn/words" className="learn-tools-btn" aria-label={words} title={words}>
        <TextIcon size={22} />
      </Link>
      {status === 'signedIn' ? (
        <Link to="/app/dictionary" className="learn-tools-btn" aria-label={dictionary} title={dictionary}>
          <DictionaryIcon size={22} />
        </Link>
      ) : (
        <a href={publishedDictionary(locale)} className="learn-tools-btn" aria-label={dictionary} title={dictionary}>
          <DictionaryIcon size={22} />
        </a>
      )}
    </div>
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
  // What review has waiting places its stop on the road.
  const due = useApiGet<PracticeDue>('/practice/due');
  const picked = entries ? pickCourse(entries, params.get('course')) : null;
  // A lesson opened from here returns here, on the same course.
  const home = picked && entries && entries.length > 1 ? `/app/learn?course=${encodeURIComponent(picked.course.id)}` : '/app/learn';
  // The path gets the map and courses this page already holds, so it does not fetch them again.
  const courses = useMemo(() => (entries ?? []).map((e) => e.course), [entries]);
  return (
    <>
      <div className="learn-top">
        <TodayStrip />
        <LearnTools />
      </div>
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
      {/* The road is the page: the picked course, its lessons a tap away. */}
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
      ) : error ? (
        <div className="learn-path">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : entries ? (
        <div className="learn-path">
          <EmptyState title={t('learn.noCourses')} message={t('learn.noCoursesBody')} />
        </div>
      ) : (
        <div className="learn-path">
          <CourseMapSkeleton />
        </div>
      )}
    </>
  );
}

/**
 * Learn (/app/learn), Lessons half: the road and nothing else, with today and the letters and dictionary at its head.
 * Stories and Games are their own halves under the same header.
 */
export function Learn(): React.JSX.Element {
  const { status } = useAuth();
  return (
    <div className="container learn-page">
      <LearnHeader view="lessons" />
      {status === 'signedIn' ? (
        <Lessons />
      ) : status === 'restoring' ? (
        <div className="learn-path">
          <CourseMapSkeleton />
        </div>
      ) : (
        <>
          <div className="learn-top">
            <LearnTools />
          </div>
          <GuestCourses />
        </>
      )}
    </div>
  );
}
