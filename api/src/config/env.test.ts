import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

describe('loadConfig', () => {
  it('applies defaults for a minimal environment', () => {
    const config = loadConfig({});
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.GIT_SHA).toBe('unknown');
  });

  it('rejects an invalid PORT and names the variable', () => {
    expect(() => loadConfig({ PORT: 'not-a-port' })).toThrow(/PORT/);
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV and names the variable', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging-ish' })).toThrow(/NODE_ENV/);
  });

  it('lists every invalid variable in one error', () => {
    let message = '';
    try {
      loadConfig({ PORT: 'x', LOG_LEVEL: 'shouty' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('PORT');
    expect(message).toContain('LOG_LEVEL');
  });

  it('returns a frozen config object', () => {
    const config = loadConfig({});
    expect(Object.isFrozen(config)).toBe(true);
  });
});
