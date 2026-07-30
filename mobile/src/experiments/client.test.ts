import { describe, expect, it, vi } from 'vitest';
import { ExperimentClient, type Assignments } from './client.js';

function memoryStore(initial: Assignments | null = null) {
  let value = initial;
  return {
    get: async () => value,
    set: async (a: Assignments) => {
      value = a;
    },
    read: () => value,
  };
}

describe('ExperimentClient', () => {
  it('hydrates from local storage then refreshes from the server', async () => {
    const store = memoryStore({ daily_goal_default: 'control' });
    const fetcher = vi.fn(async () => ({ ok: true, data: { assignments: { daily_goal_default: 'variant_b' } } }));
    const client = new ExperimentClient(fetcher, store);

    await client.init();
    expect(fetcher).toHaveBeenCalledWith('/experiments');
    expect(client.getVariant('daily_goal_default')).toBe('variant_b'); // server wins
    expect(store.read()).toEqual({ daily_goal_default: 'variant_b' }); // persisted
  });

  it('keeps cached assignments when the refresh fails (offline)', async () => {
    const store = memoryStore({ daily_goal_default: 'variant_b' });
    const fetcher = vi.fn(async () => ({ ok: false }));
    const client = new ExperimentClient(fetcher, store);

    await client.init();
    expect(client.getVariant('daily_goal_default')).toBe('variant_b'); // stayed cached
  });

  it('getVariant/isVariant fall back for unknown experiments', () => {
    const client = new ExperimentClient(async () => ({ ok: true, data: { assignments: {} } }));
    expect(client.getVariant('nope')).toBe('control');
    expect(client.getVariant('nope', 'fallback')).toBe('fallback');
    expect(client.isVariant('nope', 'control')).toBe(true);
  });
});
