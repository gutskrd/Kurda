import { useEffect, useMemo, useRef, useState } from 'react';
import { PATH_STOP_TONES, levelHintKey, levelNameKey, levelOfCefr, pathKilimSvg, type PathSection, type PathUnit } from '@kurda/shared';
import { Button } from '../components/Button';
import { BookIcon, CheckIcon, FlagIcon, LockIcon, NextIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { useDarkPage } from '../theme/useDarkPage';
import { ChapterArt } from './PathScene';
import type { SkillNode } from './types';

/**
 * The lesson path a section at a time (learn/CoursePath.tsx): the pinned heading, dividers between units, and the cards
 * closed sections fold into. The phone draws the same (mobile coursemap/LessonPath.tsx) from @kurda/shared `lessonPath`.
 */

type Unit = PathUnit<SkillNode>;
type Section = PathSection<SkillNode>;

/**
 * A section level's plain name and hint, the same ladder the stories use (shared `levelNameKey`), never a CEFR letter.
 * Null without a level or past the ladder.
 */
export function levelWords(level: string | null): { name: MessageKey; hint: MessageKey } | null {
  const at = level ? levelOfCefr(level) : null;
  return at ? { name: levelNameKey(at), hint: levelHintKey(at) } : null;
}

/** The open section's unit at the top of the window: the last whose top has passed the pinned heading's foot, read at most once a frame. */
export function useUnitAtTop(root: React.RefObject<HTMLElement | null>, units: readonly Unit[]): string | null {
  const [at, setAt] = useState<string | null>(units[0]?.unitId ?? null);
  const ids = units.map((u) => u.unitId).join(',');
  useEffect(() => {
    const el = root.current;
    const first = ids.split(',')[0] || null;
    setAt(first);
    if (!el || typeof window === 'undefined') return;
    let frame = 0;
    const read = (): void => {
      frame = 0;
      const pin = el.querySelector<HTMLElement>('.lp-pin');
      const line = pin ? pin.getBoundingClientRect().bottom : 0;
      let top = first;
      el.querySelectorAll<HTMLElement>('[data-unit]').forEach((s) => {
        if (s.getBoundingClientRect().top <= line) top = s.dataset.unit ?? top;
      });
      setAt(top);
    };
    const onScroll = (): void => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    read();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [root, ids]);
  return at;
}

/**
 * The open section's heading, pinned under the bar: "Section 1 · Chapter 2" over the top unit's name, on the unit's own
 * colour standing on its darker lip, with a kilim trim woven along its foot, the chapter's painted vignette standing on
 * it beside the name, and its guide as a book on the far side over the rail's flag where there is no room for the rail. As the next unit comes up its colour slides in over the last one's,
 * or simply changes under reduced motion (path.css). A one-section course is not named. It is for the eye; each unit's
 * own heading is in the page order for screen readers.
 */
export function UnitPin({
  unit,
  section,
  onGuide,
  onRail,
}: {
  unit: Unit;
  /** The section's number, or null when the course has one. */
  section: number | null;
  onGuide?: () => void;
  onRail: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const n = (v: number): string => new Intl.NumberFormat(locale).format(v);
  const dark = useDarkPage();
  const pin = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = pin.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => setWidth(el.offsetWidth));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  // The unit the banner showed before, kept under the new one while the new colour slides in over it.
  const [was, setWas] = useState<Unit | null>(null);
  const last = useRef(unit);
  useEffect(() => {
    const before = last.current;
    last.current = unit;
    if (before.unitId === unit.unitId) return;
    setWas(before);
    const done = window.setTimeout(() => setWas(null), PIN_SLIDE_MS);
    return () => window.clearTimeout(done);
  }, [unit]);
  const colours = PATH_STOP_TONES[dark ? 'dark' : 'light'][unit.tone];
  const trim = useMemo(
    // A hidden view measures at no size at all; the trim waits for a real one.
    () => (width > 0 ? { __html: pathKilimSvg({ width: width - 2 * PIN_TRIM_INSET, height: PIN_TRIM_H, ink: colours.ink, eye: colours.fill, idPrefix: `lppin${unit.number}` }) } : null),
    [width, colours, unit.number],
  );
  return (
    <div ref={pin} className={`lp-pin lp-tone-${unit.tone}`} data-testid="lp-pin" data-tone={unit.tone}>
      {was && <span className={`lp-pin-colour lp-tone-${was.tone}`} aria-hidden="true" />}
      <span key={unit.unitId} className={`lp-pin-colour${was ? ' is-arriving' : ''}`} aria-hidden="true" />
      {trim && <span className="lp-pin-kilim" aria-hidden="true" dangerouslySetInnerHTML={trim} />}
      <div className="lp-pin-body">
        <div key={`w${unit.unitId}`} className={`lp-pin-words${was ? ' is-arriving' : ''}`}>
          <p className="lp-pin-eyebrow">{section !== null ? t('coursemap.sectionUnit', { section: n(section), unit: n(unit.number) }) : t('coursemap.unit', { n: n(unit.number) })}</p>
          <p className="lp-pin-title">{unit.title}</p>
        </div>
        {/* The chapter's own vignette, standing on the kilim beside its name. */}
        <span key={`a${unit.unitId}`} className={`lp-pin-scene${was ? ' is-arriving' : ''}`}>
          <ChapterArt chapter={unit.number - 1} ground={colours.lip} height={PIN_ART_H} />
        </span>
      </div>
      {/* At the far end, past a seam in the lip's colour, as a book of the unit's guide and the rail's flag. */}
      <div className="lp-pin-actions">
        {onGuide && (
          <button type="button" className="lp-pin-button" aria-label={t('coursemap.guideFor', { unit: unit.title })} onClick={onGuide}>
            <BookIcon size={24} weight="bold" />
          </button>
        )}
        {/* The rail of units, where there is no room for it beside the path. */}
        <button type="button" className="lp-pin-button lp-unit-rail" aria-label={t('learn.openMap')} onClick={onRail}>
          <FlagIcon size={24} weight="bold" />
        </button>
      </div>
    </div>
  );
}

/** The vignette's height in the banner; path.css keeps the title clear of its width. */
const PIN_ART_H = 76;
/** How long a new unit's colour takes to slide in over the last one's (path.css `lp-pin-slide`). */
const PIN_SLIDE_MS = 260;
/** The kilim trim's height, and how far in from the banner's sides it runs. */
const PIN_TRIM_H = 12;
const PIN_TRIM_INSET = 14;

/** Between two units, a quiet line with the next unit's number and name: its heading, wrapping rather than cut. */
export function UnitDivider({ unit, id }: { unit: Unit; id: string }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const chapter = t('coursemap.unit', { n: new Intl.NumberFormat(locale).format(unit.number) });
  return (
    // Read as one, as the pinned heading says it: "Chapter 2, Family".
    <h2 className="lp-divider" id={id} aria-label={`${chapter}, ${unit.title}`}>
      <span className="lp-divider-eyebrow">{chapter}</span>
      <span className="lp-divider-title">{unit.title}</span>
    </h2>
  );
}

/**
 * A closed section as one card: its number, level name and hint, and where it stands (done, how far through, or shut
 * with its chapter count and what opens it). Done or begun sections open on a press; a shut one stays shut, offering the
 * test that jumps into it where there is one (`onJump`).
 */
export function SectionCard({ section, here, onOpen, onJump }: { section: Section; here: boolean; onOpen: () => void; onJump?: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const n = (v: number): string => new Intl.NumberFormat(locale).format(v);
  const level = levelWords(section.level);
  const number = t('coursemap.section', { n: n(section.number) });
  const count = section.units.length === 1 ? t('coursemap.sectionUnitsOne') : t('coursemap.sectionUnits', { count: n(section.units.length) });
  const status =
    section.state === 'done'
      ? t('coursemap.sectionDone')
      : section.state === 'locked'
        ? count
        : t('coursemap.sectionProgress', { done: n(section.unitsDone), total: n(section.units.length) });
  const after = section.state === 'locked' && section.number > 1 ? t('coursemap.sectionOpensAfter', { n: n(section.number - 1) }) : null;
  // The whole card in one label, its parts separated, for screen readers.
  const label = [number, level ? t(level.name) : null, level ? t(level.hint) : null, here ? t('coursemap.state.current') : null, status, section.state === 'done' ? count : null, after]
    .filter(Boolean)
    .join(', ');
  const badge = (
    <span className={`lp-scard-badge is-${section.state}`} aria-hidden="true">
      {section.state === 'done' ? <CheckIcon size={22} weight="bold" /> : section.state === 'locked' ? <LockIcon size={20} /> : n(section.number)}
    </span>
  );
  const words = (
    <span className="lp-scard-words">
      <span className="lp-scard-eyebrow">{number}</span>
      {level && <span className="lp-scard-title">{t(level.name)}</span>}
      {level && <span className="lp-scard-line">{t(level.hint)}</span>}
      <span className={`lp-scard-line${here ? ' is-here' : ''}`}>{here ? `${t('coursemap.state.current')} · ${status}` : status}</span>
      {section.state === 'done' && <span className="lp-scard-line">{count}</span>}
      {after && <span className="lp-scard-line">{after}</span>}
    </span>
  );
  if (section.state === 'locked') {
    return (
      <div className="lp-scard is-locked" data-section={section.key} data-testid={`lp-section-${section.number}`}>
        {badge}
        {words}
        {onJump && (
          <Button
            variant="secondary"
            size="sm"
            className="lp-scard-jump"
            aria-label={t('coursemap.jump.label', { n: n(section.jumpTo?.number ?? section.units[0]!.number) })}
            aria-haspopup="dialog"
            onClick={onJump}
          >
            <NextIcon size={16} />
            {t('coursemap.jump.bubble')}
          </Button>
        )}
      </div>
    );
  }
  return (
    <button type="button" className={`lp-scard is-${section.state}`} data-section={section.key} data-testid={`lp-section-${section.number}`} aria-label={label} onClick={onOpen}>
      {badge}
      {words}
      <span className="lp-scard-chevron" aria-hidden="true" />
    </button>
  );
}
