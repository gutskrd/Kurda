import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MoreIcon } from '../components/icons';
import { keepInView } from '../reports/keepInView';

export interface MenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  run: () => void;
}

/**
 * A ⋯ and what it holds: at the end of a member's row, and in a group
 * thread's header. Only what you may do is ever in it. Escape or a press
 * outside closes it and gives the focus back to the ⋯.
 */
export function OptionsMenu({
  label,
  items,
  disabled = false,
  className = 'ginfo-menu',
}: {
  /** names the ⋯ and its list for a screen reader */
  label: string;
  items: MenuItem[];
  disabled?: boolean;
  className?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLSpanElement>(null);

  // at the far edge of a phone, the open list is nudged back inside; at the foot of the dialog it opens upwards
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    keepInView(list);
    const box = list.closest('.modal-panel')?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const r = list.getBoundingClientRect();
    if (r.bottom > box.bottom - 8 && r.top - r.height - 48 > box.top) list.classList.add('is-up');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // the menu's Escape, not the dialog's under it
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <span className={`msg-menu ${className}${open ? ' is-open' : ''}`} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="msg-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreIcon size={22} weight="bold" />
      </button>
      {open && (
        <span className="msg-menu-list" role="menu" ref={listRef} aria-label={label}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`user-menu-item${item.danger ? ' is-danger' : ''}`}
              onClick={() => {
                buttonRef.current?.focus();
                setOpen(false);
                item.run();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
