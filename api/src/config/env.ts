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
   * A second bucket on the same endpoint and credentials that is NOT public,
   * where moderation keeps evidence it takes off the public CDN (CSAM, and a
   * closed child's files a report still holds). Optional: without it evidence
   * goes to unguessable private keys in the main bucket.
   */
  S3_EVIDENCE_BUCKET: z.string().optional(),
  /**
   * Cloudflare zone and API token (Cache Purge permission only) for the zone
   * that serves CDN_BASE_URL, so media taken down by moderation stops being
   * served from the edge at once. Optional: without them the CSAM filing task
   * lists the URLs to purge by hand.
   */
  CDN_PURGE_ZONE_ID: z.string().optional(),
  CDN_PURGE_API_TOKEN: z.string().optional(),
  /**
   * Public origin of the web app. Email links (password reset, email
   * verification) are built from this, so a wrong value sends users nowhere.
   */
  APP_BASE_URL: z.string().url().default('https://hevalo.app'),
  /**
   * Public origin of the admin panel, for the link in the urgent-report email
   * to moderators. Optional: without it the email names the page instead.
   */
  ADMIN_BASE_URL: z.string().url().optional(),
  /**
   * Process background jobs inside the API instead of a separate worker service.
   * The API only ENQUEUES jobs; without something consuming the queue, emails
   * (verification, password reset) sit in Redis forever. Defaults on wherever
   * Redis is configured so a single-service deploy still delivers its mail; set
   * 'false' when a dedicated worker process is running.
   */
  RUN_WORKER_IN_API: z.enum(['true', 'false']).optional(),

  /**
   * Learning Leagues' weekly goal, in XP that counts for the league: met it and
   * a promotion can count and no demotion can (contract 4 §L3).
   */
  LEAGUE_WEEKLY_GOAL_XP: z.coerce.number().int().min(10).max(5000).default(150),

  /**
   * Comma-separated addresses granted admin on boot. Kept in configuration
   * rather than the repository (which is public) so the admin accounts are not
   * advertised. A grant requires the address to be CONFIRMED on its account —
   * see grantBootstrapAdmins.
   */
  BOOTSTRAP_ADMIN_EMAILS: z.string().default(''),
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
  /**
   * Accepted source image MIME types (comma-separated), sniffed rather than
   * declared. HEIC is here because it is what an iPhone camera roll contains and
   * no desktop browser decodes it; every one of these is re-encoded to WebP on
   * the way in, so the stored format is unchanged by admitting them.
   */
  MEDIA_ALLOWED_TYPES: z
    .string()
    .default('image/jpeg,image/png,image/webp,image/heic,image/avif,image/tiff'),
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
  MEDIA_AUDIO_ALLOWED_TYPES: z.string().default('audio/mpeg,audio/mp4,audio/webm'),
  MEDIA_AUDIO_UPLOAD_RATE_MAX: z.coerce.number().int().positive().default(20),
  MEDIA_AUDIO_UPLOAD_RATE_WINDOW_MIN: z.coerce.number().positive().default(60),
  /** HMAC secret for access tokens. MUST be overridden in production. */
  JWT_SECRET: z.string().min(32).default(DEV_JWT_SECRET),
  /** Comma-separated OAuth audiences (iOS/Android/web client ids). */
  GOOGLE_CLIENT_IDS: z.string().optional(),
  APPLE_CLIENT_IDS: z.string().optional(),
  /**
   * The Sign in with Apple key (auth/apple-tokens.ts): with all three set, the
   * code the app sends on an Apple sign-in is exchanged for a refresh token,
   * kept encrypted, and revoked at Apple when the account is deleted (App
   * Store guideline 5.1.1(v)). Unset, nothing is exchanged, kept or revoked.
   * APPLE_PRIVATE_KEY is the .p8 file's PEM; a literal "\n" stands for a line
   * break, for dashboards that take one line. See docs/auth/apple-signin.md.
   */
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
  /** The client those tokens belong to; defaults to the first APPLE_CLIENT_IDS entry, else the app's bundle id. */
  APPLE_CLIENT_ID: z.string().optional(),
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
  EMAIL_FROM: z.string().default('Hevalo <no-reply@hevalo.app>'),
  /**
   * Where an answer to a transactional email goes. They come from a no-reply
   * address, and the password-reset email asks anyone who did not ask for it
   * to get in touch — so a reply lands in the support inbox instead of nowhere.
   */
  EMAIL_REPLY_TO: z.string().optional(),
  /** The address the support inbox answers from (admin → Email). */
  SUPPORT_EMAIL_FROM: z.string().default('Hevalo Support <support@hevalo.app>'),
  /**
   * The signing secret (`whsec_…`) of the Resend webhook that tells us about
   * mail received at the support address, and about bounces and complaints.
   * The webhook is refused while it is unset.
   */
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  /**
   * A Resend key that can read received mail, for the bodies of support email
   * (the webhook carries only who, to whom and the subject). Resend's keys are
   * either "send only" or "full access", and the sending key is deliberately
   * the first — so reading needs a key of its own. Unset, the inbox still lists
   * what arrived, and says the body can be read in Resend.
   */
  RESEND_INBOX_API_KEY: z.string().optional(),
  /**
   * Who delivers push notifications (push/provider.ts): `expo` sends through
   * Expo's push service, `stub` records the sends and delivers nothing. Unset:
   * Expo in production and the stub everywhere else, so a laptop or a test run
   * never reaches somebody's phone.
   */
  PUSH_PROVIDER: z.enum(['expo', 'stub']).optional(),
  /**
   * An Expo access token, sent with every push request. Needed only once
   * "Enhanced security for push notifications" is switched on for the project
   * at expo.dev; without that setting Expo accepts requests without one.
   */
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** 'true' admits traffic when the CAPTCHA provider is down. */
  CAPTCHA_FAIL_OPEN: z.enum(['true', 'false']).default('false'),
  /**
   * Whether a new password is checked against the public corpus of breached
   * passwords (auth/breached-password.ts; only five characters of its SHA-1
   * leave the server). Unset: on everywhere but under test, which must not
   * reach the internet. 'false' turns it off.
   */
  PASSWORD_BREACH_CHECK: z.enum(['true', 'false']).optional(),
  /**
   * Comma-separated browser origins allowed to call the API (CORS).
   * The web client (localhost:8081) needs this; native apps don't send
   * Origin so they're unaffected. Empty = no cross-origin browser access.
   */
  CORS_ORIGINS: z.string().default(''),
  /**
   * Which proxies in front of this server are allowed to say who is asking.
   *
   * Everything that asks "who is this" reads `req.ip` — the rate limiter on
   * /auth/login, the captcha's own remote-IP check, the signup and login risk
   * scoring. Behind a proxy with no setting at all, `req.ip` is the proxy's
   * address, so every one of those was looking at the same handful of values
   * for the whole internet: five login attempts a minute shared by everybody,
   * and abuse that cannot be attributed to anyone.
   *
   * This used to be a **hop count**, and it no longer can be. Fastify 5.12.5
   * fixed GHSA-3m5p-2c4r-xxw2, "X-Forwarded-* spoofing under trustProxy
   * hop-count", and the fix is that a numeric `trustProxy` no longer consumes
   * any hop at all. Measured against 5.12.5 over a real socket: 1, 2 and 3 all
   * return the connection's own address and `req.ips` is just `[peer]`. A hop
   * count is now silently useless, which is worse than wrong — the server would
   * boot, serve, and quietly rate-limit the entire internet as one caller.
   *
   * So the trusted proxies are **named** instead of counted. That was always
   * the stronger form of the same safety property: Fastify walks
   * X-Forwarded-For from the right and stops at the first address not on this
   * list, and since each hop appends the peer it actually saw, whatever a
   * client writes sits furthest LEFT and is never reached. Verified: with
   * `X-Forwarded-For: 1.2.3.4, 203.0.113.7` from a trusted peer, `req.ip` is
   * 203.0.113.7 — the address the proxy wrote, not the one the client claimed.
   *
   * The default is the three `proxy-addr` presets, which is every private range
   * and loopback: right for a managed platform like Render, where the load
   * balancer reaches the container over the private network and nothing else
   * can open a connection to it at all. Name exact addresses instead wherever
   * the origin is reachable from the public internet.
   *
   * On Render that is still not the whole chain. Render puts Cloudflare in
   * front of every service, so the walk ends at a Cloudflare edge address — the
   * same few dozen for everybody. Reading past it is CLOUDFLARE_CLIENT_IP's job
   * below, not this list's: Cloudflare's ranges must never be named here, or a
   * caller on Cloudflare's own network (a Worker) would be walked past into
   * text it wrote itself.
   *
   * `true` trusts the client's own text and is refused in production below.
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
   * Whether to read the client's address past a Cloudflare edge.
   *
   * When the first hop `TRUST_PROXY` does not cover is one of Cloudflare's
   * published addresses, the client is the address Cloudflare reports: its
   * `CF-Connecting-IP` header, or failing that the X-Forwarded-For entry it
   * wrote just left of the edge (net/client-ip.ts). Neither is believed from
   * anything that is not a Cloudflare address, so a deployment that is not
   * behind Cloudflare is unaffected either way. `off` keeps the edge as the
   * client, as before.
   */
  CLOUDFLARE_CLIENT_IP: z.enum(['auto', 'off']).default('auto'),
  /**
   * Bearer token a Prometheus scraper must present at /metrics.
   *
   * Unset, the endpoint is not served at all in production — the registry names
   * the Node version, the process's memory and uptime, and every route with its
   * traffic and error rates, which is a scrape a stranger should not be able to
   * ask for. It stays open in development, where the process is a laptop.
   */
  METRICS_TOKEN: z.string().min(16, 'must be at least 16 characters').optional(),
});

/** The names `proxy-addr` understands for "every address in this range". */
const PROXY_PRESETS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/**
 * Whether every entry names a proxy rather than counting one.
 *
 * A bare number is deliberately not a proxy list any more: Fastify 5.12.5 made
 * a numeric `trustProxy` a no-op, so accepting one here would let a deploy boot
 * believing it reads X-Forwarded-For when it does not.
 */
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
    // `true` trusts the whole X-Forwarded-For header, including the part the
    // client wrote. Anyone could then pick their own address and get a private
    // rate-limit bucket, a clean risk score, and somebody else's name in the
    // logs. Naming the proxies can only ever reach addresses a proxy appended.
    if (config.TRUST_PROXY === 'true') {
      problems.push(
        "  TRUST_PROXY: 'true' trusts a client-supplied X-Forwarded-For and is not allowed in production — name the proxies instead",
      );
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
