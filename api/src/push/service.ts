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
}

/** Delivery-time preference gate (KUR-095). */
export interface NotificationGate {
  allows(userId: string, category: NotificationCategory, at?: Date): Promise<boolean>;
}

/**
 * Push delivery (KUR-094). Fans a notification out to all of a user's devices,
 * batched per provider, and prunes any tokens the provider rejects so a stale
 * device is cleaned up on its first failed send. Delivery runs from the queue
 * worker via `makePushSendJob`; `deliver` is the idempotent-enough unit of work
 * (re-running re-sends, which push providers already de-duplicate per token).
 */
export class PushService {
  constructor(
    private readonly tokens: DeviceTokenService,
    private readonly provider: PushProvider,
    private readonly gate?: NotificationGate,
  ) {}

  /** Send to every device of `userId`; returns counts sent + pruned. */
  async deliver(userId: string, notification: Notification): Promise<DeliveryReport> {
    // preferences + quiet hours are checked at delivery time (KUR-095), so a
    // change is honored even for a send already queued when it was made.
    if (this.gate && !(await this.gate.allows(userId, notification.category))) {
      return { sent: 0, pruned: 0, suppressed: true };
    }

    const devices = await this.tokens.forUser(userId);
    if (devices.length === 0) return { sent: 0, pruned: 0 };

    const messages: PushMessage[] = devices.map((d) => ({
      token: d.token,
      platform: d.platform,
      title: notification.title,
      body: notification.body,
      data: notification.data,
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
