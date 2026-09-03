/* eslint-disable no-restricted-syntax -- the only module allowed to read process.env */
import { z } from 'zod';

/** The built-in development JWT secret — rejected in production (see loadConfig). */
export const DEV_JWT_SECRET = 'kurda-dev-secret-do-not-use-in-prod!!';

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
  /**
   * Public origin of the web app. Email links (password reset, email
   * verification) are built from this, so a wrong value sends users nowhere.
   */
  APP_BASE_URL: z.string().url().default('https://mykurda.com'),
  /**
   * Process background jobs inside the API instead of a separate worker service.
   * The API only ENQUEUES jobs; without something consuming the queue, emails
   * (verification, password reset) sit in Redis forever. Defaults on wherever
   * Redis is configured so a single-service deploy still delivers its mail; set
   * 'false' when a dedicated worker process is running.
   */
  RUN_WORKER_IN_API: z.enum(['true', 'false']).optional(),
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
  /** Community image/meme posts (KUR-290/291) — larger than an avatar but still
   * cost-capped. Longest edge + hard stored cap for the processed WebP. */
  MEDIA_IMAGE_MAX_DIMENSION: z.coerce.number().int().positive().default(1280),
  MEDIA_IMAGE_MAX_STORED_KB: z.coerce.number().positive().default(500),
  /** Per-user image-post upload rate limit. */
  MEDIA_IMAGE_UPLOAD_RATE_MAX: z.coerce.number().int().positive().default(20),
  MEDIA_IMAGE_UPLOAD_RATE_WINDOW_MIN: z.coerce.number().positive().default(60),
  /** Voice notes (KUR-282) — audio renditions/comments. Stored as-is (no server
   * transcode), so cost is capped by a tight upload size + rate limit. */
  MEDIA_AUDIO_MAX_UPLOAD_MB: z.coerce.number().positive().default(3),
  /** Advisory max recording length (client-enforced); the server caps by size. */
  MEDIA_AUDIO_MAX_SECONDS: z.coerce.number().int().positive().default(120),
  MEDIA_AUDIO_ALLOWED_TYPES: z.string().default('audio/mpeg,audio/mp4'),
  MEDIA_AUDIO_UPLOAD_RATE_MAX: z.coerce.number().int().positive().default(20),
  MEDIA_AUDIO_UPLOAD_RATE_WINDOW_MIN: z.coerce.number().positive().default(60),
  /** HMAC secret for access tokens. MUST be overridden in production. */
  JWT_SECRET: z.string().min(32).default(DEV_JWT_SECRET),
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
  /**
   * Transactional email delivery (KUR-098). Provider is chosen by which of these
   * is set: RESEND_API_KEY → Resend (HTTP); else SMTP_URL or SMTP_HOST → SMTP
   * (works with SES/Postmark/Mailgun/Gmail); else a no-op stub (dev/test). See
   * docs/auth/email-delivery.md.
   */
  RESEND_API_KEY: z.string().optional(),
  SMTP_URL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.enum(['true', 'false']).optional(),
  /** From address for transactional email. */
  EMAIL_FROM: z.string().default('MyKurda <no-reply@mykurda.com>'),
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
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const config = result.data;

  // Production safety guards — fail closed at boot rather than at first request.
  // These deliberately do NOT trip the local docker-compose stack (which runs as
  // NODE_ENV=production with a distinct, non-default JWT placeholder and no CORS
  // wildcard); they catch real misconfiguration on a live deploy.
  if (config.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (!env.JWT_SECRET) {
      problems.push('  JWT_SECRET: required in production');
    } else if (env.JWT_SECRET === DEV_JWT_SECRET) {
      problems.push('  JWT_SECRET: the built-in development secret must not be used in production');
    }
    if (config.CORS_ORIGINS.split(',').some((o) => o.trim() === '*')) {
      problems.push("  CORS_ORIGINS: wildcard '*' is not allowed in production — use an explicit origin allowlist");
    }
    // APP_BASE_URL is the base of every emailed link; a trailing slash or an
    // http:// origin would produce broken or downgraded reset links.
    if (!config.APP_BASE_URL.startsWith('https://')) {
      problems.push('  APP_BASE_URL: must be an https:// URL in production');
    }
    if (config.APP_BASE_URL.endsWith('/')) {
      problems.push('  APP_BASE_URL: must not end with a trailing slash');
    }
    // CDN_BASE_URL is the public base for media URLs (CDN_BASE_URL + '/' + key).
    // It must be a clean public HTTPS origin — never the private S3 endpoint,
    // never a path/trailing slash/credentials (which would corrupt every URL).
    if (config.CDN_BASE_URL) {
      const raw = config.CDN_BASE_URL;
      if (!raw.startsWith('https://')) {
        problems.push('  CDN_BASE_URL: must be an https:// URL in production');
      }
      if (raw.endsWith('/')) {
        problems.push('  CDN_BASE_URL: must not end with a trailing slash');
      }
      let parsed: URL | null = null;
      try {
        parsed = new URL(raw);
      } catch {
        problems.push('  CDN_BASE_URL: is not a valid URL');
      }
      if (parsed) {
        if (parsed.pathname !== '/' && parsed.pathname !== '') {
          problems.push('  CDN_BASE_URL: must not include a path (e.g. /profile-photo) — only the origin');
        }
        if (parsed.username || parsed.password) {
          problems.push('  CDN_BASE_URL: must not contain credentials');
        }
      }
      if (config.S3_ENDPOINT && raw.replace(/\/$/, '') === config.S3_ENDPOINT.replace(/\/$/, '')) {
        problems.push('  CDN_BASE_URL: must be the public CDN/custom-domain, not the private S3_ENDPOINT');
      }
    }
    if (problems.length > 0) {
      throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
    }
  }

  return Object.freeze(config);
}
