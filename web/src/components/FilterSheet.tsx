/**
 * Sort and filter, as one panel behind a funnel: the pieces the community
 * wall (feed/FeedFilter.tsx) and the stories library (stories/LibraryFilter.tsx)
 * are both built from, so the two look and work the same.
 *
 * - `useFilterSheet` holds whether the panel is open and the draft in it.
 *   Choices in the panel are a draft: nothing behind it changes until the
 *   apply button, and ✕, Escape or a press outside leave things as they were.
 * - `FilterSheet` is the funnel and the panel. On a wide screen the panel
 *   drops from the funnel; on a phone it rises from the bottom edge as a sheet.
 *   It is a modal dialog either way: the keyboard starts on the first choice
 *   made, stays inside the panel, and goes back where it came from when the
 *   panel closes.
 * - `FilterSection`, `FilterRadios`, `FilterOption`, `FilterPill` and
 *   `FilterToggle` are what goes in it: a titled group, a radio group the arrow
 *   keys move through, a row with a tick and a line of hint, a chip in a row,
 *   and an on-and-off switch.
 * - `FilterChip` says what is on while something is: it opens the panel again,
 *   and its ✕ undoes just that part.
 *
 * How it looks is in styles/filter.css.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { CloseButton } from './CloseButton';
import { CheckIcon, CloseIcon, FunnelIcon } from './icons';
import { useT } from '../i18n/I18nProvider';
import { keepInView } from '../reports/keepInView';

/** What a sheet's parts share: whether it is open, the draft, and the ways to open, close and apply it. */
export interface FilterSheetControl<V> {
  /** the panel's id, which the funnel and the chips point at while it is open */
  id: string;
  open: boolean;
  draft: V;
  setDraft: (next: V | ((d: V) => V)) => void;
  /** opens the panel on what is shown now, remembering where from; pressed again while open, closes it */
  show: (from: HTMLElement | null) => void;
  /** closes it; `back` puts the keyboard back where the panel was opened from */
  close: (back: boolean) => void;
  /** closes it and hands on the draft, when it differs from what is shown */
  apply: () => void;
  /** changes what is shown at once, without the panel: a chip's ✕ */
  undo: (next: V) => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * The state of one sort and filter panel over `value`. `normalise` says the
 * same choice once (a range only where it means something), and `same` says
 * whether two values show the same thing, so applying an unchanged draft asks
 * for nothing.
 */
export function useFilterSheet<V>({
  value,
  onChange,
  normalise = (v) => v,
  same = (a, b) => JSON.stringify(a) === JSON.stringify(b),
}: {
  value: V;
  onChange: (next: V) => void;
  normalise?: (v: V) => V;
  same?: (a: V, b: V) => boolean;
}): FilterSheetControl<V> {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<V>(value);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // what opened the panel, so the keyboard goes back there when it closes
  const opener = useRef<HTMLElement | null>(null);
  const refocus = useRef(false);
  const id = useId();

  const close = useCallback((back: boolean): void => {
    refocus.current = back;
    setOpen(false);
  }, []);
  const show = (from: HTMLElement | null): void => {
    if (open) {
      close(true);
      return;
    }
    opener.current = from;
    setDraft(normalise(value));
    setOpen(true);
  };
  const apply = (): void => {
    const next = normalise(draft);
    // the chip that opened it may be about to go, so the funnel is where the keyboard lands
    opener.current = null;
    close(true);
    if (!same(next, normalise(value))) onChange(next);
  };
  const undo = (next: V): void => {
    opener.current = null;
    refocus.current = true;
    onChange(normalise(next));
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
    // the keyboard starts on the first choice made, the first thing in the panel
    panelRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close(true);
    };
    // a press anywhere else closes it, the scrim behind the sheet included; the funnel and the chips toggle it themselves
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Element | null;
      if (!target || panelRef.current?.contains(target)) return;
      if (target.closest?.(`[data-filter-for="${id}"]`)) return;
      close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, id, close]);

  return { id, open, draft, setDraft, show, close, apply, undo, buttonRef, panelRef };
}

/**
 * The funnel and, while it is open, the panel: a head with its title and ✕,
 * the choices in a body that scrolls on its own, and a foot that stays put
 * with Reset and the button that shows what was chosen.
 */
export function FilterSheet<V>({
  control,
  label,
  filled,
  title,
  resetLabel,
  resetDisabled,
  onReset,
  applyLabel,
  className,
  children,
}: {
  control: FilterSheetControl<V>;
  /** the funnel's name, saying what is on when something is */
  label: string;
  /** whether anything differs from the plain view: the funnel is filled in */
  filled: boolean;
  title: string;
  resetLabel: string;
  resetDisabled: boolean;
  onReset: () => void;
  applyLabel: string;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const t = useT();
  const { id, open, buttonRef, panelRef } = control;
  const titleId = `${id}-title`;

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

  return (
    <span className={`ffilter${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        className={`ffilter-btn${filled ? ' is-on' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        title={label}
        data-filter-for={id}
        onClick={() => control.show(buttonRef.current)}
      >
        <FunnelIcon size={20} weight={filled ? 'fill' : 'regular'} />
      </button>

      {open && (
        <>
          {/* behind the sheet on a phone; nothing on a wider screen, where the panel is a popover */}
          <span className="ffilter-scrim" aria-hidden="true" />
          <div className="ffilter-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} id={id} ref={panelRef} onKeyDown={trap}>
            <div className="ffilter-head">
              <h2 id={titleId} className="ffilter-title">
                {title}
              </h2>
              <CloseButton className="is-inline" label={t('common.close')} onClick={() => control.close(true)} />
            </div>

            <div className="ffilter-body">{children}</div>

            <div className="ffilter-foot">
              <Button type="button" variant="ghost" size="sm" disabled={resetDisabled} onClick={onReset}>
                {resetLabel}
              </Button>
              <Button type="button" onClick={control.apply}>
                {applyLabel}
              </Button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}

/** One group of choices in the panel, under its title where it has one; `id` names the title, for the radio group under it. */
export function FilterSection({ title, id, children }: { title?: string; id?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className={`ffilter-section${title ? '' : ' is-untitled'}`}>
      {title && (
        <h3 id={id} className="ffilter-section-title">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

/**
 * A radio group the arrow keys move through, choosing as they go — down and
 * up in a list; along the row, the way the page reads, in a row of chips.
 * Only the chosen one is a Tab stop, so Tab goes from group to group.
 */
export function FilterRadios({
  label,
  axis,
  className,
  children,
}: {
  /** the id of what names the group, its section's title */
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

/** One choice in a list: its name, a line under it saying what it means where that is not obvious, and a tick when chosen. */
export function FilterOption({ on, label, hint, onChoose }: { on: boolean; label: string; hint?: string; onChoose: () => void }): React.JSX.Element {
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

/** One choice in a row of chips, the chosen one filled in ink; with a count after its word where there is one. */
export function FilterPill({
  on,
  label,
  count,
  countLabel,
  onChoose,
}: {
  on: boolean;
  label: string;
  /** how many there are of it, already written in the reader's numbers */
  count?: string;
  /** the count in words, for the ear: "Stories: 12" */
  countLabel?: string;
  onChoose: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={countLabel ? `${label}, ${countLabel}` : undefined}
      tabIndex={on ? 0 : -1}
      className={`ffilter-period${on ? ' is-on' : ''}`}
      onClick={onChoose}
    >
      {label}
      {count !== undefined && (
        <span className="ffilter-pill-count" aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  );
}

/** A choice that is on or off, as a row with a switch at its end. */
export function FilterToggle({ on, label, hint, onChange }: { on: boolean; label: string; hint?: string; onChange: (on: boolean) => void }): React.JSX.Element {
  const hintId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-describedby={hint ? hintId : undefined}
      className={`ffilter-item ffilter-toggle${on ? ' is-on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span className="ffilter-item-text">
        <span>{label}</span>
        {hint && (
          <span id={hintId} className="ffilter-item-hint">
            {hint}
          </span>
        )}
      </span>
      <span className="ffilter-switch" aria-hidden="true">
        <span />
      </span>
    </button>
  );
}

/** A part of what is shown, while it differs from the plain view: opens the panel, and its ✕ undoes just that part. */
export function FilterChip<V>({
  control,
  icon,
  label,
  clearLabel,
  onClear,
}: {
  control: FilterSheetControl<V>;
  icon?: React.ReactNode;
  label: string;
  clearLabel: string;
  onClear: () => void;
}): React.JSX.Element {
  return (
    <span className="ffilter-chip">
      <button
        type="button"
        className="ffilter-chip-main"
        aria-haspopup="dialog"
        aria-expanded={control.open}
        aria-controls={control.open ? control.id : undefined}
        data-filter-for={control.id}
        onClick={(e) => control.show(e.currentTarget)}
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
