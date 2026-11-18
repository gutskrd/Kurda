/**
 * When to ask for notification permission, and what Settings offers instead. Pure, so the rules are tested apart
 * from expo-notifications (device.ts does the asking).
 *
 * The app never asks at launch. It asks when there is a visible reason: after a lesson, from a screen saying what
 * Hevalo would send, or from Settings → Notification settings. Each leads to the system prompt by a single
 * "Continue" button; yes and no belong to the prompt, since an "Allow" or "Not now" screen in front of it steers
 * the answer and breaks platform guidelines.
 */
import type { ApiClient } from '../api/client';
import type { DeviceStore } from '../keyboard/deviceStore';

export interface PushPermissionState {
  /** `undetermined`: never asked, the system prompt will show. `denied`: declined. `unavailable`: no push here (the web build). */
  status: 'granted' | 'undetermined' | 'denied' | 'unavailable';
  /**
   * Whether asking again would show the system prompt: iOS asks once and then only its Settings app can change
   * it; Android asks again after one refusal.
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
 * What the Settings control does: show the system prompt while it still can, otherwise open the phone's settings.
 * Nothing once notifications are allowed.
 */
export function settingsAction(state: PushPermissionState): 'request' | 'openSettings' | 'none' {
  if (state.status === 'granted' || state.status === 'unavailable') return 'none';
  return state.canAsk ? 'request' : 'openSettings';
}

// ---- the offer after a lesson -------------------------------------------------------

/** Kept on this device: how often reminders were raised (the post-lesson screen, Learn's banner), and when last. */
export interface OfferRecord {
  shown: number;
  lastShownAt: string;
}

export const OFFER_KEY = 'hevalo_reminder_offer_v1';
/** Reminders may be brought up once more, and not before a week has gone by. */
export const REOFFER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_OFFERS = 2;

/**
 * Whether a lesson's results are followed by the pre-prompt screen (ReminderOffer.tsx). Only while the system
 * prompt has never been shown and still can be, since the screen's one button must lead to it. Counted when seen;
 * it can return once, a week later at the soonest, only if the prompt never reached the person, and Settings
 * remains after that.
 *
 * Never to minors: accounts start at 13 (the server refuses younger sign-ups), and 13–17 year olds have reminders
 * off by default (api notifications/prefs.ts) so keeping a streak stays their own choice. Accounts of unknown
 * age, guests included, are treated the same (`minorStatus`); Settings works for everyone.
 */
export function shouldOfferReminders(input: {
  permission: PushPermissionState;
  record: OfferRecord | null;
  /** True for 13–17, false for an adult, null when the app cannot tell. */
  minor: boolean | null;
  now: number;
}): boolean {
  const { permission, record, minor, now } = input;
  if (permission.status !== 'undetermined' || !permission.canAsk) return false;
  if (minor !== false) return false;
  return offerDue(record, now);
}

/**
 * Whether Learn's banner may explain reminders with a link to the phone's settings: only once the phone will not
 * ask again (`settingsAction` is 'openSettings'). While the phone could still ask, the banner stays away, since
 * it may not stand in front of the prompt (see the top of this file).
 *
 * Never to minors or accounts of unknown age, and from the same budget as the post-lesson screen: the two share
 * one record, so reminders are raised at most MAX_OFFERS times, a week apart.
 */
export function shouldNudgeReminders(input: {
  permission: PushPermissionState;
  record: OfferRecord | null;
  minor: boolean | null;
  now: number;
}): boolean {
  const { permission, record, minor, now } = input;
  if (settingsAction(permission) !== 'openSettings') return false;
  if (minor !== false) return false;
  return offerDue(record, now);
}

/** What the two rules above read of an account, as the session's user and `/me` both carry it. */
export interface AccountAge {
  /** Known to be 13–17 today; false for an adult, and also where no birth month is on record. */
  minor?: boolean;
  /** A guest: no birth month, and no account to send anything to. */
  guest?: boolean;
  /** An account still to be asked its birth month. */
  birthDateRequired?: boolean;
}

/**
 * Whether the account is a minor, for the two rules above: true for 13–17, false for an adult, null when unknown,
 * which both rules treat as a reason not to raise reminders.
 *
 * Age is unknown for guests and accounts without a birth month; the server's `minor` is false for both, since it
 * means "known to be 13 to 17". A guest's phone is not registered for push at all (PushRegistration.tsx). A fresh
 * sign-in's session lacks `minor` (only `/me` has it), so the server is asked then; null when even that cannot
 * say.
 */
export async function minorStatus(account: AccountAge | null | undefined, client: Pick<ApiClient, 'get'>): Promise<boolean | null> {
  const known = ageOnRecord(account);
  if (known !== undefined) return known;
  const me = await client.get<{ user?: AccountAge }>('/me');
  return me.ok ? (ageOnRecord(me.data.user) ?? null) : null;
}

/** A minor or an adult, null where no age is on record, undefined where this part of the account does not say. */
function ageOnRecord(account: AccountAge | null | undefined): boolean | null | undefined {
  if (!account) return undefined;
  if (account.guest === true || account.birthDateRequired === true) return null;
  return typeof account.minor === 'boolean' ? account.minor : undefined;
}

/** The offers' budget: never shown, or shown fewer than MAX_OFFERS times and not in the last week. */
function offerDue(record: OfferRecord | null, now: number): boolean {
  if (!record) return true;
  if (record.shown >= MAX_OFFERS) return false;
  const last = Date.parse(record.lastShownAt);
  return Number.isFinite(last) && now - last >= REOFFER_AFTER_MS;
}

/** The record after reminders were raised at `now`. */
export function noteOffer(record: OfferRecord | null, now: number): OfferRecord {
  return { shown: (record?.shown ?? 0) + 1, lastShownAt: new Date(now).toISOString() };
}

/** A stored record, or null for none or one that cannot be read (which counts as never shown). */
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
