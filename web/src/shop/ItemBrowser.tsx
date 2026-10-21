import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ITEM_SORTS, type ItemCategory, type ItemSort } from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { SearchIcon, SortIcon } from '../components/icons';
import './items.css';

/**
 * The pieces the Shop, the inventory (Edit Profile) and the chat's gift picker
 * all browse items with, so that the three read as one system: the same kinds
 * on the same tabs in the same order, with counts; the same search, the same
 * orders to sort by; the same line saying how many there are and the same way
 * back to everything.
 *
 * What is shown, and in which order, is decided by `@kurda/shared`
 * (shop-items.ts), the rules the phone's screens are written against too, so
 * a search or an order means the same thing on both. Only the words and the
 * drawing are here.
 */

export type KindTab = ItemCategory | 'all';

/** What a kind is called: on its tab, over its section, in a count. */
export const KIND_LABEL: Readonly<Record<KindTab, MessageKey>> = {
  all: 'items.kind.all',
  background: 'items.kind.background',
  icon: 'items.kind.icon',
  frame: 'items.kind.frame',
  tag: 'items.kind.tag',
  other: 'items.kind.other',
};

const SORT_LABEL: Readonly<Record<ItemSort, MessageKey>> = {
  featured: 'items.sort.featured',
  'price-asc': 'items.sort.priceAsc',
  'price-desc': 'items.sort.priceDesc',
  name: 'items.sort.name',
};

/** How far the tab row's end fades (shop/items.css), and the room at its start. */
const FADE = 40;
const EDGE = 4;

/** A prefix usable in an id attribute (React's ids carry colons). */
export function useIdPrefix(name: string): string {
  return `${name}${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/** The ids that tie a tab list to the one panel it controls. */
export const tabId = (prefix: string, kind: KindTab): string => `${prefix}-tab-${kind}`;
export const panelId = (prefix: string): string => `${prefix}-panel`;

/** A number as the reader's language writes it. */
export function useCountFormat(): (n: number) => string {
  const locale = useLocale();
  return (n) => n.toLocaleString(locale);
}

/**
 * The kinds, as tabs, each with how many it holds.
 *
 * Real tabs (tablist / tab / aria-selected): one stop in the Tab order, the
 * arrow keys move between them (mirrored on a right-to-left page, where the
 * next kind is to the left) and choosing is moving, as the pattern has it;
 * Home and End go to either end. The row scrolls sideways on a phone rather
 * than squeezing a label, and the chosen tab is always scrolled into full view.
 */
export function KindTabs({
  kinds,
  value,
  counts,
  onChange,
  idPrefix,
}: {
  /** the tabs, in order — 'all' first when there is one */
  kinds: readonly KindTab[];
  value: KindTab;
  counts: Readonly<Partial<Record<KindTab, number>>>;
  onChange: (kind: KindTab) => void;
  idPrefix: string;
}): React.JSX.Element {
  const t = useT();
  const fmt = useCountFormat();
  const refs = useRef(new Map<KindTab, HTMLButtonElement>());
  const strip = useRef<HTMLDivElement>(null);

  // the chosen tab in full view, clear of the fade at the row's end — sideways
  // only, so choosing a tab never scrolls the page
  useEffect(() => {
    const row = strip.current;
    const tab = refs.current.get(value);
    if (!row || !tab || row.scrollWidth <= row.clientWidth) return;
    const rtl = row.closest('[dir]')?.getAttribute('dir') === 'rtl';
    const box = row.getBoundingClientRect();
    const at = tab.getBoundingClientRect();
    const [fadeLeft, fadeRight] = rtl ? [FADE, EDGE] : [EDGE, FADE];
    if (at.left < box.left + fadeLeft) row.scrollBy({ left: at.left - (box.left + fadeLeft) });
    else if (at.right > box.right - fadeRight) row.scrollBy({ left: at.right - (box.right - fadeRight) });
  }, [value]);

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number): void {
    // the page's direction is its `dir` (I18nProvider sets it on <html> for Arabic and Soranî)
    const rtl = e.currentTarget.closest('[dir]')?.getAttribute('dir') === 'rtl';
    let next: number;
    if (e.key === 'ArrowRight') next = rtl ? index - 1 : index + 1;
    else if (e.key === 'ArrowLeft') next = rtl ? index + 1 : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = kinds.length - 1;
    else return;
    e.preventDefault();
    const kind = kinds[(next + kinds.length) % kinds.length]!;
    refs.current.get(kind)?.focus();
    onChange(kind);
  }

  return (
    <div className="item-tabs" role="tablist" aria-label={t('items.kinds')} ref={strip}>
      {kinds.map((kind, i) => {
        const selected = kind === value;
        return (
          <button
            key={kind}
            ref={(el) => {
              if (el) refs.current.set(kind, el);
              else refs.current.delete(kind);
            }}
            type="button"
            role="tab"
            id={tabId(idPrefix, kind)}
            aria-selected={selected}
            aria-controls={panelId(idPrefix)}
            tabIndex={selected ? 0 : -1}
            className={`item-tab${selected ? ' is-active' : ''}`}
            onClick={() => onChange(kind)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className="item-tab-label">{t(KIND_LABEL[kind])}</span>
            <span className="item-tab-count">{fmt(counts[kind] ?? 0)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The one panel the kind tabs control: whatever the chosen kind shows. */
export function KindPanel({
  idPrefix,
  kind,
  children,
  className,
}: {
  idPrefix: string;
  kind: KindTab;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div role="tabpanel" id={panelId(idPrefix)} aria-labelledby={tabId(idPrefix, kind)} className={className}>
      {children}
    </div>
  );
}

/** A search over names and descriptions. Its label says what it searches; the glass says it is a search. */
export function ItemSearch({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder: string;
}): React.JSX.Element {
  return (
    <div className="item-search">
      <SearchIcon size={17} className="item-search-glass" />
      <input
        type="search"
        className="input item-search-input"
        value={value}
        maxLength={80}
        placeholder={placeholder}
        aria-label={label}
        // a search box should not try to correct the Kurdish typed into it
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** The order to show things in: a real select, labelled where it is seen. */
export function ItemSort({ value, onChange }: { value: ItemSort; onChange: (next: ItemSort) => void }): React.JSX.Element {
  const t = useT();
  const id = useIdPrefix('item-sort');
  return (
    <div className="item-sort">
      {/* the word on a wide screen; on a phone the arrows stand for it, and
          the word stays the select's name for a screen reader */}
      <label className="item-sort-label" htmlFor={id}>
        <SortIcon size={17} className="item-sort-glyph" />
        <span className="item-sort-word">{t('items.sort')}</span>
      </label>
      <select id={id} className="input item-sort-select" value={value} onChange={(e) => onChange(e.target.value as ItemSort)}>
        {ITEM_SORTS.map((s) => (
          <option key={s} value={s}>
            {t(SORT_LABEL[s])}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A narrowing that is on or off ("Within my balance"): a checkbox, as it always was. */
export function FilterToggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <label className="item-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** One choice of a few, drawn as a segmented control over real radios (the arrow keys move it). */
export function SegmentedChoice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
}): React.JSX.Element {
  const name = useIdPrefix('item-choice');
  return (
    <fieldset className="seg item-seg">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <label key={o.value} className={`seg-btn${o.value === value ? ' is-active' : ''}`}>
          <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** The toolbar the search, the order and the toggles sit in, wrapping on a phone. */
export function ItemToolbar({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="item-toolbar">{children}</div>;
}

/**
 * How many there are, said politely when it changes, and the way back to
 * everything once anything has been narrowed. The line keeps its height
 * whether or not the button is there, so nothing below it moves.
 */
export function ResultsLine({
  count,
  filtered,
  onClear,
}: {
  count: number;
  /** anything narrowed: offer "Clear filters" */
  filtered: boolean;
  onClear: () => void;
}): React.JSX.Element {
  const t = useT();
  const fmt = useCountFormat();
  return (
    <div className="item-results">
      <p className="item-results-count" role="status" aria-live="polite">
        {count === 1 ? t('items.countOne') : t('items.count', { count: fmt(count) })}
      </p>
      {filtered && (
        <button type="button" className="btn btn-ghost item-clear" onClick={onClear}>
          {t('items.clearFilters')}
        </button>
      )}
    </div>
  );
}

/** Nothing matches: say so where the items would be, with the way out. */
export function NoMatches({ onClear }: { onClear: () => void }): React.JSX.Element {
  const t = useT();
  return (
    <div className="state item-empty">
      <p>{t('items.noMatches')}</p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onClear}>
        {t('items.clearFilters')}
      </button>
    </div>
  );
}

/** A kind's heading over its section, with how many it holds, when everything is shown at once. */
export function KindHeading({
  kind,
  count,
  id,
  level = 2,
}: {
  kind: KindTab;
  count: number;
  id?: string;
  level?: 2 | 3;
}): React.JSX.Element {
  const t = useT();
  const fmt = useCountFormat();
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <Heading className="item-section-title" id={id}>
      <span>{t(KIND_LABEL[kind])}</span>
      <span className="item-section-count">{fmt(count)}</span>
    </Heading>
  );
}
