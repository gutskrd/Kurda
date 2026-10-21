/**
 * The admin's table: sortable headings, a row for each state (loading,
 * nothing there, failed) instead of an empty grid, paging, and — on a narrow
 * screen — each row as a card with its fields labelled, so nothing scrolls
 * sideways on a phone. The old tables were 520 px wide at least and scrolled
 * off the side of a phone, with their action buttons last, out of sight.
 *
 * Whether the rows are cards is decided by the table's own box, not the
 * window, so a table in a narrow panel turns into cards too: below a width
 * (640 px, or later for a table with many columns), and at any width where the
 * table would not fit — a long name in one row could make a table wider than
 * its card, which cut off its last column, buttons and all, even on a laptop.
 * A table of numbers read across (a day per row) can instead stay a table
 * that scrolls sideways in its own box, its first column pinned, since thirty
 * days as cards is a very long page. The markup stays a table with its roles
 * spelled out either way, because a table restyled as blocks loses them in
 * some browsers.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Icon } from './icons';
import { EmptyState, ErrorState } from './states';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** sorting by this column: how two rows compare (ascending) */
  sort?: (a: T, b: T) => number;
  align?: 'start' | 'end';
  /**
   * On a phone's card: 'title' heads the card (no label), 'hidden' leaves it
   * off (something the title already says), and by default it is a labelled line.
   */
  card?: 'title' | 'hidden';
  /** the label on the card when the header is not plain text */
  cardLabel?: string;
  className?: string;
}

export type SortState = { key: string; dir: 'asc' | 'desc' };

export interface Paging {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  /** "1–50 of 312" */
  total?: number;
  pageSize?: number;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  caption,
  loading = false,
  error,
  onRetry,
  empty,
  actions,
  defaultSort,
  paging,
  rowClassName,
  what,
  wide = false,
  layout = 'cards',
}: {
  columns: ReadonlyArray<Column<T>>;
  /** null while the first load is running */
  rows: readonly T[] | null;
  rowKey: (row: T) => string;
  /** what the table lists, for screen readers ("Shop items") */
  caption: string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: ReactNode;
  /** the row's buttons, last on a wide screen and at the foot of its card on a phone */
  actions?: (row: T) => ReactNode;
  defaultSort?: SortState;
  paging?: Paging;
  rowClassName?: (row: T) => string | undefined;
  /** for the error's "your role doesn't include …" */
  what?: string;
  /**
   * many columns: cards below 960 px rather than 640, so a tablet never cuts
   * the row off; 'medium' for a few wide ones, cards below 860 px
   */
  wide?: boolean | 'medium';
  /**
   * 'cards' (the default): rows become cards when the table does not fit.
   * 'scroll': it stays a table and scrolls sideways in its own box, the first
   * column pinned — for numbers compared down a column, where cards would
   * stretch thirty short rows into a long page.
   */
  layout?: TableLayout;
}): React.JSX.Element {
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
  const span = columns.length + (actions ? 1 : 0);
  const wrap = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    if (!rows || !sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const by = col.sort;
    const out = [...rows].sort(by);
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [rows, sort, columns]);

  const toggle = (key: string): void =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const labelOf = (c: Column<T>): string | undefined => c.cardLabel ?? (typeof c.header === 'string' ? c.header : undefined);

  let body: ReactNode;
  if (error != null && !(rows && rows.length > 0)) {
    body = (
      <tr role="row" className="table-state">
        <td role="cell" colSpan={span}>
          <ErrorState error={error} onRetry={onRetry} what={what} compact />
        </td>
      </tr>
    );
  } else if (!sorted || (loading && sorted.length === 0)) {
    body = [0, 1, 2].map((i) => (
      <tr role="row" key={`loading-${i}`} className="table-loading" aria-hidden={i > 0 ? true : undefined}>
        <td role="cell" colSpan={span}>
          {i === 0 && <span className="sr-only" role="status">Loading…</span>}
          <div className="skeleton" />
        </td>
      </tr>
    ));
  } else if (sorted.length === 0) {
    body = (
      <tr role="row" className="table-state">
        <td role="cell" colSpan={span}>
          {typeof empty === 'string' || empty === undefined ? <EmptyState title={empty ?? 'Nothing here yet.'} compact /> : empty}
        </td>
      </tr>
    );
  } else {
    body = sorted.map((row) => (
      <tr role="row" key={rowKey(row)} className={rowClassName?.(row)}>
        {columns.map((c) => (
          <td
            role="cell"
            key={c.key}
            data-label={c.card === 'title' ? undefined : labelOf(c)}
            className={[c.card === 'title' ? 'is-card-title' : c.card === 'hidden' ? 'is-card-hidden' : '', c.align === 'end' ? 'is-end' : '', c.className ?? '']
              .filter(Boolean)
              .join(' ') || undefined}
          >
            {/* one box, so a card's label and value sit side by side however many parts the value has */}
            <div className="cell">{c.cell(row)}</div>
          </td>
        ))}
        {actions && (
          <td role="cell" className="is-actions">
            <div className="row-actions">{actions(row)}</div>
          </td>
        )}
      </tr>
    ));
  }

  const fit = useFit(wrap, layout === 'scroll' ? 0 : wide === 'medium' ? 860 : wide ? 960 : 640, [sorted, columns, layout, loading, error]);
  const classes = [
    'table-wrap',
    wide === 'medium' ? 'is-medium' : wide ? 'is-wide' : '',
    layout === 'scroll' ? 'is-scroll' : '',
    fit === 'cards' ? 'is-cards' : fit === 'scrolls' ? 'is-scrolling' : '',
  ];

  return (
    <div ref={wrap} className={classes.filter(Boolean).join(' ')}>
      {error != null && rows && rows.length > 0 && (
        <div className="table-refresh-error">
          <ErrorState error={error} onRetry={onRetry} what={what} compact />
        </div>
      )}
      <table role="table" className={`kit-table${loading && sorted && sorted.length > 0 ? ' is-refreshing' : ''}`} aria-busy={loading || rows === null || undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  role="columnheader"
                  key={c.key}
                  scope="col"
                  aria-sort={c.sort ? (active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                  className={c.align === 'end' ? 'is-end' : undefined}
                >
                  {c.sort ? (
                    <button type="button" className="th-sort" onClick={() => toggle(c.key)}>
                      {c.header}
                      <Icon name={active ? (sort!.dir === 'asc' ? 'chevronUp' : 'chevronDown') : 'sort'} size={14} />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
            {actions && (
              <th role="columnheader" scope="col" className="is-actions">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody role="rowgroup">{body}</tbody>
      </table>
      {paging && paging.pageCount > 1 && <Pagination {...paging} />}
    </div>
  );
}

export type TableLayout = 'cards' | 'scroll';

/** How a table sits in its box: as a table that fits, as cards, or (a 'scroll' table) scrolling sideways. */
type Fit = 'table' | 'cards' | 'scrolls';

/**
 * Measures the table against its box after every render and whenever the box
 * changes width. A table that is cards is laid out as a table for the length
 * of one measurement, inside the same task, so the screen never shows it.
 * `cardsBelow` 0 is a 'scroll' table: never cards, only told whether it scrolls.
 */
function useFit(ref: RefObject<HTMLDivElement | null>, cardsBelow: number, deps: readonly unknown[]): Fit {
  const [fit, setFit] = useState<Fit>('table');

  const measure = (): Fit => {
    const box = ref.current;
    const table = box?.querySelector('table');
    if (!box || !table) return 'table';
    const width = box.clientWidth;
    if (cardsBelow > 0 && width < cardsBelow) return 'cards';
    const cards = box.classList.contains('is-cards');
    if (cards) box.classList.remove('is-cards');
    const over = table.offsetWidth > width + 1;
    if (cards) box.classList.add('is-cards');
    if (!over) return 'table';
    return cardsBelow > 0 ? 'cards' : 'scrolls';
  };
  // read by the observer, which is set up once
  const latest = useRef(measure);
  latest.current = measure;

  // before the first paint, and again whenever what is in the table changes
  useLayoutEffect(() => {
    setFit(measure());
  }, [cardsBelow, ...deps]);

  useEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    let width = box.clientWidth;
    // a new width only: the height changes every time the rows turn into cards and back
    const observer = new ResizeObserver(() => {
      if (box.clientWidth === width) return;
      width = box.clientWidth;
      setFit(latest.current());
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [ref]);

  return fit;
}

export function Pagination({ page, pageCount, onPage, total, pageSize }: Paging): React.JSX.Element {
  const range =
    total !== undefined && pageSize
      ? `${(page * pageSize + 1).toLocaleString()}–${Math.min(total, (page + 1) * pageSize).toLocaleString()} of ${total.toLocaleString()}`
      : `Page ${page + 1} of ${pageCount}`;
  return (
    <nav className="pagination" aria-label="Pages">
      <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 0}>
        <Icon name="arrowLeft" size={16} />
        Previous
      </button>
      <span className="pagination-at" aria-live="polite">
        {range}
      </span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pageCount - 1}>
        Next
        <Icon name="arrowRight" size={16} />
      </button>
    </nav>
  );
}
