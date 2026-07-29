import { describe, expect, it } from 'vitest';
import {
  isDarkMode,
  nextPreference,
  normalizePreference,
  PREFERENCE_LABEL,
  resolveScheme,
  THEME_PREFERENCES,
} from './appearance.js';

describe('resolveScheme', () => {
  it('an explicit preference wins over the OS scheme', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('system follows the OS scheme', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
  });

  it('defaults to light when the OS scheme is unknown', () => {
    expect(resolveScheme('system', null)).toBe('light');
  });
});

describe('isDarkMode', () => {
  it('reflects the resolved scheme', () => {
    expect(isDarkMode('dark', 'light')).toBe(true);
    expect(isDarkMode('system', 'dark')).toBe(true);
    expect(isDarkMode('system', null)).toBe(false);
  });
});

describe('nextPreference', () => {
  it('cycles System → Light → Dark → System', () => {
    expect(nextPreference('system')).toBe('light');
    expect(nextPreference('light')).toBe('dark');
    expect(nextPreference('dark')).toBe('system');
  });
});

describe('normalizePreference', () => {
  it('passes valid preferences through', () => {
    for (const p of THEME_PREFERENCES) expect(normalizePreference(p)).toBe(p);
  });

  it('falls back to system for anything invalid', () => {
    expect(normalizePreference('purple')).toBe('system');
    expect(normalizePreference(undefined)).toBe('system');
    expect(normalizePreference(null)).toBe('system');
    expect(normalizePreference(42)).toBe('system');
  });
});

describe('PREFERENCE_LABEL', () => {
  it('has a human label for every preference', () => {
    for (const p of THEME_PREFERENCES) expect(PREFERENCE_LABEL[p]).toBeTruthy();
  });
});
