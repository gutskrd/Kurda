import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PATH_GEOMETRY, lessonPath, localeDir, type PathUnit, type PlacedStop, type SkillStop } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useApiGet } from '../lib/useApi';
import { useMediaQuery } from '../lib/useMediaQuery';
import { LinkButton } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { ArrowIcon, BookIcon, CheckIcon, LockIcon, RepostIcon, StarIcon, TrophyIcon } from '../components/icons';
import { ErrorState } from '../components/states';
import { CourseMapSkeleton } from '../components/skeletons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { GrammarNote } from '../learn/GrammarNote';
import { courseProgress, lessonStates } from '../learn/map';
import type { CourseMap as Map, CourseSummary, PracticeDue, SkillNode } from '../learn/types';
import '../learn/path.css';

type Stop = PlacedStop<SkillNode>['stop'];
type Unit = PathUnit<SkillNode>;

const { node: NODE, step: STEP } = PATH_GEOMETRY;

/** How a skill stands, in words — said after its name to a screen reader. */
function stateKey(stop: SkillStop<SkillNode>): MessageKey {
  if (stop.state === 'current') return 'coursemap.state.current';
  if (stop.state === 'available') return 'coursemap.state.open';
  if (stop.state === 'locked') return 'coursemap.state.locked';
  return stop.finish === 'strong' ? 'coursemap.state.strong' : stop.finish === 'refresh' ? 'coursemap.state.refresh' : 'coursemap.state.done';
}

const lessonHref = (lessonId: string, courseId: string): string =>
  `/app/learn/lesson/${lessonId}?course=${encodeURIComponent(courseId)}`;

/**
 * The line between two stops: a gentle S from one centre to the next, drawn
 * as round dots. Points are measured from the middle of the path, which is
 * where the line's own drawing sits; a right-to-left page mirrors the whole
 * drawing at once (path.css).
 */
function Trail({ unit }: { unit: Unit }): React.JSX.Element {
  const walked: string[] = [];
  const ahead: string[] = [];
  unit.stops.forEach((p, i) => {
    const before = unit.stops[i - 1];
    if (!before || !p.trail) return;
    const bend = STEP / 2;
    const d = `M ${before.x} ${before.y} C ${before.x} ${before.y + bend}, ${p.x} ${p.y - bend}, ${p.x} ${p.y}`;
    (p.trail === 'walked' ? walked : ahead).push(d);
  });
  return (
    <svg className="lp-trail" width="1" height={unit.height} aria-hidden="true" focusable="false">
      <path className="lp-trail-ahead" d={ahead.join(' ')} />
      <path className="lp-trail-walked" d={walked.join(' ')} />
    </svg>
  );
}

/** How far into the current skill: a ring round it, filling as its lessons are done. */
function Ring({ done, total }: { done: number; total: number }): React.JSX.Element {
  const r = NODE / 2 + 9;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  const size = 2 * r + 8;
  return (
    <svg className="lp-ring" width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true" focusable="false">
      <circle className="lp-ring-track" r={r} />
      {share > 0 && <circle className="lp-ring-fill" r={r} strokeDasharray={`${c * share} ${c}`} />}
    </svg>
  );
}

/** The glyph on a stop: what it is, by shape as well as colour. */
function Glyph({ stop }: { stop: Stop }): React.JSX.Element {
  if (stop.kind === 'review') return <RepostIcon size={30} weight="bold" />;
  if (stop.kind === 'trophy') return <TrophyIcon size={32} weight={stop.earned ? 'fill' : 'regular'} />;
  if (stop.state === 'locked') return <LockIcon size={28} weight="bold" />;
  if (stop.state === 'done') {
    if (stop.finish === 'strong') return <StarIcon size={32} weight="fill" />;
    // still done — the check stays — with a small sign that a review would help
    if (stop.finish === 'refresh') {
      return (
        <>
          <CheckIcon size={32} weight="bold" />
          <span className="lp-node-badge">
            <RepostIcon size={14} weight="bold" />
          </span>
        </>
      );
    }
    return <CheckIcon size={32} weight="bold" />;
  }
  return <span className="lp-node-num">{stop.number}</span>;
}

function stopClass(stop: Stop): string {
  if (stop.kind === 'review') return 'is-review';
  if (stop.kind === 'trophy') return `is-trophy${stop.earned ? ' is-earned' : ''}`;
  return `is-${stop.state}${stop.finish ? ` is-${stop.finish}` : ''}`;
}

/**
 * What the learner reads when they tap a stop: what it is, how far they are,
 * and one thing to do next. A locked skill says, kindly, what opens it.
 */
function StopCard({
  stop,
  unit,
  courseId,
  review,
  titleId,
  onTips,
}: {
  stop: Stop;
  unit: Unit;
  courseId: string;
  review: PracticeDue | null;
  titleId: string;
  onTips: (skills: SkillNode[], label: string) => void;
}): React.JSX.Element {
  const t = useT();
  const reviewHref = review?.open ? `/app/learn/review/${encodeURIComponent(review.open)}` : '/app/learn/review';

  if (stop.kind === 'review') {
    return (
      <>
        <p className="lp-pop-eyebrow">{t('review.title')}</p>
        <h3 className="lp-pop-title" id={titleId}>
          {t('coursemap.review.due', { count: stop.due })}
        </h3>
        <p className="lp-pop-line">{t('coursemap.review.why')}</p>
        <LinkButton to={reviewHref} block>
          {review?.open ? t('review.continue') : t('review.start')}
        </LinkButton>
      </>
    );
  }

  if (stop.kind === 'trophy') {
    return (
      <>
        <p className="lp-pop-eyebrow">{t('coursemap.unit', { n: unit.number })}</p>
        <h3 className="lp-pop-title" id={titleId}>
          {stop.earned ? t('coursemap.trophy.done') : t('coursemap.trophy.title')}
        </h3>
        <p className="lp-pop-line">
          {stop.earned ? t('coursemap.trophy.doneWhy', { unit: unit.title }) : t('coursemap.trophy.how', { unit: unit.title })}
        </p>
        {stop.earned && (
          <LinkButton to={reviewHref} variant="secondary" block>
            {t('review.practise')}
          </LinkButton>
        )}
      </>
    );
  }

  const { skill } = stop;
  const states = lessonStates(skill);
  const share = stop.lessonsTotal > 0 ? Math.round((stop.lessonsDone / stop.lessonsTotal) * 100) : 0;
  const action =
    stop.state === 'locked' || !stop.launch
      ? null
      : stop.finish === 'refresh'
        ? { to: reviewHref, label: t('coursemap.refreshLink') }
        : {
            to: lessonHref(stop.launch, courseId),
            label: stop.state === 'done' ? t('coursemap.again') : stop.lessonsDone > 0 ? t('learn.continue') : t('learn.start'),
          };
  return (
    <>
      <p className="lp-pop-eyebrow">
        {t('coursemap.unit', { n: unit.number })} · {unit.title}
      </p>
      <h3 className="lp-pop-title" id={titleId}>
        {skill.title}
      </h3>
      {/* what it teaches: its lessons, each one a way in once it is open */}
      {skill.lessons.length > 0 && (
        <ol className="lp-parts">
          {skill.lessons.map((lesson, i) => {
            const state = states[i]!;
            const mark = (
              <span className="lp-part-mark" aria-hidden="true">
                {state === 'done' ? <CheckIcon size={14} weight="bold" /> : state === 'locked' ? <LockIcon size={13} /> : i + 1}
              </span>
            );
            const words = (
              <>
                {mark}
                <span className="lp-part-title">{lesson.title}</span>
                <span className="sr-only">, {t(state === 'done' ? 'coursemap.lesson.done' : state === 'next' ? 'coursemap.lesson.next' : 'coursemap.lesson.locked')}</span>
              </>
            );
            return (
              <li key={lesson.lessonId} className={`lp-part is-${state}`}>
                {state === 'locked' ? (
                  <span className="lp-part-row">{words}</span>
                ) : (
                  <Link className="lp-part-row" to={lessonHref(lesson.lessonId, courseId)} state={{ title: lesson.title }}>
                    {words}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {stop.lessonsTotal > 0 && stop.state !== 'locked' && (
        <div className="lp-pop-progress">
          <div className="lp-bar" aria-hidden="true">
            <span style={{ width: `${share}%` }} />
          </div>
          <span>{t('coursemap.progress', { done: stop.lessonsDone, total: stop.lessonsTotal })}</span>
        </div>
      )}
      {stop.state === 'done' && (
        <p className="lp-pop-line">
          {stop.finish === 'refresh' ? t('coursemap.refreshWhy') : t('coursemap.strength', { percent: skill.strength })}
        </p>
      )}
      {stop.state === 'locked' && (
        <p className="lp-pop-line">{stop.after ? t('coursemap.lockedAfter', { title: stop.after.title }) : t('coursemap.state.locked')}</p>
      )}
      {stop.state !== 'locked' && !stop.launch && <p className="lp-pop-line">{t('coursemap.notYet')}</p>}
      {action && (
        <LinkButton to={action.to} state={{ title: skill.title }} block>
          {action.label}
        </LinkButton>
      )}
      {skill.hasGrammar && (
        <button
          type="button"
          className="btn btn-ghost btn-sm lp-pop-tips"
          onClick={() => onTips([skill], t('coursemap.tipsFor', { skill: skill.title }))}
        >
          <BookIcon size={18} />
          {t('coursemap.tips')}
        </button>
      )}
    </>
  );
}

/** The full name a stop's button says, so a screen reader hears what the eye sees. */
function useStopLabel(): (stop: Stop, unit: Unit) => string {
  const t = useT();
  return (stop, unit) => {
    if (stop.kind === 'review') return t('coursemap.review.label', { count: stop.due });
    if (stop.kind === 'trophy') {
      return t('coursemap.trophy.label', { n: unit.number, state: t(stop.earned ? 'coursemap.trophy.earned' : 'coursemap.trophy.ahead') });
    }
    const base = { title: stop.skill.title, state: t(stateKey(stop)) };
    return stop.lessonsTotal > 0
      ? t('coursemap.node.label', { ...base, done: stop.lessonsDone, total: stop.lessonsTotal })
      : t('coursemap.node.labelShort', base);
  };
}

/**
 * A unit's grammar notes — its guide — or one skill's, in a sheet. Each note
 * is fetched the first time the sheet asks for it, so a map with twenty
 * skills does not fetch twenty notes nobody opened.
 */
function GuideSheet({ guide, onClose }: { guide: { skills: SkillNode[]; label: string } | null; onClose: () => void }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [notes, setNotes] = useState<Record<string, { md: string } | { error: string }>>({});

  useEffect(() => {
    if (!guide) return;
    let live = true;
    for (const skill of guide.skills) {
      const have = notes[skill.skillId];
      if (have && 'md' in have) continue;
      void client.get<{ grammarMd: string }>(`/skills/${encodeURIComponent(skill.skillId)}/grammar`).then((res) => {
        if (!live) return;
        setNotes((n) => ({ ...n, [skill.skillId]: res.ok ? { md: res.data.grammarMd } : { error: describeError(res.error, t) } }));
      });
    }
    return () => {
      live = false;
    };
    // a note once fetched is kept (`notes` is read, not watched): only a new guide asks again
  }, [guide, client, t]);

  return (
    <Sheet open={guide !== null} onClose={onClose} label={guide?.label ?? ''} className="lp-guide">
      <h2 className="lp-guide-title">{guide?.label}</h2>
      {guide?.skills.map((skill) => {
        const note = notes[skill.skillId];
        return (
          <section key={skill.skillId} className="lp-guide-skill" aria-label={skill.title}>
            {guide.skills.length > 1 && <h3 className="lp-guide-skill-title">{skill.title}</h3>}
            {!note ? (
              <p className="muted" role="status">
                {t('common.loading')}
              </p>
            ) : 'error' in note ? (
              <p className="msg msg-error">{note.error}</p>
            ) : (
              <GrammarNote source={note.md} headingLevel={guide.skills.length > 1 ? 4 : 3} />
            )}
          </section>
        );
      })}
    </Sheet>
  );
}

/**
 * A course's lesson path (/app/learn/course/:courseId).
 *
 * Each unit opens with a banner in its own colour — its name, what it covers,
 * how far through it you are, and its guide when it has grammar notes — and
 * its skills follow as round stops down one gently winding line: done ones
 * filled with a check (a star once strong, arrows round once a refresh would
 * help), the one to do now raised with a ring for its lessons and a "Start"
 * over it, open ones outlined, and the rest grey with a padlock. Review sits
 * beside the current skill when words are due, and a trophy closes every
 * unit. Tapping a stop opens a small card under it: its lessons, how far
 * along it is, and one thing to do.
 *
 * The page opens scrolled to the current skill, and a button brings it back
 * once it has been scrolled away. Skills open in order, as they do on the
 * phone (the rules are @kurda/shared's `lessonPath`, which the phone uses too).
 */
export function CourseMap(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const rtl = localeDir(locale) === 'rtl';
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const { courseId = '' } = useParams();
  const { data, error, loading, reload } = useApiGet<Map>(`/courses/${encodeURIComponent(courseId)}/map`);
  const due = useApiGet<PracticeDue>('/practice/due');
  const courses = useApiGet<{ courses: CourseSummary[] }>('/courses');
  const stopLabel = useStopLabel();
  const popId = useId();

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [guide, setGuide] = useState<{ skills: SkillNode[]; label: string } | null>(null);
  const [away, setAway] = useState<'up' | 'down' | null>(null);
  const pathRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);

  // the review count decides where review sits, so the path waits for it (or its failure) once
  const dueSettled = due.data !== null || due.error !== null;
  const path = useMemo(() => (data && dueSettled ? lessonPath(data, { due: due.data?.due ?? 0 }) : null), [data, dueSettled, due.data]);

  const nodeOf = useCallback((key: string | null): HTMLElement | null => {
    if (!key || !pathRef.current) return null;
    return pathRef.current.querySelector<HTMLElement>(`[data-stop="${key}"]`);
  }, []);

  // opening the map: the current skill in the middle of the screen, once per course
  useLayoutEffect(() => {
    if (!path || scrolledFor.current === courseId) return;
    scrolledFor.current = courseId;
    nodeOf(path.focus)?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [path, courseId, nodeOf, reduceMotion]);

  // the way back to the current skill, shown only while it is off the screen
  useEffect(() => {
    const el = nodeOf(path?.focus ?? null);
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      setAway(entry.isIntersecting ? null : entry.boundingClientRect.top < 0 ? 'up' : 'down');
    });
    io.observe(el);
    return () => io.disconnect();
  }, [path, nodeOf]);

  // a card closes on Escape (back to its stop) and on a press anywhere else
  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const key = openKey;
      setOpenKey(null);
      nodeOf(key)?.focus();
    };
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Element | null;
      if (target?.closest('.lp-stop.is-open')) return;
      setOpenKey(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [openKey, nodeOf]);

  // an opened card is brought fully into view, if it hangs below the screen
  useEffect(() => {
    if (!openKey) return;
    const card = document.getElementById(popId);
    card?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [openKey, popId, reduceMotion]);

  /** Up and down the path with the arrow keys (across, in reading order), Home and End to its ends. */
  const onPathKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('lp-node') || !pathRef.current) return;
    const nodes = [...pathRef.current.querySelectorAll<HTMLElement>('.lp-node')];
    const at = nodes.indexOf(target);
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === forward) next = Math.min(nodes.length - 1, at + 1);
    else if (e.key === 'ArrowUp' || e.key === back) next = Math.max(0, at - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = nodes.length - 1;
    if (next < 0) return;
    e.preventDefault();
    nodes[next]?.focus();
    nodes[next]?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const jump = (): void => {
    const el = nodeOf(path?.focus ?? null);
    el?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    el?.focus({ preventScroll: true });
  };

  if ((loading && !data) || (data && !dueSettled)) {
    return (
      <div className="container container-narrow lp">
        <CourseMapSkeleton />
      </div>
    );
  }
  if (error || !data || !path) {
    return (
      <div className="container container-narrow">
        <ErrorState message={error ?? t('common.somethingWentWrong')} onRetry={reload} />
      </div>
    );
  }

  const progress = courseProgress(data);
  const list = courses.data?.courses ?? [];

  return (
    <div className="container container-narrow lp">
      <div className="page-header lp-head">
        <Link to="/app/learn" className="eyebrow lp-back">
          {t('coursemap.back')}
        </Link>
        <h1 className="page-title">{data.course.title}</h1>
        <p className="page-sub">{t('coursemap.progress', { done: progress.done, total: progress.total })}</p>
        {list.length > 1 && (
          <nav className="lp-courses" aria-label={t('coursemap.courses')}>
            {list.map((c) => (
              <Link
                key={c.id}
                to={`/app/learn/course/${encodeURIComponent(c.id)}`}
                className={`lp-course${c.id === courseId ? ' is-on' : ''}`}
                aria-current={c.id === courseId ? 'page' : undefined}
              >
                {c.title}
              </Link>
            ))}
          </nav>
        )}
        {progress.next && (
          <LinkButton to={lessonHref(progress.next.lessonId, data.course.id)} state={{ title: progress.next.title }} className="lp-continue">
            {progress.done === 0 ? t('learn.start') : t('learn.continue')}
          </LinkButton>
        )}
      </div>

      <div className="lp-map" ref={pathRef} onKeyDown={onPathKey}>
        {path.units.map((unit) => (
          <section key={unit.unitId} className={`lp-unit lp-tone-${unit.tone}`} aria-labelledby={`lp-unit-${unit.unitId}`}>
            <header className="lp-banner">
              <div className="lp-banner-text">
                <p className="lp-banner-eyebrow">{t('coursemap.unit', { n: unit.number })}</p>
                <h2 className="lp-banner-title" id={`lp-unit-${unit.unitId}`}>
                  {unit.title}
                </h2>
                {unit.topics.length > 0 && <p className="lp-banner-topics">{unit.topics.join(' · ')}</p>}
              </div>
              <div className="lp-banner-side">
                <span className="lp-banner-count">{t('coursemap.unitDone', { done: unit.done, total: unit.total })}</span>
                {unit.guide.length > 0 && (
                  <button
                    type="button"
                    className="lp-unit-guide"
                    onClick={() => setGuide({ skills: unit.guide, label: t('coursemap.guideFor', { unit: unit.title }) })}
                  >
                    <BookIcon size={18} />
                    {t('coursemap.guide')}
                  </button>
                )}
              </div>
            </header>

            {unit.stops.length > 0 && (
              <ol className="lp-path" style={{ height: unit.height }}>
                <Trail unit={unit} />
                {unit.stops.map(({ stop, x, y }) => {
                  const open = openKey === stop.key;
                  const current = stop.kind === 'skill' && stop.state === 'current';
                  return (
                    <li
                      key={stop.key}
                      className={`lp-stop${open ? ' is-open' : ''}`}
                      style={{ top: y - NODE / 2, '--x': `${x}px` } as React.CSSProperties}
                    >
                      {current && stop.kind === 'skill' && stop.launch && (
                        <Link
                          className="lp-callout"
                          to={lessonHref(stop.launch, data.course.id)}
                          state={{ title: stop.skill.title }}
                          aria-label={`${stop.lessonsDone > 0 ? t('learn.continue') : t('learn.start')}: ${stop.skill.title}`}
                        >
                          {stop.lessonsDone > 0 ? t('learn.continue') : t('learn.start')}
                        </Link>
                      )}
                      <button
                        type="button"
                        className={`lp-node ${stopClass(stop)}`}
                        data-stop={stop.key}
                        aria-label={stopLabel(stop, unit)}
                        aria-expanded={open}
                        aria-controls={open ? popId : undefined}
                        onClick={() => setOpenKey(open ? null : stop.key)}
                      >
                        {current && stop.kind === 'skill' && <Ring done={stop.lessonsDone} total={stop.lessonsTotal} />}
                        <span className="lp-node-face">
                          <Glyph stop={stop} />
                        </span>
                      </button>
                      {open && (
                        <div className="lp-pop" id={popId} role="group" aria-labelledby={`${popId}-title`}>
                          <span className="lp-pop-arrow" aria-hidden="true" />
                          <StopCard
                            stop={stop}
                            unit={unit}
                            courseId={data.course.id}
                            review={due.data}
                            titleId={`${popId}-title`}
                            onTips={(skills, label) => {
                              setOpenKey(null);
                              setGuide({ skills, label });
                            }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        ))}
      </div>

      {/* not while a card is open: it would sit over the card's own button */}
      {away && path.focus && !openKey && (
        <button type="button" className="lp-jump" onClick={jump}>
          <span className={`lp-jump-arrow is-${away}`} aria-hidden="true">
            <ArrowIcon size={18} weight="bold" />
          </span>
          {path.current ? t('coursemap.jump') : t('coursemap.jumpEnd')}
        </button>
      )}

      <GuideSheet guide={guide} onClose={() => setGuide(null)} />
    </div>
  );
}
