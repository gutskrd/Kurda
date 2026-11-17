import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PATH_GEOMETRY,
  PATH_RETURN,
  TOPIC_STARS,
  lessonPath,
  lessonXpRange,
  localeDir,
  mascotSpot,
  pathChanges,
  pathLand,
  pathSnapshot,
  type LessonPath as Path,
  type PathChanges,
  type PathSnapshot,
  type PathStopLook,
  type PathUnit,
  type PlacedStop,
  type SkillStop,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { describeError } from '../lib/api';
import { useApiGet, type ApiState } from '../lib/useApi';
import { useMediaQuery } from '../lib/useMediaQuery';
import { LinkButton } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { ArrowIcon, BookIcon, CheckIcon, LockIcon, RepostIcon } from '../components/icons';
import { ErrorState } from '../components/states';
import { CourseMapSkeleton } from '../components/skeletons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { GrammarNote } from './GrammarNote';
import { courseProgress, lessonStates } from './map';
import { RoundStars, StarRow, TopicRing } from './PathRing';
import { SectionCard, UnitDivider, UnitPin, levelWords, useUnitAtTop } from './PathSections';
import { LearnerToken, StopArt, UnitLand, UnitRail, UpcomingUnit, useDarkPage, useUnitsOnScreen, useWidth, type RailSection } from './PathWorld';
import { preloadLesson } from './preloadLesson';
import type { CourseMap as Map, CourseSummary, PracticeDue, SkillNode } from './types';
import './path.css';

type Stop = PlacedStop<SkillNode>['stop'];
type Unit = PathUnit<SkillNode>;

const { node: NODE } = PATH_GEOMETRY;

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
 * The glyph on a stop: what it is, by shape as well as colour. A finished
 * topic's coin carries its stars instead (`RoundStars`; a check only on a map
 * too old to count them), the story and the chest are drawn whole
 * (`StopArt`), and the learner stands on the stop to do now: those carry no
 * glyph.
 */
function Glyph({ stop }: { stop: Stop }): React.JSX.Element | null {
  if (stop.kind === 'review') return <RepostIcon size={28} weight="bold" />;
  if (stop.kind === 'trophy' || stop.kind === 'story') return null;
  if (stop.state === 'current') return null;
  if (stop.state === 'locked') return <LockIcon size={26} weight="bold" />;
  if (stop.state === 'done') {
    const refresh = stop.finish === 'refresh' && (
      // still done, with a small sign that a review would help
      <span className="lp-node-badge">
        <RepostIcon size={14} weight="bold" />
      </span>
    );
    return (
      <>
        {stop.rounds > 0 ? null : <CheckIcon size={32} weight="bold" />}
        {refresh}
      </>
    );
  }
  return <span className="lp-node-num">{stop.number}</span>;
}

function stopClass(stop: Stop): string {
  if (stop.kind === 'review') return 'is-review';
  if (stop.kind === 'trophy') return `is-trophy${stop.earned ? ' is-earned' : ''}`;
  if (stop.kind === 'story') return `is-story${stop.open ? ' is-won' : ' is-closed'}`;
  return `is-${stop.state}${stop.finish ? ` is-${stop.finish}` : ''}`;
}

/**
 * How a stop is drawn (shared `pathStopSvg`): a skill by how it stands — a
 * finished one a gold coin however strong its reviews say it is, since its
 * stars now say how far it has been taken, and faded only when a refresh
 * would help — review as an open stop, a chapter's story as its prize, a
 * scroll rolled and tied on stone until the chapter is done and open on gold
 * from then on, and a unit without a story ending at its chest.
 */
function stopLook(stop: Stop): PathStopLook {
  if (stop.kind === 'review') return 'review';
  if (stop.kind === 'trophy') return stop.earned ? 'chestOpen' : 'chest';
  if (stop.kind === 'story') return stop.open ? 'story' : 'storyLocked';
  if (stop.state === 'done') return stop.finish === 'refresh' ? 'refresh' : 'done';
  return stop.state;
}

/**
 * What the learner reads when they tap a stop: what it is, how far they are,
 * one thing to do next, and what it pays. A locked skill says, kindly, what
 * opens it; a topic with a star says its stars and the round it is in; a
 * chapter's story, its prize, says the chapter is complete and opens it.
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
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);

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

  if (stop.kind === 'story') {
    return (
      <>
        <p className="lp-pop-eyebrow">{t('coursemap.unit', { n: unit.number })}</p>
        {/* the chapter's prize: what the chest at its end said, in gold, as what was won */}
        {stop.open && (
          <p className="lp-pop-won" data-testid="lp-chapter-complete">
            <CheckIcon size={14} weight="bold" />
            {t('coursemap.trophy.done')}
          </p>
        )}
        <h3 className="lp-pop-title" id={titleId}>
          {t('coursemap.story.title')}
        </h3>
        <p className="lp-pop-tale" lang="ku" dir="ltr">
          {stop.title}
        </p>
        <p className="lp-pop-line">{stop.open ? t('coursemap.story.open') : t('coursemap.story.shut')}</p>
        {!stop.open && <p className="lp-pop-line">{t('coursemap.unitDone', { done: number(unit.done), total: number(unit.total) })}</p>}
        {stop.open && (
          <div className="lp-pop-go">
            <LinkButton to={`/app/learn/stories/${encodeURIComponent(stop.slug)}`} block>
              {t('coursemap.story.read')}
            </LinkButton>
            <LinkButton to={reviewHref} variant="secondary" block>
              {t('review.practise')}
            </LinkButton>
          </div>
        )}
      </>
    );
  }

  const { skill } = stop;
  const states = lessonStates(skill);
  // the round being played: its lessons finished, and once a topic has a star, those of its next round
  const share = stop.lessonsTotal > 0 ? Math.round(((stop.rounds > 0 ? stop.pieces : stop.lessonsDone) / stop.lessonsTotal) * 100) : 0;
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
          {stop.rounds > 0 && <StarRow rounds={stop.rounds} />}
          {stop.rounds < TOPIC_STARS && (
            <div className="lp-bar" aria-hidden="true">
              <span style={{ width: `${share}%` }} />
            </div>
          )}
          <span>
            {stop.rounds >= TOPIC_STARS
              ? t('coursemap.roundsDone', { last: TOPIC_STARS })
              : stop.rounds > 0
                ? t('coursemap.round', { round: stop.rounds + 1, last: TOPIC_STARS, done: stop.pieces, total: stop.lessonsTotal })
                : t('coursemap.progress', { done: stop.lessonsDone, total: stop.lessonsTotal })}
          </span>
        </div>
      )}
      {stop.state === 'done' && stop.rounds > 0 && <p className="lp-pop-line">{t(stop.rounds >= TOPIC_STARS ? 'coursemap.roundsAll' : 'coursemap.roundsWhy')}</p>}
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

/**
 * The full name a stop's button says, so a screen reader hears what the eye
 * sees: once a topic has a star, the round it is in ("Greetings, Done, round
 * 2 of 3, 3 of 4 lessons"), or that all three are done.
 */
function useStopLabel(): (stop: Stop, unit: Unit) => string {
  const t = useT();
  return (stop, unit) => {
    if (stop.kind === 'review') return t('coursemap.review.label', { count: stop.due });
    if (stop.kind === 'trophy') {
      return t('coursemap.trophy.label', { n: unit.number, state: t(stop.earned ? 'coursemap.trophy.earned' : 'coursemap.trophy.ahead') });
    }
    if (stop.kind === 'story') return t(stop.open ? 'coursemap.story.label' : 'coursemap.story.labelShut', { title: stop.title });
    const base = { title: stop.skill.title, state: t(stateKey(stop)) };
    if (stop.lessonsTotal === 0) return t('coursemap.node.labelShort', base);
    if (stop.rounds >= TOPIC_STARS) return t('coursemap.node.labelRounds', { ...base, last: TOPIC_STARS });
    if (stop.rounds > 0) return t('coursemap.node.labelRound', { ...base, round: stop.rounds + 1, last: TOPIC_STARS, done: stop.pieces, total: stop.lessonsTotal });
    return t('coursemap.node.label', { ...base, done: stop.lessonsDone, total: stop.lessonsTotal });
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

const NO_STOPS: ReadonlySet<string> = new Set();

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
 * The moments of a return (`PATH_RETURN`, counted from when the path is
 * drawn, as the phone counts them): the ring's new pieces fill, a finished
 * stop pops and turns gold, a star earned drops in, an opened stop loses its
 * lock, a ring made whole starts its next round, and the bubble moves on.
 */
const STEP = { fill: 1, finish: 2, star: 3, open: 4, next: 5, bubble: 6 } as const;

/**
 * Where the return has got to (`STEP`), from 0 — drawn as it was, the page
 * settling — to `STEP.bubble`; null once it is over, or when there was
 * nothing to show.
 */
function useReturnStep(ret: PathReturn | null): number | null {
  const [at, setAt] = useState<{ ret: PathReturn | null; step: number | null }>({ ret: null, step: null });
  useEffect(() => {
    if (!ret) return;
    const { settleMs, finishAtMs, starAtMs, starMs, openAtMs, bubbleAtMs, bubbleMs, popMs } = PATH_RETURN;
    const marks = [settleMs, finishAtMs, starAtMs, openAtMs, starAtMs + starMs, bubbleAtMs];
    // in order, each a moment later than the one before
    const timers = marks.map((ms, i) => window.setTimeout(() => setAt({ ret, step: i + 1 }), ms));
    timers.push(window.setTimeout(() => setAt({ ret, step: null }), bubbleAtMs + Math.max(bubbleMs, popMs, 400)));
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
function PathMascot({ x, y, flip, cheer, onPress }: { x: number; y: number; flip: boolean; cheer: boolean; onPress: () => void }): React.JSX.Element {
  return (
    <li className="lp-mascot" aria-hidden="true" style={{ top: y, '--mx': `${x}px` } as React.CSSProperties}>
      <SpeakingCharacter speaker="hevalo" audio={null} crop="full" size={MASCOT_SIZE} decorative mirrored={flip} reaction={cheer ? 'cheer' : null} onPress={onPress} />
    </li>
  );
}

/** Hevalo drawn whole beside the path, at the scale of the valley's trees and houses rather than towering over them. */
const MASCOT_SIZE = 104;

/** The units whose stops have risen into place already, by course, while the tab is open: each rises once. */
const RISEN = new Set<string>();

/** The section a stop is in, from 0; null for no stop. */
function sectionOf(path: Path<SkillNode>, key: string | null): number | null {
  if (!key) return null;
  const at = path.sections.findIndex((s) => s.units.some((u) => u.stops.some((p) => p.stop.key === key)));
  return at >= 0 ? at : null;
}

/**
 * A course's lesson path: on the course's own page (pages/CourseMap.tsx, with
 * its header) and as the home of Learn (pages/Learn.tsx, without).
 *
 * The course is shown a section at a time (shared `lessonPath`'s `sections`,
 * its units grouped by their level in the course plan): the section the
 * learner is in is open, a section before it is one card that opens it again,
 * and a later one is a card that says what it is — its number, its level by
 * the app's own name for it, how many chapters — shut. A course without
 * levels is one section, and shows no cards.
 *
 * Over the open section a heading in the colour of the unit at the top of
 * the window, pinned under the bar as the page scrolls — "Section 1 ·
 * Chapter 2" over the unit's name, with its guide (the grammar notes) as a
 * book on the far side — and between two units a quiet divider with the next
 * one's name. Each unit's stops go down the road through its land: its four
 * topics, each in a ring of a piece for each lesson, a gold coin with a star
 * for each round once finished (one to three), the one to do now raised in
 * the unit's colour with a "Start" over it and Hevalo beside it, open ones
 * cream, and the rest field stone with a padlock; review beside the current
 * topic when words are due; and the story that closes the chapter, its prize
 * (a unit without one ends at its chest). Tapping a stop opens a small card
 * under it: its lessons, how far along it is, one thing to do, and what it
 * pays.
 *
 * Coming back after a lesson, the path shows what the lesson did, on the
 * shared timeline (`PATH_RETURN`): the ring's piece fills, a topic finished
 * pops as it turns gold and its star drops in, a round made whole earns its
 * star, the topic it opened loses its padlock, and the bubble moves on as the
 * page follows it and Hevalo cheers. Under Reduce Motion the path is simply
 * drawn as it now is.
 *
 * The course page opens scrolled to the current skill, and a button brings it
 * back once it has been scrolled away. Skills open in order, as they do on the
 * phone (the rules are @kurda/shared's `lessonPath`, which the phone uses too).
 */
export function CoursePath({
  courseId,
  showHeader = true,
  home = null,
  given,
}: {
  courseId: string;
  showHeader?: boolean;
  home?: string | null;
  /**
   * What whoever draws the path already holds (Learn has the courses, their
   * maps and what review has waiting): the path takes it and asks for none of
   * it again. A map that could not be loaded there (`null`) is asked for here,
   * so the path has its own way to say so and to try again.
   */
  given?: { map: Map | null; courses: CourseSummary[]; due: ApiState<PracticeDue> };
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const rtl = localeDir(locale) === 'rtl';
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const ownMap = useApiGet<Map>(given?.map ? null : `/courses/${encodeURIComponent(courseId)}/map`);
  const data = given?.map ?? ownMap.data;
  const { error, loading, reload } = ownMap;
  const ownDue = useApiGet<PracticeDue>(given ? null : '/practice/due');
  const due = given?.due ?? ownDue;
  const ownCourses = useApiGet<{ courses: CourseSummary[] }>(given ? null : '/courses');
  const courses = given ? { data: { courses: given.courses } } : ownCourses;
  const stopLabel = useStopLabel();
  const popId = useId();
  const dark = useDarkPage();
  const [railOpen, setRailOpen] = useState(false);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [guide, setGuide] = useState<{ skills: SkillNode[]; label: string } | null>(null);
  const [away, setAway] = useState<'up' | 'down' | null>(null);
  const pathRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  // the review count decides where review sits, so the path waits for it (or its failure) once
  const dueSettled = due.data !== null || due.error !== null;
  const path = useMemo(() => (data && dueSettled ? lessonPath(data, { due: due.data?.due ?? 0 }) : null), [data, dueSettled, due.data]);
  const width = useWidth(pathRef, path !== null);

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

  /*
   * The section open: the one picked from its card, else, coming back from a
   * lesson, the one it was played in (a lesson played again in a section
   * finished long ago is seen filling its ring there), and once the path has
   * moved on, or with nothing to show, the one the stop to open on is in —
   * during a return, the one the learner was in until the bubble moves on, so
   * a lesson that finishes a section is seen finishing it. A pick lasts until
   * the learner moves into another section.
   */
  const [picked, setPicked] = useState<number | null>(null);
  const [pickedFor, setPickedFor] = useState<number | null>(path?.section ?? null);
  if (path && pickedFor !== path.section) {
    setPickedFor(path.section);
    setPicked(null);
  }
  const was = playing ? ret.from : null;
  const focusKey = playing && step! < STEP.bubble && was ? was : (path?.focus ?? null);
  const movedOn = ret !== null && ret.changes.current !== null && (!playing || step! >= STEP.bubble);
  const playedIn = path && ret && !movedOn ? sectionOf(path, ret.changes.ring[0]?.key ?? ret.changes.finished[0] ?? null) : null;
  const open = path ? Math.min(path.sections.length - 1, picked ?? playedIn ?? sectionOf(path, focusKey) ?? path.section) : 0;
  const shown = path?.sections[open] ?? null;
  const named = (path?.sections.length ?? 0) > 1;
  const openUnits = useMemo(() => shown?.units ?? [], [shown]);
  const screen = useUnitsOnScreen(pathRef, openUnits);
  const atTop = useUnitAtTop(pathRef, openUnits);

  // each unit rises the first time it can be seen, and only then; units not seen yet wait under the ground
  const [risen, setRisen] = useState<ReadonlySet<string>>(() => new Set(RISEN));
  // those that rose on an earlier visit are simply there: only a rise seen now plays
  const [risenBefore] = useState<ReadonlySet<string>>(() => new Set(RISEN));
  useEffect(() => {
    if (!screen.seen || reduceMotion) return;
    let more = false;
    for (const id of screen.seen) {
      const mark = `${courseId}:${id}`;
      if (!RISEN.has(mark)) {
        RISEN.add(mark);
        more = true;
      }
    }
    if (more) setRisen(new Set(RISEN));
  }, [screen.seen, reduceMotion, courseId]);

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
    if (step === STEP.bubble && path?.focus) nodeOf(path.focus)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [step, path, nodeOf]);

  // the way back to the current skill, shown only while it is off the screen (and in the section open)
  useEffect(() => {
    const el = nodeOf(path?.focus ?? null);
    if (!el || typeof IntersectionObserver === 'undefined') {
      setAway(null);
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      setAway(entry.isIntersecting ? null : entry.boundingClientRect.top < 0 ? 'up' : 'down');
    });
    io.observe(el);
    return () => io.disconnect();
  }, [path, nodeOf, open]);

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

  // an opened card is one press from a lesson: its code is asked for now, so that press does not wait for it
  useEffect(() => {
    if (openKey) preloadLesson();
  }, [openKey]);

  // an opened card is brought fully into view, if it hangs below the screen
  useEffect(() => {
    if (!openKey) return;
    const card = document.getElementById(popId);
    card?.scrollIntoView?.({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [openKey, popId, reduceMotion]);

  // a unit picked on the rail: its section opens, and once it is drawn the page goes to it
  const [goTo, setGoTo] = useState<string | null>(null);
  useEffect(() => {
    if (!goTo || !pathRef.current) return;
    const target = pathRef.current.querySelector<HTMLElement>(`[data-unit="${goTo}"]`) ?? pathRef.current.querySelector<HTMLElement>(`[data-holds~="${goTo}"]`);
    if (!target) return;
    setGoTo(null);
    target.scrollIntoView?.({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    target.querySelector<HTMLElement>('.lp-node, .lp-scard')?.focus({ preventScroll: true });
  }, [goTo, open, reduceMotion]);

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
  if (error || !data || !path || !shown) {
    return <ErrorState message={error ?? t('common.somethingWentWrong')} onRetry={reload} />;
  }

  const progress = courseProgress(data);
  const list = courses.data?.courses ?? [];
  const current = path.current;
  // the learner stands on the skill to do now — on the one before it until the return has moved on — and hops across
  const tokenAt = current ? (playing && step! < STEP.bubble && was ? was : current) : null;
  const hopping = playing && step! >= STEP.bubble && was !== null && current !== null && was !== current;
  const placedOf = (key: string | null): { unitId: string; x: number; y: number } | null => {
    for (const u of path.units) {
      const p = u.stops.find((s) => s.stop.key === key);
      if (p) return { unitId: u.unitId, x: p.x, y: p.y };
    }
    return null;
  };
  const tokenPlace = placedOf(tokenAt);
  const fromPlace = hopping ? placedOf(was) : null;
  const sign = rtl ? -1 : 1;
  const hop =
    hopping && tokenPlace
      ? fromPlace && fromPlace.unitId === tokenPlace.unitId
        ? { dx: sign * (fromPlace.x - tokenPlace.x), dy: fromPlace.y - tokenPlace.y }
        : { dx: 0, dy: -2 * PATH_GEOMETRY.step }
      : null;
  // the stretch of trail walked since the lesson fills in as the path moves on
  const fresh: ReadonlySet<string> = playing && step! < STEP.bubble && ret.changes.current && was ? new Set([ret.changes.current]) : NO_STOPS;
  const unitOfCurrent = placedOf(current)?.unitId ?? null;
  const rail: RailSection[] = path.sections.map((s) => ({
    number: named ? s.number : null,
    level: levelWords(s.level)?.name ?? null,
    units: s.units.map((u) => ({ unitId: u.unitId, number: u.number, title: u.title, tone: u.tone, done: u.done, total: u.total, here: u.unitId === unitOfCurrent })),
  }));
  const toUnit = (unitId: string): void => {
    setRailOpen(false);
    const at = path.sections.findIndex((s) => s.units.some((u) => u.unitId === unitId));
    if (at >= 0 && at !== open && path.sections[at]!.state !== 'locked') setPicked(at);
    setGoTo(unitId);
  };

  /** A stop as it is drawn now: during the return, a finished or opened one is drawn as it was until its moment. */
  const drawnAs = (stop: Stop): Stop => {
    if (!playing || stop.kind !== 'skill') return stop;
    const before = ret.prev[stop.key];
    if (!before) return stop;
    if (step! < STEP.finish && ret.changes.finished.includes(stop.key)) return { ...stop, state: before.state, finish: null };
    if (step! < STEP.open && ret.changes.opened.includes(stop.key)) return { ...stop, state: 'locked', finish: null };
    return stop;
  };
  /** A topic's ring and stars as they are drawn at this moment of a return, and as they now are otherwise. */
  const ringNow = (stop: SkillStop<SkillNode>): { filled: number; whole: boolean; from?: number; stars: number; earned: boolean } => {
    const of = stop.lessonsTotal;
    const now = { filled: stop.rounds >= TOPIC_STARS ? of : stop.pieces, whole: stop.rounds >= TOPIC_STARS, stars: stop.rounds, earned: false };
    const change = playing ? ret.changes.ring.find((r) => r.key === stop.key) : undefined;
    if (!change) return now;
    const before = change.from.rounds >= TOPIC_STARS ? of : change.from.pieces;
    const roundDone = change.to.rounds > change.from.rounds;
    if (step! < STEP.fill) return { filled: before, whole: false, stars: change.from.rounds, earned: false };
    if (!roundDone) return { ...now, from: before };
    // the round made whole: full, gold as the stop turns, its star dropping in, then the next round as it is
    if (step! < STEP.next) return { filled: of, whole: step! >= STEP.finish, from: before, stars: step! >= STEP.star ? change.to.rounds : change.from.rounds, earned: step! >= STEP.star };
    return { ...now, earned: true };
  };
  const cheer = playing && step! >= STEP.bubble && (ret.changes.finished.length > 0 || ret.changes.opened.length > 0);
  // the unit named in the pinned heading: the one at the top of the window, in the section open
  const pinUnit = openUnits.find((u) => u.unitId === atTop) ?? openUnits[0]!;

  return (
    <div className="lp">
      {showHeader && (
        <div className="page-header lp-head">
          {/* the way back, as every page draws it: the chevron that points back in the page's own direction, then the words */}
          <Link to="/app/learn" className="back-link">
            <ArrowIcon size={16} />
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

      <div className="lp-world">
        <UnitRail sections={rail} onPick={toUnit} />
        <div className={`lp-map${playing ? ' is-returning' : ''}`} ref={pathRef} onKeyDown={onPathKey}>
          {path.sections.map((section, s) =>
            s !== open ? (
              <div key={section.key} className="lp-fold" data-holds={section.units.map((u) => u.unitId).join(' ')}>
                <SectionCard section={section} here={s === path.section} onOpen={() => setPicked(s)} />
              </div>
            ) : (
              <div key={section.key} className="lp-open-section" data-testid="lp-section-open">
                <UnitPin
                  unit={pinUnit}
                  section={named ? pinUnit.section : null}
                  onGuide={pinUnit.guide.length > 0 ? () => setGuide({ skills: pinUnit.guide, label: t('coursemap.guideFor', { unit: pinUnit.title }) }) : undefined}
                  onRail={() => setRailOpen(true)}
                />
                {section.units.map((unit, index) => {
                  const land = pathLand(unit.number - 1);
                  const near = !screen.near || screen.near.has(unit.unitId);
                  const seen = !screen.seen || screen.seen.has(unit.unitId);
                  const waiting = !reduceMotion && screen.seen !== null && !risen.has(`${courseId}:${unit.unitId}`);
                  const rising = !reduceMotion && risen.has(`${courseId}:${unit.unitId}`) && !risenBefore.has(`${courseId}:${unit.unitId}`);
                  const mascotAt = playing && step! < STEP.bubble && was ? was : current;
                  const here = unit.stops.find((p) => p.stop.key === mascotAt);
                  const spot = here ? mascotSpot(here) : null;
                  const headingId = `lp-unit-${unit.unitId}`;
                  return (
                    <section
                      key={unit.unitId}
                      data-unit={unit.unitId}
                      className={`lp-unit lp-tone-${unit.tone}${seen ? ' is-seen' : ''}${waiting ? ' is-waiting' : ''}${rising ? ' is-rising' : ''}`}
                      aria-labelledby={headingId}
                    >
                      {index === 0 ? (
                        // the first unit is named by the pinned heading over it: its own heading is read, not shown again
                        <h2 className="sr-only" id={headingId}>
                          {named ? `${t('coursemap.section', { n: section.number })}, ` : ''}
                          {t('coursemap.unit', { n: unit.number })}, {unit.title}
                        </h2>
                      ) : (
                        <UnitDivider unit={unit} id={headingId} />
                      )}

                      {unit.stops.length > 0 && (
                        <ol className={`lp-path${index === 0 ? ' is-first' : ''}`} style={{ height: unit.height }}>
                          <UnitLand unit={unit} land={land} width={width} rtl={rtl} dark={dark} near={near} fresh={fresh} />
                          {spot && here && (
                            <PathMascot x={spot.x} y={spot.y} flip={sign * spot.x > sign * here.x} cheer={cheer} onPress={() => current && setOpenKey(current)} />
                          )}
                          {unit.stops.map(({ stop: real, x, y }, k) => {
                            const stop = drawnAs(real);
                            const isOpen = openKey === stop.key;
                            const isCurrent = stop.kind === 'skill' && stop.state === 'current';
                            const finishing = playing && step! >= STEP.finish && ret.changes.finished.includes(stop.key);
                            const opening = playing && step! >= STEP.open && ret.changes.opened.includes(stop.key);
                            // a prize won by the lesson: shut and wobbling as the skill pops, bursting open as the next one opens
                            const won = real.kind === 'trophy' ? real.earned : real.kind === 'story' ? real.open : false;
                            const wonNow = won && playing && unit.stops.some((p) => ret.changes.finished.includes(p.stop.key));
                            const wobbling = wonNow && step! >= STEP.finish && !(step! >= STEP.open);
                            const unlocking = wonNow && step! >= STEP.open;
                            const look = wonNow && step! < STEP.open ? (real.kind === 'story' ? 'storyLocked' : 'chest') : stopLook(stop);
                            // the bubble waits for its moment on the way back, then arrives at the new stop
                            const bubble = isCurrent && (!playing || step! >= STEP.bubble);
                            const ring = stop.kind === 'skill' && stop.lessonsTotal > 0 ? ringNow(stop) : null;
                            return (
                              <li
                                key={stop.key}
                                className={`lp-stop${isOpen ? ' is-open' : ''}${isCurrent && !playing ? ' is-here' : ''}`}
                                style={{ top: y - NODE / 2, '--x': `${x}px`, '--i': k } as React.CSSProperties}
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
                                  className={`lp-node ${stopClass(stop)}${finishing ? ' is-finishing' : ''}${opening ? ' is-opening' : ''}${wobbling ? ' is-wobbling' : ''}${unlocking ? ' is-unlocking' : ''}${near ? ' is-drawn' : ''}`}
                                  data-stop={stop.key}
                                  aria-label={stopLabel(stop, unit)}
                                  aria-expanded={isOpen}
                                  aria-controls={isOpen ? popId : undefined}
                                  onClick={() => setOpenKey(isOpen ? null : stop.key)}
                                >
                                  {isCurrent && <span className="lp-glow" aria-hidden="true" />}
                                  {ring && near && stop.kind === 'skill' && (
                                    <TopicRing of={stop.lessonsTotal} filled={ring.filled} whole={ring.whole} from={ring.from} locked={stop.state === 'locked'} />
                                  )}
                                  <span className="lp-node-face">
                                    <StopArt look={look} tone={unit.tone} dark={dark} near={near} />
                                    {ring && stop.kind === 'skill' && stop.state === 'done' && <RoundStars rounds={ring.stars} earned={ring.earned} />}
                                    <span className="lp-node-glyph">
                                      <Glyph stop={stop} />
                                    </span>
                                  </span>
                                </button>
                                {isOpen && (
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
                          {tokenPlace && tokenPlace.unitId === unit.unitId && <LearnerToken key={tokenAt} x={tokenPlace.x} y={tokenPlace.y} hop={hop} />}
                        </ol>
                      )}
                    </section>
                  );
                })}
              </div>
            ),
          )}
          {data.upcoming && <UpcomingUnit upcoming={data.upcoming} dark={dark} />}
        </div>
      </div>

      <Sheet open={railOpen} onClose={() => setRailOpen(false)} label={t('learn.openMap')} className="lp-rail-sheet">
        <h2 className="lp-guide-title">{t('learn.openMap')}</h2>
        <UnitRail sections={rail} onPick={toUnit} />
      </Sheet>

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
