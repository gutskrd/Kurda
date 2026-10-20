/**
 * What never reaches log storage (KUR-009): credentials, and the addresses
 * that name a person.
 *
 * pino matches a redaction path against the logged object exactly, so
 * `*.email` covers `{ user: { email } }` and NOT `{ email }` — the field
 * logged at the top, which is how most calls write it. Each key is therefore
 * listed twice, at the top and one level down. Shared by the request logger
 * and the job worker's, which had none at all.
 */
const SECRET_KEYS = ['password', 'passwordHash', 'token', 'accessToken', 'refreshToken', 'idToken', 'captchaToken', 'email'];

export const LOG_REDACT = {
  paths: ['req.headers.authorization', 'req.headers.cookie', ...SECRET_KEYS, ...SECRET_KEYS.map((k) => `*.${k}`)],
  censor: '[redacted]',
};

/**
 * An address as a log line may show it: enough to tell a bounce at one
 * provider from a problem with all of them, not enough to name anyone.
 * `rojda@example.com` → `r***@example.com`.
 */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${address[0]}***${address.slice(at)}`;
}
