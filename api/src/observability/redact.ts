/**
 * What never reaches log storage: credentials and the addresses that name a person. pino matches redaction paths
 * exactly, so `*.email` covers `{ user: { email } }` but not a top-level `{ email }`; each key is listed at the top
 * and one level down. Shared by the request logger and the job worker's.
 */
const SECRET_KEYS = [
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'captchaToken',
  'secret',
  'email',
];

export const LOG_REDACT = {
  paths: ['req.headers.authorization', 'req.headers.cookie', ...SECRET_KEYS, ...SECRET_KEYS.map((k) => `*.${k}`)],
  censor: '[redacted]',
};

/**
 * An address as a log line may show it: enough to tell one provider's bounce from a general problem, not enough to
 * name anyone. `name@example.com` → `n***@example.com`.
 */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${address[0]}***${address.slice(at)}`;
}
