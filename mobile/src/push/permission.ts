/**
 * When the phone asks to send notifications, and what Settings offers in its
 * place (KUR-094). Pure, with no React Native, so the rules can be read and
 * tested apart from expo-notifications (device.ts does the asking).
 *
 * The app never asks at launch. It asks once there is a reason a person can
 * see: after a lesson, from a screen that says what Hevalo would send, or
 * from Settings → Notification settings when they go looking. Those two are
 * the only places of the app's own that lead to the phone's question, and
 * each leads to it by one button that says "Continue". The yes and the no are
 * the phone's to offer: a screen of the app's own with "Allow" or "Not now"
 * on it, standing in front of the phone's question, steers the answer, and
 * the platform's guidelines turn an app away for it.
 */
import type { ApiClient } from '../api/client';
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

/** Kept on this phone: how often reminders have been brought up (the screen after a lesson, Learn's banner), and when last. */
export interface OfferRecord {
  shown: number;
  lastShownAt: string;
}

export const OFFER_KEY = 'hevalo_reminder_offer_v1';
/** Reminders may be brought up once more, and not before a week has gone by. */
export const REOFFER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_OFFERS = 2;

/**
 * Whether a lesson's results are followed by the screen that comes before the
 * phone's question (ReminderOffer.tsx).
 *
 * Only while the system prompt has never been shown and the phone can still
 * show it: the screen's one button has to lead to the prompt, and someone who
 * answered it either way has answered. The screen is counted when it is seen.
 * It can come a second time, a week later at the soonest, only for somebody
 * the prompt never reached (the phone put it away unanswered, say), and never
 * again after that; Settings is where they can still find it.
 *
 * Never to a child. No account is under 13 (the server refuses the sign-up),
 * so the children with accounts are the 13 to 17 year olds — and for them the
 * reminders start switched off (api notifications/prefs.ts), because a nudge
 * to keep a run going should be a young person's own choice. Asking them
 * unprompted would be that nudge by another road, so they are not offered it,
 * nor is an account whose age is not known, a guest's among them
 * (`minorStatus`); Settings works for everyone.
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
  return offerDue(record, now);
}

/**
 * Whether Learn's slim banner may say what reminders are for, with the way to
 * the phone's settings: only once the phone will not ask again
 * (`settingsAction` says 'openSettings'), when those settings are the one
 * place the answer can still be changed. While the phone could still ask, the
 * banner stays away. Its button would then have led to the phone's question
 * and its ✕ round it, and the app's own screen in front of that question may
 * offer neither a choice nor a way past (see the top of this file).
 *
 * Never to a minor or an account whose age is not known, and out of the same
 * budget as the screen after a lesson: the two share one record, so between
 * them reminders are brought up at most MAX_OFFERS times, a week apart.
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
  /** known to be 13–17 today; false for an adult, and also where no birth month is on record */
  minor?: boolean;
  /** a guest: no birth month, and no account to send anything to */
  guest?: boolean;
  /** an account still to be asked its birth month */
  birthDateRequired?: boolean;
}

/**
 * Whether the account is a minor, for the two rules above: true for 13–17,
 * false for an adult, null when nobody knows, which both rules read as a
 * reason not to bring reminders up.
 *
 * Nobody knows for a guest or for an account not yet asked its birth month.
 * The server's `minor` is false for both, because it means "known to be 13
 * to 17", so on its own it is not an answer of "adult" — and a guest's phone
 * is not registered for notifications at all (PushRegistration.tsx), so a
 * screen saying what Hevalo would send them would be saying something untrue.
 *
 * The session from a fresh sign-in does not carry `minor` (only `/me` does),
 * so the server is asked then; null when even that cannot say.
 */
export async function minorStatus(account: AccountAge | null | undefined, client: Pick<ApiClient, 'get'>): Promise<boolean | null> {
  const known = ageOnRecord(account);
  if (known !== undefined) return known;
  const me = await client.get<{ user?: AccountAge }>('/me');
  return me.ok ? (ageOnRecord(me.data.user) ?? null) : null;
}

/** A minor or an adult, null where no age is on record, and undefined where this much of the account does not say. */
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

/** The record once reminders have been brought up at `now`. */
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
