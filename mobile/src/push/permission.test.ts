import { describe, expect, it, vi } from 'vitest';
// the device store reads the platform; the rules themselves never touch React Native
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
import { memoryStore } from '../keyboard/deviceStore';
import {
  MAX_OFFERS,
  OFFER_KEY,
  PUSH_UNAVAILABLE,
  REOFFER_AFTER_MS,
  noteOffer,
  parseOfferRecord,
  readOfferRecord,
  saveOfferShown,
  settingsAction,
  shouldNudgeReminders,
  shouldOfferReminders,
  toPermissionState,
  type OfferRecord,
  type PushPermissionState,
} from './permission';

const NOW = Date.parse('2026-10-21T18:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const NEVER_ASKED: PushPermissionState = { status: 'undetermined', canAsk: true };
const shownAgo = (ms: number, shown = 1): OfferRecord => ({ shown, lastShownAt: new Date(NOW - ms).toISOString() });

describe('toPermissionState', () => {
  it('reads granted, never asked and refused', () => {
    expect(toPermissionState({ status: 'granted', granted: true, canAskAgain: true })).toEqual({ status: 'granted', canAsk: false });
    expect(toPermissionState({ status: 'undetermined', granted: false, canAskAgain: true })).toEqual(NEVER_ASKED);
    // iOS: one answer, and only the Settings app can change it
    expect(toPermissionState({ status: 'denied', granted: false, canAskAgain: false })).toEqual({ status: 'denied', canAsk: false });
  });

  it('knows Android will show the prompt again after one refusal', () => {
    expect(toPermissionState({ status: 'denied', granted: false, canAskAgain: true })).toEqual({ status: 'denied', canAsk: true });
  });

  it('counts iOS quiet delivery (provisional, ephemeral) as allowed', () => {
    expect(toPermissionState({ status: 'denied', granted: false, ios: { status: 3 } }).status).toBe('granted');
    expect(toPermissionState({ status: 'denied', granted: false, ios: { status: 4 } }).status).toBe('granted');
    expect(toPermissionState({ status: 'denied', granted: false, ios: { status: 1 } }).status).toBe('denied');
  });
});

describe('settingsAction', () => {
  it('shows the system prompt while the phone still will', () => {
    expect(settingsAction(NEVER_ASKED)).toBe('request');
    expect(settingsAction({ status: 'denied', canAsk: true })).toBe('request');
  });

  it('opens the phone’s settings once only they can change the answer', () => {
    expect(settingsAction({ status: 'denied', canAsk: false })).toBe('openSettings');
  });

  it('has nothing to do when allowed, or where there is no push', () => {
    expect(settingsAction({ status: 'granted', canAsk: false })).toBe('none');
    expect(settingsAction(PUSH_UNAVAILABLE)).toBe('none');
  });
});

describe('shouldNudgeReminders', () => {
  const adult = (over: Partial<Parameters<typeof shouldNudgeReminders>[0]> = {}) =>
    shouldNudgeReminders({ permission: NEVER_ASKED, record: null, minor: false, now: NOW, ...over });

  it('offers an adult whose reminders are off, never asked or turned down', () => {
    expect(adult()).toBe(true);
    expect(adult({ permission: { status: 'denied', canAsk: false } })).toBe(true);
    expect(adult({ permission: { status: 'denied', canAsk: true } })).toBe(true);
  });

  it('says nothing once reminders are on, or where there are none', () => {
    expect(adult({ permission: { status: 'granted', canAsk: false } })).toBe(false);
    expect(adult({ permission: PUSH_UNAVAILABLE })).toBe(false);
  });

  it('never offers a minor, nor an account whose age is not known', () => {
    expect(adult({ minor: true })).toBe(false);
    expect(adult({ minor: null })).toBe(false);
  });

  it('spends the same budget as the card after a lesson: a week apart, and twice in all', () => {
    expect(adult({ record: shownAgo(6 * DAY) })).toBe(false);
    expect(adult({ record: shownAgo(7 * DAY) })).toBe(true);
    expect(adult({ record: shownAgo(30 * DAY, MAX_OFFERS) })).toBe(false);
  });
});

describe('shouldOfferReminders', () => {
  const adult = (over: Partial<Parameters<typeof shouldOfferReminders>[0]> = {}) =>
    shouldOfferReminders({ permission: NEVER_ASKED, record: null, minor: false, now: NOW, ...over });

  it('offers an adult who has never been asked, after their first lesson', () => {
    expect(adult()).toBe(true);
  });

  it('never offers once the system prompt has been answered, either way', () => {
    expect(adult({ permission: { status: 'granted', canAsk: false } })).toBe(false);
    expect(adult({ permission: { status: 'denied', canAsk: false } })).toBe(false);
    // Android could ask again, but they already said no to the phone itself
    expect(adult({ permission: { status: 'denied', canAsk: true } })).toBe(false);
    expect(adult({ permission: PUSH_UNAVAILABLE })).toBe(false);
  });

  it('never offers a minor, nor an account whose age is not known', () => {
    expect(adult({ minor: true })).toBe(false);
    expect(adult({ minor: null })).toBe(false);
  });

  it('remembers a card passed over, and does not show it again within the week', () => {
    expect(adult({ record: shownAgo(0) })).toBe(false);
    expect(adult({ record: shownAgo(DAY) })).toBe(false);
    expect(adult({ record: shownAgo(REOFFER_AFTER_MS - 1) })).toBe(false);
  });

  it('offers once more after seven days, and never after that', () => {
    expect(adult({ record: shownAgo(REOFFER_AFTER_MS) })).toBe(true);
    expect(adult({ record: shownAgo(30 * DAY) })).toBe(true);
    expect(MAX_OFFERS).toBe(2);
    expect(adult({ record: shownAgo(REOFFER_AFTER_MS, 2) })).toBe(false);
    expect(adult({ record: shownAgo(365 * DAY, 2) })).toBe(false);
  });

  it('reads a record it cannot make sense of as a card already shown recently, not as a reason to ask', () => {
    expect(adult({ record: { shown: 1, lastShownAt: 'yesterday-ish' } })).toBe(false);
  });
});

describe('the offer record', () => {
  it('counts each showing and when it was', () => {
    const first = noteOffer(null, NOW);
    expect(first).toEqual({ shown: 1, lastShownAt: new Date(NOW).toISOString() });
    expect(noteOffer(first, NOW + REOFFER_AFTER_MS)).toEqual({ shown: 2, lastShownAt: new Date(NOW + REOFFER_AFTER_MS).toISOString() });
  });

  it('treats nothing stored, or something unreadable, as never shown', () => {
    expect(parseOfferRecord(null)).toBeNull();
    expect(parseOfferRecord('not json')).toBeNull();
    expect(parseOfferRecord('{"shown":"one"}')).toBeNull();
    expect(parseOfferRecord('{"shown":1,"lastShownAt":"2026-10-21T18:00:00.000Z"}')).toEqual({ shown: 1, lastShownAt: '2026-10-21T18:00:00.000Z' });
  });

  it('is kept on the phone, and the second showing ends the offers', async () => {
    const store = memoryStore();
    expect(await readOfferRecord(store)).toBeNull();
    await saveOfferShown(store, NOW);
    expect(JSON.parse(store.data.get(OFFER_KEY)!)).toEqual({ shown: 1, lastShownAt: new Date(NOW).toISOString() });
    const later = NOW + REOFFER_AFTER_MS;
    expect(shouldOfferReminders({ permission: NEVER_ASKED, record: await readOfferRecord(store), minor: false, now: later })).toBe(true);
    await saveOfferShown(store, later);
    expect(shouldOfferReminders({ permission: NEVER_ASKED, record: await readOfferRecord(store), minor: false, now: later + 90 * DAY })).toBe(false);
  });
});
