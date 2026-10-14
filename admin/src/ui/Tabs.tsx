/**
 * Tabs: one row of choices, one chosen. Arrow keys move along the row and
 * choose (Home and End jump to the ends); Tab leaves it — the keyboard pattern
 * every tab list on the web uses. A tab with an `href` is a link, so a tab
 * that has an address of its own (#/audio/lessons) can be opened in a new tab
 * or bookmarked.
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  /** a count beside the label: "Still to record (12)" */
  count?: number;
  href?: string;
}

export function Tabs<K extends string>({
  items,
  value,
  onChange,
  label,
  idBase,
  className,
}: {
  items: ReadonlyArray<TabItem<K>>;
  value: K;
  onChange?: (key: K) => void;
  /** what the row chooses, for screen readers: "Status", "Show" */
  label: string;
  /** with a panel, `${idBase}-panel` labels it and the tabs control it */
  idBase?: string;
  className?: string;
}): React.JSX.Element {
  const refs = useRef(new Map<K, HTMLElement>());

  const move = (e: KeyboardEvent, at: number): void => {
    const last = items.length - 1;
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (at + 1) % items.length
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (at - 1 + items.length) % items.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1;
    if (to < 0) return;
    e.preventDefault();
    const next = items[to]!;
    refs.current.get(next.key)?.focus();
    if (next.href) location.hash = next.href.replace(/^#/, '');
    else onChange?.(next.key);
  };

  return (
    <div className={`tabs${className ? ` ${className}` : ''}`} role="tablist" aria-label={label}>
      {items.map((item, i) => {
        const selected = item.key === value;
        const props = {
          role: 'tab' as const,
          'aria-selected': selected,
          'aria-controls': idBase && selected ? `${idBase}-panel` : undefined,
          id: idBase ? `${idBase}-tab-${item.key}` : undefined,
          tabIndex: selected ? 0 : -1,
          className: `tab${selected ? ' active' : ''}`,
          onKeyDown: (e: KeyboardEvent) => move(e, i),
          ref: (el: HTMLElement | null) => {
            if (el) refs.current.set(item.key, el);
            else refs.current.delete(item.key);
          },
        };
        const content = (
          <>
            {item.label}
            {item.count !== undefined && <span className="tab-count">{item.count}</span>}
          </>
        );
        return item.href ? (
          <a key={item.key} href={item.href} {...props} onClick={() => onChange?.(item.key)}>
            {content}
          </a>
        ) : (
          <button key={item.key} type="button" {...props} onClick={() => onChange?.(item.key)}>
            {content}
          </button>
        );
      })}
    </div>
  );
}

/** The panel a tab row controls. */
export function TabPanel({ idBase, value, children }: { idBase: string; value: string; children: ReactNode }): React.JSX.Element {
  return (
    <div role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-tab-${value}`}>
      {children}
    </div>
  );
}
