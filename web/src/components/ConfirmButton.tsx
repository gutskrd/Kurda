import { useEffect, useRef, useState } from 'react';

/** How long the armed state waits before giving up on you. */
const ARMED_MS = 4_000;

/**
 * A button for something you cannot undo.
 *
 * One press arms it and the label changes to ask; a second press does the
 * thing. It disarms itself after a few seconds, and on blur, so a half-pressed
 * Delete never sits there waiting to catch a stray click later.
 *
 * In place of `confirm()`, which is a browser dialog the app cannot style, lands
 * outside the page for a screen reader, and is blocked outright in some
 * embedded browsers — leaving the action silently impossible.
 */
export function ConfirmButton({
  label,
  confirmLabel = 'Sure?',
  busyLabel,
  onConfirm,
  className = '',
  disabled = false,
  title,
}: {
  label: React.ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
  disabled?: boolean;
  /** the plain-words version, for the accessible name and the tooltip */
  title: string;
}): React.JSX.Element {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!armed) return;
    timer.current = setTimeout(() => setArmed(false), ARMED_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armed]);

  async function press(): Promise<void> {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`${className}${armed ? ' is-armed' : ''}`}
      disabled={disabled || busy}
      title={title}
      aria-label={armed ? `${title} — press again to confirm` : title}
      onBlur={() => setArmed(false)}
      onClick={() => void press()}
    >
      {busy ? (busyLabel ?? '…') : armed ? confirmLabel : label}
    </button>
  );
}
