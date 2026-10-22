import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  DEFAULT_FEED_PERIOD,
  DEFAULT_FEED_SORT,
  FEED_PERIODS,
  FEED_SORTS,
  sortRanks,
  type FeedPeriod,
  type FeedSort,
} from '@kurda/shared';
import { Button } from '../components/Button';
import { CheckIcon, CloseIcon, FeedFilterIcon, SortIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { keepInView } from '../reports/keepInView';
import { SECTIONS, type FeedSection } from './postKinds';

/** How the wall is shown: in what order, from how far back, and which of it. */
export interface FeedFilterValue {
  section: FeedSection;
  kind: string | null;
  sort: FeedSort;
  period: FeedPeriod;
}

/** The wall as it opens: everything, newest first. */
export const DEFAULT_FILTER: FeedFilterValue = { section: 'all', kind: null, sort: DEFAULT_FEED_SORT, period: DEFAULT_FEED_PERIOD };

type T = ReturnType<typeof useT>;

/** "All writing", "All pictures": a half chosen whole, as it reads in the list. */
const ALL_OF: Partial<Record<FeedSection, MessageKey>> = { gotin: 'civak.filter.allWriting', dimen: 'civak.filter.allPictures' };

const SORT_LABEL: Record<FeedSort, MessageKey> = {
  newest: 'feed.sort.newest',
  oldest: 'feed.sort.oldest',
  popular: 'feed.sort.popular',
  discussed: 'feed.sort.discussed',
};
const SORT_HINT: Partial<Record<FeedSort, MessageKey>> = { popular: 'feed.sort.popularHint', discussed: 'feed.sort.discussedHint' };
const PERIOD_LABEL: Record<FeedPeriod, MessageKey> = {
  day: 'feed.period.day',
  week: 'feed.period.week',
  month: 'feed.period.month',
  year: 'feed.period.year',
  all: 'feed.period.all',
};

/** A range only belongs to the two ranked orders; newest and oldest always read everything. */
export function normalised(value: FeedFilterValue): FeedFilterValue {
  return sortRanks(value.sort) ? value : { ...value, period: DEFAULT_FEED_PERIOD };
}

export function isDefaultFilter(value: FeedFilterValue): boolean {
  const v = normalised(value);
  return v.section === 'all' && v.kind === null && v.sort === DEFAULT_FEED_SORT && v.period === DEFAULT_FEED_PERIOD;
}

const same = (a: FeedFilterValue, b: FeedFilterValue): boolean => {
  const x = normalised(a);
  const y = normalised(b);
  return x.section === y.section && x.kind === y.kind && x.sort === y.sort && x.period === y.period;
};

/** What the wall is narrowed to, in words — "Pictures · Meme" — or null while it shows everything. */
export function filterLabel(t: T, value: Pick<FeedFilterValue, 'section' | 'kind'>): string | null {
  if (value.section === 'all') return null;
  const section = SECTIONS.find((s) => s.key === value.section);
  if (!section) return null;
  const kind = value.kind ? section.kinds.find((k) => k.key === value.kind) : null;
  return kind ? `${t(section.labelKey)} · ${t(kind.labelKey)}` : t(section.labelKey);
}

/** The order and its range, in words — "Most popular · This week" — or null for the newest first. */
export function sortLabel(t: T, value: Pick<FeedFilterValue, 'sort' | 'period'>): string | null {
  if (value.sort === DEFAULT_FEED_SORT) return null;
  const ranged = sortRanks(value.sort) && value.period !== DEFAULT_FEED_PERIOD;
  return ranged ? `${t(SORT_LABEL[value.sort])} · ${t(PERIOD_LABEL[value.period])}` : t(SORT_LABEL[value.sort]);
}

/** Everything that differs from the plain wall, for the button's name: "Most popular, This week, Pictures · Meme". */
function activeParts(t: T, value: FeedFilterValue): string[] {
  const v = normalised(value);
  const parts: string[] = [];
  if (v.sort !== DEFAULT_FEED_SORT) parts.push(t(SORT_LABEL[v.sort]));
  if (sortRanks(v.sort) && v.period !== DEFAULT_FEED_PERIOD) parts.push(t(PERIOD_LABEL[v.period]));
  const kind = filterLabel(t, v);
  if (kind) parts.push(kind);
  return parts;
}

/**
 * The wall's sort and filter: a funnel beside the Post button, and behind it
 * one panel with everything about how the wall is shown — in what order
 * (newest, oldest, most popular, most discussed), from how far back for the
 * two that rank, and which kinds of post.
 *
 * Choices in the panel are a draft: nothing on the wall moves until "Show
 * posts", and ✕, Escape or a press outside leave it as it was. "Reset" puts
 * the draft back to the plain wall. While anything differs from the plain
 * wall the funnel is filled and a chip under the heading says what — one for
 * the order, one for the kinds — each opening the panel again and each with a
 * ✕ that undoes just that part.
 *
 * On a wide screen the panel drops from the funnel; on a phone it rises from
 * the bottom edge as a sheet. It is a modal dialog either way: the keyboard
 * stays inside it, each list of choices is a radio group the arrow keys move
 * through, and closing it puts the keyboard back where it came from.
 */
export function FeedFilter({ value, onChange }: { value: FeedFilterValue; onChange: (next: FeedFilterValue) => void }): React.JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FeedFilterValue>(value);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sortChipRef = useRef<HTMLButtonElement>(null);
  const kindChipRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // what opened the panel, so the keyboard goes back there when it closes
  const opener = useRef<HTMLElement | null>(null);
  const refocus = useRef(false);
  const id = useId();
  const titleId = `${id}-title`;

  const kindText = filterLabel(t, value);
  const sortText = sortLabel(t, normalised(value));
  const parts = activeParts(t, value);
  const filled = parts.length > 0;
  const buttonLabel = filled ? t('feed.sortFilter.buttonOn', { what: parts.join(', ') }) : t('feed.sortFilter.button');

  const show = (from: HTMLElement | null): void => {
    if (open) {
      close(true);
      return;
    }
    opener.current = from;
    setDraft(normalised(value));
    setOpen(true);
  };
  function close(back: boolean): void {
    refocus.current = back;
    setOpen(false);
  }
  const apply = (): void => {
    const next = normalised(draft);
    // the chip that opened it may be about to go, so the funnel is where the keyboard lands
    opener.current = null;
    close(true);
    if (!same(next, value)) onChange(next);
  };
  const undo = (part: Partial<FeedFilterValue>): void => {
    opener.current = null;
    refocus.current = true;
    onChange(normalised({ ...value, ...part }));
  };

  // after the render that closed the panel or cleared a part: the chip may be gone by then
  useEffect(() => {
    if (open || !refocus.current) return;
    refocus.current = false;
    (opener.current?.isConnected ? opener.current : buttonRef.current)?.focus();
  });

  // as a popover beside a narrow window's edge the panel is nudged back inside; as a sheet it is already
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (open && panel && getComputedStyle(panel).position !== 'fixed') keepInView(panel);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // the keyboard starts on the order chosen now, the first thing in the panel
    panelRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close(true);
    };
    // a press anywhere else closes it, the scrim behind the sheet included; the funnel and the chips toggle it themselves
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      for (const el of [panelRef.current, buttonRef.current, sortChipRef.current, kindChipRef.current]) if (el?.contains(target)) return;
      close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  /** The keyboard stays in the panel: Tab from the last control comes round to the first, and back. */
  const trap = (e: React.KeyboardEvent): void => {
    if (e.key !== 'Tab') return;
    const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"])') ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const ranks = sortRanks(draft.sort);
  const isKind = (section: FeedSection, kind: string | null): boolean => draft.section === section && draft.kind === kind;
  const pick = (section: FeedSection, kind: string | null) => (): void => setDraft((d) => ({ ...d, section, kind }));

  return (
    <>
      {(sortText || kindText) && (
        <span className="ffilter-chips">
          {sortText && (
            <Chip
              ref={sortChipRef}
              icon={<SortIcon size={15} />}
              label={sortText}
              open={open}
              panelId={id}
              clearLabel={t('feed.sort.clear')}
              onOpen={() => show(sortChipRef.current)}
              onClear={() => undo({ sort: DEFAULT_FEED_SORT, period: DEFAULT_FEED_PERIOD })}
            />
          )}
          {kindText && (
            <Chip
              ref={kindChipRef}
              icon={<FeedFilterIcon size={15} weight="fill" />}
              label={kindText}
              open={open}
              panelId={id}
              clearLabel={t('civak.filter.clear')}
              onOpen={() => show(kindChipRef.current)}
              onClear={() => undo({ section: 'all', kind: null })}
            />
          )}
        </span>
      )}

      <span className={`ffilter${open ? ' is-open' : ''}`}>
        <button
          ref={buttonRef}
          type="button"
          className={`ffilter-btn${filled ? ' is-on' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-label={buttonLabel}
          title={buttonLabel}
          onClick={() => show(buttonRef.current)}
        >
          <FeedFilterIcon size={20} weight={filled ? 'fill' : 'regular'} />
        </button>

        {open && (
          <>
            {/* behind the sheet on a phone; nothing on a wider screen, where the panel is a popover */}
            <span className="ffilter-scrim" aria-hidden="true" />
            <div className="ffilter-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} id={id} ref={panelRef} onKeyDown={trap}>
              <span className="ffilter-grip" aria-hidden="true" />
              <div className="ffilter-head">
                <h2 id={titleId} className="ffilter-title">
                  {t('feed.sortFilter.title')}
                </h2>
                <button type="button" className="ffilter-close" aria-label={t('common.close')} title={t('common.close')} onClick={() => close(true)}>
                  <CloseIcon size={18} />
                </button>
              </div>

              <div className="ffilter-body">
                <Section title={t('feed.sort.title')} id={`${id}-sort`}>
                  <Radios label={`${id}-sort`} axis="vertical">
                    {FEED_SORTS.map((s) => (
                      <Option
                        key={s}
                        on={draft.sort === s}
                        label={t(SORT_LABEL[s])}
                        hint={SORT_HINT[s] ? t(SORT_HINT[s]!) : undefined}
                        onChoose={() => setDraft((d) => ({ ...d, sort: s }))}
                      />
                    ))}
                  </Radios>
                </Section>

                {ranks && (
                  <Section title={t('feed.period.title')} id={`${id}-period`}>
                    <Radios label={`${id}-period`} axis="horizontal" className="ffilter-periods">
                      {FEED_PERIODS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          role="radio"
                          aria-checked={draft.period === p}
                          tabIndex={draft.period === p ? 0 : -1}
                          className={`ffilter-period${draft.period === p ? ' is-on' : ''}`}
                          onClick={() => setDraft((d) => ({ ...d, period: p }))}
                        >
                          {t(PERIOD_LABEL[p])}
                        </button>
                      ))}
                    </Radios>
                  </Section>
                )}

                <Section title={t('civak.filter.title')} id={`${id}-show`}>
                  <Radios label={`${id}-show`} axis="vertical">
                    <Option on={isKind('all', null)} label={t('civak.filter.everything')} onChoose={pick('all', null)} />
                    {SECTIONS.filter((x) => x.key !== 'all').map((s) => (
                      <div key={s.key} className="ffilter-group" role="group" aria-labelledby={`${id}-${s.key}`}>
                        <span id={`${id}-${s.key}`} className="ffilter-heading">
                          {t(s.labelKey)}
                        </span>
                        <Option on={isKind(s.key, null)} label={t(ALL_OF[s.key] ?? s.labelKey)} onChoose={pick(s.key, null)} />
                        {s.kinds.map((k) => (
                          <Option key={k.key} on={isKind(s.key, k.key)} label={t(k.labelKey)} onChoose={pick(s.key, k.key)} />
                        ))}
                      </div>
                    ))}
                  </Radios>
                </Section>
              </div>

              <div className="ffilter-foot">
                <Button type="button" variant="ghost" size="sm" disabled={isDefaultFilter(draft)} onClick={() => setDraft(DEFAULT_FILTER)}>
                  {t('feed.sortFilter.reset')}
                </Button>
                <Button type="button" onClick={apply}>
                  {t('feed.sortFilter.apply')}
                </Button>
              </div>
            </div>
          </>
        )}
      </span>
    </>
  );
}

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="ffilter-section">
      <h3 id={id} className="ffilter-section-title">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * A radio group the arrow keys move through, choosing as they go — down and
 * up in a list; along the row, the way the page reads, in a row of chips.
 * Only the chosen one is a Tab stop, so Tab goes from group to group.
 */
function Radios({
  label,
  axis,
  className,
  children,
}: {
  label: string;
  axis: 'vertical' | 'horizontal';
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent): void => {
    const radios = [...(ref.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])];
    const at = radios.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const rtl = getComputedStyle(ref.current!).direction === 'rtl';
    const forward = axis === 'vertical' ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = axis === 'vertical' ? 'ArrowUp' : rtl ? 'ArrowRight' : 'ArrowLeft';
    const to: Partial<Record<string, number>> = { [forward]: at + 1, [back]: at - 1, Home: 0, End: radios.length - 1 };
    // a list also answers left and right, and a row up and down, the same way
    if (axis === 'vertical') Object.assign(to, { ArrowRight: rtl ? at - 1 : at + 1, ArrowLeft: rtl ? at + 1 : at - 1 });
    else Object.assign(to, { ArrowDown: at + 1, ArrowUp: at - 1 });
    const next = to[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const target = radios[(next + radios.length) % radios.length];
    target?.focus();
    target?.click();
  };
  return (
    <div ref={ref} role="radiogroup" aria-labelledby={label} className={`ffilter-radios is-${axis}${className ? ` ${className}` : ''}`} onKeyDown={onKey}>
      {children}
    </div>
  );
}

/** One choice in a list: its name, and a line under it saying what it means where that is not obvious. */
function Option({ on, label, hint, onChoose }: { on: boolean; label: string; hint?: string; onChoose: () => void }): React.JSX.Element {
  const hintId = useId();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={hint ? label : undefined}
      aria-describedby={hint ? hintId : undefined}
      tabIndex={on ? 0 : -1}
      className={`ffilter-item${on ? ' is-on' : ''}`}
      onClick={onChoose}
    >
      <span className="ffilter-item-text">
        <span>{label}</span>
        {hint && (
          <span id={hintId} className="ffilter-item-hint">
            {hint}
          </span>
        )}
      </span>
      {on && <CheckIcon size={18} />}
    </button>
  );
}

/** A part of how the wall is shown, while it differs from the plain wall: opens the panel, and its ✕ undoes just that part. */
function Chip({
  ref,
  icon,
  label,
  open,
  panelId,
  clearLabel,
  onOpen,
  onClear,
}: {
  ref: React.Ref<HTMLButtonElement>;
  icon: React.ReactNode;
  label: string;
  open: boolean;
  panelId: string;
  clearLabel: string;
  onOpen: () => void;
  onClear: () => void;
}): React.JSX.Element {
  return (
    <span className="ffilter-chip">
      <button
        ref={ref}
        type="button"
        className="ffilter-chip-main"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onOpen}
      >
        {icon}
        <span className="ffilter-chip-text">{label}</span>
      </button>
      <button type="button" className="ffilter-chip-clear" aria-label={clearLabel} title={clearLabel} onClick={onClear}>
        <CloseIcon size={14} weight="bold" />
      </button>
    </span>
  );
}
