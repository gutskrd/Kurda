/* eslint-disable no-restricted-syntax -- the only module allowed to read process.env */
import { z } from 'zod';

/** The built-in development JWT secret — rejected in production (see loadConfig). */
export const DEV_JWT_SECRET = 'kurda-dev-secret-do-not-use-in-prod!!';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Set by the deploy pipeline; "unknown" in local dev. */
  GIT_SHA: z.string().default('unknown'),
  /** Optional until every environment has Postgres; /health reports not_configured when absent. */
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection URL')
    .optional(),
  /** Optional; without it caching is a no-op and /health reports not_configured. */
  REDIS_URL: z
    .string()
    .regex(/^rediss?:\/\//, 'must be a redis:// or rediss:// connection URL')
    .optional(),
  /** Optional; error tracking is off without it. */
  SENTRY_DSN: z.string().url().optional(),
  /** S3-compatible media storage: all of the group below, or none. */
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /**
   * A private bucket on the same endpoint and credentials, where moderation keeps evidence taken off the public CDN.
   * Optional: without it evidence goes to unguessable private keys in the main bucket.
   */
  S3_EVIDENCE_BUCKET: z.string().optional(),
  /**
   * Zone and API token (cache purge only) for the zone serving CDN_BASE_URL, so media taken down stops being served
   * from the edge at once. Optional: without them the CSAM filing task lists the URLs to purge by hand.
   */
  CDN_PURGE_ZONE_ID: z.string().optional(),
  CDN_PURGE_API_TOKEN: z.string().optional(),
  /** Public origin of the web app; emailed links are built from it. */
  APP_BASE_URL: z.string().url().default('https://hevalo.app'),
  /** Public origin of the admin panel, for the link in the urgent-report email. Without it the email names the page. */
  ADMIN_BASE_URL: z.string().url().optional(),
  /**
   * Process background jobs inside the API instead of a separate worker. Without a consumer, queued emails sit in
   * Redis forever, so it defaults on wherever Redis is configured; set 'false' when a dedicated worker runs.
   */
  RUN_WORKER_IN_API: z.enum(['true', 'false']).optional(),

  /** The league's weekly goal in XP: meeting it lets a promotion count and rules out demotion. */
  LEAGUE_WEEKLY_GOAL_XP: z.coerce.number().int().min(10).max(5000).default(150),

  /**
   * Comma-separated addresses granted admin on boot, kept out of the public repository. A grant needs the address
   * confirmed on its account (see grantBootstrapAdmins).
   */
  BOOTSTRAP_ADMIN_EMAILS: z.string().default(''),
  /**
   * Comma-separated addresses that alone may use the admin console, whatever roles anyone else holds. Unset, every
   * staff role may. Configuration only, like the bootstrap list.
   */
  ADMIN_ACCESS_EMAILS: z.string().default(''),
  /** Public CDN origin serving the bucket (falls back to endpoint/bucket). */
  CDN_BASE_URL: z.string().url().optional(),

  /* Media cost limits, enforced by the application; the storage provider's billing is the source of truth. */
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
  /**
   * Accepted source image types (comma-separated), sniffed rather than declared. HEIC is what an iPhone camera roll
   * holds; everything is re-encoded to WebP on the way in.
   */
  MEDIA_ALLOWED_TYPES: z
    .string()
    .default('image/jpeg,image/png,image/webp,image/heic,image/avif,image/tiff'),
  /** Community image posts: longest edge, and a hard cap on the stored WebP. */
  MEDIA_IMAGE_MAX_DIMENSION: z.coerce.number().int().positive().default(1280),
  MEDIA_IMAGE_MAX_STORED_KB: z.coerce.number().positive().default(500),
  /** Per-user image-post upload rate limit. */
  MEDIA_IMAGE_UPLOAD_RATE_MAX: z.coerce.number().int().positive().default(20),
  MEDIA_IMAGE_UPLOAD_RATE_WINDOW_MIN: z.coerce.number().positive().default(60),
  /** Voice notes are stored as uploaded, so their cost is capped by upload size and a rate limit. */
  MEDIA_AUDIO_MAX_UPLOAD_MB: z.coerce.number().positive().default(3),
  /** Advisory max recording length (client-enforced); the server caps by size. */
  MEDIA_AUDIO_MAX_SECONDS: z.coerce.number().int().positive().default(120),
  MEDIA_AUDIO_ALLOWED_TYPES: z.string().default('audio/mpeg,audio/mp4,audio/webm'),
  MEDIA_AUDIO_UPLOAD_RATE_MAX: z.coerce.number().int().positive().default(20),
  MEDIA_AUDIO_UPLOAD_RATE_WINDOW_MIN: z.coerce.number().positive().default(60),
  /** HMAC secret for access tokens. MUST be overridden in production. */
  JWT_SECRET: z.string().min(32).default(DEV_JWT_SECRET),
  /** Comma-separated OAuth audiences (iOS/Android/web client ids). */
  GOOGLE_CLIENT_IDS: z.string().optional(),
  APPLE_CLIENT_IDS: z.string().optional(),
  /**
   * The Sign in with Apple key (auth/apple-tokens.ts). With all three set, the app's sign-in code is exchanged for
   * a refresh token, kept encrypted and revoked when the account is deleted, as the App Store requires. Unset,
   * nothing is exchanged. APPLE_PRIVATE_KEY is the .p8 PEM, with a literal "\n" standing for a line break. See
   * docs/auth/apple-signin.md.
   */
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
  /** The client those tokens belong to; defaults to the first APPLE_CLIENT_IDS entry, else the app's bundle id. */
  APPLE_CLIENT_ID: z.string().optional(),
  /** CAPTCHA secret; CAPTCHA is off when unset. */
  TURNSTILE_SECRET: z.string().optional(),
  /** Shared secret guarding store refund webhooks; they are refused when unset. */
  IAP_WEBHOOK_SECRET: z.string().optional(),
  /**
   * The older name for IAP_PURCHASES_OFF, still read so a deploy that sets it keeps booting. Despite the name it
   * only switches store purchases off; the stub verifier is refused at boot whatever asks for it.
   */
  IAP_ALLOW_STUB: z.enum(['true', 'false']).default('false'),
  /**
   * Run without store purchases: every receipt is refused with 503 IAP_UNAVAILABLE. A production deploy without
   * store credentials sets this to boot; without it, and without real verifiers, production refuses to start.
   */
  IAP_PURCHASES_OFF: z.enum(['true', 'false']).default('false'),
  /** Shared secret guarding email bounce and complaint webhooks; they are refused when unset. */
  EMAIL_WEBHOOK_SECRET: z.string().optional(),
  /**
   * Transactional email. The provider follows from what is set: RESEND_API_KEY sends over HTTP, else SMTP_URL or
   * SMTP_HOST over SMTP, else a no-op stub. See docs/auth/email-delivery.md.
   */
  RESEND_API_KEY: z.string().optional(),
  SMTP_URL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.enum(['true', 'false']).optional(),
  /** From address for transactional email. */
  EMAIL_FROM: z.string().default('Hevalo <no-reply@hevalo.app>'),
  /** Reply-to for transactional email, which comes from a no-reply address, so answers reach the support inbox. */
  EMAIL_REPLY_TO: z.string().optional(),
  /** The address the support inbox answers from (admin → Email). */
  SUPPORT_EMAIL_FROM: z.string().default('Hevalo Support <support@hevalo.app>'),
  /**
   * The sender for answers to mail written to an address at zagrosian.com, in the business's own look. Unset, every
   * answer comes from SUPPORT_EMAIL_FROM. Set it only once the sending key may send for that domain, or such
   * answers are refused.
   */
  ZAGROSIAN_EMAIL_FROM: z.string().optional(),
  /** Signing secret (`whsec_…`) of the webhook reporting received support mail, bounces and complaints. */
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  /**
   * A key that can read received mail, for support email bodies (the webhook carries only sender, recipient and
   * subject). The sending key is deliberately send-only, so reading needs its own. Unset, the inbox lists what
   * arrived and says the body can be read at the provider.
   */
  RESEND_INBOX_API_KEY: z.string().optional(),
  /**
   * Who delivers push notifications: `expo` sends them, `stub` records and delivers nothing. Unset, `expo` in
   * production and the stub elsewhere, so a laptop or test run never reaches a phone.
   */
  PUSH_PROVIDER: z.enum(['expo', 'stub']).optional(),
  /** Push access token, needed only once enhanced push security is switched on for the project. */
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** 'true' admits traffic when the CAPTCHA provider is down. */
  CAPTCHA_FAIL_OPEN: z.enum(['true', 'false']).default('false'),
  /**
   * Whether a new password is checked against the public corpus of breached passwords (only five characters of its
   * SHA-1 leave the server). Unset, on everywhere except under test, which must stay off the network.
   */
  PASSWORD_BREACH_CHECK: z.enum(['true', 'false']).optional(),
  /**
   * Comma-separated browser origins allowed to call the API. Native apps send no Origin and are unaffected; empty
   * means no cross-origin browser access.
   */
  CORS_ORIGINS: z.string().default(''),
  /**
   * The proxies trusted to say who is asking, by address or `proxy-addr` preset. Rate limits, the captcha and risk
   * scoring all read `req.ip`; behind an untrusted proxy that is the proxy's address, which makes the whole
   * internet one caller.
   *
   * Proxies are named, never counted: fastify ignores a numeric hop count, so the server would boot and quietly
   * treat everyone as the load balancer. With named proxies fastify walks X-Forwarded-For from the right and stops
   * at the first untrusted address, so whatever the client wrote (furthest left) is never reached.
   *
   * The default is every private range and loopback, right where only the platform's load balancer can reach the
   * container; name exact addresses wherever the origin is publicly reachable. Never list Cloudflare's ranges here:
   * CLOUDFLARE_CLIENT_IP reads past the edge, and a caller on Cloudflare's network could otherwise be walked past
   * into text it wrote. `true` trusts the client's own text and is refused in production.
   */
  TRUST_PROXY: z
    .string()
    .default('loopback,linklocal,uniquelocal')
    .refine(
      (v) => v === 'false' || v === 'true' || isProxyList(v),
      'must be false, or a comma-separated list of proxy IPs/CIDRs and the ' +
        'presets loopback/linklocal/uniquelocal — a bare hop count no longer ' +
        'works (fastify GHSA-3m5p-2c4r-xxw2)',
    ),
  /**
   * Whether to read the client's address past a Cloudflare edge. When the first untrusted hop is a published
   * Cloudflare address, the client is its `CF-Connecting-IP`, or else the X-Forwarded-For entry just left of the
   * edge (net/client-ip.ts). Neither is believed from any other address. `off` keeps the edge as the client.
   */
  CLOUDFLARE_CLIENT_IP: z.enum(['auto', 'off']).default('auto'),
  /**
   * Bearer token a metrics scraper must present at /metrics. Unset, the endpoint is not served in production, since
   * it reveals the runtime, memory and every route's traffic; it stays open in development.
   */
  METRICS_TOKEN: z.string().min(16, 'must be at least 16 characters').optional(),
});

/** The names `proxy-addr` understands for "every address in this range". */
const PROXY_PRESETS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/** Whether every entry names a proxy. A bare number is refused because fastify ignores a numeric `trustProxy`. */
function isProxyList(value: string): boolean {
  const parts = value.split(',').map((p) => p.trim());
  return parts.length > 0 && parts.every((p) => PROXY_PRESETS.has(p) || p.includes('.') || p.includes(':'));
}

/** `TRUST_PROXY` in the shape Fastify wants. */
export function trustProxyOption(value: string): boolean | string {
  if (value === 'false') return false;
  if (value === 'true') return true;
  return value;
}

export type AppConfig = Readonly<z.infer<typeof envSchema>>;

/** Parses and validates the environment, throwing with every invalid or missing variable so a bad deploy fails at boot. */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const config = result.data;

  // Production guards fail at boot. They do not trip the local docker-compose stack, which runs as production with
  // a distinct JWT placeholder and no CORS wildcard.
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
    // `true` would believe the client-written part of X-Forwarded-For, letting anyone pick an address for a fresh
    // rate-limit bucket, a clean risk score and someone else's name in the logs.
    if (config.TRUST_PROXY === 'true') {
      problems.push(
        "  TRUST_PROXY: 'true' trusts a client-supplied X-Forwarded-For and is not allowed in production — name the proxies instead",
      );
    }
    // Every emailed link starts with APP_BASE_URL; a trailing slash or http:// would break or downgrade them.
    if (!config.APP_BASE_URL.startsWith('https://')) {
      problems.push('  APP_BASE_URL: must be an https:// URL in production');
    }
    if (config.APP_BASE_URL.endsWith('/')) {
      problems.push('  APP_BASE_URL: must not end with a trailing slash');
    }
    // Media URLs are CDN_BASE_URL + '/' + key, so it must be a clean public HTTPS origin: never the private S3
    // endpoint, and no path, trailing slash or credentials.
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
