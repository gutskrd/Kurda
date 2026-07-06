import * as Sentry from '@sentry/node';
import type { AppConfig } from '../config/env.js';

const SCRUB_KEYS = /password|token|secret|authorization|cookie|email/i;

/** Removes PII-ish values anywhere in an event's extra/request data. */
export function scrubEvent<T>(value: T): T {
  if (Array.isArray(value)) return value.map(scrubEvent) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SCRUB_KEYS.test(k) ? '[scrubbed]' : scrubEvent(v),
      ]),
    ) as T;
  }
  return value;
}

/**
 * Error tracking is optional: without SENTRY_DSN nothing initializes and
 * captureError is a no-op, so dev/test never need a Sentry account.
 */
let enabled = false;

export function initSentry(config: AppConfig): boolean {
  if (!config.SENTRY_DSN) return false;
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    release: config.GIT_SHA,
    beforeSend: (event) => scrubEvent(event),
  });
  enabled = true;
  return true;
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: scrubEvent(context) } : undefined);
}
