import { afterEach, describe, expect, it } from 'vitest';
import { apiBaseUrl, defaultApiBaseUrl } from './env.js';

// __DEV__ is a bundler-injected global (RN/Metro) — not defined under vitest,
// so set it explicitly per test via a typed cast (RN declares it as a bare var,
// not a globalThis property).
const g = globalThis as typeof globalThis & { __DEV__?: boolean };
afterEach(() => {
  delete g.__DEV__;
});

describe('apiBaseUrl', () => {
  it('production points at the live API', () => {
    expect(apiBaseUrl('production')).toBe('https://kurda-api.onrender.com');
  });

  it('development is the local server', () => {
    expect(apiBaseUrl('development')).toBe('http://localhost:3000');
  });

  it('an explicit override wins', () => {
    expect(apiBaseUrl('production', 'https://custom.example')).toBe('https://custom.example');
  });
});

describe('defaultApiBaseUrl', () => {
  it('uses the live API in a release build (__DEV__ false) — never localhost', () => {
    g.__DEV__ = false;
    expect(defaultApiBaseUrl()).toBe('https://kurda-api.onrender.com');
  });

  it('uses the local server only in a dev build (__DEV__ true)', () => {
    g.__DEV__ = true;
    expect(defaultApiBaseUrl()).toBe('http://localhost:3000');
  });
});
