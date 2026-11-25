import type { MessageKey } from '../i18n/en';
import type { MeProfile } from '../lib/types';

/**
 * Where everything in Settings lives: ten categories on the home list, each at /app/settings/<category>, and the leaf
 * pages inside them at /app/settings/<leaf>, which keep the addresses they always had. A leaf goes back to its category
 * and a category to the home.
 */

export const CATEGORIES = ['account', 'parental', 'display', 'privacy', 'sounds', 'notifications', 'safety', 'storage', 'help', 'about'] as const;
export type SettingsCategory = (typeof CATEGORIES)[number];

export const LEAVES = ['username', 'birth-month', 'password', 'devices', 'delete', 'language', 'theme', 'keyboard', 'leagues', 'visibility', 'blocked', 'gift-limit', 'feedback'] as const;
export type SettingsLeaf = (typeof LEAVES)[number];

export type SettingsPage = SettingsCategory | SettingsLeaf;

/** The category each leaf belongs to, which its back leads to and which the list marks while it is open. */
export const LEAF_CATEGORY: Record<SettingsLeaf, SettingsCategory> = {
  username: 'account',
  'birth-month': 'account',
  password: 'account',
  devices: 'account',
  delete: 'account',
  language: 'display',
  theme: 'display',
  keyboard: 'display',
  leagues: 'privacy',
  visibility: 'privacy',
  blocked: 'privacy',
  'gift-limit': 'privacy',
  feedback: 'help',
};

/** Addresses that moved, from links already sent: the data export now lives with the cache. */
export const MOVED: Readonly<Record<string, SettingsPage>> = { data: 'storage' };

export const PAGE_TITLE: Record<SettingsPage, MessageKey> = {
  account: 'settings.eyebrow',
  parental: 'parental.title',
  display: 'settings.display.title',
  privacy: 'settings.social.title',
  sounds: 'settings.soundsVibration',
  notifications: 'notifications.title',
  safety: 'settings.safety.title',
  storage: 'settings.storage.title',
  help: 'settings.help.title',
  about: 'settings.about.title',
  username: 'settings.username.title',
  'birth-month': 'age.label',
  password: 'settings.password.title',
  devices: 'settings.devices.title',
  delete: 'settings.delete.title',
  language: 'language.settingsTitle',
  theme: 'settings.appearance.title',
  keyboard: 'keyboard.settings.title',
  leagues: 'settings.leagues.title',
  visibility: 'settings.privacy.title',
  blocked: 'settings.blocked.title',
  'gift-limit': 'settings.giftLimit.title',
  feedback: 'appFeedback.settingsTitle',
};

export const SETTINGS_HOME = '/app/settings';

export const settingsPath = (page: SettingsPage, rest = ''): string => `${SETTINGS_HOME}/${page}${rest ? `/${rest}` : ''}`;

export const isCategory = (value: string | undefined): value is SettingsCategory => (CATEGORIES as readonly string[]).includes(value ?? '');
export const isLeaf = (value: string | undefined): value is SettingsLeaf => (LEAVES as readonly string[]).includes(value ?? '');
export const isSettingsPage = (value: string | undefined): value is SettingsPage => isCategory(value) || isLeaf(value);

/** The category a page sits in: itself for a category. */
export const categoryOf = (page: SettingsPage): SettingsCategory => (isLeaf(page) ? LEAF_CATEGORY[page] : page);

/** The page an address names and what follows it (/app/settings/<page>/<rest>), or nothing for the home. */
export function readSettingsPath(pathname: string): { page?: string; rest: string } {
  const m = /^\/app\/settings(?:\/([^/]+)((?:\/[^/]+)*))?\/?$/.exec(pathname);
  return { page: m?.[1], rest: (m?.[2] ?? '').replace(/^\//, '') };
}

/** Where to write to a person about anything. */
export const SUPPORT_EMAIL = 'support@hevalo.app';

/** The account as Settings knows it, and how a page tells the list it changed something. */
export interface MeState {
  user: MeProfile | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  onChanged: (patch: Partial<MeProfile>) => void;
}
