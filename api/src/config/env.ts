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
  /** HMAC secret for access tokens. MUST be overridden in production. */
  JWT_SECRET: z.string().min(32).default('kurda-dev-secret-do-not-use-in-prod!!'),
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
