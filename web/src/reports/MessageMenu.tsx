import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CopyIcon, FlagIcon, MoreIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { keepInView } from './keepInView';

/**
 * The ⋯ with Report beside someone else's chat message: shown on hover or focus on a computer, always faint on a
 * touch screen, where a long press opens it too. A menu rather than a bare flag, so it does not read as an accusation.
 */
export function MessageMenu({
  label,
  onReport,
  openSignal = 0,
}: {
  /** Names the message for screen readers, such as "More about Rojda's message". */
  label: string;
  onReport: () => void;
  /** Bumped by a long press on the message to open the menu. */
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

  // The ⋯ can sit at a phone screen's edge, so the open menu is nudged back inside.
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
              // Focus the ⋯ first, so the report sheet returns focus there; this menu item will be gone.
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

/** How long a touch hold on a message takes to open its options. */
const LONG_PRESS_MS = 450;

/**
 * A chat message with its options (Copy for text, Report for someone else's), opened by a touch hold (the bubble sinks
 * slightly), a right click (unless text is selected, leaving the browser's menu), or a visually hidden button for the
 * keyboard and screen readers. With neither option the message is drawn as it is.
 */
export function MessageLine({
  children,
  label,
  onReport,
  copyText,
  mine = false,
}: {
  children: ReactNode;
  /** Names the message's options for screen readers, such as "More about Rojda's message". */
  label: string;
  /** Reports someone else's message. */
  onReport?: () => void;
  /** The text to copy; null or absent for a card without text. */
  copyText?: string | null;
  /** The reader's own message, on the far side, so the options open from there. */
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
  /** The current press is a finger, not a mouse. */
  const touching = useRef(false);
  /** A hold just opened the options, so the click that ends it is not a tap on the message. */
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

  // "Copied" shows briefly at the message, then goes.
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
    // Focus the hidden button, so the report sheet returns focus there.
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
        // A new press clears whatever the last hold left behind.
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
        // A moving finger is scrolling the thread, not holding a message.
        if (touching.current && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4)) cancel();
      }}
      onClickCapture={(e) => {
        if (!justHeld.current) return;
        justHeld.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        // Android's long press arrives as a context menu, as does a mouse's right click.
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
