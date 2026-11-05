import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PATH_LANDMARK_LOOP,
  PATH_STOP_ART,
  landmarkBox,
  pathGroundColour,
  pathLandSvg,
  pathLandmarkSvg,
  pathLoopSvg,
  pathStonesSvg,
  pathStopSvg,
  praiseWords,
  trailStones,
  type PathBox,
  type PathHost,
  type PathLand,
  type PathStopLook,
  type PathUnit,
  type UnitTone,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { Avatar } from '../components/Avatar';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { SkillNode } from './types';

/**
 * The world the website's lesson path walks through, drawn from @kurda/shared
 * (path-world.ts for where things stand, art/path-land.ts for the drawings),
 * as the phone draws it: each unit's land under its stops, the stepping
 * stones between them, the unit's landmark and its one small moving part,
 * the person of the course who waits by the unit, and the learner's own
 * picture standing on the stop to do now. The rail of units beside the path
 * is here too.
 *
 * A unit far from the screen (`near` false) is only its ground's colour, so a
 * course of twelve units draws two or three lands at a time; the stylesheet
 * moves only the unit in view (path.css), and nothing under Reduce Motion.
 */

type Unit = PathUnit<SkillNode>;

/** Whether the page is drawn dark (theme/theme.ts puts the scheme on the root element), followed as it changes. */
export function useDarkPage(): boolean {
  const read = (): boolean => typeof document !== 'undefined' && document.documentElement.dataset.theme !== 'light';
  const [dark, setDark] = useState(read);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/** An element's width, followed as it changes; a phone's width until it has been measured, so the path draws at once. */
export function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width || 0);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry?.contentRect.width ?? 0)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * Which units are near the screen (one screen either way: drawn in full) and
 * which can be seen, by their `data-unit`, followed as the page scrolls. With
 * no IntersectionObserver (a test's page) every unit counts as near and seen.
 */
export function useUnitsOnScreen(root: React.RefObject<HTMLElement | null>, units: readonly Unit[]): { near: ReadonlySet<string> | null; seen: ReadonlySet<string> | null } {
  const [near, setNear] = useState<ReadonlySet<string> | null>(null);
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(null);
  const ids = units.map((u) => u.unitId).join(',');
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const watch = (margin: string, set: (s: ReadonlySet<string>) => void): IntersectionObserver => {
      const now = new Set<string>();
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const id = (e.target as HTMLElement).dataset.unit;
            if (!id) continue;
            if (e.isIntersecting) now.add(id);
            else now.delete(id);
          }
          set(new Set(now));
        },
        { rootMargin: margin },
      );
      el.querySelectorAll<HTMLElement>('[data-unit]').forEach((s) => io.observe(s));
      return io;
    };
    const a = watch('100% 0px 100% 0px', setNear);
    const b = watch('0px', setSeen);
    return () => {
      a.disconnect();
      b.disconnect();
    };
  }, [root, ids]);
  return { near, seen };
}

/** One unit's land, its trail and its landmark, behind its stops; decorative. */
export function UnitLand({
  unit,
  land,
  width,
  rtl,
  dark,
  near,
  fresh,
}: {
  unit: Unit;
  land: PathLand;
  width: number;
  rtl: boolean;
  dark: boolean;
  near: boolean;
  /** the stops whose stretch of trail was walked only since the last lesson: their stones fill in as the path moves on */
  fresh: ReadonlySet<string>;
}): React.JSX.Element {
  const stones = useMemo(() => trailStones(unit.stops), [unit.stops]);
  const ground = useMemo(() => {
    if (!near || width <= 0) return null;
    const stops = unit.stops.map((p) => ({ key: p.stop.key, x: p.x, y: p.y }));
    return { __html: pathLandSvg({ ground: land.ground, width, height: unit.height, stops, stones, dark, rtl, seed: unit.unitId }) };
  }, [near, width, unit, land.ground, stones, dark, rtl]);
  const trail = useMemo(() => {
    if (!near || width <= 0) return null;
    const isFresh = (s: (typeof stones)[number]): boolean => s.walked && fresh.has(s.to);
    const draw = (list: typeof stones, walked: boolean): { __html: string } | null =>
      list.length > 0 ? { __html: pathStonesSvg({ width, height: unit.height, stones: list, walked, dark, rtl }) } : null;
    return {
      ahead: draw(
        stones.filter((s) => !s.walked || isFresh(s)),
        false,
      ),
      walked: draw(
        stones.filter((s) => s.walked && !isFresh(s)),
        true,
      ),
      fresh: draw(stones.filter(isFresh), true),
    };
  }, [near, width, unit.height, stones, fresh, dark, rtl]);
  const box = landmarkBox(width);
  return (
    <li className="lp-land" aria-hidden="true" style={{ background: ground ? undefined : pathGroundColour(land.ground, dark) }}>
      {ground && <span className="lp-land-ground" dangerouslySetInnerHTML={ground} />}
      {trail?.ahead && <span className="lp-land-stones" dangerouslySetInnerHTML={trail.ahead} />}
      {trail?.walked && <span className="lp-land-stones" dangerouslySetInnerHTML={trail.walked} />}
      {trail?.fresh && <span className="lp-land-stones is-fresh" dangerouslySetInnerHTML={trail.fresh} />}
      {near && width > 0 && <Landmark land={land} box={box} dark={dark} />}
    </li>
  );
}

/** A unit's landmark, and over it its loop, which the stylesheet moves while the unit is in view. */
function Landmark({ land, box, dark }: { land: PathLand; box: PathBox; dark: boolean }): React.JSX.Element {
  const picture = useMemo(() => ({ __html: pathLandmarkSvg({ landmark: land.landmark, dark, size: box.w }) }), [land.landmark, dark, box.w]);
  const loop = PATH_LANDMARK_LOOP[land.landmark];
  const s = box.w / 120;
  const sprite = useMemo(() => ({ __html: pathLoopSvg({ kind: loop.kind, dark, size: loop.w * s }) }), [loop, dark, s]);
  return (
    <span
      className="lp-landmark"
      data-landmark={land.landmark}
      style={{ '--lx': `${box.x - box.w / 2}px`, top: box.y, width: box.w, height: box.h } as React.CSSProperties}
    >
      <span className="lp-landmark-art" dangerouslySetInnerHTML={picture} />
      <span
        className={`lp-loop is-${loop.kind}`}
        style={{ left: loop.x * s, top: loop.y * s, width: loop.w * s, height: loop.h * s }}
        dangerouslySetInnerHTML={sprite}
      />
    </span>
  );
}

/** A stop's base and face, from the shared drawing; the face is what a press pushes down. */
export function StopArt({ look, tone, dark, near }: { look: PathStopLook; tone: UnitTone; dark: boolean; near: boolean }): React.JSX.Element | null {
  const art = useMemo(
    () => (near ? { base: { __html: pathStopSvg({ look, tone, part: 'base', dark }) }, face: { __html: pathStopSvg({ look, tone, part: 'face', dark }) } } : null),
    [near, look, tone, dark],
  );
  if (!art) return null;
  return (
    <>
      <span className="lp-art lp-art-base" aria-hidden="true" dangerouslySetInnerHTML={art.base} />
      <span className="lp-art lp-art-face" aria-hidden="true" dangerouslySetInnerHTML={art.face} />
    </>
  );
}

/** Where the shared drawing sits round a 72-point stop: its box, offset so its disc's face is a little above the button's middle. */
export const STOP_ART_AT = { left: 36 - PATH_STOP_ART.cx, top: 30 - PATH_STOP_ART.cy, size: PATH_STOP_ART.box } as const;

/**
 * The lights along the current stop's side, one for each of its lessons, lit
 * in gold as each is done; `moving` from `from` on, as a return from a lesson
 * shows it.
 */
export function SideLights({ done, total }: { done: number; total: number }): React.JSX.Element | null {
  const count = Math.min(total, 8);
  if (count === 0) return null;
  const gap = count > 1 ? Math.min(13, (2 * PATH_STOP_ART.rx - 22) / (count - 1)) : 0;
  return (
    <span className="lp-lights" aria-hidden="true">
      {Array.from({ length: count }, (_, k) => {
        const dx = (k - (count - 1) / 2) * gap;
        const y = 30 + PATH_STOP_ART.ry * Math.sqrt(Math.max(0, 1 - (dx / PATH_STOP_ART.rx) ** 2)) + PATH_STOP_ART.raised / 2;
        return <span key={k} className={`lp-light${k < done ? ' is-lit' : ''}`} style={{ left: 36 + dx - 4, top: y - 4, '--k': k } as React.CSSProperties} />;
      })}
    </span>
  );
}

/**
 * The learner, standing on the stop to do now: their picture in a ring of the
 * unit's colour on a short stem. Coming back from a lesson that moved them
 * on, they hop there from the stop they finished (`hop`: how far across and
 * up that stop was, in points); the stylesheet plays the hop, and bobs them
 * with the stop.
 */
export function LearnerToken({ x, y, hop }: { x: number; y: number; hop: { dx: number; dy: number } | null }): React.JSX.Element {
  const { user } = useAuth();
  return (
    <li
      className={`lp-learner${hop ? ' is-hopping' : ''}`}
      aria-hidden="true"
      data-testid="lp-learner"
      style={{ top: y, '--tx': `${x}px`, '--hx': `${hop?.dx ?? 0}px`, '--hy': `${hop?.dy ?? 0}px` } as React.CSSProperties}
    >
      <span className="lp-learner-ring">
        <Avatar url={user?.avatarUrl ?? null} glyphSize={22} />
      </span>
      <span className="lp-learner-stem" />
    </li>
  );
}

/**
 * Hamo or Xezal beside the unit's last stop, whole, as Hevalo stands by the
 * current one. While their unit is in view and the learner has been through
 * some of it, now and then they say a word of praise from the course's own
 * list (shared `praiseWords`), in the course's Kurdish, in a bubble over them.
 * A picture, left out of the reading order: the stops say everything.
 */
export function PathHost({
  host,
  box,
  flip,
  speak,
  dialect,
}: {
  host: PathHost;
  box: PathBox;
  flip: boolean;
  /** in view, with something to praise */
  speak: boolean;
  dialect: string | null | undefined;
}): React.JSX.Element {
  const words = praiseWords(dialect);
  const [said, setSaid] = useState<string | null>(null);
  const turn = useRef(0);
  useEffect(() => {
    if (!speak || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      setSaid(null);
      return;
    }
    let hide: number | undefined;
    const say = (): void => {
      setSaid(words[turn.current % words.length]!);
      turn.current += 1;
      hide = window.setTimeout(() => setSaid(null), 3200);
    };
    const first = window.setTimeout(say, 1600);
    const every = window.setInterval(say, 9000);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(hide);
      window.clearInterval(every);
    };
  }, [speak, words]);
  const lang = dialect && /sor|ckb/i.test(dialect) ? 'ckb' : 'ku';
  return (
    <li className="lp-host" aria-hidden="true" data-host={host} style={{ top: box.y, '--hx': `${box.x}px`, width: box.w, height: box.h } as React.CSSProperties}>
      {said && (
        <span className="lp-host-say" lang={lang}>
          {said}
        </span>
      )}
      <span className="lp-host-figure">
        <SpeakingCharacter speaker={host} audio={null} crop="full" size={HOST_WIDTH} decorative mirrored={flip} />
      </span>
    </li>
  );
}

/** How wide the people beside the path are drawn: as tall, whole, as Hevalo stands. */
const HOST_WIDTH = 64;

/** A unit as the rail lists it. */
export interface RailUnit {
  unitId: string;
  number: number;
  title: string;
  tone: UnitTone;
  done: number;
  total: number;
  here: boolean;
}

/**
 * Every unit of the course as a milestone on a slim rail beside the path —
 * filled once the unit is done, ringed where the learner is — with its number
 * and its name; a press scrolls there. Sticky, so it is in reach however far
 * down the path the learner has scrolled; the stylesheet shows it only where
 * the page leaves room beside the path.
 */
export function UnitRail({ units, onPick }: { units: RailUnit[]; onPick: (unitId: string) => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  return (
    <nav className="lp-rail" aria-label={t('learn.openMap')}>
      <ol>
        {units.map((u) => {
          const finished = u.total > 0 && u.done === u.total;
          return (
            <li key={u.unitId} className={`lp-rail-unit lp-tone-${u.tone}${u.here ? ' is-here' : ''}${finished ? ' is-done' : ''}`}>
              <button type="button" onClick={() => onPick(u.unitId)} aria-current={u.here ? 'step' : undefined}>
                <span className="lp-rail-dot" aria-hidden="true" />
                <span className="lp-rail-words">
                  <span className="lp-rail-number">{t('coursemap.unit', { n: new Intl.NumberFormat(locale).format(u.number) })}</span>
                  <span className="lp-rail-title">{u.title}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
