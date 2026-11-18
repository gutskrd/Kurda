import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/I18nProvider';

/** How long the armed state waits for the second press. */
const ARMED_MS = 4_000;

/**
 * A button for something that cannot be undone: the first press arms it and asks, the second acts. It disarms after a
 * few seconds and on blur. Used instead of `confirm()`, which cannot be styled and is blocked in some embedded browsers.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  busyLabel,
  onConfirm,
  className = '',
  disabled = false,
  title,
  role,
}: {
  label: React.ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
  disabled?: boolean;
  /** The plain-words version, for the accessible name and the tooltip. */
  title: string;
  /** "menuitem" when it is a menu item. */
  role?: 'menuitem';
}): React.JSX.Element {
  const t = useT();
  // Not a default argument, which is evaluated before any hook has run.
  const confirm = confirmLabel ?? t('common.sure');
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
      role={role}
      className={`${className}${armed ? ' is-armed' : ''}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      title={title}
      aria-label={armed ? t('common.pressAgain', { what: title }) : title}
      onBlur={() => setArmed(false)}
      onClick={() => void press()}
    >
      {/* While busy the button keeps its word, and so its width. */}
      {busy ? (busyLabel ?? label) : armed ? confirm : label}
    </button>
  );
}
