import { describe, expect, it } from 'vitest';
import { buildSettings, settingsRowIds, type SettingsContext } from './model.js';

const signedIn: SettingsContext = { signedIn: true, providerLabel: 'Apple', appVersion: '1.2.3' };
const guest: SettingsContext = { signedIn: false, appVersion: '1.2.3' };

describe('buildSettings — account section adapts', () => {
  it('signed-in users get account info, log out, and delete account', () => {
    const ids = settingsRowIds(buildSettings(signedIn));
    expect(ids).toContain('account_info');
    expect(ids).toContain('logout');
    expect(ids).toContain('delete_account');
    expect(ids).not.toContain('create_account');
  });

  it('guests get create account, no log out / delete', () => {
    const ids = settingsRowIds(buildSettings(guest));
    expect(ids).toContain('create_account');
    expect(ids).not.toContain('logout');
    expect(ids).not.toContain('delete_account');
  });

  it('shows the provider label on the account info row', () => {
    const account = buildSettings(signedIn)[0];
    const info = account?.rows.find((r) => r.id === 'account_info');
    expect(info?.value).toBe('Apple');
  });

  it('marks Delete Account as destructive', () => {
    const del = buildSettings(signedIn)[0]?.rows.find((r) => r.id === 'delete_account');
    expect(del?.destructive).toBe(true);
  });
});

describe('buildSettings — common hub', () => {
  it('has all the Apple-expected sections in order', () => {
    const sections = buildSettings(signedIn).map((s) => s.id);
    expect(sections).toEqual([
      'account',
      'appearance',
      'language',
      'notifications',
      'privacy',
      'onboarding',
      'about',
    ]);
  });

  it('exposes reset onboarding, privacy + data export, and appearance', () => {
    const ids = settingsRowIds(buildSettings(guest));
    expect(ids).toEqual(
      expect.arrayContaining(['appearance', 'language', 'notifications', 'privacy', 'data_export', 'reset_onboarding', 'about']),
    );
  });

  it('shows the app version on the About row', () => {
    const about = buildSettings(signedIn).find((s) => s.id === 'about');
    expect(about?.rows[0]?.value).toBe('1.2.3');
  });

  it('every row carries an i18n label key', () => {
    for (const section of buildSettings(signedIn)) {
      expect(section.titleKey).toMatch(/^settings\./);
      for (const row of section.rows) expect(row.labelKey).toMatch(/^settings\./);
    }
  });
});
