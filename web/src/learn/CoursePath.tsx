import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PATH_GEOMETRY,
  PATH_MASCOT,
  PATH_RETURN,
  lessonPath,
  lessonXpRange,
  localeDir,
  mascotSpot,
  pathChanges,
  pathSnapshot,
  type PathChanges,
  type PathSnapshot,
  type PathUnit,
  type PlacedStop,
  type SkillStop,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
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
import { GrammarNote } from './GrammarNote';
import { courseProgress, lessonStates } from './map';
import type { CourseMap as Map, CourseSummary, PracticeDue, SkillNode } from './types';
import './path.css';

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

/**
 * How far into the current skill: a ring round it, filling as its lessons are
 * done. Coming back from a lesson it fills from where it was (`moving`): drawn
 * at the share it had, then at the new one, which the stylesheet slides to.
 */
function Ring({ share, moving = false }: { share: number; moving?: boolean }): React.JSX.Element {
  const r = NODE / 2 + 9;
  const c = 2 * Math.PI * r;
  const size = 2 * r + 8;
  const s = Math.max(0, Math.min(1, share));
  return (
    <svg className="lp-ring" width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true" focusable="false">
      <circle className="lp-ring-track" r={r} />
      {/* as a style, not an attribute, so the stylesheet's transition carries it from one share to the next */}
      {(s > 0 || moving) && <circle className={`lp-ring-fill${moving ? ' is-moving' : ''}`} r={r} style={{ strokeDasharray: `${c * s} ${c}` }} />}
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
 * one thing to do next, and what it pays. A locked skill says, kindly, what
 * opens it.
 */
function StopCard({
  stop,
  unit,
  courseId,
  home,
  review,
  titleId,
  onTips,
}: {
  stop: Stop;
  unit: Unit;
  courseId: string;
  /** where a lesson opened from here comes back to */
  home: string | null;
  review: PracticeDue | null;
  titleId: string;
  onTips: (skills: SkillNode[], label: string) => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
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
        ? { to: reviewHref, label: t('coursemap.refreshLink'), again: null }
        : {
            to: lessonHref(stop.launch, courseId),
            label: stop.state === 'done' ? t('coursemap.again') : stop.lessonsDone > 0 ? t('learn.continue') : t('learn.start'),
            // the lesson it opens has been finished before: a replay, which pays less
            again: skill.lessons.find((l) => l.lessonId === stop.launch)?.completed ?? stop.state === 'done',
          };
  // what the lesson the button opens pays, in the server's own numbers (@kurda/shared xp.ts)
  const xp = action && action.again !== null ? lessonXpRange(action.again) : null;
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
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
                  <Link className="lp-part-row" to={lessonHref(lesson.lessonId, courseId)} state={{ title: lesson.title, from: home }}>
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
        <div className="lp-pop-go">
          <LinkButton to={action.to} state={{ title: skill.title, from: home }} block>
            {action.label}
          </LinkButton>
          {xp && (
            <span className="lp-pop-xp">
              {t(action.again ? 'coursemap.xp.again' : 'coursemap.xp.first', { min: number(xp.min), max: number(xp.max) })}
            </span>
          )}
        </div>
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

// ---------- coming back to the path ----------

/*
 * The path as it was last drawn in this tab, per course: what coming back to
 * it after a lesson is compared with, so the lesson's mark on it can be shown
 * happening rather than only having happened (shared `pathChanges`). A tab
 * that has never drawn the course has nothing to compare, and simply draws it.
 */
const snapshotKey = (courseId: string): string => `hevalo:path:${courseId}`;

function readSnapshot(courseId: string): PathSnapshot | null {
  try {
    const raw = sessionStorage.getItem(snapshotKey(courseId));
    const value: unknown = raw ? JSON.parse(raw) : null;
    return value && typeof value === 'object' ? (value as PathSnapshot) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(courseId: string, snapshot: PathSnapshot): void {
  try {
    sessionStorage.setItem(snapshotKey(courseId), JSON.stringify(snapshot));
  } catch {
    // storage blocked: the next visit draws the path as it is, without the moment
  }
}

interface PathReturn {
  changes: PathChanges;
  prev: PathSnapshot;
  /** the stop that was current, where the page opens before it moves on */
  from: string | null;
}

/**
 * Where the return has got to (`PATH_RETURN`), from 0 — drawn as it was, the
 * page settling — through 1 the ring filling, 2 the finished stop popping, 3
 * the opened one opening, to 4 the bubble arriving at the new stop; null once
 * it is over, or when there was nothing to show.
 */
function useReturnStep(ret: PathReturn | null): number | null {
  const [at, setAt] = useState<{ ret: PathReturn | null; step: number | null }>({ ret: null, step: null });
  useEffect(() => {
    if (!ret) return;
    const { settleMs, finishAtMs, openAtMs, bubbleAtMs, bubbleMs, popMs } = PATH_RETURN;
    const marks = [settleMs, settleMs + finishAtMs, settleMs + openAtMs, settleMs + bubbleAtMs];
    const timers = marks.map((ms, i) => window.setTimeout(() => setAt({ ret, step: i + 1 }), ms));
    timers.push(window.setTimeout(() => setAt({ ret, step: null }), settleMs + bubbleAtMs + Math.max(bubbleMs, popMs)));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [ret]);
  if (!ret) return null;
  // until its first moment it is drawn as it was, from the very first frame
  return at.ret === ret ? at.step : 0;
}

/**
 * Hevalo beside the current stop (shared `mascotSpot`): across from it, never
 * on the line. He arrives with the path, greets a tap — which opens the stop's
 * card, as the stop itself would — and cheers when coming back shows a skill
 * finished or opened. The stop's own button is the way in for a keyboard or a
 * screen reader; he is a picture, and is left out of the reading order. Not on
 * the narrowest screens, where he would crowd the path.
 */
function PathMascot({ x, y, cheer, onPress }: { x: number; y: number; cheer: boolean; onPress: () => void }): React.JSX.Element {
  return (
    <li className="lp-mascot" aria-hidden="true" style={{ top: y, '--mx': `${x}px` } as React.CSSProperties}>
      <SpeakingCharacter speaker="hevalo" audio={null} crop="bust" size={PATH_MASCOT.size} decorative reaction={cheer ? 'cheer' : null} onPress={onPress} />
    </li>
  );
}

/**
 * A course's lesson path: on the course's own page (pages/CourseMap.tsx, with
 * its header) and as the home of Learn (pages/Learn.tsx, without).
 *
 * Each unit opens with a banner in its own colour — its name, what it covers,
 * how far through it you are, and its guide when it has grammar notes — and
 * its skills follow as round stops down one gently winding line: done ones
 * filled with a check (a star once strong, arrows round once a refresh would
 * help), the one to do now raised with a ring for its lessons, a "Start" over
 * it and Hevalo beside it, open ones outlined, and the rest grey with a
 * padlock. Review sits beside the current skill when words are due, and a
 * trophy closes every unit. Tapping a stop opens a small card under it: its
 * lessons, how far along it is, one thing to do, and what it pays.
 *
 * Coming back after a lesson, the path shows what the lesson did, on the
 * shared timeline (`PATH_RETURN`): the ring fills from where it was, a skill
 * finished pops and takes its check, the one it opened loses its padlock, and
 * the bubble moves on as the page follows it and Hevalo cheers. Under Reduce
 * Motion the path is simply drawn as it now is.
 *
 * The course page opens scrolled to the current skill, and a button brings it
 * back once it has been scrolled away. Skills open in order, as they do on the
 * phone (the rules are @kurda/shared's `lessonPath`, which the phone uses too).
 */
export function CoursePath({ courseId, showHeader = true, home = null }: { courseId: string; showHeader?: boolean; home?: string | null }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const rtl = localeDir(locale) === 'rtl';
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const { data, error, loading, reload } = useApiGet<Map>(`/courses/${encodeURIComponent(courseId)}/map`);
  const due = useApiGet<PracticeDue>('/practice/due');
  const courses = useApiGet<{ courses: CourseSummary[] }>('/courses');
  const stopLabel = useStopLabel();
  const popId = useId();

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [guide, setGuide] = useState<{ skills: SkillNode[]; label: string } | null>(null);
  const [away, setAway] = useState<'up' | 'down' | null>(null);
  const pathRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  // the review count decides where review sits, so the path waits for it (or its failure) once
  const dueSettled = due.data !== null || due.error !== null;
  const path = useMemo(() => (data && dueSettled ? lessonPath(data, { due: due.data?.due ?? 0 }) : null), [data, dueSettled, due.data]);

  // what changed since the path was last drawn here: read once, as it is first drawn
  const returned = useRef<{ ret: PathReturn | null } | null>(null);
  if (path && !returned.current) {
    const prev = readSnapshot(courseId);
    const changes = reduceMotion ? null : pathChanges(prev, path);
    const from = prev ? (Object.keys(prev).find((key) => prev[key]!.state === 'current') ?? null) : null;
    returned.current = { ret: changes && prev ? { changes, prev, from } : null };
  }
  const ret = returned.current?.ret ?? null;
  const step = useReturnStep(ret);
  const playing = ret !== null && step !== null;
  // and what it is now, for next time
  useEffect(() => {
    if (path) writeSnapshot(courseId, pathSnapshot(path));
  }, [path, courseId]);

  const nodeOf = useCallback((key: string | null): HTMLElement | null => {
    if (!key || !pathRef.current) return null;
    return pathRef.current.querySelector<HTMLElement>(`[data-stop="${key}"]`);
  }, []);

  // opening: the current skill in the middle of the screen — or, coming back, the one that was current,
  // which the page then follows on to the new one. Learn opens at its top, today's row in view, unless
  // the learner is coming back, and "Back to your lesson" is there when the stop is below the screen.
  useLayoutEffect(() => {
    if (!path || scrolled.current) return;
    scrolled.current = true;
    if (!showHeader && !ret) return;
    nodeOf(ret?.from ?? path.focus)?.scrollIntoView?.({ block: 'center', behavior: reduceMotion || ret ? 'auto' : 'smooth' });
  }, [path, nodeOf, reduceMotion, ret, showHeader]);
  useEffect(() => {
    if (step === 4 && path?.focus) nodeOf(path.focus)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [step, path, nodeOf]);

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
      if (target?.closest('.lp-stop.is-open, .lp-mascot')) return;
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
    card?.scrollIntoView?.({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
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
    nodes[next]?.scrollIntoView?.({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const jump = (): void => {
    const el = nodeOf(path?.focus ?? null);
    el?.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    el?.focus({ preventScroll: true });
  };

  if ((loading && !data) || (data && !dueSettled)) {
    return (
      <div className="lp">
        <CourseMapSkeleton />
      </div>
    );
  }
  if (error || !data || !path) {
    return <ErrorState message={error ?? t('common.somethingWentWrong')} onRetry={reload} />;
  }

  const progress = courseProgress(data);
  const list = courses.data?.courses ?? [];
  const current = path.current;

  /** A stop as it is drawn now: during the return, a finished or opened one is drawn as it was until its moment. */
  const shown = (stop: Stop): Stop => {
    if (!playing || stop.kind !== 'skill') return stop;
    const before = ret.prev[stop.key];
    if (!before) return stop;
    if (step! < 2 && ret.changes.finished.includes(stop.key)) return { ...stop, state: before.state, finish: null };
    if (step! < 3 && ret.changes.opened.includes(stop.key)) return { ...stop, state: 'locked', finish: null };
    return stop;
  };
  const cheer = playing && step! >= 4 && (ret.changes.finished.length > 0 || ret.changes.opened.length > 0);

  return (
    <div className="lp">
      {showHeader && (
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
            <LinkButton
              to={lessonHref(progress.next.lessonId, data.course.id)}
              state={{ title: progress.next.title, from: home }}
              className="lp-continue"
            >
              {progress.done === 0 ? t('learn.start') : t('learn.continue')}
            </LinkButton>
          )}
        </div>
      )}

      <div className={`lp-map${playing ? ' is-returning' : ''}`} ref={pathRef} onKeyDown={onPathKey}>
        {path.units.map((unit) => {
          const here = unit.stops.find((p) => p.stop.key === current);
          const spot = here ? mascotSpot(here) : null;
          return (
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
                  {spot && current && <PathMascot x={spot.x} y={spot.y} cheer={cheer} onPress={() => setOpenKey(current)} />}
                  {unit.stops.map(({ stop: real, x, y }) => {
                    const stop = shown(real);
                    const open = openKey === stop.key;
                    const isCurrent = stop.kind === 'skill' && stop.state === 'current';
                    const moving = playing ? ret.changes.ring.find((r) => r.key === stop.key) : undefined;
                    const finishing = playing && step! >= 2 && ret.changes.finished.includes(stop.key);
                    const opening = playing && step! >= 3 && ret.changes.opened.includes(stop.key);
                    // the bubble waits for its moment on the way back, then arrives at the new stop
                    const bubble = isCurrent && (!playing || step! >= 4);
                    return (
                      <li
                        key={stop.key}
                        className={`lp-stop${open ? ' is-open' : ''}`}
                        style={{ top: y - NODE / 2, '--x': `${x}px` } as React.CSSProperties}
                      >
                        {bubble && stop.kind === 'skill' && stop.launch && (
                          <Link
                            className={`lp-callout${playing ? ' is-arriving' : ''}`}
                            to={lessonHref(stop.launch, data.course.id)}
                            state={{ title: stop.skill.title, from: home }}
                            aria-label={`${stop.lessonsDone > 0 ? t('learn.continue') : t('learn.start')}: ${stop.skill.title}`}
                          >
                            {stop.lessonsDone > 0 ? t('learn.continue') : t('learn.start')}
                          </Link>
                        )}
                        <button
                          type="button"
                          className={`lp-node ${stopClass(stop)}${finishing ? ' is-finishing' : ''}${opening ? ' is-opening' : ''}`}
                          data-stop={stop.key}
                          aria-label={stopLabel(stop, unit)}
                          aria-expanded={open}
                          aria-controls={open ? popId : undefined}
                          onClick={() => setOpenKey(open ? null : stop.key)}
                        >
                          {moving && step! < 2 ? (
                            <Ring share={step === 0 ? moving.from : moving.to} moving />
                          ) : (
                            isCurrent && stop.kind === 'skill' && <Ring share={stop.lessonsTotal > 0 ? stop.lessonsDone / stop.lessonsTotal : 0} />
                          )}
                          <span className="lp-node-face">
                            <Glyph stop={stop} />
                          </span>
                        </button>
                        {open && (
                          <div className="lp-pop" id={popId} role="group" aria-labelledby={`${popId}-title`}>
                            <span className="lp-pop-arrow" aria-hidden="true" />
                            <StopCard
                              stop={real}
                              unit={unit}
                              courseId={data.course.id}
                              home={home}
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
          );
        })}
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
