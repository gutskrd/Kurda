/* eslint-disable no-restricted-syntax -- the only module allowed to read process.env */
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Injected by the deploy pipeline (KUR-008); "unknown" in local dev. */
  GIT_SHA: z.string().default('unknown'),
  /** Optional until every environment has Postgres; /health reports not_configured when absent. */
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection URL')
    .optional(),
  /** Optional read-replica pool (KUR-114); reads route here, writes stay on the primary. */
  DATABASE_REPLICA_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection URL')
    .optional(),
  /** Optional; without it caching is a no-op and /health reports not_configured. */
  REDIS_URL: z
    .string()
    .regex(/^rediss?:\/\//, 'must be a redis:// or rediss:// connection URL')
    .optional(),
  /** Optional; error tracking is disabled without it (KUR-009). */
  SENTRY_DSN: z.string().url().optional(),
  /** S3-compatible media storage (KUR-013): all-or-none group below. */
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Public CDN origin serving the bucket (falls back to endpoint/bucket). */
  CDN_BASE_URL: z.string().url().optional(),

  /* --- Media cost-safety (KUR-177 hardening) — keep R2 within the free tier ---
   * All application-level guards; Cloudflare is the source of truth for real
   * billing. Configurable so limits can grow without code changes. */
  /** Reject a raw upload larger than this before processing. */
  MEDIA_MAX_UPLOAD_MB: z.coerce.number().positive().default(5),
  /** Target/hard cap for the final stored (processed) object. */
  MEDIA_MAX_STORED_KB: z.coerce.number().positive().default(250),
  /** Longest edge of the processed image, in px. */
  MEDIA_MAX_DIMENSION: z.coerce.number().int().positive().default(512),
  /** App-level total-storage kill switch (below R2's free 10 GB). */
  MEDIA_STORAGE_LIMIT_GB: z.coerce.number().positive().default(9),
  /** App-level monthly R2 op ceilings (below Cloudflare's free A/B allowances). */
  MEDIA_MONTHLY_CLASS_A_LIMIT: z.coerce.number().int().positive().default(900_000),
  MEDIA_MONTHLY_CLASS_B_LIMIT: z.coerce.number().int().positive().default(9_000_000),
  /** Per-user profile-photo change rate limit. */
  MEDIA_UPLOAD_RATE_MAX: z.coerce.number().int().positive().default(10),
  MEDIA_UPLOAD_RATE_WINDOW_MIN: z.coerce.number().positive().default(60),
  /** Accepted source image MIME types (comma-separated). */
  MEDIA_ALLOWED_TYPES: z.string().default('image/jpeg,image/png,image/webp'),
  /** HMAC secret for access tokens. MUST be overridden in production. */
  JWT_SECRET: z.string().min(32).default('kurda-dev-secret-do-not-use-in-prod!!'),
  /** Comma-separated OAuth audiences (iOS/Android/web client ids). */
  GOOGLE_CLIENT_IDS: z.string().optional(),
  APPLE_CLIENT_IDS: z.string().optional(),
  /** Cloudflare Turnstile; CAPTCHA disabled when unset (KUR-025). */
  TURNSTILE_SECRET: z.string().optional(),
  /** Shared secret guarding IAP refund webhooks; disabled when unset (KUR-072). */
  IAP_WEBHOOK_SECRET: z.string().optional(),
  /**
   * Permit the dev/test STUB receipt verifier even under NODE_ENV=production
   * (KUR-072). For dev/testing deploys that have no App Store / Play Store
   * credentials yet — it lets the API boot without a real verifier. NEVER set
   * this on a store-facing deployment: the stub does not cryptographically
   * verify receipts, so real purchases could be forged. Default 'false' keeps
   * production a hard error until a real verifier + credentials are wired.
   */
  IAP_ALLOW_STUB: z.enum(['true', 'false']).default('false'),
  /** Shared secret guarding email bounce/complaint webhooks; disabled when unset (KUR-098). */
  EMAIL_WEBHOOK_SECRET: z.string().optional(),
  /** 'true' admits traffic when the CAPTCHA provider is down. */
  CAPTCHA_FAIL_OPEN: z.enum(['true', 'false']).default('false'),
  /**
   * Comma-separated browser origins allowed to call the API (CORS).
   * The web client (localhost:8081) needs this; native apps don't send
   * Origin so they're unaffected. Empty = no cross-origin browser access.
   */
  CORS_ORIGINS: z.string().default(''),
});

export type AppConfig = Readonly<z.infer<typeof envSchema>>;

/**
 * Parses and validates environment variables. Throws with a message
 * naming every invalid/missing variable so a misconfigured deploy
 * fails at boot, not at first request.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (result.success && result.data.NODE_ENV === 'production' && !env.JWT_SECRET) {
    throw new Error('Invalid environment configuration:\n  JWT_SECRET: required in production');
  }
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return Object.freeze(result.data);
}
