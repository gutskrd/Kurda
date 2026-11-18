import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from './api';
import { showNotice } from './notice';
import type { ApiError, ApiResult } from './types';
import { useT, type Translate } from '../i18n/I18nProvider';

/**
 * Optimistic changes: a tap shows its result at once, the server is told in the background, and a refusal puts back
 * what the server last confirmed with a short notice (lib/notice.ts). One value has at most one request out at a
 * time; taps meanwhile are "latest intent wins": only the newest wanted state is kept, and it is sent when the first
 * answers if it still differs from what the server then has. Requests must set a state (PUT, DELETE, an explicit
 * flag), never flip one, so a repeat or a late arrival is harmless.
 */

/** Compares plain values and records; records built the same way compare equal. */
function sameValue<T>(a: T, b: T): boolean {
  return Object.is(a, b) || (typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b));
}

export interface LineOptions<T, R> {
  /** Sends the wanted state; `confirmed` is what the server held before, for a request that sends only the change. */
  send: (wanted: T, confirmed: T) => Promise<ApiResult<R>>;
  /** The true state from the server's answer, where it returns one; otherwise the sent state is taken as confirmed. */
  fromAnswer?: (data: R, sent: T) => T;
  /** Called whenever the state to show changes. */
  onShow: (shown: T) => void;
  /** The server accepted `sent` and answered `data`. */
  onSaved?: (data: R, sent: T) => void;
  /** The server refused and the shown state went back to `confirmed`. */
  onFailed: (error: ApiError, confirmed: T) => void;
  same?: (a: T, b: T) => boolean;
}

export interface Line<T> {
  /** What the screen shows: the newest wanted state, or the confirmed one. */
  readonly shown: T;
  /** Shows `next` at once and gets it to the server. */
  want: (next: T) => void;
  /** A fresh read of the server's state; shown at once unless a request is out, whose answer then has the last word. */
  heard: (confirmed: T) => void;
}

/** One value kept in step with the server, outside React so its timing can be tested on its own. */
export function intentLine<T, R>(initial: T, options: LineOptions<T, R>): Line<T> {
  const same = options.same ?? sameValue;
  let confirmed = initial;
  let shown = initial;
  let busy = false;
  let queued: { value: T } | null = null;

  const show = (value: T): void => {
    if (Object.is(value, shown)) return;
    shown = value;
    options.onShow(value);
  };

  const run = async (value: T): Promise<void> => {
    busy = true;
    const res = await options.send(value, confirmed);
    busy = false;
    if (res.ok) {
      confirmed = options.fromAnswer ? options.fromAnswer(res.data, value) : value;
      options.onSaved?.(res.data, value);
    }
    const next = queued;
    queued = null;
    // A newer tap is the person's latest intent, so it goes next whatever this answer was.
    if (next && !same(next.value, confirmed)) return run(next.value);
    show(confirmed);
    // When a newer tap already asked for what the server holds, nothing looks undone, so nothing is said.
    if (!res.ok && !next) options.onFailed(res.error, confirmed);
  };

  return {
    get shown() {
      return shown;
    },
    want(next) {
      show(next);
      if (busy) {
        queued = { value: next };
        return;
      }
      if (!same(next, confirmed)) void run(next);
    },
    heard(value) {
      confirmed = value;
      if (!busy) show(value);
    },
  };
}

/**
 * The sentence for a rolled-back change: the usual description, except that a refusal the app has no words for gets a
 * translated one rather than the server's own English.
 */
export function failureText(error: ApiError, t: Translate): string {
  const said = describeError(error, t);
  return error.kind === 'client' && said === error.message ? t('common.somethingWentWrong') : said;
}

export interface OptimisticOptions<T, R> {
  fromAnswer?: (data: R, sent: T) => T;
  onSaved?: (data: R, sent: T) => void;
  /** Says why in place of the notice, for a control that already shows its own message beside it. */
  onFailed?: (error: ApiError, confirmed: T) => void;
  same?: (a: T, b: T) => boolean;
}

/**
 * `value` as the screen shows it, optimistically: `[shown, want]`. `value` is the server's state as the caller last
 * heard it; when it changes it is adopted, unless a request is out. `want` takes the next state or a function of the
 * shown one.
 */
export function useOptimistic<T, R = unknown>(
  value: T,
  send: (wanted: T, confirmed: T) => Promise<ApiResult<R>>,
  options: OptimisticOptions<T, R> = {},
): [T, (next: T | ((shown: T) => T)) => void] {
  const t = useT();
  const [shown, setShown] = useState(value);
  // The latest of everything the line calls, since it outlives the render that made it.
  const hands = useRef({ send, options, t });
  hands.current = { send, options, t };
  const line = useRef<Line<T> | null>(null);
  line.current ??= intentLine<T, R>(value, {
    send: (wanted, confirmed) => hands.current.send(wanted, confirmed),
    fromAnswer: (data, sent) => (hands.current.options.fromAnswer ? hands.current.options.fromAnswer(data, sent) : sent),
    onShow: setShown,
    onSaved: (data, sent) => hands.current.options.onSaved?.(data, sent),
    onFailed: (error, confirmed) => {
      const { options: o, t: tr } = hands.current;
      if (o.onFailed) o.onFailed(error, confirmed);
      else showNotice(failureText(error, tr));
    },
    same: (a, b) => (hands.current.options.same ?? sameValue)(a, b),
  });

  const heardValue = useRef(value);
  useEffect(() => {
    if ((hands.current.options.same ?? sameValue)(heardValue.current, value)) return;
    heardValue.current = value;
    line.current!.heard(value);
  }, [value]);

  const want = useCallback((next: T | ((shown: T) => T)) => {
    const l = line.current!;
    l.want(typeof next === 'function' ? (next as (shown: T) => T)(l.shown) : next);
  }, []);

  return [shown, want];
}

/** A change already drawn on screen: how to take it back, and what to do once the server has it. */
export interface ShownChange {
  undo: () => void;
  keep?: () => void;
}

/**
 * Sends a one-way change already shown (a removal, an answered request, a notification read). If the server refuses,
 * `undo` puts the screen back and the notice says so; `goneIsDone` treats a 404 as done, for removing what may already
 * be gone.
 */
export function useOptimisticSend(): <R>(
  request: () => Promise<ApiResult<R>>,
  change: ShownChange,
  options?: { goneIsDone?: boolean; onFailed?: (error: ApiError) => void },
) => Promise<ApiResult<R>> {
  const t = useT();
  const tr = useRef(t);
  tr.current = t;
  return useCallback(async (request, change, options = {}) => {
    const res = await request();
    if (res.ok || (options.goneIsDone && res.error.status === 404)) {
      change.keep?.();
      return res;
    }
    change.undo();
    if (options.onFailed) options.onFailed(res.error);
    else showNotice(failureText(res.error, tr.current));
    return res;
  }, []);
}
