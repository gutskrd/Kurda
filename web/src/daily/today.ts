import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { weekStartsOn, type TodayWeek } from '@kurda/shared';
import { useLocale } from '../i18n/I18nProvider';
import type { DailyRewardStatus, StreakSummary } from '../lib/types';
import { useApiGet } from '../lib/useApi';

/** GET /me/today: the streak, last week and this one in the learner's zone, today's Zêr and the latest badge. */
export interface TodayView extends TodayWeek {
  streak: StreakSummary;
  daily: DailyRewardStatus;
}

/** What a claim or a restore changed, shown until the server's next answer says it. */
type Change = Partial<Pick<TodayView, 'streak' | 'daily'>>;

export interface Today {
  view: TodayView | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  /** Shows a change at once and asks the server again. */
  change: (change: Change) => void;
}

/**
 * The daily view's data, with the week starting where the reader's language starts it, asked for once `enabled` and
 * kept after, so a closing sheet keeps its contents. One answer is shared by the home card and the sheets it and Learn
 * open (lib/apiMemory.ts), so a sheet opens with it in place.
 */
export function useToday(enabled = true): Today {
  const locale = useLocale();
  const [wanted, setWanted] = useState(enabled);
  if (enabled && !wanted) setWanted(true);
  const answer = useApiGet<TodayView>(wanted ? `/me/today?weekStart=${weekStartsOn(locale)}` : null);
  const { error, loading, reload } = answer;
  // `ok` says nothing about the body's shape; an answer without the view's parts is not shown.
  const data = answer.data && Array.isArray(answer.data.days) && answer.data.streak && answer.data.daily ? answer.data : null;
  // Opened again later, it asks again, since a lesson may have changed the day.
  const last = useRef(enabled);
  const ever = useRef(false);
  useEffect(() => {
    if (enabled && !last.current && ever.current) reload();
    if (enabled) ever.current = true;
    last.current = enabled;
  }, [enabled, reload]);
  // A change belongs to the answer it was made on; a newer answer replaces it.
  const [changed, setChanged] = useState<{ on: TodayView; change: Change } | null>(null);
  const view = useMemo(() => (data && changed?.on === data ? { ...data, ...changed.change } : data), [data, changed]);
  const change = useCallback(
    (next: Change) => {
      if (data) setChanged((was) => ({ on: data, change: { ...(was?.on === data ? was.change : {}), ...next } }));
      reload();
    },
    [data, reload],
  );
  return { view, error, loading, reload, change };
}

/** What today's Zêr offers: a claim, a lesson first, or nothing until tomorrow. An older server sends no `learnedToday`. */
export type DailyAction = 'claim' | 'learnFirst' | 'claimed';

export function dailyAction(daily: DailyRewardStatus): DailyAction {
  if (daily.canClaim) return 'claim';
  if (!daily.alreadyClaimedToday && daily.learnedToday === false) return 'learnFirst';
  return 'claimed';
}
