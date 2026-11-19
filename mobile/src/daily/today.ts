import { useCallback, useEffect, useState } from 'react';
import { weekStartsOn, type TodayWeek } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import type { DailyStatus } from '../rewards/daily';
import type { Streak } from '../streak/format';

/** GET /me/today: the streak, last week and this one in the learner's zone, today's Zêr and the latest badge. */
export interface TodayView extends TodayWeek {
  streak: Streak;
  daily: DailyStatus;
}

/** What a claim or a restore changed, shown until the server's next answer says it. */
type Change = Partial<Pick<TodayView, 'streak' | 'daily'>>;

export interface Today {
  view: TodayView | null;
  /** The last ask failed and nothing is held. */
  failed: boolean;
  reload: () => void;
  /** Shows a change at once and asks the server again. */
  change: (change: Change) => void;
}

/** An answer with the view's parts; anything else is not shown. */
function isView(data: unknown): data is TodayView {
  const v = data as Partial<TodayView> | null;
  return !!v && Array.isArray(v.days) && !!v.streak && !!v.daily;
}

/**
 * The daily view's data, with the week starting where the reader's language starts it, asked for while `enabled` and
 * again each time it becomes so, and kept between, so a closing sheet keeps its contents.
 */
export function useToday(enabled = true): Today {
  const { client } = useAuth();
  const { locale } = useI18n();
  const [view, setView] = useState<TodayView | null>(null);
  const [failed, setFailed] = useState(false);
  const [asked, setAsked] = useState(0);
  const reload = useCallback(() => setAsked((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    void client.get<TodayView>(`/me/today?weekStart=${weekStartsOn(locale)}`).then((res) => {
      if (!live) return;
      if (res.ok && isView(res.data)) {
        setView(res.data);
        setFailed(false);
      } else if (!res.ok) {
        setFailed(true);
      }
    });
    return () => {
      live = false;
    };
  }, [client, locale, enabled, asked]);

  const change = useCallback(
    (next: Change) => {
      setView((was) => (was ? { ...was, ...next } : was));
      reload();
    },
    [reload],
  );
  return { view, failed, reload, change };
}
