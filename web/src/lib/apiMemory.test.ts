import { describe, it, expect, vi } from 'vitest';
import { GUEST, ask, forgetAnswers, justAnswered, lastAnswer, remember } from './apiMemory';
import type { ApiResult } from './types';

/** A client whose GET answers from a list, one answer per call, and counts the calls. */
function clientAnswering(...answers: Array<ApiResult<unknown>>) {
  const get = vi.fn(async () => answers.shift() ?? { ok: true as const, data: null });
  return { get: get as unknown as <T>(path: string) => Promise<ApiResult<T>>, calls: () => get.mock.calls.length };
}

describe('the last answers the app keeps', () => {
  it('keeps what a question was answered with, for whoever asked', async () => {
    const client = clientAnswering({ ok: true, data: { friends: ['rojda'] } });
    await ask(client, 'u1', '/friends');
    expect(lastAnswer('u1', '/friends')?.data).toEqual({ friends: ['rojda'] });
    expect(justAnswered('u1', '/friends')).toBe(true);
  });

  it('hands one account’s answers to nobody else: another person asking empties it first', async () => {
    const client = clientAnswering({ ok: true, data: { friends: ['rojda'] } });
    await ask(client, 'u1', '/friends');
    expect(lastAnswer('u2', '/friends')).toBeNull();
    // and it does not come back for the first person either: it was dropped, not hidden
    expect(lastAnswer('u1', '/friends')).toBeNull();
  });

  it('keeps a visitor’s answers apart from an account’s', () => {
    remember(GUEST, '/feed', { items: [1] });
    expect(lastAnswer('u1', '/feed')).toBeNull();
  });

  it('is emptied in one go', () => {
    remember('u1', '/me', { user: 'me' });
    forgetAnswers();
    expect(lastAnswer('u1', '/me')).toBeNull();
  });

  it('asks once when two screens ask the same thing at the same moment', async () => {
    const client = clientAnswering({ ok: true, data: { due: 3 } });
    const [a, b] = await Promise.all([ask(client, 'u1', '/practice/due'), ask(client, 'u1', '/practice/due')]);
    expect(client.calls()).toBe(1);
    expect(a).toEqual(b);
  });

  it('gives back the object already held when the same answer arrives again', async () => {
    const client = clientAnswering({ ok: true, data: { due: 3 } }, { ok: true, data: { due: 3 } });
    const first = await ask<{ due: number }>(client, 'u1', '/practice/due');
    const second = await ask<{ due: number }>(client, 'u1', '/practice/due');
    expect(first.ok && second.ok && first.data === second.data).toBe(true);
  });

  it('drops an answer the server now refuses, and keeps one it only failed to reach', async () => {
    remember('u1', '/library/posts/p1', { title: 'Baran' });
    await ask(clientAnswering({ ok: false, error: { kind: 'network', message: 'offline' } }), 'u1', '/library/posts/p1');
    expect(lastAnswer('u1', '/library/posts/p1')?.data).toEqual({ title: 'Baran' });
    await ask(clientAnswering({ ok: false, error: { kind: 'client', status: 404, message: 'gone' } }), 'u1', '/library/posts/p1');
    expect(lastAnswer('u1', '/library/posts/p1')).toBeNull();
  });

  it('keeps nothing from a request that was still on its way when the memory was emptied', async () => {
    let answer: (res: ApiResult<unknown>) => void = () => undefined;
    const waiting = new Promise<ApiResult<unknown>>((resolve) => (answer = resolve));
    const client = { get: (() => waiting) as <T>(path: string) => Promise<ApiResult<T>> };
    const pending = ask(client, 'u1', '/me');
    forgetAnswers();
    answer({ ok: true, data: { user: 'the one who signed out' } });
    await pending;
    expect(lastAnswer('u1', '/me')).toBeNull();
  });
});
