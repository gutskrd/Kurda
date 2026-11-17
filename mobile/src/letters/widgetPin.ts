import { useCallback, useEffect, useState } from 'react';
import type { WidgetPrefs } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiError } from '../api/types';
import { reloadLetterWidget } from '../widget/reload';

/**
 * Pins a received letter to the home-screen widget from a correspondence, or unpins it so the widget shows the
 * newest. The choice belongs to the account (shared WidgetPrefs), so every phone follows it; this phone's widget
 * reloads at once (widget/reload.ts). Nothing is offered until the server has said what is pinned, since acting
 * without knowing could unpin a letter pinned on another phone. The server refuses NOT_FOUND and LETTER_REMOVED.
 */
const WIDGET_PREFS_PATH = '/letters/widget/prefs';

const isPrefs = (v: unknown): v is WidgetPrefs =>
  typeof v === 'object' && v !== null && typeof (v as WidgetPrefs).showWords === 'boolean' && ((v as WidgetPrefs).pinnedLetterId === null || typeof (v as WidgetPrefs).pinnedLetterId === 'string');

export function useWidgetPin(client: ApiClient): {
  /** The pinned letter, null for always the newest; undefined until the server has said. */
  pinned: string | null | undefined;
  /** The letter being pinned or unpinned right now. */
  busy: string | null;
  error: ApiError | null;
  /** Resolves to the server's refusal code when it says no (LETTER_REMOVED or NOT_FOUND). */
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
      // Reload this phone's widget now rather than at its next refresh.
      reloadLetterWidget();
      return undefined;
    },
    [client, prefs, busy],
  );

  return { pinned: prefs ? prefs.pinnedLetterId : undefined, busy, error, toggle };
}
