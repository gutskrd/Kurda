import type { AppConfig } from '../config/env.js';

/**
 * Push delivery provider (KUR-094). Real FCM/APNs adapters land in a follow-up;
 * this defines the contract + a stub so the pipeline (token lifecycle, queued
 * batching, invalid-token pruning) is fully exercisable now and in staging. A
 * provider reports which tokens it rejected so the caller can prune them.
 */

export type PushPlatform = 'ios' | 'android';

export interface PushMessage {
  token: string;
  platform: PushPlatform;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSendResult {
  sent: number;
  /** Tokens the provider rejected as unregistered/invalid — prune these. */
  invalidTokens: string[];
}

export interface PushProvider {
  send(messages: PushMessage[]): Promise<PushSendResult>;
}

/**
 * In-memory provider: records everything it was asked to send and reports a
 * configurable set of tokens as invalid. Used by tests and as the default until
 * real credentials are configured, so staging can still exercise delivery.
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

/**
 * The active provider. Until FCM/APNs credentials are wired (follow-up), this is
 * the stub — delivery is logged, not dropped, so nothing depends on real creds
 * to develop against. Production wiring will branch on `config` here.
 */
export function createPushProvider(_config: AppConfig): PushProvider {
  return new StubPushProvider();
}
