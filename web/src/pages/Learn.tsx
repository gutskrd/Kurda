import { Link, useSearchParams } from 'react-router-dom';
import { useApiGet } from '../lib/useApi';
import { LinkButton } from '../components/Button';
import { ErrorState, EmptyState } from '../components/states';
import { CourseGridSkeleton, CourseMapSkeleton } from '../components/skeletons';
import { Skeleton } from '../components/Skeleton';
import { DictionaryIcon, FlameIcon } from '../components/icons';
import { useAuth } from '../auth/AuthProvider';
import { useLocale, useT } from '../i18n/I18nProvider';
import { courseProgress, dialectName } from '../learn/map';
import { CoursePath } from '../learn/CoursePath';
import type { PracticeDue } from '../learn/types';
import type { MeProfile } from '../lib/types';
import { useCourses, type CourseEntry } from '../learn/useCourses';
import { LearnHeader } from '../learn/LearnHeader';
import { QuestsCard } from '../quests/QuestsCard';
import { publishedDictionary } from '../layouts/navLinks';

/** Three letters a beginner meets first: one familiar, one with a mark, one with a hat. */
const ALPHABET_TEASER = 'Aa Çç Êê';

/** GET /me/daily-goal */
interface DailyGoal {
  goal: number;
  effectiveGoal: number;
  earnedXp: number;
  progress: number;
  completed: boolean;
}

/**
 * Review, among the practice tools: what is due now, and the way in. The
 * number is the one a session will find (GET /practice/due counts as a session
 * chooses), so "3 due" never opens a review of five. A review left part-way
 * through is offered first, at its own address, so coming back picks it up
 * rather than starting another beside it.
 *
 * Its button is a secondary one even when words are due: the page has one
 * primary action, the path's own "Start" or "Continue", and two equal white
 * buttons a screen apart ask the learner to choose before they can start.
 */
function ReviewEntry(): React.JSX.Element {
  const t = useT();
  const { data, error, loading } = useApiGet<PracticeDue>('/practice/due');
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

/** Today's goal as a small ring: how much of it is done, drawn round. */
function GoalRing({ share, met }: { share: number; met: boolean }): React.JSX.Element {
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`learn-strip-ring${met ? ' is-met' : ''}`} width="28" height="28" viewBox="-14 -14 28 28" aria-hidden="true" focusable="false">
      <circle className="learn-strip-ring-track" r={r} />
      {share > 0 && <circle className="learn-strip-ring-fill" r={r} strokeDasharray={`${c * Math.min(1, share)} ${c}`} />}
    </svg>
  );
}

/**
 * Today, in one row above the path: the streak, today's goal as a ring with
 * its XP, and what review has waiting, as a chip that opens it.
 *
 * Informational and kind. Nothing here counts down or warns about losing
 * anything — the streak is a number that went up, and a day without one is an
 * invitation to start, not a failure to report. Its shape holds the place
 * until the answers are in, so the path below does not jump when they land,
 * and a part that fails is quietly left out: the path is the page.
 */
function TodayStrip(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const goal = useApiGet<DailyGoal>('/me/daily-goal');
  const me = useApiGet<{ user: MeProfile }>('/me');
  const due = useApiGet<PracticeDue>('/practice/due');
  const g = goal.data;
  const streak = me.data?.user?.streak?.current;
  const number = (n: number): string => n.toLocaleString(locale);
  const waiting = (goal.loading && !g) || (me.loading && !me.data);
  const target = g ? g.effectiveGoal || g.goal : 0;
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
            <p className={`learn-strip-item learn-strip-streak${streak > 0 ? ' is-on' : ''}`}>
              <FlameIcon size={20} weight={streak > 0 ? 'fill' : 'regular'} />
              <span aria-hidden="true">{number(streak)}</span>
              <span className="sr-only">{streak > 0 ? t('learn.today.streak', { count: streak }) : t('learn.today.noStreak')}</span>
            </p>
          )}
          {g && typeof g.earnedXp === 'number' && target > 0 && (
            <p
              className="learn-strip-item learn-strip-goal"
              role="progressbar"
              aria-label={t('learn.today.goalLabel')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.max(0, Math.min(1, g.progress)) * 100)}
              aria-valuetext={g.completed ? t('learn.today.done') : t('learn.today.goal', { xp: number(g.earnedXp), goal: number(target) })}
            >
              <GoalRing share={g.progress} met={g.completed} />
              <span aria-hidden="true">{t('learn.today.goalShort', { xp: number(g.earnedXp), goal: number(target) })}</span>
            </p>
          )}
          {due.data && (due.data.open || due.data.due > 0) && (
            <Link to={reviewHref} className="learn-strip-item learn-strip-chip">
              {t('learn.today.dueChip', { count: number(due.data.due) })}
            </Link>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Practice tools: review, the alphabet and the dictionary, side by side.
 *
 * Tools, not courses — each is something to reach for between lessons — so
 * they share a row rather than each taking a card of the page's full width.
 * The dictionary a visitor gets is the published one, which needs no account.
 */
function Tools({ signedIn }: { signedIn: boolean }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const dictionary = signedIn ? (
    <Link to="/app/dictionary" className="learn-tool learn-tool-link">
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
        {signedIn && <ReviewEntry />}
        {/* before any course, the letters it is written in */}
        <Link to="/app/alphabet" className="learn-tool learn-tool-link ab-start">
          <span className="ab-start-letters" lang="ku" aria-hidden="true">
            {ALPHABET_TEASER}
          </span>
          <span className="learn-tool-title ab-start-title">{t('alphabet.title')}</span>
          <span className="learn-tool-body ab-start-body">{t('alphabet.link')}</span>
        </Link>
        {dictionary}
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

/**
 * What a visitor without an account sees where the courses would be.
 *
 * Asked, in place, rather than bounced: a course keeps your progress, so it
 * needs somebody to keep it for, and that is said plainly beside the way to
 * become somebody. The tools above it and the games one switch away are open.
 */
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

/**
 * Whose path Learn shows: the course asked for (`?course=`), else the one the
 * learner is furthest into, else the first with anything open, else the first.
 */
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
  const picked = entries ? pickCourse(entries, params.get('course')) : null;
  // a lesson opened from here comes back here, on the same course
  const home = picked && entries && entries.length > 1 ? `/app/learn?course=${encodeURIComponent(picked.course.id)}` : '/app/learn';
  return (
    <>
      <TodayStrip />
      <QuestsCard />
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
      {/* the path is Learn's home: the course picked, its lessons one tap away */}
      {picked ? (
        <section className="learn-path" aria-label={picked.course.title}>
          <CoursePath key={picked.course.id} courseId={picked.course.id} showHeader={false} home={home} />
        </section>
      ) : (
        !entries && !error && <CourseMapSkeleton />
      )}
      <Tools signedIn />
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
 * Learn (/app/learn), on its Lessons half: today in one row and today's quests
 * in a slim card under it (quests/QuestsCard.tsx), then the path of
 * the course the learner is in — the lesson path is Learn's home, with Hevalo
 * beside the stop to do now — then the practice tools and every course with
 * how far the learner is through it. The Games half is pages/Games.tsx,
 * behind the same header.
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
          <Tools signedIn={false} />
          <GuestCourses />
        </>
      )}
    </div>
  );
}
