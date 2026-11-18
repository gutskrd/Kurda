import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { describeError, isMaintenance, type Translate } from './errors';
import type { ApiError, ApiResult } from './types';

/**
 * Changes shown before the server has them, so a tap answers at once. Each key (one post's like, one setting) keeps
 * the value the server last confirmed and the value last wanted, with one request out at a time: taps meanwhile only
 * change what is wanted, which is sent when the answer comes if it still differs, so rapid taps end on the last one.
 * A refusal goes back to the confirmed value, unless a newer tap has asked for something else, and is said once.
 *
 * The screen keeps the server's data as it is and draws `shown(key, fromServer)` over it; its `send` writes the
 * server's answer into that data, so dropping the wanted value on success or refusal leaves the truth in place.
 */

export interface IntentsOptions<K, S, T> {
  /** Ask the server for `wanted`, `confirmed` being what it holds now. */
  send: (key: K, wanted: S, confirmed: S) => Promise<ApiResult<T>>;
  /** The value the server holds after a success, read from its answer (a total, a list it reordered); else the one sent. */
  answered?: (data: T, sent: S) => S;
  /** The server refused or could not be reached; the key already shows its confirmed value again. */
  failed: (error: ApiError, key: K) => void;
  /** What `shown` or `busy` answers has changed. */
  changed: () => void;
  same?: (a: S, b: S) => boolean;
}

export interface Intents<K, S> {
  /** Show `next` at once and see it to the server; `current` is the server's value as the screen knows it. */
  want: (key: K, next: S, current: S) => void;
  /** What to draw for `key`: the value wanted while one is on its way, else the screen's own `fromServer`. */
  shown: (key: K, fromServer: S) => S;
  /** Whether anything for `key` is still on its way to the server. */
  busy: (key: K) => boolean;
}

interface Entry<S> {
  confirmed: S;
  wanted: S;
}

export function createIntents<K, S, T = unknown>({ send, answered, failed, changed, same = Object.is }: IntentsOptions<K, S, T>): Intents<K, S> {
  const entries = new Map<K, Entry<S>>();

  const run = async (key: K, entry: Entry<S>): Promise<void> => {
    while (!same(entry.wanted, entry.confirmed)) {
      const sending = entry.wanted;
      const res = await send(key, sending, entry.confirmed);
      if (res.ok) {
        entry.confirmed = answered ? answered(res.data, sending) : sending;
        // Nothing newer was asked for, so the server's value is the one to keep, even where it differs.
        if (same(entry.wanted, sending)) entry.wanted = entry.confirmed;
        continue;
      }
      // A newer tap is its own request; only a refusal of the last one goes back and says so.
      if (!same(entry.wanted, sending)) continue;
      entries.delete(key);
      changed();
      failed(res.error, key);
      return;
    }
    entries.delete(key);
    changed();
  };

  return {
    want: (key, next, current) => {
      const entry = entries.get(key);
      if (entry) {
        entry.wanted = next;
        changed();
        return;
      }
      if (same(next, current)) return;
      const fresh = { confirmed: current, wanted: next };
      entries.set(key, fresh);
      changed();
      void run(key, fresh);
    },
    shown: (key, fromServer) => {
      const entry = entries.get(key);
      return entry ? entry.wanted : fromServer;
    },
    busy: (key) => entries.has(key),
  };
}

/** How long the same refusal is not said again: a burst of taps that all failed together is one alert. */
const SAID_FOR_MS = 1500;
let lastSaid = { text: '', at: 0 };

/** Say that a change did not save, in the app's words; maintenance has its own screen, so it is not said twice. */
export function sayNotSaved(error: ApiError, t: Translate): void {
  if (isMaintenance(error)) return;
  const text = describeError(error, t);
  const now = Date.now();
  if (text === lastSaid.text && now - lastSaid.at < SAID_FOR_MS) return;
  lastSaid = { text, at: now };
  Alert.alert(text);
}

/** `sayNotSaved` for a screen, in its reader's language. */
export function useSayNotSaved(): (error: ApiError) => void {
  const { t } = useI18n();
  return useCallback((error: ApiError) => sayNotSaved(error, t), [t]);
}

/**
 * `createIntents` for a screen. `send` and `failed` are read when used, so they may close over the latest render.
 * Without `failed` a refusal is said in an alert; a screen with its own place for errors passes one. A refusal is said
 * even after the screen has gone, since the change it made did not happen.
 */
export function useIntents<K, S, T = unknown>(
  send: IntentsOptions<K, S, T>['send'],
  options: Pick<IntentsOptions<K, S, T>, 'answered' | 'same'> & { failed?: IntentsOptions<K, S, T>['failed'] } = {},
): Intents<K, S> {
  const say = useSayNotSaved();
  const [, setVersion] = useState(0);
  const latest = useRef({ send, answered: options.answered, failed: options.failed ?? say });
  latest.current = { send, answered: options.answered, failed: options.failed ?? say };
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [intents] = useState(() =>
    createIntents<K, S, T>({
      send: (key, wanted, confirmed) => latest.current.send(key, wanted, confirmed),
      answered: (data, sent) => (latest.current.answered ? latest.current.answered(data, sent) : sent),
      failed: (error, key) => latest.current.failed(error, key),
      changed: () => {
        if (alive.current) setVersion((v) => v + 1);
      },
      same: options.same,
    }),
  );
  return intents;
}
