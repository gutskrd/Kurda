import { API_URL } from './config';
import type { ApiError, ApiResult, TokenPair } from './types';
import { createTokenStorage, persistTokens, type TokenStorage } from './tokenStorage';
import type { MessageKey } from '../i18n/en';
import { isMissingRoute, MAINTENANCE_CODE, maintenanceNoticeOf, type MaintenanceNotice, type SuspendedErrorDetails } from '@kurda/shared';
import { restrictionOf, restrictionText, suspensionOf } from '../reports/restriction';
import { limitErrorText } from './limits';
import { deviceId } from './deviceId';
import { durationInWords } from './timeWords';

/** Just enough of the i18n contract to write a sentence; no React in here. */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Browser API client for Hevalo. It follows the same protocol the mobile
 * client already implements (mobile/src/api/client.ts):
 *   - attaches the access token to every request
 *   - on 401, refreshes once (single-flight) and replays the request
 *   - every mutating request carries an Idempotency-Key generated BEFORE the
 *     first attempt and reused on the replay, so a call can never double-apply
 *   - network failures and 429s come back as typed results, never throws
 *   - every request says which browser it comes from (`X-Device-Id`,
 *     lib/deviceId.ts), which sign-in protection and the devices list key on
 *
 * The server remains authoritative for all auth/authz/validation — this client
 * only transports requests. The browser is untrusted.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TIMEOUT_MS = 30_000; // Render free tier can cold-start ~20-40s

export function requestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * Gives up on the request from outside — a long-poll whose screen has
   * closed. An aborted request answers as a network failure, like a timeout,
   * and is never retried after a refresh.
   */
  signal?: AbortSignal;
}

export class ApiClient {
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly storage: TokenStorage,
    private readonly onLogout: () => void,
    /**
     * The account was suspended while signed in. Every request then answers
     * a bare ACCOUNT_DISABLED; the refresh answers ACCOUNT_SUSPENDED with the
     * reasons and an appeal token, which is what the suspension screen needs.
     */
    private readonly onSuspended: (details: SuspendedErrorDetails) => void = () => undefined,
    /**
     * Hevalo has been taken offline for a while. Every request but a few
     * (signing in and out, `/status`) then answers 503 MAINTENANCE with what
     * to show (@kurda/shared maintenance.ts), and whichever one finds out puts
     * the offline screen up (maintenance/MaintenanceGate.tsx).
     */
    private readonly onMaintenance: (notice: MaintenanceNotice) => void = () => undefined,
  ) {}

  get isAuthenticated(): boolean {
    return this.storage.get() !== null;
  }

  get<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('GET', path, options);
  }
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('POST', path, { ...options, body });
  }
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('PUT', path, { ...options, body });
  }
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('PATCH', path, { ...options, body });
  }
  delete<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('DELETE', path, options);
  }

  /**
   * Upload raw bytes (e.g. a profile photo) — the endpoint reads the request
   * body as an image, so this sends the Blob directly with its own content-type
   * rather than JSON. Returns a typed result; no auto-refresh (caller retries).
   */
  async uploadBytes<T>(path: string, blob: Blob): Promise<ApiResult<T>> {
    const tokens = this.storage.get();
    try {
      const res = await this.timedFetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': blob.type || 'application/octet-stream',
          'idempotency-key': requestId(),
          'x-device-id': deviceId(),
          ...(tokens ? { authorization: `Bearer ${tokens.accessToken}` } : {}),
        },
        body: blob,
      });
      return this.toResult<T>(res);
    } catch {
      return { ok: false, error: { kind: 'network', message: 'network request failed' } };
    }
  }

  /**
   * `uploadBytes`, telling `onProgress` how far the bytes have gone (0–1).
   *
   * fetch cannot report an upload's progress, so this one is an
   * XMLHttpRequest. A picture on a slow connection takes long enough that a
   * bar that moves is the difference between waiting and giving up (the
   * composer, web/src/composer). Same result shape, same no-refresh rule.
   */
  uploadWithProgress<T>(path: string, blob: Blob, onProgress: (fraction: number) => void): Promise<ApiResult<T>> {
    if (typeof XMLHttpRequest === 'undefined') return this.uploadBytes<T>(path, blob);
    const tokens = this.storage.get();
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseUrl}${path}`);
      xhr.timeout = TIMEOUT_MS * 4;
      xhr.setRequestHeader('content-type', blob.type || 'application/octet-stream');
      xhr.setRequestHeader('idempotency-key', requestId());
      xhr.setRequestHeader('x-device-id', deviceId());
      if (tokens) xhr.setRequestHeader('authorization', `Bearer ${tokens.accessToken}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
      };
      const failed = () => resolve({ ok: false, error: { kind: 'network', message: 'network request failed' } });
      xhr.onerror = failed;
      xhr.ontimeout = failed;
      xhr.onload = () => {
        const headers = new Headers();
        const retryAfter = xhr.getResponseHeader('retry-after');
        if (retryAfter) headers.set('retry-after', retryAfter);
        headers.set('content-type', 'application/json');
        const body = xhr.status === 204 ? null : xhr.responseText || null;
        void this.toResult<T>(new Response(body, { status: xhr.status, headers })).then(resolve);
      };
      xhr.send(blob);
    });
  }

  private async timedFetch(url: string, init: RequestInit, outside?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const abort = (): void => controller.abort();
    if (outside?.aborted) controller.abort();
    else outside?.addEventListener('abort', abort, { once: true });
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      outside?.removeEventListener('abort', abort);
    }
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { ...options.headers, 'x-device-id': deviceId() };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (MUTATING.has(method)) headers['idempotency-key'] = requestId();

    const attempt = async (): Promise<ApiResult<T>> => {
      const tokens = this.storage.get();
      // a credential the caller passed is the one meant (the suspension
      // screen's appeal token): a session left in storage never replaces it
      const withAuth = tokens && !headers.authorization ? { ...headers, authorization: `Bearer ${tokens.accessToken}` } : headers;
      let res: Response;
      try {
        res = await this.timedFetch(
          `${this.baseUrl}${path}`,
          {
            method,
            headers: withAuth,
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          },
          options.signal,
        );
      } catch {
        return { ok: false, error: { kind: 'network', message: 'network request failed' } satisfies ApiError };
      }
      return this.toResult<T>(res);
    };

    const first = await attempt();
    if (!first.ok && first.error.code === 'ACCOUNT_DISABLED' && this.storage.get()) {
      // Suspended mid-session: the refresh is where the reasons are. It
      // answers ACCOUNT_SUSPENDED (onSuspended takes it from there) — or, if
      // the suspension has just ended, a fresh token worth one more try.
      if (await this.refreshOnce()) return attempt();
      return first;
    }
    if (first.ok || first.error.status !== 401 || options.signal?.aborted) return first;

    // A 401 with no stored session is a normal auth failure (e.g. a bad login) —
    // surface the server's message rather than trying to refresh/logging out.
    if (!this.storage.get()) return first;

    const refreshed = await this.refreshOnce();
    if (!refreshed) return this.loggedOut();

    const second = await attempt();
    if (second.ok || second.error.status !== 401) return second;
    return this.loggedOut();
  }

  /**
   * Sign out on the server: the stored refresh token's session is revoked, so
   * a copy of it left anywhere else stops working. Best-effort and never
   * throws — signing out locally must not depend on the network.
   */
  async endSession(): Promise<void> {
    const tokens = this.storage.get();
    if (!tokens) return;
    try {
      await this.timedFetch(`${this.baseUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-device-id': deviceId() },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
    } catch {
      // offline: the session still ends locally
    }
  }

  /**
   * Swap in a new access token and keep the refresh token, where it already
   * lives. Changing the password answers with one: it ends every access token
   * issued before it, this session's included, and this session carries on.
   */
  replaceAccessToken(accessToken: string): void {
    const tokens = this.storage.get();
    if (!tokens) return;
    const remembered = localStorage.getItem('hevalo_tokens') !== null;
    persistTokens({ accessToken, refreshToken: tokens.refreshToken }, remembered);
  }

  private refreshOnce(): Promise<boolean> {
    this.refreshInFlight ??= this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<boolean> {
    const tokens = this.storage.get();
    if (!tokens) return false;
    let res: Response;
    try {
      res = await this.timedFetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-device-id': deviceId() },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
    } catch {
      return false;
    }
    if (!res.ok) {
      if (res.status === 403) {
        const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string; details?: unknown };
        const suspended = suspensionOf({ kind: 'client', status: 403, code: body.code, message: body.message ?? '', details: body.details });
        if (suspended) {
          // the API has already ended every session this account had
          this.storage.clear();
          this.onSuspended(suspended);
        }
      }
      return false;
    }
    const next = (await res.json()) as TokenPair;
    // preserve the persistence choice: rewrite wherever the tokens currently live
    const remembered = localStorage.getItem('hevalo_tokens') !== null;
    persistTokens(next, remembered);
    return true;
  }

  private loggedOut<T>(): ApiResult<T> {
    this.storage.clear();
    this.onLogout();
    return { ok: false, error: { kind: 'unauthorized', message: 'session expired', status: 401 } };
  }

  private async toResult<T>(res: Response): Promise<ApiResult<T>> {
    if (res.ok) {
      const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
      return { ok: true, data };
    }
    let envelope: { code?: string; message?: string; requestId?: string; details?: unknown } = {};
    try {
      envelope = (await res.json()) as typeof envelope;
    } catch {
      // non-JSON error body
    }
    if (res.status === 503) {
      const notice = maintenanceNoticeOf(envelope);
      if (notice) this.onMaintenance(notice);
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'));
      return {
        ok: false,
        error: {
          kind: 'rate_limited',
          code: envelope.code ?? 'RATE_LIMITED',
          message: envelope.message ?? 'too many requests',
          retryAfterSec: Number.isFinite(retryAfter) ? retryAfter : undefined,
          requestId: envelope.requestId,
          status: 429,
          // a wait that ends at a time the reader is shown (a group's REQUEST_WAIT `until`)
          ...(envelope.details !== undefined ? { details: envelope.details } : {}),
        },
      };
    }
    const kind: ApiError['kind'] = res.status === 401 ? 'unauthorized' : res.status >= 500 ? 'server' : 'client';
    return {
      ok: false,
      error: {
        kind,
        code: envelope.code,
        message: envelope.message ?? `request failed (${res.status})`,
        requestId: envelope.requestId,
        status: res.status,
        ...(envelope.details !== undefined ? { details: envelope.details } : {}),
      },
    };
  }
}

/**
 * Friendly, human copy for an ApiError — used by forms and error states.
 *
 * `t` is required rather than optional on purpose. An optional one would leave
 * every call site that forgot it quietly in English, which is exactly the kind
 * of gap this is meant to close; required, the compiler names them all.
 *
 * The server's own message still comes through untranslated where it is more
 * specific than anything here — a bad login says why. That is a gap the API
 * would have to close, not this function.
 */
/**
 * Server codes precise enough to say in the reader’s own language.
 *
 * The API raises 114 distinct codes and every message is English, so this is
 * a floor, not a ceiling: the auth flow first, because it is the one every
 * reader meets. Seventeen of those codes carry more than one message —
 * FORBIDDEN alone has seven — and a code that vague cannot be translated
 * from the code alone, so it is left to fall through.
 */
export const CODE_COPY: Record<string, MessageKey> = {
  ACCOUNT_NOT_ACTIVATED: 'error.notActivated',
  ACCOUNT_DISABLED: 'error.code.accountDisabled',
  CODE_EXPIRED: 'error.code.codeExpired',
  INVALID_CODE: 'error.code.invalidCode',
  INVALID_CREDENTIALS: 'error.code.invalidCredentials',
  INVALID_TOKEN: 'error.code.invalidLink',
  LOCKED: 'error.code.locked',
  SIGNUP_REJECTED: 'error.code.signupRejected',
  TOO_MANY_ATTEMPTS: 'error.code.tooManyAttempts',
  USERNAME_TAKEN: 'error.code.usernameTaken',
  // an address that may already have an account: said without saying whether
  // it does, as the server means it (nobody may learn which addresses are
  // registered), and with the two ways on for somebody it does belong to
  REGISTRATION_FAILED: 'error.code.registrationFailed',
  // a sign-in the server wants to check before it lets it through
  LOGIN_VERIFICATION_REQUIRED: 'error.code.loginCheck',
  // a session that cannot be renewed, for any of the reasons the server has
  INVALID_REFRESH: 'error.sessionExpired',
  REFRESH_EXPIRED: 'error.sessionExpired',
  REFRESH_REUSED: 'error.sessionExpired',
  // age and the protections that follow from it
  UNDER_MINIMUM_AGE: 'error.code.underMinimumAge',
  INVALID_BIRTH_MONTH: 'error.code.invalidBirthMonth',
  BIRTH_DATE_ALREADY_SET: 'error.code.birthDateAlreadySet',
  OPEN_GROUPS_ADULTS_ONLY: 'error.code.openGroupsAdultsOnly',
  VISIBILITY_NOT_ALLOWED: 'error.code.visibilityNotAllowed',
  LEARN_FIRST: 'error.code.learnFirst',
  // a new password found in a public breach (sign-up, reset, change)
  PASSWORD_BREACHED: 'error.code.passwordBreached',
  // a sign-in asked for a challenge; said the same for every reason the
  // server has, and whether or not the address has an account
  CAPTCHA_REQUIRED: 'error.code.captchaRequired',
  // changing the password while signed in
  WRONG_PASSWORD: 'error.code.wrongPassword',
  NO_PASSWORD: 'error.code.noPassword',
  // ending a session that has already ended
  SESSION_NOT_FOUND: 'error.code.sessionNotFound',
  // Hevalo offline for a while: the offline screen says the rest, and no
  // "something went wrong on our end" is shown beside it
  [MAINTENANCE_CODE]: 'maintenance.title',
};
/**
 * What a password the server turned down needs (`WEAK_PASSWORD`'s
 * `details.reason`, api/src/auth/password-policy.ts), in the reader's words.
 * The numbers are the policy's own.
 */
const PASSWORD_REASON: Record<string, [MessageKey, Record<string, number>?]> = {
  'too-short': ['error.code.passwordTooShort', { count: 8 }],
  'too-long': ['error.code.passwordTooLong', { count: 128 }],
  'needs-letter': ['error.code.passwordNeedsLetter'],
  'needs-number': ['error.code.passwordNeedsNumber'],
};

/** What a username the server turned down needs (`INVALID_USERNAME`, api/src/users/username.ts). */
const USERNAME_REASON: Record<string, [MessageKey, Record<string, number>?]> = {
  'too-short': ['error.code.usernameTooShort', { count: 3 }],
  'too-long': ['error.code.usernameTooLong', { count: 30 }],
  'invalid-chars': ['error.code.usernameChars'],
  'edge-underscore': ['error.code.usernameUnderscore'],
  'consecutive-underscore': ['error.code.usernameUnderscore'],
  'numbers-only': ['error.code.usernameLetter'],
  'no-letter': ['error.code.usernameLetter'],
  reserved: ['error.code.usernameUnavailable'],
};

function reasonOf(details: unknown): string | null {
  return details && typeof details === 'object' && typeof (details as { reason?: unknown }).reason === 'string'
    ? (details as { reason: string }).reason
    : null;
}

/**
 * The sentence for a refusal whose code alone is not enough: which rule a
 * password or a username broke, and which field of a form did not pass the
 * server's check. Null when the code is not one of these.
 */
function detailedCopy(error: ApiError, t: Translate): string | null {
  if (error.code === 'WEAK_PASSWORD' || error.code === 'INVALID_USERNAME') {
    const table = error.code === 'WEAK_PASSWORD' ? PASSWORD_REASON : USERNAME_REASON;
    const found = table[reasonOf(error.details) ?? ''];
    if (found) return t(found[0], found[1]);
    return t(error.code === 'WEAK_PASSWORD' ? 'auth.passwordHint' : 'error.code.usernameChars');
  }
  if (error.code === 'VALIDATION_ERROR') {
    // the issues name the field; an email address is the one people most often mistype
    const issues = Array.isArray(error.details) ? (error.details as Array<{ path?: unknown }>) : [];
    const email = issues.some((i) => Array.isArray(i.path) && i.path.includes('email'));
    return t(email ? 'error.code.badEmail' : 'error.code.checkDetails');
  }
  return null;
}

/** How long a lockout has left, from its header or, failing that, its details. */
function lockedForSec(error: ApiError): number | null {
  const fromDetails = (error.details as { retryAfterSec?: unknown } | undefined)?.retryAfterSec;
  const sec = error.retryAfterSec ?? (typeof fromDetails === 'number' ? fromDetails : undefined);
  return sec !== undefined && Number.isFinite(sec) && sec > 0 ? sec : null;
}

export function describeError(error: ApiError, t: Translate, locale?: string): string {
  // The language is the page's when a caller does not pass one: I18nProvider
  // keeps <html lang> in step with the reader's choice.
  const lang = (locale ?? (typeof document !== 'undefined' ? document.documentElement.lang : '')) || 'en';

  // A limit on the account says what is limited and until when, in the
  // reader's words and time zone (reports/restriction.ts).
  const restriction = restrictionOf(error);
  if (restriction) return restrictionText(restriction, t, lang);

  // A limit on how many of something one person may have (lib/limits.ts):
  // which one, its number and what makes room, before any countdown — a full
  // list of drafts does not empty by waiting a minute.
  const limit = limitErrorText(error, t);
  if (limit) return limit;

  // Sign-in paused after failed attempts: how long, the way a person says it
  // ("about 15 minutes"), rather than a countdown in seconds. Without a
  // number it falls through to CODE_COPY's plain sentence.
  if (error.code === 'LOCKED') {
    const sec = lockedForSec(error);
    if (sec !== null) return t('error.code.lockedFor', { duration: durationInWords(sec, t, lang) });
  }

  // A live countdown beats any sentence, so it wins when the server sent one:
  // every 429 carries a Retry-After.
  if (error.kind === 'rate_limited' && error.retryAfterSec && error.retryAfterSec > 0) {
    // A lockout is minutes. The copy that only ever saw a rate limiter said
    // seconds, and a real lockout came back as 792 of them.
    const wait = Math.max(1, Math.ceil(error.retryAfterSec));
    return wait >= 90
      ? t('error.tooManyRetryInMin', { minutes: Math.ceil(wait / 60) })
      : t('error.tooManyRetryIn', { seconds: wait });
  }

  // Otherwise a precise code beats the kind: the difference between "something
  // went wrong" and "that code has expired".
  const byCode = error.code ? CODE_COPY[error.code] : undefined;
  if (byCode) return t(byCode);
  const detailed = detailedCopy(error, t);
  if (detailed) return detailed;
  // a route the API does not have: this build is newer than the server, and
  // "route not found" is no sentence for a reader (@kurda/shared isMissingRoute)
  if (isMissingRoute(error)) return t('error.notOnServer');
  switch (error.kind) {
    case 'network':
      return t('error.offline');
    case 'rate_limited':
      // without a countdown, which the branch at the top already took
      return t('error.tooMany');
    case 'unauthorized':
      // INVALID_CREDENTIALS is answered by code above, so what reaches here is
      // a mid-session refresh failure — or a 401 we have no copy for, whose
      // own message is still better than nothing.
      return error.message && error.message !== 'session expired' ? error.message : t('error.sessionExpired');
    case 'server':
      return t('error.server');
    default:
      return error.message || t('error.generic');
  }
}

/** Build a client bound to browser storage. `onLogout` re-renders the app. */
export function createApiClient(
  onLogout: () => void,
  onSuspended?: (details: SuspendedErrorDetails) => void,
  onMaintenance?: (notice: MaintenanceNotice) => void,
): { client: ApiClient; storage: TokenStorage } {
  const storage = createTokenStorage();
  return { client: new ApiClient(API_URL, storage, onLogout, onSuspended, onMaintenance), storage };
}
