import { useCallback, useEffect, useState } from 'react';
import type { QuestDay } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';

interface QuestDayState {
  day: QuestDay | null;
  error: string | null;
  loading: boolean;
}

/**
 * Today's quests (GET /me/quests), read once when `enabled`, with a way to
 * read them again. A day without its list of quests is an answer this client
 * cannot use, and is treated as one that failed.
 */
export function useQuestDay(enabled = true): QuestDayState & { reload: () => void } {
  const { client } = useAuth();
  const t = useT();
  const [state, setState] = useState<QuestDayState>({ day: null, error: null, loading: enabled });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    void client.get<QuestDay>('/me/quests').then((res) => {
      if (!live) return;
      if (res.ok && Array.isArray(res.data?.quests)) setState({ day: res.data, error: null, loading: false });
      else setState({ day: null, error: res.ok ? t('quests.loadFailed') : describeError(res.error, t), loading: false });
    });
    return () => {
      live = false;
    };
  }, [client, enabled, nonce, t]);

  return { ...state, reload };
}
