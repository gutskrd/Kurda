import { useCallback, useEffect, useState } from 'react';

/** How long the refusal note stays up. */
const NOTICE_MS = 2600;

/**
 * Stops phone keyboards answering for the player: predictive text and autocorrect insert whole words (and rewrite
 * Kurdish ones), and autocomplete offers earlier entries.
 */
export const TYPE_ONLY_ATTRS = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
} as const;

/**
 * A field that only accepts typing: paste, drop and middle-click paste are refused with a note to show, since the
 * answer is often a tab away. A courtesy only; the server's rules are what count. `message` is required so no caller
 * falls back to untranslated English.
 */
export function useTypeOnly(message: string): {
  /** Spread onto the input or textarea. */
  handlers: {
    onPaste: (e: React.ClipboardEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  } & typeof TYPE_ONLY_ATTRS;
  /** What to show when something was refused, or null. */
  notice: string | null;
  /** Shows the note for text refused another way, such as a paste arriving only as `beforeinput`. */
  refuse: () => void;
} {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const refuse = useCallback(
    (e: { preventDefault: () => void }): void => {
      e.preventDefault();
      setNotice(message);
    },
    [message],
  );

  const refuseEdit = useCallback((): void => setNotice(message), [message]);

  return { handlers: { ...TYPE_ONLY_ATTRS, onPaste: refuse, onDrop: refuse }, notice, refuse: refuseEdit };
}
