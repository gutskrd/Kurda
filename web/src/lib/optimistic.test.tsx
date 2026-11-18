import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n/I18nProvider';
import { intentLine, useOptimistic, useOptimisticSend, type LineOptions } from './optimistic';
import { onNotice } from './notice';
import type { ApiError, ApiResult } from './types';

const OFFLINE: ApiError = { kind: 'network', message: 'network request failed' };

/** A request the test answers by hand, in any order. */
function deferred<T = unknown>(): { promise: Promise<ApiResult<T>>; answer: (res: ApiResult<T>) => Promise<void> } {
  let resolve!: (res: ApiResult<T>) => void;
  const promise = new Promise<ApiResult<T>>((r) => (resolve = r));
  return {
    promise,
    answer: async (res) => {
      resolve(res);
      // Lets the line's continuation run before the test looks.
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

/** A line over a boolean whose requests are answered by hand; `sent` lists what reached the server, in order. */
function toggleLine(initial = false, extra: Partial<LineOptions<boolean, unknown>> = {}) {
  const requests: Array<ReturnType<typeof deferred>> = [];
  const sent: boolean[] = [];
  const shown: boolean[] = [];
  const failed: ApiError[] = [];
  const line = intentLine<boolean, unknown>(initial, {
    send: (wanted) => {
      sent.push(wanted);
      const d = deferred();
      requests.push(d);
      return d.promise;
    },
    onShow: (v) => shown.push(v),
    onFailed: (e) => failed.push(e),
    ...extra,
  });
  return { line, requests, sent, shown, failed };
}

describe('intentLine', () => {
  it('shows a tap at once and keeps it once the server agrees', async () => {
    const { line, requests, sent, failed } = toggleLine();
    line.want(true);
    expect(line.shown).toBe(true);
    expect(sent).toEqual([true]);
    await requests[0]!.answer({ ok: true, data: {} });
    expect(line.shown).toBe(true);
    expect(failed).toEqual([]);
  });

  it('puts back the confirmed state and says why when the server refuses', async () => {
    const { line, requests, failed } = toggleLine();
    line.want(true);
    await requests[0]!.answer({ ok: false, error: OFFLINE });
    expect(line.shown).toBe(false);
    expect(failed).toEqual([OFFLINE]);
  });

  it('sends only the newest wanted state once the first request answers', async () => {
    const { line, requests, sent } = toggleLine();
    line.want(true);
    line.want(false);
    line.want(true);
    line.want(false);
    // One request out at a time: the taps in between are never sent.
    expect(sent).toEqual([true]);
    expect(line.shown).toBe(false);
    await requests[0]!.answer({ ok: true, data: {} });
    expect(sent).toEqual([true, false]);
    expect(line.shown).toBe(false);
    await requests[1]!.answer({ ok: true, data: {} });
    expect(line.shown).toBe(false);
  });

  it('sends nothing more when the newest tap asks for what the server now has', async () => {
    const { line, requests, sent } = toggleLine();
    line.want(true);
    line.want(false);
    line.want(true);
    await requests[0]!.answer({ ok: true, data: {} });
    expect(sent).toEqual([true]);
    expect(line.shown).toBe(true);
  });

  it('never undoes a newer tap: a refused first request still lets the newest one go', async () => {
    const requests: Array<ReturnType<typeof deferred>> = [];
    const sent: string[] = [];
    const failed: ApiError[] = [];
    const line = intentLine<string, unknown>('a', {
      send: (wanted) => {
        sent.push(wanted);
        const d = deferred();
        requests.push(d);
        return d.promise;
      },
      onShow: () => undefined,
      onFailed: (e) => failed.push(e),
    });
    line.want('b');
    line.want('c');
    await requests[0]!.answer({ ok: false, error: OFFLINE });
    // Nothing is said for the first: the newest choice is on its way.
    expect(failed).toEqual([]);
    expect(line.shown).toBe('c');
    expect(sent).toEqual(['b', 'c']);
    await requests[1]!.answer({ ok: true, data: {} });
    expect(line.shown).toBe('c');
  });

  it('says nothing when a refused request was already taken back by a newer tap', async () => {
    const { line, requests, sent, failed } = toggleLine();
    line.want(true);
    line.want(false);
    await requests[0]!.answer({ ok: false, error: OFFLINE });
    expect(sent).toEqual([true]);
    expect(line.shown).toBe(false);
    expect(failed).toEqual([]);
  });

  it('lets the server’s answer have the last word where it returns the true state', async () => {
    const requests: Array<ReturnType<typeof deferred<{ count: number }>>> = [];
    const line = intentLine<number, { count: number }>(1, {
      send: () => {
        const d = deferred<{ count: number }>();
        requests.push(d);
        return d.promise;
      },
      fromAnswer: (data) => data.count,
      onShow: () => undefined,
      onFailed: () => undefined,
    });
    line.want(2);
    expect(line.shown).toBe(2);
    await requests[0]!.answer({ ok: true, data: { count: 3 } });
    expect(line.shown).toBe(3);
  });

  it('adopts a fresh read at once, but not over a request still out', async () => {
    const { line, requests } = toggleLine();
    line.heard(true);
    expect(line.shown).toBe(true);
    line.want(false);
    line.heard(true);
    expect(line.shown).toBe(false);
    await requests[0]!.answer({ ok: true, data: {} });
    expect(line.shown).toBe(false);
  });
});

function Toggle({ send, value = false }: { send: (on: boolean) => Promise<ApiResult<unknown>>; value?: boolean }): React.JSX.Element {
  const [on, want] = useOptimistic(value, send);
  return (
    <button type="button" aria-pressed={on} onClick={() => want((v) => !v)}>
      Save
    </button>
  );
}

describe('useOptimistic', () => {
  it('turns before the server answers, and turns back with a notice when it refuses', async () => {
    const notices: string[] = [];
    const stop = onNotice((text) => notices.push(text));
    const d = deferred();
    render(
      <I18nProvider>
        <Toggle send={() => d.promise} />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-pressed', 'true');
    await act(() => d.answer({ ok: false, error: OFFLINE }));
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-pressed', 'false');
    expect(notices).toEqual(['Can’t reach Hevalo right now. Check your connection and try again.']);
    stop();
  });

  it('follows the caller’s value when it changes from outside', async () => {
    const send = vi.fn();
    const view = render(
      <I18nProvider>
        <Toggle send={send} />
      </I18nProvider>,
    );
    view.rerender(
      <I18nProvider>
        <Toggle send={send} value />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-pressed', 'true');
    expect(send).not.toHaveBeenCalled();
  });
});

function Removable({ send }: { send: () => Promise<ApiResult<unknown>> }): React.JSX.Element {
  const [here, setHere] = useState(true);
  const sendShown = useOptimisticSend();
  return here ? (
    <button
      type="button"
      onClick={() => {
        setHere(false);
        void sendShown(send, { undo: () => setHere(true) }, { goneIsDone: true });
      }}
    >
      Remove
    </button>
  ) : (
    <p>Gone</p>
  );
}

describe('useOptimisticSend', () => {
  it('takes a removal back with a translated notice when the server refuses it', async () => {
    const notices: string[] = [];
    const stop = onNotice((text) => notices.push(text));
    const d = deferred();
    render(
      <I18nProvider>
        <Removable send={() => d.promise} />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Gone')).toBeInTheDocument();
    await act(() => d.answer({ ok: false, error: { kind: 'client', status: 403, message: 'not yours' } }));
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(notices).toEqual(['Something went wrong. Please try again.']);
    stop();
  });

  it('counts a removal of something already gone as done', async () => {
    const d = deferred();
    render(
      <I18nProvider>
        <Removable send={() => d.promise} />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await act(() => d.answer({ ok: false, error: { kind: 'client', status: 404, message: 'no such thing' } }));
    expect(screen.getByText('Gone')).toBeInTheDocument();
  });
});
