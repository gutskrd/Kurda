/**
 * What went wrong, in words an admin can act on. Every page used to print the
 * server's message as it came ("insufficient permissions", "Failed"), or show
 * an empty table, so "your role cannot do this", "enter your 2FA code" and "the
 * server fell over" all looked the same. They need different answers: ask a
 * superadmin, enter a code, or try again later.
 */
import { ApiError } from '../api';

export type ErrorKind =
  /** signed in, but this account's role is not allowed this */
  | 'forbidden'
  /** the 2FA window ran out: a code is needed again */
  | 'two_factor'
  /** this account has not set up 2FA yet */
  | 'two_factor_setup'
  | 'signed_out'
  | 'not_found'
  /** the request reached nothing: no connection, or the server is down */
  | 'offline'
  /** the server refused what was sent (a form problem, a state that changed) */
  | 'invalid'
  | 'conflict'
  | 'rate_limited'
  | 'server';

export interface DescribedError {
  kind: ErrorKind;
  title: string;
  message: string;
  /** the server's id for the request, to quote in a bug report */
  requestId: string | null;
}

/** The server's own words, when they say something more than the status does. */
function serverMessage(err: ApiError): string {
  const m = err.message.trim();
  return m ? `${m.charAt(0).toUpperCase()}${m.slice(1)}${/[.!?]$/.test(m) ? '' : '.'}` : '';
}

export function describeError(err: unknown, what = 'this'): DescribedError {
  if (err instanceof ApiError) {
    const requestId = err.requestId;
    if (err.status === 403 && err.code === 'TOTP_REQUIRED') {
      return {
        kind: 'two_factor',
        title: 'Enter your 2FA code again',
        message: 'Your two-factor check has expired. Enter a code from your authenticator app to carry on.',
        requestId,
      };
    }
    if (err.status === 403 && err.code === 'TOTP_ENROLLMENT_REQUIRED') {
      return {
        kind: 'two_factor_setup',
        title: 'Set up two-factor authentication',
        message: 'The admin needs an authenticator app on this account before it opens anything.',
        requestId,
      };
    }
    if (err.status === 403) {
      return {
        kind: 'forbidden',
        title: 'Your role can’t open this',
        message: `Your account is signed in, but its role doesn’t include ${what}. Roles are given on the server, by whoever runs Hevalo.`,
        requestId,
      };
    }
    if (err.status === 401) {
      return { kind: 'signed_out', title: 'Signed out', message: 'Your session ended. Sign in again to carry on.', requestId };
    }
    if (err.status === 404) {
      return { kind: 'not_found', title: 'Not found', message: serverMessage(err) || 'It may have been deleted.', requestId };
    }
    if (err.status === 409) {
      return { kind: 'conflict', title: 'Something changed', message: serverMessage(err) || 'Reload and try again.', requestId };
    }
    if (err.status === 429) {
      return { kind: 'rate_limited', title: 'Too many tries', message: 'Wait a minute, then try again.', requestId };
    }
    if (err.status >= 400 && err.status < 500) {
      return { kind: 'invalid', title: 'That wasn’t accepted', message: serverMessage(err) || 'Check the form and try again.', requestId };
    }
    return {
      kind: 'server',
      title: 'The server had a problem',
      message: 'It didn’t finish. Try again in a moment; if it keeps happening, send the request id to a developer.',
      requestId,
    };
  }
  // fetch rejects with a TypeError when the request never got an answer
  if (err instanceof TypeError) {
    return {
      kind: 'offline',
      title: 'Can’t reach the server',
      message: 'Check your connection. The server may also be restarting — try again in a minute.',
      requestId: null,
    };
  }
  return {
    kind: 'server',
    title: 'Something went wrong',
    message: err instanceof Error && err.message ? err.message : 'Try again in a moment.',
    requestId: null,
  };
}

/** One line for a toast or an inline message: the title and what to do. */
export function errorLine(err: unknown, what?: string): string {
  const d = describeError(err, what);
  // a form problem's own words say more than the title does
  if (d.kind === 'invalid' || d.kind === 'conflict' || d.kind === 'not_found') return d.message;
  return `${d.title}. ${d.message}`;
}
