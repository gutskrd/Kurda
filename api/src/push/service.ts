import { batchMessages } from './batching.js';
import type { PushMessage, PushProvider } from './provider.js';
import type { DeviceTokenService } from './tokens-service.js';
import type { NotificationCategory } from '../notifications/prefs.js';

export interface Notification {
  category: NotificationCategory;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface DeliveryReport {
  sent: number;
  pruned: number;
  /** True when preferences/quiet hours blocked delivery at send time. */
  suppressed?: boolean;
  /** For a push held by quiet hours to go when they end (`HELD_IN_QUIET`): when that is. */
  heldUntil?: Date;
}

/**
 * How long a push may wait for an offline phone before it is not worth showing. A streak reminder is about today, so
 * it lapses after two hours (the later one goes at 22:00, so never after midnight); everything else keeps the
 * service's default.
 */
const FRESH_FOR: Partial<Record<NotificationCategory, number>> = {
  streak: 2 * 60 * 60,
};

/**
 * Categories whose push waits for quiet hours to end instead of being dropped: a letter is a person writing to you,
 * while a reminder or badge news is worthless the next morning.
 */
export const HELD_IN_QUIET: ReadonlySet<NotificationCategory> = new Set(['letters']);

/** The delivery-time preference gate. */
export interface NotificationGate {
  allows(userId: string, category: NotificationCategory, at?: Date): Promise<boolean>;
  /** when a push held back only by quiet hours could go (notifications/prefs-service.ts) */
  quietUntil?(userId: string, category: NotificationCategory, at?: Date): Promise<Date | null>;
}

/**
 * Push delivery: fans a notification out to all of a user's devices, batched per provider, and prunes tokens the
 * provider rejects. Runs from the queue worker via `makePushSendJob`; re-running `deliver` resends, which providers
 * deduplicate per token.
 */
export class PushService {
  constructor(
    private readonly tokens: DeviceTokenService,
    private readonly provider: PushProvider,
    private readonly gate?: NotificationGate,
  ) {}

  /** Send to every device of `userId`; returns counts sent + pruned. */
  async deliver(userId: string, notification: Notification): Promise<DeliveryReport> {
    // Preferences and quiet hours are checked at delivery, so a change applies to sends already queued.
    if (this.gate && !(await this.gate.allows(userId, notification.category))) {
      const heldUntil = HELD_IN_QUIET.has(notification.category) ? await this.gate.quietUntil?.(userId, notification.category) : null;
      return { sent: 0, pruned: 0, suppressed: true, ...(heldUntil ? { heldUntil } : {}) };
    }

    const devices = await this.tokens.forUser(userId);
    if (devices.length === 0) return { sent: 0, pruned: 0 };

    // The category rides along so the app can open something sensible for data naming no screen (a streak reminder opens lessons).
    const data = { ...notification.data, category: notification.category };
    const ttlSeconds = FRESH_FOR[notification.category];
    const messages: PushMessage[] = devices.map((d) => ({
      token: d.token,
      platform: d.platform,
      title: notification.title,
      body: notification.body,
      data,
      ...(ttlSeconds !== undefined ? { ttlSeconds } : {}),
    }));

    let sent = 0;
    const invalid: string[] = [];
    for (const batch of batchMessages(messages)) {
      const res = await this.provider.send(batch);
      sent += res.sent;
      invalid.push(...res.invalidTokens);
    }

    const pruned = await this.tokens.prune(invalid);
    return { sent, pruned };
  }
}
