import { useEffect, useId, useMemo, useState } from 'react';
import {
  PATH_LANDMARK_LOOP,
  landmarkBox,
  pathLandmarkSvg,
  pathLoopSvg,
  pathMilestoneSvg,
  pathScene,
  pathSignpostSvg,
  pathStopSvg,
  unitRounds,
  unitScenery,
  type PathBox,
  type PathLand,
  type PathStopLook,
  type PathUnit,
  type UnitTone,
} from '@kurda/shared';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { PathChest, PathScene } from './PathScene';
import type { SkillNode } from './types';

/**
 * What stands beside the lesson path, drawn from @kurda/shared (path-world.ts, art/path-landmark.ts) as on the phone:
 * each unit's landmark with one moving part, beside a path that stands on the page itself; plus the rail of units. A
 * unit far from the screen (`near` false) draws nothing, and only the unit in view moves (path.css), never under
 * reduced motion.
 */

type Unit = PathUnit<SkillNode>;

/** An element's width, followed as it changes, from when it is `ready`. */
export function useWidth(ref: React.RefObject<HTMLElement | null>, ready: boolean): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    setWidth(Math.round(el.getBoundingClientRect().width || 0));
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry?.contentRect.width ?? 0)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, ready]);
  return width;
}

/**
 * Which units are near the screen (within a screen either way: drawn in full) and which are visible, by `data-unit`.
 * Without IntersectionObserver (tests) every unit counts as both.
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

/** A unit's landmark beside its stops, the path itself standing on the page; decorative. */
export function UnitLandmark({ land, width, dark, near }: { land: PathLand; width: number; dark: boolean; near: boolean }): React.JSX.Element {
  return (
    <li className="lp-land" aria-hidden="true">
      {near && width > 0 && <Landmark land={land} box={landmarkBox(width)} dark={dark} />}
    </li>
  );
}

/** A unit's landmark with its loop over it, which the stylesheet moves while the unit is in view. */
function Landmark({ land, box, dark }: { land: PathLand; box: PathBox; dark: boolean }): React.JSX.Element {
  const picture = useMemo(() => ({ __html: pathLandmarkSvg({ landmark: land.landmark, ground: land.ground, dark, size: box.w }) }), [land.landmark, land.ground, dark, box.w]);
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

/** A stop's base and face from the shared drawing; a press pushes the face down. */
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

/** A unit's milestone, its last stop, from the shared drawing: the seal and the drum it stands on; a press pushes the seal down. */
export function MilestoneArt({ won, rounds, dark, near }: { won: boolean; rounds: number; dark: boolean; near: boolean }): React.JSX.Element | null {
  const art = useMemo(
    () =>
      near
        ? { base: { __html: pathMilestoneSvg({ won, rounds, part: 'base', dark }) }, face: { __html: pathMilestoneSvg({ won, rounds, part: 'face', dark }) } }
        : null,
    [near, won, rounds, dark],
  );
  if (!art) return null;
  // Laid from the button's corner as path.css places it (shared PATH_MILESTONE_ART).
  return (
    <>
      <span className="lp-art lp-art-base is-milestone" aria-hidden="true" dangerouslySetInnerHTML={art.base} />
      <span className="lp-art lp-art-face is-milestone" aria-hidden="true" dangerouslySetInnerHTML={art.face} />
    </>
  );
}

/**
 * A unit's playful touches beside its road (shared `unitScenery`): its little scene, chosen from the chapter (shared
 * `pathScene`, PathScene.tsx), with the chapter's rounds strung under it, and the unit's painted sandûq, shut until the
 * unit is done and then open on its gold. Both are for the eye and out of the reading order; a tap plays a moment of its
 * own (path.css), and nothing moves under reduced motion.
 */
export function UnitScenery({
  unit,
  dark,
  near,
  mascot,
  rtl,
  reduce,
}: {
  unit: Unit;
  dark: boolean;
  near: boolean;
  /** Where Hevalo stands beside the stop to do now in this unit, if he is here. */
  mascot: { x: number; y: number } | null;
  rtl: boolean;
  reduce: boolean;
}): React.JSX.Element | null {
  const scene = pathScene(unit.number - 1);
  const spots = useMemo(() => unitScenery(unit.stops, mascot, scene), [unit.stops, mascot, scene]);
  const [opened, setOpened] = useState(0);
  if (!near) return null;
  const won = unit.total > 0 && unit.done === unit.total;
  return (
    <>
      {spots.scene && (
        <li className={`lp-scene is-${scene}`} aria-hidden="true" data-scene={scene} style={{ top: spots.scene.y, '--sx': `${spots.scene.x}px` } as React.CSSProperties}>
          {/* Drawn for the road's start side; on the other it is mirrored, so it always faces the road. */}
          <PathScene scene={scene} flip={spots.scene.x > 0 !== rtl} dark={dark} rounds={unitRounds(unit.stops)} reduce={reduce} />
        </li>
      )}
      {spots.chest && (
        <li className="lp-chest" aria-hidden="true" style={{ top: spots.chest.y, '--cx': `${spots.chest.x}px` } as React.CSSProperties}>
          <button type="button" className="lp-chest-hit" tabIndex={-1} aria-hidden="true" onClick={() => setOpened((n) => n + 1)}>
            <PathChest open={won} dark={dark} size={CHEST_SIZE} played={opened} />
          </button>
        </li>
      )}
    </>
  );
}

/** The sandûq's size beside the road: a stop's, so it reads as one of the road's own things. */
const CHEST_SIZE = 96;

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

/** A section as the rail lists it: its number (null in a one-section course), its level's plain name, and its units. */
export interface RailSection {
  number: number | null;
  level: MessageKey | null;
  units: RailUnit[];
}

/**
 * Every unit as a milestone on a slim sticky rail beside the path, filled when done and ringed where the learner is,
 * grouped by section where there are several; a press opens its section and goes there. Shown only where there is room.
 */
export function UnitRail({ sections, onPick }: { sections: RailSection[]; onPick: (unitId: string) => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const n = (v: number): string => new Intl.NumberFormat(locale).format(v);
  return (
    <nav className="lp-rail" aria-label={t('learn.openMap')}>
      {sections.map((section, s) => (
        <div key={section.number ?? s} className="lp-rail-section">
          {section.number !== null && (
            <p className="lp-rail-section-name">
              {section.level ? `${t('coursemap.section', { n: n(section.number) })} · ${t(section.level)}` : t('coursemap.section', { n: n(section.number) })}
            </p>
          )}
          <ol>
            {section.units.map((u) => {
              const finished = u.total > 0 && u.done === u.total;
              const number = t('coursemap.unit', { n: n(u.number) });
              return (
                <li key={u.unitId} className={`lp-rail-unit lp-tone-${u.tone}${u.here ? ' is-here' : ''}${finished ? ' is-done' : ''}`}>
                  {/* Number and name as one, as the unit's heading says them. */}
                  <button type="button" onClick={() => onPick(u.unitId)} aria-current={u.here ? 'step' : undefined} aria-label={`${number}, ${u.title}`}>
                    <span className="lp-rail-dot" aria-hidden="true" />
                    <span className="lp-rail-words">
                      <span className="lp-rail-number">{number}</span>
                      <span className="lp-rail-title">{u.title}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </nav>
  );
}

/** The unit after the last one released, as the map names it (api/src/coursemap/service.ts). */
export interface Upcoming {
  number: number;
  title: string;
  recordedBy: 'hamo' | null;
}

/**
 * Where the path stops for now: a signpost with the next unit's number and name, on its way. On the road, whose chapters
 * go online as Hamo records them, Hamo stands by the sign with a small red recording light, still under reduced motion.
 */
export function UpcomingUnit({ upcoming, dark }: { upcoming: Upcoming; dark: boolean }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const titleId = useId();
  const sign = useMemo(() => ({ __html: pathSignpostSvg({ dark, size: 120, idPrefix: 'lp-next' }) }), [dark]);
  return (
    <section className="lp-next" aria-labelledby={titleId}>
      <div className="lp-next-art" aria-hidden="true">
        <span className="lp-next-sign" dangerouslySetInnerHTML={sign} />
        {upcoming.recordedBy && (
          <span className="lp-next-host">
            <SpeakingCharacter speaker={upcoming.recordedBy} audio={null} crop="full" size={NEXT_HOST_SIZE} decorative />
          </span>
        )}
      </div>
      <div className="lp-next-text">
        <p className="lp-next-eyebrow">{t('coursemap.unit', { n: new Intl.NumberFormat(locale).format(upcoming.number) })}</p>
        <h2 className="lp-next-title" id={titleId}>
          {upcoming.title}
        </h2>
        <p className="lp-next-line">
          {upcoming.recordedBy && <span className="lp-next-rec" aria-hidden="true" />}
          {t(upcoming.recordedBy ? 'coursemap.upcoming.recording' : 'coursemap.upcoming.soon')}
        </p>
      </div>
    </section>
  );
}

/** Hamo's height by the signpost, a little smaller than beside a unit, as he is further up the road. */
const NEXT_HOST_SIZE = 112;
