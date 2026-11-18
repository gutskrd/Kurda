import type { AppConfig } from '../config/env.js';

/**
 * Push delivery providers. The pipeline (token lifecycle, queued batching, invalid-token pruning) uses only this
 * contract; `createPushProvider` picks one from configuration. A provider reports rejected tokens for pruning.
 */

export type PushPlatform = 'ios' | 'android';

export interface PushMessage {
  token: string;
  platform: PushPlatform;
  title: string;
  body: string;
  data?: Record<string, string>;
  /** How long the push service may hold the message for an offline phone; unset is its default of weeks, wrong for anything about today. */
  ttlSeconds?: number;
}

export interface PushSendResult {
  sent: number;
  /** Tokens the provider rejected as unregistered/invalid — prune these. */
  invalidTokens: string[];
}

export interface PushProvider {
  send(messages: PushMessage[]): Promise<PushSendResult>;
}

/** The logger shape a provider writes to, which both app.log and the worker's logger have. */
export interface PushLog {
  warn(obj: Record<string, unknown>, msg: string): void;
}

/**
 * In-memory provider that records what it was asked to send and reports chosen tokens as invalid. Used by tests and
 * wherever delivery is off (PUSH_PROVIDER=stub), so the rest of the pipeline still runs.
 */
export class StubPushProvider implements PushProvider {
  readonly sent: PushMessage[] = [];

  constructor(private readonly invalid: Set<string> = new Set()) {}

  async send(messages: PushMessage[]): Promise<PushSendResult> {
    this.sent.push(...messages);
    const invalidTokens = messages.map((m) => m.token).filter((t) => this.invalid.has(t));
    return { sent: messages.length - invalidTokens.length, invalidTokens };
  }
}

/** Expo's push service: one endpoint for both platforms, holding the APNs and FCM credentials. */
export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** The most messages Expo takes in one request. */
export const EXPO_CHUNK_SIZE = 100;
/** How long the one retry of a failed request waits. */
const RETRY_DELAY_MS = 1_000;
/** A request that has not answered by now is treated like a dropped connection. */
const REQUEST_TIMEOUT_MS = 15_000;

/** The Android channel the app creates before it asks for permission (mobile/src/push/device.ts). */
const ANDROID_CHANNEL_ID = 'default';

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound: 'default';
  channelId?: string;
  ttl?: number;
}

/** One answer per message, in the order the messages were sent. */
type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

/** Why one request went nowhere. Transient ones are worth the one retry. */
class ExpoRequestError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * Delivery through Expo's push service. Phones register an Expo push token (`ExponentPushToken[…]`) and Expo forwards
 * each message to APNs or FCM with the project's credentials, so the server needs no store keys. Messages go in
 * requests of at most 100; a request failing for a passing reason (no connection, timeout, 5xx, 429) is retried once
 * after a pause, then logged and dropped rather than thrown, since a throw would resend the whole fan-out.
 * `DeviceNotRegistered` tickets return the token for pruning; other ticket errors are logged. Receipts are not polled.
 * `accessToken` is needed only with enhanced push security on.
 */
export class ExpoPushProvider implements PushProvider {
  private readonly accessToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log?: PushLog;
  private readonly retryDelayMs: number;

  constructor(
    opts: {
      accessToken?: string;
      fetch?: typeof fetch;
      sleep?: (ms: number) => Promise<void>;
      log?: PushLog;
      retryDelayMs?: number;
    } = {},
  ) {
    this.accessToken = opts.accessToken;
    // looked up at call time, so a test that replaces the global fetch is heard
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.log = opts.log;
    this.retryDelayMs = opts.retryDelayMs ?? RETRY_DELAY_MS;
  }

  async send(messages: PushMessage[]): Promise<PushSendResult> {
    let sent = 0;
    const invalidTokens: string[] = [];
    for (let i = 0; i < messages.length; i += EXPO_CHUNK_SIZE) {
      const chunk = messages.slice(i, i + EXPO_CHUNK_SIZE);
      const tickets = await this.postWithRetry(chunk.map(toExpoMessage));
      if (!tickets) continue;
      chunk.forEach((message, index) => {
        const ticket = tickets[index];
        if (ticket?.status === 'ok') {
          sent += 1;
          return;
        }
        const error = ticket?.details?.error;
        if (error === 'DeviceNotRegistered') {
          invalidTokens.push(message.token);
          return;
        }
        // the token itself is never logged: it is the address of somebody's phone
        this.log?.warn(
          { provider: 'expo', error: error ?? 'missing ticket', detail: ticket?.message, platform: message.platform },
          'push not accepted',
        );
      });
    }
    return { sent, invalidTokens };
  }

  /** The tickets for one chunk, or null when it could not be sent (logged). */
  private async postWithRetry(chunk: ExpoMessage[]): Promise<ExpoTicket[] | null> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.post(chunk);
      } catch (err) {
        const transient = err instanceof ExpoRequestError ? err.transient : true;
        if (transient && attempt === 1) {
          await this.sleep(this.retryDelayMs);
          continue;
        }
        this.log?.warn(
          {
            provider: 'expo',
            messages: chunk.length,
            attempts: attempt,
            status: err instanceof ExpoRequestError ? err.status : undefined,
            err: err instanceof Error ? err.message : String(err),
          },
          'push chunk dropped',
        );
        return null;
      }
    }
  }

  private async post(chunk: ExpoMessage[]): Promise<ExpoTicket[]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    let res: Response;
    try {
      res = await this.fetchImpl(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new ExpoRequestError(err instanceof Error ? err.message : 'network error', true);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const transient = res.status >= 500 || res.status === 429;
      throw new ExpoRequestError(`Expo push request failed (${res.status}) ${detail.slice(0, 300)}`.trim(), transient, res.status);
    }
    const payload = (await res.json().catch(() => null)) as { data?: unknown; errors?: unknown } | null;
    if (!payload || !Array.isArray(payload.data)) {
      // a 200 that carries request-level errors instead of tickets
      throw new ExpoRequestError(`Expo push answered without tickets: ${JSON.stringify(payload?.errors ?? payload).slice(0, 300)}`, false, res.status);
    }
    return payload.data as ExpoTicket[];
  }
}

function toExpoMessage(m: PushMessage): ExpoMessage {
  return {
    to: m.token,
    title: m.title,
    body: m.body,
    ...(m.data ? { data: m.data } : {}),
    // the phone's own sound, never one of ours
    sound: 'default',
    ...(m.platform === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    ...(m.ttlSeconds !== undefined ? { ttl: m.ttlSeconds } : {}),
  };
}

/**
 * The active provider: PUSH_PROVIDER picks it; unset, production delivers through Expo and everything else gets the
 * stub, so no laptop or test run reaches a phone.
 */
export function createPushProvider(config: AppConfig, log?: PushLog): PushProvider {
  const choice = config.PUSH_PROVIDER ?? (config.NODE_ENV === 'production' ? 'expo' : 'stub');
  if (choice === 'expo') return new ExpoPushProvider({ accessToken: config.EXPO_ACCESS_TOKEN, log });
  return new StubPushProvider();
}
