import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CopyIcon, FlagIcon, MoreIcon } from '../components/icons';
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
              // the ⋯ is where the keyboard goes back to when the report
              // sheet closes: the sheet remembers what had focus as it opens,
              // and by then this item is gone
              buttonRef.current?.focus();
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

/** Hold a message for under half a second on a touch screen: the phone's way to its options. */
export const LONG_PRESS_MS = 450;

/**
 * A chat message, and what can be done with it.
 *
 * Nothing sits beside the message: a column of ⋯ down one side of a thread
 * is clutter that pushes every bubble in, and it is not where anybody looks.
 * The options are where messaging apps keep them —
 *
 *   held on a touch screen (the bubble sinks a little under the finger, so
 *   the hold is felt to be doing something, and the options open under it);
 *   right-clicked with a mouse (unless some of its text is selected, when the
 *   browser's own menu is the one wanted, to copy just that);
 *   from the keyboard or a screen reader, by a button that is there but out
 *   of sight until it has focus.
 *
 * The options are Copy, for a message with words in it, and Report, for
 * somebody else's. With neither there is nothing to open and the message is
 * drawn as it is.
 */
export function MessageLine({
  children,
  label,
  onReport,
  copyText,
  mine = false,
}: {
  children: ReactNode;
  /** names the message's options for a screen reader ("More about Rojda's message") */
  label: string;
  /** someone else's message can be reported */
  onReport?: () => void;
  /** the words to copy; null or absent for a card with none */
  copyText?: string | null;
  /** your own message, at the far side: the options open from that side */
  mine?: boolean;
}): React.JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  /** the press under way is a finger, not a mouse */
  const touching = useRef(false);
  /** a hold just opened the options: the click that ends it is not a tap on the message */
  const justHeld = useRef(false);

  const cancel = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setPressing(false);
  };
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  useLayoutEffect(() => {
    if (open && listRef.current) keepInView(listRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
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

  // "Copied" says so for a moment, where the message is, then goes
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const words = copyText?.trim() ? copyText : null;
  if (!words && !onReport) return <>{children}</>;

  const copy = (): void => {
    setOpen(false);
    void navigator.clipboard?.writeText(words ?? '').then(
      () => setCopied(true),
      () => undefined,
    );
  };
  const report = (): void => {
    // the hidden button is where the keyboard goes back to when the report sheet closes
    buttonRef.current?.focus();
    setOpen(false);
    onReport?.();
  };
  const hasSelection = (): boolean => {
    const selection = window.getSelection?.();
    return !!selection && !selection.isCollapsed && !!wrapRef.current?.contains(selection.anchorNode);
  };

  return (
    <div
      ref={wrapRef}
      className={`bubble-line${mine ? ' mine' : ''}${pressing ? ' is-pressing' : ''}${open ? ' is-open' : ''}`}
      onPointerDown={(e) => {
        // a new press: whatever the last hold left behind is over
        justHeld.current = false;
        touching.current = e.pointerType === 'touch';
        if (!touching.current) return;
        cancel();
        setPressing(true);
        timer.current = window.setTimeout(() => {
          timer.current = null;
          setPressing(false);
          justHeld.current = true;
          setOpen(true);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerMove={(e) => {
        // a finger that moves is scrolling the thread, not holding a message
        if (touching.current && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4)) cancel();
      }}
      onClickCapture={(e) => {
        if (!justHeld.current) return;
        justHeld.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        // Android's long press arrives as a context menu; a mouse's right click is one
        if (!touching.current && hasSelection()) return;
        e.preventDefault();
        cancel();
        setOpen(true);
      }}
    >
      {children}
      <button
        ref={buttonRef}
        type="button"
        className="bubble-options-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        {t('chat.messageOptions')}
      </button>
      {open && (
        <div className="bubble-menu" role="menu" ref={listRef} aria-label={label}>
          {words ? (
            <button ref={firstRef} type="button" role="menuitem" className="user-menu-item" onClick={copy}>
              <CopyIcon size={16} /> {t('chat.copy')}
            </button>
          ) : null}
          {onReport ? (
            <button ref={words ? undefined : firstRef} type="button" role="menuitem" className="user-menu-item" onClick={report}>
              <FlagIcon size={16} /> {t('moderation.report')}
            </button>
          ) : null}
        </div>
      )}
      <span className="bubble-copied" role="status" aria-live="polite">
        {copied ? t('chat.copied') : ''}
      </span>
    </div>
  );
}
