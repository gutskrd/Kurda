import { useCallback, useEffect, useState } from 'react';

/** How long the refusal note stays up before it stops being useful. */
const NOTICE_MS = 2600;

/**
 * Attributes that stop a keyboard from answering for you.
 *
 * Mostly a phone problem. Predictive text and autocorrect post whole words
 * nobody typed — which in a word game is the answer arriving by itself, and in
 * a Kurdish one is also a keyboard that has never heard of "xweş" rewriting it
 * into something else. `autoComplete` off keeps the browser from offering the
 * last thing you typed into a box with the same name.
 */
export const TYPE_ONLY_ATTRS = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
} as const;

/**
 * A field that only accepts typing.
 *
 * Paste, drag-and-drop and middle-click paste all put text in a box without
 * anyone having typed it, and in these games the answer is often one tab away —
 * a dictionary, or in the race, the text itself on the same screen. Refusing
 * them silently reads as a broken box, so this hands back a note to show.
 *
 * A courtesy, not a boundary: the browser is not where cheating has to be
 * stopped, because the endpoints take whatever they are posted. It sits
 * alongside the server-side rules, it does not replace them.
 */
export function useTypeOnly(message = 'No pasting — type it.'): {
  /** spread onto the input or textarea */
  handlers: {
    onPaste: (e: React.ClipboardEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  } & typeof TYPE_ONLY_ATTRS;
  /** what to show when something was refused, or null */
  notice: string | null;
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

  return { handlers: { ...TYPE_ONLY_ATTRS, onPaste: refuse, onDrop: refuse }, notice };
}
