import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PATH_GEOMETRY,
  PATH_RETURN,
  PATH_START_WORDS,
  PATH_STAMP_MOMENT,
  TOPIC_STARS,
  isSoraniDialect,
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
import { ArrowIcon, BookIcon, CheckIcon, LockIcon, PracticeIcon, RepostIcon, StarIcon, TalkIcon, WordsIcon } from '../components/icons';
import { ErrorState } from '../components/states';
import { CourseMapSkeleton } from '../components/skeletons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { GrammarNote } from './GrammarNote';
import { JumpSheet } from './JumpSheet';
import { courseProgress, lessonStates } from './map';
import { RoundPrints, TopicBar } from './PathRing';
import { TileStamp } from './PathScene';
import { SectionCard, UnitDivider, UnitPin, levelWords, useUnitAtTop } from './PathSections';
import { MilestoneArt, StopArt, UnitLandmark, UnitRail, UnitScenery, UpcomingUnit, useUnitsOnScreen, useWidth, type RailSection } from './PathWorld';
import { useDarkPage } from '../theme/useDarkPage';
import { preloadLesson } from './preloadLesson';
import type { CourseMap as Map, CourseSummary, PracticeDue, SkillNode } from './types';
import './path.css';

type Stop = PlacedStop<SkillNode>['stop'];
type Unit = PathUnit<SkillNode>;

const { node: NODE } = PATH_GEOMETRY;

/** How a skill stands, in words, said after its name to a screen reader. */
function stateKey(stop: SkillStop<SkillNode>): MessageKey {
  if (stop.state === 'current') return 'coursemap.state.current';
  if (stop.state === 'available') return 'coursemap.state.open';
  if (stop.state === 'locked') return 'coursemap.state.locked';
  return stop.finish === 'strong' ? 'coursemap.state.strong' : stop.finish === 'refresh' ? 'coursemap.state.refresh' : 'coursemap.state.done';
}

const lessonHref = (lessonId: string, courseId: string): string =>
  `/app/learn/lesson/${lessonId}?course=${encodeURIComponent(courseId)}`;

/**
 * The glyph on a stop, so its kind shows by shape as well as colour. A topic's tile shows what its next lesson is:
 * letters for new words, a conversation, or practice (its number, or on the stop to do now a star, from a server too old
 * to say); stamped once finished, the glyph steps back under Hevalo's print (path.css). The milestone carries its
 * chapter's number.
 */
function Glyph({ stop }: { stop: Stop }): React.JSX.Element | null {
  if (stop.kind === 'review') return <RepostIcon size={28} weight="bold" />;
  if (stop.kind === 'trophy' || stop.kind === 'story') return null;
  if (stop.state === 'locked') return <LockIcon size={26} weight="bold" />;
  const kind =
    stop.launchKind === 'words' ? (
      <WordsIcon size={32} />
    ) : stop.launchKind === 'talk' ? (
      <TalkIcon size={32} />
    ) : stop.launchKind === 'practice' ? (
      <PracticeIcon size={32} />
    ) : stop.state === 'current' ? (
      <StarIcon size={32} weight="fill" />
    ) : stop.state === 'done' ? null : (
      <span className="lp-node-num">{stop.number}</span>
    );
  // Still done, with a small sign that a review would help.
  if (stop.state === 'done' && stop.finish === 'refresh') {
    return (
      <>
        {kind}
        <span className="lp-node-badge">
          <RepostIcon size={14} weight="bold" />
        </span>
      </>
    );
  }
  return kind;
}

function stopClass(stop: Stop): string {
  if (stop.kind === 'review') return 'is-review';
  if (stop.kind === 'trophy') return `is-milestone is-trophy${stop.earned ? ' is-earned' : ''}`;
  if (stop.kind === 'story') return `is-milestone is-story${stop.open ? ' is-won' : ' is-closed'}`;
  return `is-${stop.state}${stop.finish ? ` is-${stop.finish}` : ''}`;
}

/**
 * How a stop is drawn (shared `pathStopSvg`): a finished skill is its unit's tile as before, stamped (`TileStamp`), and
 * faded a little when a refresh would help; review is an open stop. A unit's last stop, its story or its trophy, is drawn as its
 * milestone (`MilestoneArt`), and this look says only whether it is won.
 */
function stopLook(stop: Stop): PathStopLook {
  if (stop.kind === 'review') return 'review';
  if (stop.kind === 'trophy') return stop.earned ? 'chestOpen' : 'chest';
  if (stop.kind === 'story') return stop.open ? 'story' : 'storyLocked';
  if (stop.state === 'done') return stop.finish === 'refresh' ? 'refresh' : 'done';
  return stop.state;
}

/** Whether a stop's card offers a lesson to play now, and so is the road's main button, in its unit's colour. */
function goes(stop: Stop): boolean {
  return stop.kind === 'skill' && stop.state !== 'locked' && Boolean(stop.launch);
}

/**
 * The card a tapped stop opens: what it is, progress, one thing to do next, and what it pays. A locked skill says what
 * opens it; a starred topic shows its stars and round; a chapter's story says the chapter is complete.
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
  /** Where a lesson opened from here returns to. */
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
        {/* The chapter's prize, in gold. */}
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
  // The round being played: its lessons finished, and once a topic has a star, those of its next round.
  const share = stop.lessonsTotal > 0 ? Math.round(((stop.rounds > 0 ? stop.pieces : stop.lessonsDone) / stop.lessonsTotal) * 100) : 0;
  const action =
    stop.state === 'locked' || !stop.launch
      ? null
      : stop.finish === 'refresh'
        ? { to: reviewHref, label: t('coursemap.refreshLink'), again: null }
        : {
            to: lessonHref(stop.launch, courseId),
            label: stop.state === 'done' ? t('coursemap.again') : stop.lessonsDone > 0 ? t('learn.continue') : t('learn.start'),
            // The lesson was finished before: a replay, which pays less.
            again: skill.lessons.find((l) => l.lessonId === stop.launch)?.completed ?? stop.state === 'done',
          };
  // What the lesson pays, from the server's own numbers (@kurda/shared xp.ts).
  const xp = action && action.again !== null ? lessonXpRange(action.again) : null;
  const tips = skill.hasGrammar && (
    <button type="button" className="btn btn-ghost btn-sm lp-pop-tips" onClick={() => onTips([skill], t('coursemap.tipsFor', { skill: skill.title }))}>
      <BookIcon size={18} />
      {t('coursemap.tips')}
    </button>
  );
  // A topic to play now: its name, which lesson or round is next, and one button that says what it pays.
  if (action && goes(stop)) {
    const at = skill.lessons.findIndex((l) => l.lessonId === stop.launch);
    // A finished topic is played again in rounds, so it says which round; any other says which lesson is next.
    const where =
      stop.state === 'done' && stop.rounds > 0
        ? stop.rounds >= TOPIC_STARS
          ? t('coursemap.roundsDone', { last: TOPIC_STARS })
          : t('coursemap.round', { round: stop.rounds + 1, last: TOPIC_STARS, done: stop.pieces, total: stop.lessonsTotal })
        : at >= 0
          ? t('coursemap.lessonOf', { n: number(at + 1), total: number(skill.lessons.length) })
          : null;
    return (
      <>
        <h3 className="lp-pop-title" id={titleId}>
          {skill.title}
        </h3>
        {where && <p className="lp-pop-line">{where}</p>}
        {stop.rounds > 0 && <RoundPrints rounds={stop.rounds} />}
        <LinkButton to={action.to} state={{ title: skill.title, from: home }} block className="lp-pop-start">
          <span>{action.label}</span>
          {xp && <span className="lp-pop-start-xp">{t(action.again ? 'coursemap.xp.again' : 'coursemap.xp.first', { min: number(xp.min), max: number(xp.max) })}</span>}
        </LinkButton>
        {tips}
      </>
    );
  }
  return (
    <>
      <p className="lp-pop-eyebrow">
        {t('coursemap.unit', { n: unit.number })} · {unit.title}
      </p>
      <h3 className="lp-pop-title" id={titleId}>
        {skill.title}
      </h3>
      {/* What it teaches: its lessons, each a way in once open. */}
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
          {stop.rounds > 0 && <RoundPrints rounds={stop.rounds} />}
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
      {tips}
    </>
  );
}

/** A stop button's full name, matching what is seen: the round once a topic has a star ("Greetings, Done, round 2 of 3, 3 of 4 lessons"). */
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

/** A unit's grammar notes (its guide), or one skill's, in a sheet; each note is fetched the first time it is shown. */
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
    // A fetched note is kept (`notes` is read, not watched); only a new guide asks again.
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

// ---------- Coming back to the path ----------

/*
 * The path as last drawn in this tab, per course, so a return from a lesson can play what changed (shared
 * `pathChanges`). Without a snapshot the path is simply drawn.
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
    // Storage blocked: the next visit draws the path without the moment.
  }
}

/*
 * The finished stops already stamped on this device, per course, kept across visits so each is stamped once, the first
 * time the learner is back on the road after finishing it. The first visit counts everything finished so far as stamped.
 */
const stampsKey = (courseId: string): string => `hevalo:stamped:${courseId}`;

function readStamps(courseId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(stampsKey(courseId));
    const value: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(value) ? new Set(value.filter((k): k is string => typeof k === 'string')) : null;
  } catch {
    return null;
  }
}

function writeStamps(courseId: string, keys: ReadonlySet<string>): void {
  try {
    localStorage.setItem(stampsKey(courseId), JSON.stringify([...keys]));
  } catch {
    // Storage blocked: a stop may be stamped again on a later visit, which does no harm.
  }
}

/** Every finished topic on the road, by key. */
function finishedKeys(path: Path<SkillNode>): string[] {
  return path.units.flatMap((u) => u.stops.filter((p) => p.stop.kind === 'skill' && p.stop.state === 'done').map((p) => p.stop.key));
}

interface PathReturn {
  changes: PathChanges;
  prev: PathSnapshot;
  /** The stop that was current, where the page opens before it moves on. */
  from: string | null;
}

/**
 * The moments of a return (`PATH_RETURN`, counted from the draw as on the phone): the bar fills, a finished stop is
 * stamped, a full bar starts its next round, an opened stop loses its lock, and the bubble moves on.
 */
const STEP = { fill: 1, finish: 2, next: 3, open: 4, bubble: 5 } as const;

/** Where the return has got to (`STEP`), from 0 (drawn as it was) to `STEP.bubble`; null once over or with nothing to show. */
function useReturnStep(ret: PathReturn | null): number | null {
  const [at, setAt] = useState<{ ret: PathReturn | null; step: number | null }>({ ret: null, step: null });
  useEffect(() => {
    if (!ret) return;
    const { settleMs, finishAtMs, nextAtMs, openAtMs, bubbleAtMs, bubbleMs, popMs } = PATH_RETURN;
    const marks = [settleMs, finishAtMs, nextAtMs, openAtMs, bubbleAtMs];
    // In order, each a moment after the last.
    const timers = marks.map((ms, i) => window.setTimeout(() => setAt({ ret, step: i + 1 }), ms));
    timers.push(window.setTimeout(() => setAt({ ret, step: null }), bubbleAtMs + Math.max(bubbleMs, popMs, 400)));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [ret]);
  if (!ret) return null;
  // Until its first moment it is drawn as it was, from the very first frame.
  return at.ret === ret ? at.step : 0;
}

/**
 * Hevalo beside the current stop (shared `mascotSpot`), never on the line. A tap opens the stop's card; he cheers when a
 * return shows a skill finished or opened. He is decorative and out of the reading order, and hidden on the narrowest
 * screens.
 */
function PathMascot({ x, y, flip, cheer, onPress }: { x: number; y: number; flip: boolean; cheer: boolean; onPress: () => void }): React.JSX.Element {
  return (
    <li className="lp-mascot" aria-hidden="true" style={{ top: y, '--mx': `${x}px` } as React.CSSProperties}>
      <SpeakingCharacter speaker="hevalo" audio={null} crop="full" size={MASCOT_SIZE} decorative mirrored={flip} reaction={cheer ? 'cheer' : null} onPress={onPress} />
    </li>
  );
}

/** Hevalo's size beside the path, in scale with the valley's trees and houses. */
const MASCOT_SIZE = 104;

/** Units whose stops have already risen in this tab, by course; each rises once. */
const RISEN = new Set<string>();

/** A stamp waits this long on a plain visit, so the tile is seen as it was before it is stamped. */
const STAMP_SETTLE_MS = 450;

/** The section a stop is in, from 0; null for no stop. */
function sectionOf(path: Path<SkillNode>, key: string | null): number | null {
  if (!key) return null;
  const at = path.sections.findIndex((s) => s.units.some((u) => u.stops.some((p) => p.stop.key === key)));
  return at >= 0 ? at : null;
}

/**
 * A course's lesson path, on the course page (pages/CourseMap.tsx) and as Learn's home (pages/Learn.tsx), by
 * @kurda/shared's `lessonPath` as on the phone. One section shows at a time, with earlier and later ones as cards, under
 * a pinned heading naming the top unit. A return from a lesson plays what changed (`PATH_RETURN`), or simply redraws
 * under reduced motion. A later chapter that can be tested into offers its test on its first stop and on its section's
 * card (JumpSheet.tsx).
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
   * What the caller already holds (Learn has the courses, maps and review count), so nothing is fetched again. A map
   * that failed there (`null`) is fetched here, so the path can say so and retry.
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
  const [jumpTo, setJumpTo] = useState<Unit | null>(null);
  const [away, setAway] = useState<'up' | 'down' | null>(null);
  const pathRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  // The review count decides where review sits, so the path waits once for it or its failure.
  const dueSettled = due.data !== null || due.error !== null;
  // Units that can be tested into are offered as such ("Jump here?", JumpSheet.tsx).
  const path = useMemo(() => (data && dueSettled ? lessonPath(data, { due: due.data?.due ?? 0, offerJumps: true }) : null), [data, dueSettled, due.data]);
  const width = useWidth(pathRef, path !== null);

  // What changed since the path was last drawn here, read once on the first draw.
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
  // And what it is now, for next time.
  useEffect(() => {
    if (path) writeSnapshot(courseId, pathSnapshot(path));
  }, [path, courseId]);

  /*
   * The open section: one picked from its card; else, returning from a lesson, the one it was played in until the bubble
   * moves on, so finishing a section is seen; else the one the opening stop is in. A pick lasts until the learner moves
   * into another section.
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

  // Each unit rises the first time it can be seen; unseen units wait under the ground.
  const [risen, setRisen] = useState<ReadonlySet<string>>(() => new Set(RISEN));
  // Units that rose on an earlier visit are simply there.
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

  // The stops stamped on this device; read once the road is drawn, and on a first visit every finished stop so far.
  const [stamped, setStamped] = useState<ReadonlySet<string> | null>(null);
  if (path && stamped === null) setStamped(readStamps(courseId) ?? new Set(finishedKeys(path)));
  useEffect(() => {
    if (!path || !stamped) return;
    // Under reduced motion there is no moment to wait for: what is finished is stamped as it is drawn.
    const next = reduceMotion ? new Set([...stamped, ...finishedKeys(path)]) : stamped;
    if (next.size !== stamped.size) setStamped(next);
    writeStamps(courseId, next);
  }, [path, stamped, reduceMotion, courseId]);
  const stampDone = useCallback((key: string) => setStamped((had) => (had && !had.has(key) ? new Set([...had, key]) : had)), []);

  const nodeOf = useCallback((key: string | null): HTMLElement | null => {
    if (!key || !pathRef.current) return null;
    return pathRef.current.querySelector<HTMLElement>(`[data-stop="${key}"]`);
  }, []);

  // Opening: the current skill in the middle of the screen, or on a return the previous one, which the page then follows
  // to the new one. Learn opens at its top unless returning, with "Back to your lesson" when the stop is below.
  useLayoutEffect(() => {
    if (!path || scrolled.current) return;
    scrolled.current = true;
    if (!showHeader && !ret) return;
    nodeOf(ret?.from ?? path.focus)?.scrollIntoView?.({ block: 'center', behavior: reduceMotion || ret ? 'auto' : 'smooth' });
  }, [path, nodeOf, reduceMotion, ret, showHeader]);
  useEffect(() => {
    if (step === STEP.bubble && path?.focus) nodeOf(path.focus)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [step, path, nodeOf]);

  // The way back to the current skill, shown only while it is off screen (in the open section).
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

  // A card closes on Escape (back to its stop) and on a press anywhere else.
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

  // An open card is one press from a lesson, so the lesson's code is fetched now.
  useEffect(() => {
    if (openKey) preloadLesson();
  }, [openKey]);

  // An open card hanging below the screen is scrolled fully into view.
  useEffect(() => {
    if (!openKey) return;
    const card = document.getElementById(popId);
    card?.scrollIntoView?.({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [openKey, popId, reduceMotion]);

  // A unit picked on the rail: its section opens, and once drawn the page goes to it.
  const [goTo, setGoTo] = useState<string | null>(null);
  useEffect(() => {
    if (!goTo || !pathRef.current) return;
    const target = pathRef.current.querySelector<HTMLElement>(`[data-unit="${goTo}"]`) ?? pathRef.current.querySelector<HTMLElement>(`[data-holds~="${goTo}"]`);
    if (!target) return;
    setGoTo(null);
    target.scrollIntoView?.({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    target.querySelector<HTMLElement>('.lp-node, .lp-scard')?.focus({ preventScroll: true });
  }, [goTo, open, reduceMotion]);

  /** Arrow keys move along the path (across, in reading order), Home and End to its ends. */
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

  if ((loading && !data) || (data && !dueSettled)) return <CourseMapSkeleton header={showHeader} />;
  if (error || !data || !path || !shown) {
    return <ErrorState message={error ?? t('common.somethingWentWrong')} onRetry={reload} />;
  }

  const progress = courseProgress(data);
  const list = courses.data?.courses ?? [];
  // The bubble over the stop to do now speaks the course's own dialect, whatever the reader's language.
  const startWords = PATH_START_WORDS[isSoraniDialect(list.find((c) => c.id === courseId)?.dialect) ? 'sorani' : 'kurmanji'];
  const current = path.current;
  const placedOf = (key: string | null): { unitId: string; x: number; y: number } | null => {
    for (const u of path.units) {
      const p = u.stops.find((s) => s.stop.key === key);
      if (p) return { unitId: u.unitId, x: p.x, y: p.y };
    }
    return null;
  };
  const sign = rtl ? -1 : 1;
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

  /** A stop as drawn now: during a return, a finished or opened one looks as it was until its moment. */
  const drawnAs = (stop: Stop): Stop => {
    if (!playing || stop.kind !== 'skill') return stop;
    const before = ret.prev[stop.key];
    if (!before) return stop;
    if (step! < STEP.finish && ret.changes.finished.includes(stop.key)) return { ...stop, state: before.state, finish: null };
    if (step! < STEP.open && ret.changes.opened.includes(stop.key)) return { ...stop, state: 'locked', finish: null };
    return stop;
  };
  /** A topic's bar at this moment of a return, or as it is otherwise. */
  const barNow = (stop: SkillStop<SkillNode>): { filled: number; whole: boolean; from?: number } => {
    const of = stop.lessonsTotal;
    const now = { filled: stop.pieces, whole: false };
    const change = playing ? ret.changes.ring.find((r) => r.key === stop.key) : undefined;
    if (!change) return now;
    const before = change.from.rounds < TOPIC_STARS ? change.from.pieces : of;
    if (step! < STEP.fill) return { filled: before, whole: false };
    // A round made whole: the bar full and gold as the stop is stamped, then its next round.
    if (change.to.rounds > change.from.rounds && step! < STEP.next) return { filled: of, whole: step! >= STEP.finish, from: before };
    return { ...now, from: before };
  };
  // The next finished stop to stamp, one at a time down the road, once its unit is in view; under reduced motion none
  // is played, and each is simply stamped.
  const stampNext = (() => {
    if (reduceMotion || !stamped) return null;
    for (const unit of openUnits) {
      if (screen.seen && !screen.seen.has(unit.unitId)) continue;
      for (const { stop } of unit.stops) {
        const drawn = drawnAs(stop);
        if (drawn.kind === 'skill' && drawn.state === 'done' && !stamped.has(drawn.key)) return drawn.key;
      }
    }
    return null;
  })();
  const cheer = playing && step! >= STEP.bubble && (ret.changes.finished.length > 0 || ret.changes.opened.length > 0);
  // The unit in the pinned heading: the one at the top of the window, in the open section.
  const pinUnit = openUnits.find((u) => u.unitId === atTop) ?? openUnits[0]!;

  return (
    <div className="lp">
      {showHeader && (
        <div className="page-header lp-head">
          {/* The way back, as on every page: a chevron pointing back in the page's direction, then the words. */}
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
                <SectionCard
                  section={section}
                  here={s === path.section}
                  onOpen={() => setPicked(s)}
                  onJump={section.jumpTo ? () => setJumpTo(section.jumpTo) : undefined}
                />
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
                        // The first unit is named by the pinned heading, so its own heading is for screen readers only.
                        <h2 className="sr-only" id={headingId}>
                          {named ? `${t('coursemap.section', { n: section.number })}, ` : ''}
                          {t('coursemap.unit', { n: unit.number })}, {unit.title}
                        </h2>
                      ) : (
                        <UnitDivider unit={unit} id={headingId} />
                      )}

                      {unit.stops.length > 0 && (
                        <ol className={`lp-path${index === 0 ? ' is-first' : ''}`} style={{ height: unit.height }}>
                          <UnitLandmark land={land} width={width} dark={dark} near={near} />
                          {spot && here && (
                            <PathMascot x={spot.x} y={spot.y} flip={sign * spot.x > sign * here.x} cheer={cheer} onPress={() => current && setOpenKey(current)} />
                          )}
                          <UnitScenery unit={unit} dark={dark} near={near} here={here ?? null} width={width} rtl={rtl} reduce={reduceMotion} />
                          {unit.stops.map(({ stop: real, x, y }, k) => {
                            const stop = drawnAs(real);
                            const isOpen = openKey === stop.key;
                            const isCurrent = stop.kind === 'skill' && stop.state === 'current';
                            const finishing = playing && step! >= STEP.finish && ret.changes.finished.includes(stop.key);
                            const opening = playing && step! >= STEP.open && ret.changes.opened.includes(stop.key);
                            // A prize the lesson won: shut and wobbling as the skill pops, bursting open as the next opens.
                            const won = real.kind === 'trophy' ? real.earned : real.kind === 'story' ? real.open : false;
                            const wonNow = won && playing && unit.stops.some((p) => ret.changes.finished.includes(p.stop.key));
                            const wobbling = wonNow && step! >= STEP.finish && !(step! >= STEP.open);
                            const unlocking = wonNow && step! >= STEP.open;
                            const look = wonNow && step! < STEP.open ? (real.kind === 'story' ? 'storyLocked' : 'chest') : stopLook(stop);
                            // The milestone, the unit's last stop, stays slate until the moment its chapter is won.
                            const milestone = real.kind === 'story' || real.kind === 'trophy';
                            // On a return the bubble waits for its moment, then arrives at the new stop.
                            const bubble = isCurrent && (!playing || step! >= STEP.bubble);
                            const bar = stop.kind === 'skill' && stop.lessonsTotal > 0 ? barNow(stop) : null;
                            // A finished topic is stamped: already, or now in its moment; until then it is its tile as before.
                            const stamping = stampNext === stop.key;
                            const isStamped = stop.kind === 'skill' && stop.state === 'done' && (reduceMotion || (stamped?.has(stop.key) ?? true));
                            // A later chapter that can be tested into: its first stop offers the test rather than its card.
                            const jumpHere = unit.jumpKey === stop.key;
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
                                    <span lang={startWords === PATH_START_WORDS.sorani ? 'ckb' : 'ku'} dir="auto">
                                      {stop.lessonsDone > 0 ? startWords.going : startWords.start}
                                    </span>
                                  </Link>
                                )}
                                {jumpHere && (
                                  // For the pointer only: the stop under it is the same offer, named for the keyboard and screen readers.
                                  <button type="button" className="lp-callout is-jump" tabIndex={-1} aria-hidden="true" onClick={() => setJumpTo(unit)}>
                                    {t('coursemap.jump.bubble')}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={`lp-node ${stopClass(stop)}${isStamped ? ' is-stamped' : ''}${stamping ? ' is-stamping' : ''}${finishing ? ' is-finishing' : ''}${opening ? ' is-opening' : ''}${wobbling ? ' is-wobbling' : ''}${unlocking ? ' is-unlocking' : ''}${near ? ' is-drawn' : ''}`}
                                  data-stop={stop.key}
                                  style={stamping ? ({ '--stamp-press': `${(playing ? 0 : STAMP_SETTLE_MS) + PATH_STAMP_MOMENT.ms * PATH_STAMP_MOMENT.pressAt}ms` } as React.CSSProperties) : undefined}
                                  aria-label={jumpHere ? t('coursemap.jump.label', { n: unit.number.toLocaleString(locale) }) : stopLabel(stop, unit)}
                                  aria-haspopup={jumpHere ? 'dialog' : undefined}
                                  aria-expanded={jumpHere ? undefined : isOpen}
                                  aria-controls={isOpen ? popId : undefined}
                                  onClick={() => (jumpHere ? setJumpTo(unit) : setOpenKey(isOpen ? null : stop.key))}
                                >
                                  {/* The bar is the topic in hand: the one to do now, or one a return is filling. */}
                                  {bar && near && stop.kind === 'skill' && (isCurrent || (playing && ret.changes.ring.some((r) => r.key === stop.key))) && (
                                    <TopicBar of={stop.lessonsTotal} filled={bar.filled} whole={bar.whole} from={bar.from} />
                                  )}
                                  <span className="lp-node-face">
                                    {milestone ? (
                                      <>
                                        <MilestoneArt won={won && !(wonNow && step! < STEP.open)} dark={dark} near={near} />
                                        <span className={`lp-milestone-num${won && !(wonNow && step! < STEP.open) ? ' is-won' : ''}`} aria-hidden="true">
                                          {new Intl.NumberFormat(locale).format(unit.number)}
                                        </span>
                                      </>
                                    ) : (
                                      <StopArt look={look} tone={unit.tone} dark={dark} near={near} />
                                    )}
                                    {/* Now and then a glint sweeps the stop to do now. */}
                                    {isCurrent && near && <span className="lp-shine" aria-hidden="true" />}
                                    <span className="lp-node-glyph">
                                      <Glyph stop={stop} />
                                    </span>
                                    {near && stop.kind === 'skill' && stop.state === 'done' && (isStamped || stamping) && (
                                      <TileStamp
                                        stopKey={stop.key}
                                        dark={dark}
                                        worn={stop.finish === 'refresh'}
                                        pressing={stamping && !isStamped}
                                        delay={playing ? 0 : STAMP_SETTLE_MS}
                                        onStamped={stampDone}
                                      />
                                    )}
                                  </span>
                                </button>
                                {isOpen && (
                                  <div className={`lp-pop${goes(real) ? ' is-go' : ''}`} id={popId} role="group" aria-labelledby={`${popId}-title`}>
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
            ),
          )}
          {data.upcoming && <UpcomingUnit upcoming={data.upcoming} dark={dark} />}
        </div>
      </div>

      <Sheet open={railOpen} onClose={() => setRailOpen(false)} label={t('learn.openMap')} className="lp-rail-sheet">
        <h2 className="lp-guide-title">{t('learn.openMap')}</h2>
        <UnitRail sections={rail} onPick={toUnit} />
      </Sheet>

      {/* Not while a card is open, where it would cover the card's button. */}
      {away && path.focus && !openKey && (
        <button type="button" className="lp-jump" onClick={jump}>
          <span className={`lp-jump-arrow is-${away}`} aria-hidden="true">
            <ArrowIcon size={18} weight="bold" />
          </span>
          {path.current ? t('coursemap.jump') : t('coursemap.jumpEnd')}
        </button>
      )}

      <GuideSheet guide={guide} onClose={() => setGuide(null)} />
      <JumpSheet unit={jumpTo} courseId={data.course.id} from={home ?? `/app/learn/course/${encodeURIComponent(courseId)}`} onClose={() => setJumpTo(null)} />
    </div>
  );
}
