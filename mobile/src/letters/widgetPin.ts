import { useCallback, useEffect, useState } from 'react';
import type { WidgetPrefs } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiError } from '../api/types';
import { reloadLetterWidget } from '../widget/reload';

/**
 * Which letter is on your home-screen widget, from a correspondence
 * (LetterThreadScreen): a letter you were sent can be shown there for good —
 * "Show on my widget" — and taken off again, when the widget goes back to the
 * newest letter. The choice is the account's (shared WidgetPrefs), so every
 * phone with the widget follows it; this phone's widget is asked to catch up
 * at once (widget/reload.ts), the others at their next refresh. Whether the
 * widget shows the words stays as it was chosen in settings.
 *
 * Until the server has said what is pinned, nothing is offered: a choice made
 * without knowing it could unpin the letter somebody pinned on another phone.
 * The server answers with the widget's settings as they now are (shared
 * WidgetSettings, which holds the choices), and refuses a letter that cannot be
 * pinned (NOT_FOUND) or was taken down meanwhile (LETTER_REMOVED).
 */
export const WIDGET_PREFS_PATH = '/letters/widget/prefs';

const isPrefs = (v: unknown): v is WidgetPrefs =>
  typeof v === 'object' && v !== null && typeof (v as WidgetPrefs).showWords === 'boolean' && ((v as WidgetPrefs).pinnedLetterId === null || typeof (v as WidgetPrefs).pinnedLetterId === 'string');

export function useWidgetPin(client: ApiClient): {
  /** the letter pinned now, null for always the newest; undefined until the server has said */
  pinned: string | null | undefined;
  /** the letter being pinned or taken off right now */
  busy: string | null;
  error: ApiError | null;
  /** resolves to the server's refusal code when it said no (LETTER_REMOVED for a letter taken down, NOT_FOUND for one that cannot be pinned) */
  toggle: (letterId: string) => Promise<string | undefined>;
} {
  const [prefs, setPrefs] = useState<WidgetPrefs | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let live = true;
    void client.get<unknown>(WIDGET_PREFS_PATH).then((res) => {
      if (live && res.ok && isPrefs(res.data)) setPrefs({ pinnedLetterId: res.data.pinnedLetterId, showWords: res.data.showWords });
    });
    return () => {
      live = false;
    };
  }, [client]);

  const toggle = useCallback(
    async (letterId: string): Promise<string | undefined> => {
      if (!prefs || busy) return undefined;
      const next: WidgetPrefs = { pinnedLetterId: prefs.pinnedLetterId === letterId ? null : letterId, showWords: prefs.showWords };
      setBusy(letterId);
      setError(null);
      const res = await client.put<unknown>(WIDGET_PREFS_PATH, next);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return res.error.code ?? 'FAILED';
      }
      setPrefs(isPrefs(res.data) ? { pinnedLetterId: res.data.pinnedLetterId, showWords: res.data.showWords } : next);
      // the widget on this phone shows the change now rather than at its next refresh
      reloadLetterWidget();
      return undefined;
    },
    [client, prefs, busy],
  );

  return { pinned: prefs ? prefs.pinnedLetterId : undefined, busy, error, toggle };
}
