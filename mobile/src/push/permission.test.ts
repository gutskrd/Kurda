import { describe, expect, it, vi } from 'vitest';
// The device store reads the platform; the rules themselves never touch React Native.
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
import { memoryStore } from '../keyboard/deviceStore';
import {
  MAX_OFFERS,
  OFFER_KEY,
  PUSH_UNAVAILABLE,
  REOFFER_AFTER_MS,
  minorStatus,
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
    // iOS: one answer, and only the Settings app can change it.
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
  const REFUSED_FOR_GOOD: PushPermissionState = { status: 'denied', canAsk: false };
  const adult = (over: Partial<Parameters<typeof shouldNudgeReminders>[0]> = {}) =>
    shouldNudgeReminders({ permission: REFUSED_FOR_GOOD, record: null, minor: false, now: NOW, ...over });

  it('tells an adult whose phone will not ask again where reminders are turned on', () => {
    expect(adult()).toBe(true);
    expect(settingsAction(REFUSED_FOR_GOOD)).toBe('openSettings');
  });

  it('never stands in front of the phone’s own question: nothing while the phone could still ask', () => {
    expect(adult({ permission: NEVER_ASKED })).toBe(false);
    // Android, after one refusal: asking again would still show its prompt.
    expect(adult({ permission: { status: 'denied', canAsk: true } })).toBe(false);
  });

  it('is shown exactly where its button opens the phone’s settings, whatever the phone answers', () => {
    const answers: PushPermissionState[] = [
      NEVER_ASKED,
      { status: 'undetermined', canAsk: false },
      { status: 'denied', canAsk: true },
      REFUSED_FOR_GOOD,
      { status: 'granted', canAsk: false },
      PUSH_UNAVAILABLE,
    ];
    for (const permission of answers) expect(adult({ permission }), JSON.stringify(permission)).toBe(settingsAction(permission) === 'openSettings');
  });

  it('says nothing once reminders are on, or where there are none', () => {
    expect(adult({ permission: { status: 'granted', canAsk: false } })).toBe(false);
    expect(adult({ permission: PUSH_UNAVAILABLE })).toBe(false);
  });

  it('never offers a minor, nor an account whose age is not known', () => {
    expect(adult({ minor: true })).toBe(false);
    expect(adult({ minor: null })).toBe(false);
  });

  it('spends the same budget as the screen after a lesson: a week apart, and twice in all', () => {
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
    // Android could ask again, but they already said no to the phone itself.
    expect(adult({ permission: { status: 'denied', canAsk: true } })).toBe(false);
    expect(adult({ permission: PUSH_UNAVAILABLE })).toBe(false);
  });

  it('never offers a minor, nor an account whose age is not known', () => {
    expect(adult({ minor: true })).toBe(false);
    expect(adult({ minor: null })).toBe(false);
  });

  it('is offered only where its one button leads to the phone’s question', () => {
    const answers: PushPermissionState[] = [
      NEVER_ASKED,
      { status: 'undetermined', canAsk: false },
      { status: 'denied', canAsk: true },
      { status: 'denied', canAsk: false },
      { status: 'granted', canAsk: false },
      PUSH_UNAVAILABLE,
    ];
    for (const permission of answers) {
      if (adult({ permission })) expect(settingsAction(permission), JSON.stringify(permission)).toBe('request');
    }
    // A phone that says it was never asked and will not ask: the button would lead nowhere.
    expect(adult({ permission: { status: 'undetermined', canAsk: false } })).toBe(false);
  });

  it('remembers the screen was shown, and does not show it again within the week', () => {
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

  it('reads a record it cannot make sense of as a screen already shown recently, not as a reason to ask', () => {
    expect(adult({ record: { shown: 1, lastShownAt: 'yesterday-ish' } })).toBe(false);
  });
});

describe('minorStatus', () => {
  /** A server answering `/me` with `reply`, counting the calls. */
  const server = (reply: unknown) => {
    const get = vi.fn(async () => reply);
    return { get: get as unknown as Parameters<typeof minorStatus>[1]['get'], asked: get };
  };

  it('answers from the session when it knows, and asks the server only when it does not', async () => {
    const me = server({ ok: true, data: { user: { minor: true } } });
    expect(await minorStatus({ minor: false }, me)).toBe(false);
    expect(await minorStatus({ minor: true }, me)).toBe(true);
    expect(me.asked).not.toHaveBeenCalled();
    // A fresh sign-in: the session says nothing of the age yet.
    expect(await minorStatus({}, me)).toBe(true);
    expect(await minorStatus(null, me)).toBe(true);
    expect(me.asked).toHaveBeenCalledTimes(2);
    expect(me.asked).toHaveBeenCalledWith('/me');
  });

  /*
   * The server's `minor` means "known to be 13 to 17", so it is false for guests and accounts without a birth
   * month; those must not be read as adults.
   */
  it('does not take a guest, or an account with no birth month on record, for an adult', async () => {
    const adultLooking = server({ ok: true, data: { user: { minor: false } } });
    expect(await minorStatus({ minor: false, guest: true }, adultLooking)).toBeNull();
    expect(await minorStatus({ minor: false, birthDateRequired: true }, adultLooking)).toBeNull();
    // Known from the session alone: the server is not asked.
    expect(adultLooking.asked).not.toHaveBeenCalled();
    // And when it is the server that says so.
    expect(await minorStatus({}, server({ ok: true, data: { user: { minor: false, guest: true } } }))).toBeNull();
    expect(await minorStatus({}, server({ ok: true, data: { user: { minor: false, birthDateRequired: true } } }))).toBeNull();
    expect(await minorStatus({}, server({ ok: true, data: { user: { minor: false, guest: false, birthDateRequired: false } } }))).toBe(false);
  });

  it('cannot say when the server cannot, which neither rule reads as an adult', async () => {
    expect(await minorStatus({}, server({ ok: false, error: { kind: 'network', message: 'offline' } }))).toBeNull();
    expect(await minorStatus({}, server({ ok: true, data: { user: {} } }))).toBeNull();
    expect(await minorStatus({}, server({ ok: true, data: {} }))).toBeNull();
    for (const rule of [shouldOfferReminders, shouldNudgeReminders]) {
      for (const permission of [NEVER_ASKED, { status: 'denied', canAsk: false } as const]) {
        expect(rule({ permission, record: null, minor: null, now: NOW })).toBe(false);
      }
    }
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
