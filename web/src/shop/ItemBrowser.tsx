import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ITEM_SORTS, type ItemCategory, type ItemSort } from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { SortIcon } from '../components/icons';
import { SearchField } from '../components/SearchField';
import './items.css';

/**
 * The parts the Shop, the inventory (Edit Profile) and the chat's gift picker browse items with: kind tabs with
 * counts, search, sort, the results line and the way back to everything. What is shown and in which order comes from
 * `@kurda/shared` (shop-items.ts), as on the phone; only the words and the drawing are here.
 */

export type KindTab = ItemCategory | 'all';

/** What a kind is called on its tab, over its section and in a count. */
const KIND_LABEL: Readonly<Record<KindTab, MessageKey>> = {
  all: 'items.kind.all',
  background: 'items.kind.background',
  icon: 'items.kind.icon',
  frame: 'items.kind.frame',
  tag: 'items.kind.tag',
  sticker: 'items.kind.sticker',
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
const tabId = (prefix: string, kind: KindTab): string => `${prefix}-tab-${kind}`;
const panelId = (prefix: string): string => `${prefix}-panel`;

/** A number as the reader's language writes it. */
function useCountFormat(): (n: number) => string {
  const locale = useLocale();
  return (n) => n.toLocaleString(locale);
}

/**
 * The kinds as tabs with their counts. Real ARIA tabs: one Tab stop, arrow keys move and select (mirrored right to
 * left), Home and End jump to either end. On a phone the row scrolls sideways, keeping the chosen tab in full view.
 */
export function KindTabs({
  kinds,
  value,
  counts,
  onChange,
  idPrefix,
}: {
  /** The tabs in order, 'all' first when there is one. */
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

  // Keep the chosen tab in full view, clear of the end fade, scrolling only sideways so the page never moves.
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
    // The page's direction is its `dir`, which I18nProvider sets on <html>.
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

/** A search over names and descriptions, labelled with what it searches. */
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
    <SearchField
      icon
      className="item-search"
      inputClassName="item-search-input"
      value={value}
      onValueChange={onChange}
      maxLength={80}
      placeholder={placeholder}
      aria-label={label}
      // A search box should not try to correct the Kurdish typed into it.
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
    />
  );
}

/** The order to show things in: a real select, labelled where it is seen. */
export function ItemSort({ value, onChange }: { value: ItemSort; onChange: (next: ItemSort) => void }): React.JSX.Element {
  const t = useT();
  const id = useIdPrefix('item-sort');
  return (
    <div className="item-sort">
      {/* The word on a wide screen; on a phone the arrows replace it, and it stays the select's accessible name. */}
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

/** An on/off narrowing such as "Within my balance", as a checkbox. */
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

/** One choice of a few, as a segmented control over real radios. */
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
          <span className="seg-btn-label">{o.label}</span>
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
 * The result count, announced politely when it changes, with "Clear filters" once anything is narrowed. The line keeps
 * its height either way, so nothing below moves.
 */
export function ResultsLine({
  count,
  filtered,
  onClear,
}: {
  count: number;
  /** Anything is narrowed, so offer "Clear filters". */
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

/** Nothing matches: says so where the items would be, with a way to clear the filters. */
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
