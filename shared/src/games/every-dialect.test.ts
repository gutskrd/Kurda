import { describe, expect, it } from 'vitest';
import { readEveryDialect, type DialectsClient } from './every-dialect.js';

type Offer = { dialect: 'kmr' | 'ckb'; n: number };
type Err = { code?: string; message: string };

/** An API answering from `answers` by path, and the paths it was asked. */
function api(answers: Record<string, { ok: true; data: unknown } | { ok: false; error: Err }>): { client: DialectsClient<Err>; asked: string[] } {
  const asked: string[] = [];
  const client = {
    get: async (path: string) => {
      asked.push(path);
      return answers[path] ?? { ok: false, error: { code: 'NOT_FOUND', message: 'route not found' } };
    },
  } as unknown as DialectsClient<Err>;
  return { client, asked };
}

describe('reading both varieties at once', () => {
  it('asks once and gives each variety’s answer', async () => {
    const both = [{ dialect: 'kmr', n: 1 }, { dialect: 'ckb', n: 2 }];
    const { client, asked } = api({ '/games/availability': { ok: true, data: { dialects: both } } });
    expect(await readEveryDialect<Offer, Err>(client, '/games/availability')).toEqual({ ok: true, data: both });
    expect(asked).toEqual(['/games/availability']);
  });

  it('asks an API from before the form once per variety', async () => {
    const { client, asked } = api({
      '/games/impostor/couch': { ok: false, error: { code: 'VALIDATION_ERROR', message: 'dialect: required' } },
      '/games/impostor/couch?dialect=kmr': { ok: true, data: { dialect: 'kmr', n: 1 } },
      '/games/impostor/couch?dialect=ckb': { ok: true, data: { dialect: 'ckb', n: 2 } },
    });
    expect(await readEveryDialect<Offer, Err>(client, '/games/impostor/couch')).toEqual({
      ok: true,
      data: [
        { dialect: 'kmr', n: 1 },
        { dialect: 'ckb', n: 2 },
      ],
    });
    expect(asked).toEqual(['/games/impostor/couch', '/games/impostor/couch?dialect=kmr', '/games/impostor/couch?dialect=ckb']);
  });

  it('passes on any other failure as it is', async () => {
    const down = { ok: false as const, error: { code: 'UNAVAILABLE', message: 'down' } };
    const { client, asked } = api({ '/games/availability': down });
    expect(await readEveryDialect<Offer, Err>(client, '/games/availability')).toEqual(down);
    expect(asked).toHaveLength(1);
  });
});
