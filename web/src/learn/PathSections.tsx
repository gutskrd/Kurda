import { useEffect, useState } from 'react';
import { levelHintKey, levelNameKey, levelOfCefr, type PathSection, type PathUnit } from '@kurda/shared';
import { BookIcon, CheckIcon, FlagIcon, LockIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import type { SkillNode } from './types';

/**
 * The website's lesson path a section at a time (learn/CoursePath.tsx): the
 * heading pinned over the open section, the quiet divider between two of its
 * units, and the card each section that is not open is folded into. The
 * phone draws the same (mobile coursemap/LessonPath.tsx), from the same
 * sections (@kurda/shared `lessonPath`).
 */

type Unit = PathUnit<SkillNode>;
type Section = PathSection<SkillNode>;

/**
 * What a section's level is called, and what it is like: the app's own plain
 * names for its levels, the ones the stories use (shared `levelNameKey`), so a
 * learner meets one ladder everywhere and never a bare CEFR letter. Null for a
 * section without a level, or with one past the ladder.
 */
export function levelWords(level: string | null): { name: MessageKey; hint: MessageKey } | null {
  const at = level ? levelOfCefr(level) : null;
  return at ? { name: levelNameKey(at), hint: levelHintKey(at) } : null;
}

/**
 * Which of the open section's units is at the top of the window, under the
 * pinned heading: the last whose top has gone up past the heading's foot.
 * Followed as the page scrolls, at most once a frame.
 */
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
 * The open section's heading, pinned to the top of the window under the bar
 * as its units are scrolled through: "Section 1 · Chapter 2" over the name of
 * the unit at the top, in that unit's colour, with its guide (the grammar
 * notes) as a book on the far side and, where the page has no room for the
 * rail of units beside the path, the flag that opens it. A course of one
 * section is not named. It says what the eye sees; each unit's own heading is
 * in the page's order for a screen reader (`UnitDivider`, and the first
 * unit's, read but not shown).
 */
export function UnitPin({
  unit,
  section,
  onGuide,
  onRail,
}: {
  unit: Unit;
  /** the section's number, or null when the course has one */
  section: number | null;
  onGuide?: () => void;
  onRail: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const n = (v: number): string => new Intl.NumberFormat(locale).format(v);
  return (
    <div className={`lp-pin lp-tone-${unit.tone}`} data-testid="lp-pin">
      <div className="lp-pin-words">
        <p className="lp-pin-eyebrow">{section !== null ? t('coursemap.sectionUnit', { section: n(section), unit: n(unit.number) }) : t('coursemap.unit', { n: n(unit.number) })}</p>
        <p className="lp-pin-title">{unit.title}</p>
      </div>
      {onGuide && (
        <button type="button" className="lp-pin-button" aria-label={t('coursemap.guideFor', { unit: unit.title })} onClick={onGuide}>
          <BookIcon size={20} />
        </button>
      )}
      {/* the rail of units, where the page has no room for it beside the path */}
      <button type="button" className="lp-pin-button lp-unit-rail" aria-label={t('learn.openMap')} onClick={onRail}>
        <FlagIcon size={20} />
      </button>
    </div>
  );
}

/**
 * Between one unit and the next, a quiet line with the next unit's number and
 * name between two hairlines: its heading, so a long path reads in chapters.
 * The name wraps rather than being cut.
 */
export function UnitDivider({ unit, id }: { unit: Unit; id: string }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const chapter = t('coursemap.unit', { n: new Intl.NumberFormat(locale).format(unit.number) });
  return (
    // said as one, as the unit's pinned heading says it: "Chapter 2, Family"
    <h2 className="lp-divider" id={id} aria-label={`${chapter}, ${unit.title}`}>
      <span className="lp-divider-eyebrow">{chapter}</span>
      <span className="lp-divider-title">{unit.title}</span>
    </h2>
  );
}

/**
 * A section that is not open, as one card: its number, its level by the
 * app's own name for it with a line saying what that is like, and where it
 * stands — done, how far the learner is through it, or, shut, how many
 * chapters wait in it and what opens it. A section done or begun opens when
 * pressed; a shut one stays shut.
 */
export function SectionCard({ section, here, onOpen }: { section: Section; here: boolean; onOpen: () => void }): React.JSX.Element {
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
  // the whole card in one breath, its parts apart: what a screen reader says for it
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
