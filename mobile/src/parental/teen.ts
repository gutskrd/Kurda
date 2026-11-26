import { useCallback, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { PARENTAL_SWITCHES, type Bedtime, type ParentalControls } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import { describeError, isMaintenance, type Translate } from '../api/errors';
import { createIntents, sayNotSaved, type Intents } from '../api/optimistic';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { changeControls, readTeen, type TeenDetail } from './api';

/**
 * One teen as their parent sees them (GET /me/parental/teens/:id), shared by the teen's page and the choice pages behind
 * it, so a limit chosen on one is already on the other when it comes back. A change shows at once and is sent in the
 * background, one request per control at a time; a refusal puts it back, says why and buzzes once.
 */
export type ControlKey = keyof ParentalControls;

/** Every control a parent sets: the two times, then the switches. */
export const CONTROL_KEYS: readonly ControlKey[] = ['dailyLimitMinutes', 'bedtime', ...PARENTAL_SWITCHES];

/**
 * Whether changing a control from `was` to `next` opens something up again: a switch turned back on, a limit lifted or
 * raised, a bedtime taken away or started later. Only the first parent may do that; any parent may tighten.
 */
export function loosens<K extends ControlKey>(key: K, was: ParentalControls[K], next: ParentalControls[K]): boolean {
  if (key === 'dailyLimitMinutes') {
    const [a, b] = [was as number | null, next as number | null];
    return a !== null && (b === null || b > a);
  }
  if (key === 'bedtime') {
    const [a, b] = [was as Bedtime | null, next as Bedtime | null];
    // Every bedtime ends at seven, so a later start is a shorter night.
    return a !== null && (b === null || b.from > a.from);
  }
  return was === false && next === true;
}

const details = new Map<string, TeenDetail>();
const intents = new Map<string, Intents<ControlKey, unknown>>();
const listeners = new Set<() => void>();
let version = 0;
/** The session and language of whoever last drew a teen, for the requests and words sent after they have moved on. */
const latest: { client: ApiClient | null; t: Translate | null } = { client: null, t: null };

function changed(): void {
  version += 1;
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function intentsFor(teenId: string): Intents<ControlKey, unknown> {
  let found = intents.get(teenId);
  if (!found) {
    found = createIntents<ControlKey, unknown>({
      send: async (key, wanted) => {
        const res = await changeControls(latest.client!, teenId, { [key]: wanted } as Partial<ParentalControls>);
        // The server's whole answer becomes the page's copy, so a value it settled differently is what shows.
        if (res.ok && res.data?.controls) {
          const detail = details.get(teenId);
          if (detail) details.set(teenId, { ...detail, controls: res.data.controls });
        }
        return res;
      },
      failed: (error) => {
        haptic('error');
        if (latest.t) sayNotSaved(error, latest.t);
      },
      changed,
      same,
    });
    intents.set(teenId, found);
  }
  return found;
}

/** Forget every teen read, between accounts and tests. */
export function forgetTeens(): void {
  details.clear();
  intents.clear();
  changed();
}

export interface TeenState {
  detail: TeenDetail | null;
  /** The controls as they will be: what the server holds, with any change on its way drawn over it. */
  controls: ParentalControls | null;
  failed: string | null;
  reload: () => void;
  change: <K extends ControlKey>(key: K, value: ParentalControls[K]) => void;
  /** Takes a change the server confirmed (a corrected birth month) into what every page of this teen shows. */
  amend: (change: Partial<TeenDetail>) => void;
}

export function useTeen(teenId: string): TeenState {
  const { client } = useAuth();
  const { t } = useI18n();
  latest.client = client;
  latest.t = t;
  useSyncExternalStore(subscribe, () => version, () => version);
  const [failed, setFailed] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void readTeen(client, teenId).then((res) => {
        if (!live) return;
        if (!res.ok) {
          // The server answers a link the parent is no longer part of as not found, and what was kept of it goes.
          if (res.error.status === 404) {
            details.delete(teenId);
            changed();
            setFailed(t('parental.teenGone'));
          } else if (!isMaintenance(res.error)) setFailed(describeError(res.error, t));
          return;
        }
        setFailed(null);
        details.set(teenId, res.data);
        changed();
      });
      return () => {
        live = false;
      };
    }, [client, teenId, t, round]),
  );

  const detail = details.get(teenId) ?? null;
  const wishes = intentsFor(teenId);
  const controls = detail
    ? (Object.fromEntries(CONTROL_KEYS.map((key) => [key, wishes.shown(key, detail.controls[key])])) as unknown as ParentalControls)
    : null;

  // The row that changed it has already ticked; the request follows in the background.
  const change = useCallback(
    <K extends ControlKey>(key: K, value: ParentalControls[K]) => {
      const now = details.get(teenId);
      if (now) wishes.want(key, value, now.controls[key]);
    },
    [teenId, wishes],
  );

  const amend = useCallback(
    (update: Partial<TeenDetail>) => {
      const now = details.get(teenId);
      if (!now) return;
      details.set(teenId, { ...now, ...update });
      changed();
    },
    [teenId],
  );

  const reload = useCallback(() => setRound((r) => r + 1), []);
  return { detail, controls, failed, reload, change, amend };
}
