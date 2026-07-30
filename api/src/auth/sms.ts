/**
 * Provider-agnostic SMS sender (KUR-297). The real provider (Twilio /
 * MessageBird / SNS) implements this seam and is wired by config; nothing else
 * in the codebase knows which provider is used. Until one is configured we use
 * {@link StubSmsSender}, which records the last message (so dev/tests can read
 * the code) instead of sending — production must supply a real sender.
 */
export interface SmsSender {
  send(toE164: string, message: string): Promise<void>;
}

export interface SentSms {
  to: string;
  message: string;
}

/** No-op sender that captures messages in memory (dev/test). */
export class StubSmsSender implements SmsSender {
  readonly sent: SentSms[] = [];

  async send(toE164: string, message: string): Promise<void> {
    this.sent.push({ to: toE164, message });
  }

  /** The most recent message sent to a number (test/dev convenience). */
  lastTo(toE164: string): SentSms | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      if (this.sent[i]!.to === toE164) return this.sent[i];
    }
    return undefined;
  }
}
