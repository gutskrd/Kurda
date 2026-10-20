/**
 * A "More" menu: the actions a row has beyond its main one, so a table row on
 * a phone is not a pile of six buttons. A real menu for the keyboard — arrow
 * keys move, Escape closes and returns to the button, a click outside closes.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './icons';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

export function ActionMenu({
  items,
  label = 'More actions',
  buttonText,
}: {
  items: ReadonlyArray<MenuItem>;
  /** the button's accessible name: "More actions for heval" */
  label?: string;
  /** visible text on the button; an icon alone when left out */
  buttonText?: string;
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  if (items.length === 0) return null;

  const close = (refocus = true): void => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent): void => {
    const all = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      all[(at + 1) % all.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      all[(at - 1 + all.length) % all.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      all[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      all[all.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div className="menu-wrap">
      <button
        ref={button}
        type="button"
        className={buttonText ? 'menu-button' : 'icon-button menu-button'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={buttonText ? undefined : label}
        title={buttonText ? undefined : label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {buttonText}
        <Icon name={buttonText ? 'chevronDown' : 'more'} />
      </button>
      {open && (
        <div ref={menu} id={id} className="menu" role="menu" aria-label={label} onKeyDown={onKey}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`menu-item${item.tone === 'danger' ? ' is-danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
