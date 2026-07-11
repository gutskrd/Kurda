import type { AppConfig } from '../config/env.js';

/**
 * Email delivery provider (KUR-098). Real SES/Postmark adapters land behind this
 * seam (like the IAP verifier and push provider); the stub records sends so the
 * pipeline — templating, suppression, queued retry — is fully exercisable now.
 */

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  send(payload: EmailPayload): Promise<{ messageId: string }>;
}

/** In-memory provider: records what it was asked to send. */
export class StubEmailProvider implements EmailProvider {
  readonly sent: EmailPayload[] = [];

  async send(payload: EmailPayload): Promise<{ messageId: string }> {
    this.sent.push(payload);
    return { messageId: `stub-${this.sent.length}` };
  }
}

/** The active provider — stub until SES/Postmark credentials are wired. */
export function createEmailProvider(_config: AppConfig): EmailProvider {
  return new StubEmailProvider();
}
