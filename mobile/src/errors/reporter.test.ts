import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientErrorBatch } from '@kurda/shared';
import {
  CrashReporter,
  FATAL_REPORT_WAIT_MS,
  REPORT_BATCH_DELAY_MS,
  REPORT_MAX_BATCHES,
  REPORT_MIN_GAP_MS,
  fitBatch,
  installGlobalErrorHandler,
  type ErrorUtilsLike,
} from './reporter';

const about = () => ({ platform: 'ios' as const, appVersion: '0.1.0', buildNumber: '42', osVersion: '18.2' });

function reporter(send: (batch: ClientErrorBatch) => Promise<unknown> = async () => undefined, enabled = true) {
  const sent: ClientErrorBatch[] = [];
  const spy = vi.fn(async (batch: ClientErrorBatch) => {
    sent.push(batch);
    return send(batch);
  });
  return { r: new CrashReporter({ enabled, send: spy, about }), sent, spy };
}

function thrown(message: string, at = 'LessonCard'): Error {
  const e = new TypeError(message);
  e.stack = `TypeError: ${message}\n    at ${at} (address at main.jsbundle:1:20345)\n    at render (address at main.jsbundle:1:9000)`;
  return e;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the crash reporter', () => {
  it('sends the errors of a few seconds together, as one batch', async () => {
    const { r, sent } = reporter();
    r.noteScreen('Learn');
    r.capture(thrown('a is undefined'), { kind: 'render', fatal: false, componentStack: '\n    in LessonCard\n    in LessonsView' });
    r.capture(thrown('b is undefined', 'Other'), { kind: 'uncaught', fatal: false });
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(REPORT_BATCH_DELAY_MS);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ platform: 'ios', appVersion: '0.1.0', buildNumber: '42', osVersion: '18.2' });
    expect(sent[0]!.reports).toEqual([
      {
        kind: 'render',
        fatal: false,
        name: 'TypeError',
        message: 'a is undefined',
        stack: 'TypeError: a is undefined\nat LessonCard (address at main.jsbundle:1:20345)\nat render (address at main.jsbundle:1:9000)',
        componentStack: 'in LessonCard\nin LessonsView',
        screen: 'Learn',
        count: 1,
      },
      expect.objectContaining({ kind: 'uncaught', message: 'b is undefined', screen: 'Learn', count: 1 }),
    ]);
  });

  it('counts an error that repeats instead of sending it again and again', async () => {
    const { r, sent } = reporter();
    for (let i = 0; i < 50; i++) r.capture(thrown('loop'), { kind: 'render', fatal: false });
    await vi.advanceTimersByTimeAsync(REPORT_BATCH_DELAY_MS);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.reports).toHaveLength(1);
    expect(sent[0]!.reports[0]!.count).toBe(50);
    // and once it has been sent, the same error adds nothing for the rest of the launch
    r.capture(thrown('loop'), { kind: 'render', fatal: false });
    await vi.advanceTimersByTimeAsync(REPORT_MIN_GAP_MS * 2);
    expect(sent).toHaveLength(1);
  });

  it('spaces batches out, and stops after a handful in one launch', async () => {
    const { r, sent } = reporter();
    r.capture(thrown('first'), { kind: 'uncaught', fatal: false });
    await vi.advanceTimersByTimeAsync(REPORT_BATCH_DELAY_MS);
    expect(sent).toHaveLength(1);
    r.capture(thrown('second'), { kind: 'uncaught', fatal: false });
    await vi.advanceTimersByTimeAsync(REPORT_BATCH_DELAY_MS);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(REPORT_MIN_GAP_MS);
    expect(sent).toHaveLength(2);
    for (let i = 0; i < 20; i++) {
      r.capture(thrown(`more ${i}`), { kind: 'uncaught', fatal: false });
      await vi.advanceTimersByTimeAsync(REPORT_MIN_GAP_MS + REPORT_BATCH_DELAY_MS);
    }
    expect(sent).toHaveLength(REPORT_MAX_BATCHES);
  });

  it('lets a failed request go: no throw, no retry, and no report about the report', async () => {
    const { r, spy } = reporter(async () => {
      throw new TypeError('Network request failed');
    });
    r.capture(thrown('first'), { kind: 'uncaught', fatal: false });
    await vi.advanceTimersByTimeAsync(REPORT_BATCH_DELAY_MS);
    await vi.advanceTimersByTimeAsync(REPORT_MIN_GAP_MS * 3);
    expect(spy).toHaveBeenCalledTimes(1);
    // and the reporter still works afterwards
    r.capture(thrown('second'), { kind: 'uncaught', fatal: false });
    await vi.advanceTimersByTimeAsync(REPORT_MIN_GAP_MS);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('survives a send that throws before it even starts', async () => {
    const r = new CrashReporter({
      enabled: true,
      about,
      send: () => {
        throw new Error('no fetch here');
      },
    });
    r.capture(thrown('x'), { kind: 'uncaught', fatal: false });
    await expect(r.flush()).resolves.toBeUndefined();
  });

  it('sends nothing at all when it is off', async () => {
    const { r, spy } = reporter(undefined, false);
    r.capture(thrown('x'), { kind: 'uncaught', fatal: true });
    await r.flush();
    await vi.advanceTimersByTimeAsync(REPORT_MIN_GAP_MS);
    expect(spy).not.toHaveBeenCalled();
  });

  it('says nothing about the person: addresses and ids are cleaned, a thrown object is not read', async () => {
    const { r, sent } = reporter();
    r.capture(new Error('no account for rojda@example.com'), { kind: 'uncaught', fatal: false });
    r.capture({ user: { name: 'Rojda', email: 'rojda@example.com' } }, { kind: 'uncaught', fatal: false });
    r.capture('a thrown string', { kind: 'uncaught', fatal: false });
    await r.flush();
    const reports = sent[0]!.reports;
    expect(reports.map((x) => x.message)).toEqual(['no account for [email]', 'a value of type object was thrown', 'a thrown string']);
    expect(JSON.stringify(sent[0])).not.toContain('Rojda');
  });

  it('keeps only a route name as the screen', async () => {
    const { r, sent } = reporter();
    r.noteScreen('Profile with a name in it');
    r.capture(thrown('x'), { kind: 'uncaught', fatal: false });
    await r.flush();
    expect(sent[0]!.reports[0]!.screen).toBeUndefined();
  });
});

describe('a batch too large for the server', () => {
  it('loses its last reports first, then the stacks of the one left', () => {
    const big = { kind: 'uncaught' as const, fatal: false, message: 'ک'.repeat(300), stack: 'ژ'.repeat(1500), count: 1 };
    const batch = { ...about(), reports: Array.from({ length: 10 }, () => ({ ...big })) };
    const fitted = fitBatch(batch, 10_000);
    expect(fitted.reports.length).toBeGreaterThan(0);
    expect(fitted.reports.length).toBeLessThan(10);
    expect(new TextEncoder().encode(JSON.stringify(fitted)).length).toBeLessThanOrEqual(10_000);
    const one = fitBatch(batch, 1_500);
    expect(one.reports).toHaveLength(1);
    expect(one.reports[0]!.stack).toBeUndefined();
  });
});

describe('the global error handler', () => {
  function errorUtils() {
    let handler: (error: unknown, isFatal?: boolean) => void = () => undefined;
    const previous = vi.fn();
    const utils: ErrorUtilsLike = {
      getGlobalHandler: () => previous,
      setGlobalHandler: (h) => {
        handler = h;
      },
    };
    return { utils, previous, fire: (error: unknown, isFatal?: boolean) => handler(error, isFatal) };
  }

  it('reports an error nothing caught and hands it on at once when the app goes on', async () => {
    const { r, sent } = reporter();
    const { utils, previous, fire } = errorUtils();
    installGlobalErrorHandler(r, utils);
    const error = thrown('late');
    fire(error, false);
    expect(previous).toHaveBeenCalledWith(error, false);
    await vi.advanceTimersByTimeAsync(REPORT_BATCH_DELAY_MS);
    expect(sent[0]!.reports[0]).toMatchObject({ kind: 'uncaught', fatal: false, message: 'late' });
  });

  it('sends a fatal error’s report before handing it on, since the app closes then', async () => {
    let answer: () => void = () => undefined;
    const { r, sent } = reporter(() => new Promise<void>((resolve) => (answer = resolve)));
    const { utils, previous, fire } = errorUtils();
    installGlobalErrorHandler(r, utils);
    fire(thrown('fatal'), true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.reports[0]!.fatal).toBe(true);
    expect(previous).not.toHaveBeenCalled();
    answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('does not hold the app up for long when the report cannot leave, and hands on only the first fatal error', async () => {
    const { r } = reporter(() => new Promise(() => undefined));
    const { utils, previous, fire } = errorUtils();
    installGlobalErrorHandler(r, utils);
    const first = thrown('first');
    fire(first, true);
    fire(thrown('second'), true);
    await vi.advanceTimersByTimeAsync(FATAL_REPORT_WAIT_MS);
    expect(previous).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledWith(first, true);
  });

  it('is not installed when reporting is off, so development keeps its own handler', () => {
    const { r } = reporter(undefined, false);
    const set = vi.fn();
    installGlobalErrorHandler(r, { getGlobalHandler: () => () => undefined, setGlobalHandler: set });
    expect(set).not.toHaveBeenCalled();
  });
});
