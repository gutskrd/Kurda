/**
 * When the phone asks to send notifications, and what Settings offers in its
 * place (KUR-094). Pure, with no React Native, so the rules can be read and
 * tested apart from expo-notifications (device.ts does the asking).
 *
 * The app never asks at launch. It asks once there is a reason a person can
 * see: after a lesson, with a short card they can turn down, or from
 * Settings → Notification settings when they go looking.
 */
import type { DeviceStore } from '../keyboard/deviceStore';

export interface PushPermissionState {
  /**
   * `undetermined`: never asked, the system prompt will show. `denied`: said
   * no. `unavailable`: no push here at all (the web build).
   */
  status: 'granted' | 'undetermined' | 'denied' | 'unavailable';
  /**
   * Whether asking again would show the system prompt. iOS asks once and
   * after that only its Settings app can change the answer; Android asks
   * again after one refusal.
   */
  canAsk: boolean;
}

export const PUSH_UNAVAILABLE: PushPermissionState = { status: 'unavailable', canAsk: false };

/** The few fields of expo-notifications' answer that the rules read. */
export interface PermissionAnswer {
  status: string;
  granted?: boolean;
  canAskAgain?: boolean;
  ios?: { status?: number } | null;
}

/** iOS's quiet delivery (provisional, ephemeral): allowed, without having been asked. */
const IOS_QUIET_ALLOWED = new Set([3, 4]);

export function toPermissionState(answer: PermissionAnswer): PushPermissionState {
  if (answer.granted === true || answer.status === 'granted') return { status: 'granted', canAsk: false };
  if (answer.ios?.status !== undefined && IOS_QUIET_ALLOWED.has(answer.ios.status)) return { status: 'granted', canAsk: false };
  if (answer.status === 'undetermined') return { status: 'undetermined', canAsk: answer.canAskAgain !== false };
  return { status: 'denied', canAsk: answer.canAskAgain === true };
}

/**
 * What the control in Settings does: show the system prompt while it still
 * can, otherwise send the person to the phone's own settings, where the
 * answer now lives. Nothing to do once notifications are allowed.
 */
export function settingsAction(state: PushPermissionState): 'request' | 'openSettings' | 'none' {
  if (state.status === 'granted' || state.status === 'unavailable') return 'none';
  return state.canAsk ? 'request' : 'openSettings';
}

// ---- the offer after a lesson -------------------------------------------------------

/** Kept on this phone: how often the card after a lesson has been shown, and when last. */
export interface OfferRecord {
  shown: number;
  lastShownAt: string;
}

export const OFFER_KEY = 'hevalo_reminder_offer_v1';
/** A card that was passed over may come back once, and not before a week has gone by. */
export const REOFFER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_OFFERS = 2;

/**
 * Whether to show "Want a gentle reminder?" at the end of a lesson.
 *
 * Only while the system prompt has never been shown: someone who answered it
 * either way has answered. A card passed over (Not now, or Done without a
 * word) comes back once, a week later at the soonest, and never again after
 * that; Settings is where they can still find it.
 *
 * Never to a child. No account is under 13 (the server refuses the sign-up),
 * so the children with accounts are the 13 to 17 year olds — and for them the
 * reminders start switched off (api notifications/prefs.ts), because a nudge
 * to keep a run going should be a young person's own choice. Asking them
 * unprompted would be that nudge by another road, so they are not offered it,
 * nor is an account whose age is not known; Settings works for everyone.
 */
export function shouldOfferReminders(input: {
  permission: PushPermissionState;
  record: OfferRecord | null;
  /** true for 13–17, false for an adult, null when the app cannot tell */
  minor: boolean | null;
  now: number;
}): boolean {
  const { permission, record, minor, now } = input;
  if (permission.status !== 'undetermined' || !permission.canAsk) return false;
  if (minor !== false) return false;
  if (!record) return true;
  if (record.shown >= MAX_OFFERS) return false;
  const last = Date.parse(record.lastShownAt);
  return Number.isFinite(last) && now - last >= REOFFER_AFTER_MS;
}

/** The record once the card has been shown at `now`. */
export function noteOffer(record: OfferRecord | null, now: number): OfferRecord {
  return { shown: (record?.shown ?? 0) + 1, lastShownAt: new Date(now).toISOString() };
}

/** A stored record, or null for none or for one that cannot be read (which reads as never shown). */
export function parseOfferRecord(raw: string | null): OfferRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OfferRecord>;
    if (typeof value.shown !== 'number' || typeof value.lastShownAt !== 'string') return null;
    return { shown: value.shown, lastShownAt: value.lastShownAt };
  } catch {
    return null;
  }
}

export async function readOfferRecord(store: DeviceStore): Promise<OfferRecord | null> {
  return parseOfferRecord(await store.get(OFFER_KEY));
}

export async function saveOfferShown(store: DeviceStore, now: number): Promise<void> {
  const next = noteOffer(await readOfferRecord(store), now);
  await store.set(OFFER_KEY, JSON.stringify(next));
}
