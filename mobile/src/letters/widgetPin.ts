import { useCallback, useEffect, useState } from 'react';
import type { WidgetPrefs } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import { useIntents } from '../api/optimistic';
import type { ApiError } from '../api/types';
import { reloadLetterWidget } from '../widget/reload';

/**
 * Pins a received letter to the home-screen widget from a correspondence, or unpins it so the widget shows the
 * newest. The choice belongs to the account (shared WidgetPrefs), so every phone follows it; this phone's widget
 * reloads at once (widget/reload.ts). Nothing is offered until the server has said what is pinned, since acting
 * without knowing could unpin a letter pinned on another phone. A pin shows at once and is put back if the server
 * refuses (NOT_FOUND, LETTER_REMOVED).
 */
const WIDGET_PREFS_PATH = '/letters/widget/prefs';

const isPrefs = (v: unknown): v is WidgetPrefs =>
  typeof v === 'object' && v !== null && typeof (v as WidgetPrefs).showWords === 'boolean' && ((v as WidgetPrefs).pinnedLetterId === null || typeof (v as WidgetPrefs).pinnedLetterId === 'string');

export function useWidgetPin(
  client: ApiClient,
  /** The letter was removed meanwhile, so the correspondence should be read again. */
  onRemoved: () => void,
): {
  /** The pinned letter, null for always the newest; undefined until the server has said. */
  pinned: string | null | undefined;
  error: ApiError | null;
  /** Pins the letter, or unpins it if it is the one pinned; shown at once and put back if the server says no. */
  toggle: (letterId: string) => void;
} {
  const [prefs, setPrefs] = useState<WidgetPrefs | null>(null);
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

  const pinning = useIntents<'pin', string | null, unknown>(
    async (_key, pinnedLetterId) => {
      const next: WidgetPrefs = { pinnedLetterId, showWords: prefs?.showWords ?? true };
      const res = await client.put<unknown>(WIDGET_PREFS_PATH, next);
      if (res.ok) {
        setPrefs(isPrefs(res.data) ? { pinnedLetterId: res.data.pinnedLetterId, showWords: res.data.showWords } : next);
        // Reload this phone's widget now rather than at its next refresh.
        reloadLetterWidget();
      }
      return res;
    },
    {
      answered: (data, sent) => (isPrefs(data) ? data.pinnedLetterId : sent),
      failed: (refused) => {
        setError(refused);
        if (refused.code === 'LETTER_REMOVED') onRemoved();
      },
    },
  );
  const pinned = prefs ? pinning.shown('pin', prefs.pinnedLetterId) : undefined;

  const toggle = useCallback(
    (letterId: string): void => {
      if (!prefs) return;
      setError(null);
      pinning.want('pin', pinned === letterId ? null : letterId, prefs.pinnedLetterId);
    },
    [prefs, pinning, pinned],
  );

  return { pinned, error, toggle };
}
