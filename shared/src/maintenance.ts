/**
 * Taking Hevalo offline for a while, from the admin console.
 *
 * A superadmin turns it on now or from a set time, and says what people see
 * meanwhile: a title, a message, a picture, and when Hevalo is expected back.
 * While it is on, the API answers the apps with 503 MAINTENANCE and the
 * notice below, and the apps put up a screen with it in place of whatever
 * was open, asking `GET /status` every half minute until it is over. Staff
 * carry on as normal, so the app can be checked before it opens again, and
 * the admin console itself is never closed.
 *
 * A title or message left empty is the apps' own, in each reader's language;
 * one written is shown as written.
 */

export const MAINTENANCE_CODE = 'MAINTENANCE';

export const MAINTENANCE_LIMITS = { title: 80, message: 600 } as const;

/** How often an app showing the screen asks whether Hevalo is back. */
export const MAINTENANCE_POLL_SECONDS = 30;

/** How far ahead a start can be set. */
export const MAINTENANCE_MAX_LEAD_DAYS = 30;

/** What people see while Hevalo is offline. */
export interface MaintenanceNotice {
  /** null: the apps' own title, in the reader's language */
  title: string | null;
  /** null: the apps' own message, in the reader's language */
  message: string | null;
  /** an uploaded wide picture; null: the apps' own */
  pictureUrl: string | null;
  /** when it began, ISO */
  since: string;
  /** when Hevalo is expected back, ISO; null when not said */
  backBy: string | null;
}

/** `GET /status`: null while Hevalo is open. */
export interface StatusResponse {
  maintenance: MaintenanceNotice | null;
}

/** What an admin sets. */
export interface MaintenanceSettings {
  enabled: boolean;
  title: string | null;
  message: string | null;
  /** an upload from `POST /admin/shop/art/background` */
  assetKey: string | null;
  /** null: from the moment it is turned on */
  startsAt: string | null;
  /** when Hevalo is expected back; null: not said */
  endsAt: string | null;
  /** at `endsAt` Hevalo opens again by itself; otherwise `endsAt` is only shown */
  reopenAtEnd: boolean;
}

/**
 * Where a setting stands: off, waiting for its start, on, or over because
 * its end came and it reopens by itself.
 */
export type MaintenancePhase = 'off' | 'scheduled' | 'on' | 'ended';

export function maintenancePhase(s: Pick<MaintenanceSettings, 'enabled' | 'startsAt' | 'endsAt' | 'reopenAtEnd'>, now: Date): MaintenancePhase {
  if (!s.enabled) return 'off';
  const t = now.getTime();
  if (s.startsAt && Date.parse(s.startsAt) > t) return 'scheduled';
  if (s.endsAt && s.reopenAtEnd && Date.parse(s.endsAt) <= t) return 'ended';
  return 'on';
}

/** The notice in an API answer, when the answer is "Hevalo is offline" (a 503 body, or `GET /status`). */
export function maintenanceNoticeOf(body: unknown): MaintenanceNotice | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as { code?: unknown; maintenance?: unknown };
  const m = b.maintenance as Partial<MaintenanceNotice> | null | undefined;
  if (typeof m !== 'object' || m === null || typeof m.since !== 'string') return null;
  const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
  return {
    title: text(m.title),
    message: text(m.message),
    pictureUrl: typeof m.pictureUrl === 'string' && /^https:\/\//.test(m.pictureUrl) ? m.pictureUrl : null,
    since: m.since,
    backBy: text(m.backBy),
  };
}
