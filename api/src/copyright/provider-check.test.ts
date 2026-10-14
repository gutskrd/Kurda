import { describe, expect, it } from 'vitest';
import { PROVIDER } from '@kurda/shared';
import { providerPlaceholderWarnings } from './provider-check.js';

describe('provider placeholders at boot', () => {
  it('names the copyright contact that is still a placeholder, in production', () => {
    const warnings = providerPlaceholderWarnings('production', { ...PROVIDER, copyrightEmail: '[copyright@your-domain]' });
    expect(warnings.some((w) => w.startsWith('PROVIDER.copyrightEmail') && w.includes('[copyright@your-domain]'))).toBe(true);
  });

  it('says nothing once the details are filled in', () => {
    const filled = {
      ...PROVIDER,
      copyrightEmail: 'copyright@hevalo.app',
      dmcaAgent: { ...PROVIDER.dmcaAgent, email: 'copyright@hevalo.app' },
    };
    expect(providerPlaceholderWarnings('production', filled)).toEqual([]);
  });

  it('stays quiet in development and tests', () => {
    expect(providerPlaceholderWarnings('development', { ...PROVIDER, copyrightEmail: '[x]' })).toEqual([]);
    expect(providerPlaceholderWarnings('test', { ...PROVIDER, copyrightEmail: '[x]' })).toEqual([]);
  });
});
