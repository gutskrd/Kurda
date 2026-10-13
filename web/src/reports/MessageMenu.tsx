import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FlagIcon, MoreIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { keepInView } from './keepInView';

/**
 * The ⋯ beside someone else's chat message, with Report in it.
 *
 * On a computer it shows when the message is hovered or focused, so a thread
 * is not a column of dots; on a touch screen, where there is no hover, it is
 * always there but faint — and a long press on the message opens it too,
 * which is where a phone user's thumb goes first (`onLongPress` below, wired
 * by the bubble).
 *
 * A menu of one for now, because one thing is offered: a menu rather than a
 * bare flag because more belongs here later, and so a flag sitting next to
 * every message does not read as an accusation.
 */
export function MessageMenu({
  label,
  onReport,
  openSignal = 0,
}: {
  /** names the message for a screen reader ("More about Rojda's message") */
  label: string;
  onReport: () => void;
  /** bumped by a long press on the message: opens the menu */
  openSignal?: number;
}): React.JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  // the ⋯ can sit at the far edge of a phone screen beside a long message:
  // the open menu is nudged back inside rather than drawn half off it
  useLayoutEffect(() => {
    if (open && listRef.current) keepInView(listRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    itemRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <span className={`msg-menu${open ? ' is-open' : ''}`} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="msg-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreIcon size={18} />
      </button>
      {open && (
        <span className="msg-menu-list" role="menu" ref={listRef}>
          <button
            ref={itemRef}
            type="button"
            role="menuitem"
            className="user-menu-item"
            onClick={() => {
              setOpen(false);
              onReport();
            }}
          >
            <FlagIcon size={16} /> {t('moderation.report')}
          </button>
        </span>
      )}
    </span>
  );
}

/** Hold a message for half a second on a touch screen: the phone's way to its menu. */
export const LONG_PRESS_MS = 500;

/**
 * A message with its ⋯ beside it, and the long press that opens it on a
 * touch screen. Only a touch starts the timer — a mouse has the button, and a
 * press-and-hold to select text with one must stay a text selection.
 */
export function MessageLine({
  children,
  label,
  onReport,
}: {
  children: ReactNode;
  label: string;
  onReport: () => void;
}): React.JSX.Element {
  const [signal, setSignal] = useState(0);
  const timer = useRef<number | null>(null);
  /** the press under way is a finger, not a mouse */
  const touching = useRef(false);
  const cancel = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);

  return (
    <div
      className="bubble-line"
      onPointerDown={(e) => {
        touching.current = e.pointerType === 'touch';
        if (!touching.current) return;
        cancel();
        timer.current = window.setTimeout(() => {
          timer.current = null;
          setSignal((n) => n + 1);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => {
        // Android's long press arrives as a context menu: open ours instead of the browser's
        if (!touching.current) return;
        e.preventDefault();
        cancel();
        setSignal((n) => n + 1);
      }}
    >
      {children}
      <MessageMenu label={label} onReport={onReport} openSignal={signal} />
    </div>
  );
}
