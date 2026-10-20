import { Link } from 'react-router-dom';
import { useApiGet } from '../lib/useApi';
import { LinkButton } from '../components/Button';
import { ErrorState, EmptyState } from '../components/states';
import { CourseGridSkeleton } from '../components/skeletons';
import { Skeleton } from '../components/Skeleton';
import { DictionaryIcon, FlameIcon } from '../components/icons';
import { useAuth } from '../auth/AuthProvider';
import { useLocale, useT } from '../i18n/I18nProvider';
import { courseProgress, dialectName, type NextLesson } from '../learn/map';
import type { PracticeDue } from '../learn/types';
import type { MeProfile } from '../lib/types';
import { useCourses, type CourseEntry } from '../learn/useCourses';
import { LearnHeader } from '../learn/LearnHeader';
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
 * primary action, the Continue at the top, and two equal white buttons a
 * screen apart ask the learner to choose before they can start.
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

/**
 * The one next step, before anything else on the page.
 *
 * A learner who opens Learn has usually come to carry on, and a page that
 * offers six equal ways forward makes them choose before they can start.
 * This is the course they are furthest into (or the first one, for somebody
 * new), the lesson up next in it, how far they have come, and one button.
 * Everything else on the page is below it.
 */
function ContinueCard({ entries }: { entries: CourseEntry[] }): React.JSX.Element | null {
  const t = useT();
  const withNext = entries
    .map((entry) => ({ entry, progress: entry.map ? courseProgress(entry.map) : null }))
    .filter((e): e is { entry: CourseEntry; progress: { done: number; total: number; next: NextLesson } } => Boolean(e.progress?.next));
  // a course already begun before one not yet started, in the server's order otherwise
  const pick = withNext.find((e) => e.progress.done > 0) ?? withNext[0];
  if (!pick) return null;
  const { entry, progress } = pick;
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const fresh = progress.done === 0;
  return (
    <section className="learn-hero" aria-labelledby="learn-hero-title">
      <p className="learn-hero-where">
        {entry.course.title} · {progress.next.skillTitle}
      </p>
      <h2 className="learn-hero-title" id="learn-hero-title">
        {progress.next.title}
      </h2>
      <div className="learn-hero-progress">
        <div
          className="course-progress-bar"
          role="progressbar"
          aria-label={t('learn.progressLabel', { course: entry.course.title })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="course-progress-text">{t('learn.progress', { done: progress.done, total: progress.total })}</span>
      </div>
      <LinkButton
        to={`/app/learn/lesson/${progress.next.lessonId}?course=${encodeURIComponent(entry.course.id)}`}
        state={{ title: progress.next.title }}
        size="lg"
        className="learn-hero-go"
      >
        {fresh ? t('learn.startFirst') : t('learn.continue')}
      </LinkButton>
    </section>
  );
}

/**
 * The Continue card's shape while the courses are on their way, so the page
 * under it does not jump down a card's height when it arrives. Built from the
 * card's own classes, so it is the card's height by construction.
 */
function ContinueSkeleton(): React.JSX.Element {
  return (
    <div className="learn-hero" aria-hidden="true">
      <p className="learn-hero-where">
        <Skeleton line w="45%" />
      </p>
      <h2 className="learn-hero-title">
        <Skeleton line w="60%" />
      </h2>
      <div className="learn-hero-progress">
        <div className="course-progress-bar" />
        <span className="course-progress-text">
          <Skeleton line w="35%" />
        </span>
      </div>
      <Skeleton h={52} w={160} radius="var(--r-pill)" className="learn-hero-go" />
    </div>
  );
}

/**
 * Today, said plainly: how much of the day's goal is done and how long the
 * streak is.
 *
 * Informational and kind. Nothing here counts down or warns about losing
 * anything — the streak is a number that went up, and a day without one is
 * an invitation to start, not a failure to report. Its shape holds the place
 * until both answers are in, so the tools below do not jump when they land,
 * and it is quietly absent if they fail: the lessons below are the page.
 */
function Today(): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const goal = useApiGet<DailyGoal>('/me/daily-goal');
  const me = useApiGet<{ user: MeProfile }>('/me');
  const g = goal.data;
  const streak = me.data?.user?.streak?.current;
  if ((goal.loading && !g) || (me.loading && !me.data)) return <TodaySkeleton />;
  if (!g || typeof g.earnedXp !== 'number' || typeof streak !== 'number') return null;
  const target = g.effectiveGoal || g.goal;
  const pct = Math.round(Math.max(0, Math.min(1, g.progress)) * 100);
  return (
    <section className="learn-today" aria-labelledby="learn-today-title">
      <div className="learn-today-goal">
        <h2 className="learn-section-title" id="learn-today-title">
          {t('learn.today.title')}
        </h2>
        <div
          className="course-progress-bar learn-today-bar"
          role="progressbar"
          aria-label={t('learn.today.goalLabel')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <span style={{ width: `${pct}%` }} className={g.completed ? 'is-met' : undefined} />
        </div>
        <p className="learn-today-line">
          {g.completed
            ? t('learn.today.done')
            : t('learn.today.goal', { xp: g.earnedXp.toLocaleString(locale), goal: target.toLocaleString(locale) })}
        </p>
      </div>
      <p className={`learn-today-streak${streak > 0 ? ' is-on' : ''}`}>
        <FlameIcon size={20} weight={streak > 0 ? 'fill' : 'regular'} />
        <span>{streak > 0 ? t('learn.today.streak', { count: streak }) : t('learn.today.noStreak')}</span>
      </p>
    </section>
  );
}

/** Today's shape, from its own classes, while the goal and the streak are fetched. */
function TodaySkeleton(): React.JSX.Element {
  const t = useT();
  return (
    <div className="learn-today" aria-hidden="true">
      <div className="learn-today-goal">
        <h2 className="learn-section-title">{t('learn.today.title')}</h2>
        <div className="course-progress-bar learn-today-bar" />
        <p className="learn-today-line">
          <Skeleton line w="40%" />
        </p>
      </div>
      <p className="learn-today-streak">
        <Skeleton w={20} h={20} circle />
        <Skeleton line w={96} />
      </p>
    </div>
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

function Lessons(): React.JSX.Element {
  const t = useT();
  const { entries, error, reload } = useCourses();
  return (
    <>
      {entries ? <ContinueCard entries={entries} /> : !error && <ContinueSkeleton />}
      <Today />
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
 * Learn (/app/learn), on its Lessons half: the one next step, today, the
 * practice tools, then every course with how far the learner is through it.
 * The Games half is pages/Games.tsx, behind the same header.
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
