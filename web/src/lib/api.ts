import { API_URL } from './config';
import type { ApiError, ApiResult, TokenPair } from './types';
import { createTokenStorage, persistTokens, type TokenStorage } from './tokenStorage';
import type { MessageKey } from '../i18n/en';
import {
  isMissingRoute,
  isPictureRejection,
  isPlainPath,
  MAINTENANCE_CODE,
  maintenanceNoticeOf,
  type MaintenanceNotice,
  type SuspendedErrorDetails,
} from '@kurda/shared';
import { restrictionOf, restrictionText, suspensionOf } from '../reports/restriction';
import { limitErrorText } from './limits';
import { deviceId } from './deviceId';
import { durationInWords } from './timeWords';
import { usernameRefusalText } from './usernameText';
import { rejectionText } from '../pictures/words';
import type { Translate } from '../i18n/I18nProvider';

/** Just enough of the i18n contract to write a sentence; no React in here. */

/**
 * Browser API client, speaking the same protocol as the phone's (mobile/src/api/client.ts): it attaches the access
 * token, refreshes once on a 401 (single-flight) and replays, reuses one Idempotency-Key per mutating call across the
 * replay, returns network failures and 429s as typed results instead of throwing, and sends `X-Device-Id`
 * (lib/deviceId.ts) for sign-in protection and the devices list. The server stays authoritative for everything.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TIMEOUT_MS = 30_000; // Render's free tier can take 20–40 s to cold-start.

/** The answer for a path that would reach another endpoint than it names (shared `isPlainPath`); nothing is sent. */
const OFF_PATH = { ok: false, error: { kind: 'client', status: 404, code: 'NOT_FOUND', message: 'not found' } } as const satisfies ApiResult<never>;

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
  /** Aborts the request from outside, e.g. a long-poll whose screen closed; it answers as a network failure and is never replayed. */
  signal?: AbortSignal;
}

export class ApiClient {
  private refreshInFlight: Promise<boolean> | null = null;
  private readonly writeListeners = new Set<(path: string) => void>();

  constructor(
    private readonly baseUrl: string,
    private readonly storage: TokenStorage,
    private readonly onLogout: () => void,
    /**
     * The account was suspended while signed in: requests answer a bare ACCOUNT_DISABLED, and only the refresh's
     * ACCOUNT_SUSPENDED carries the reasons and appeal token the suspension screen needs.
     */
    private readonly onSuspended: (details: SuspendedErrorDetails) => void = () => undefined,
    /**
     * Requests other than sign-in, sign-out and `/status` answer 503 MAINTENANCE with the notice to show
     * (maintenance/MaintenanceGate.tsx).
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

  /** Sends raw bytes (a profile photo) with their own content type instead of JSON; no auto-refresh, the caller retries. */
  async uploadBytes<T>(path: string, blob: Blob): Promise<ApiResult<T>> {
    if (!isPlainPath(path)) return OFF_PATH;
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

  /** `uploadBytes` with upload progress (0–1), which fetch cannot report, so this uses XMLHttpRequest. */
  uploadWithProgress<T>(path: string, blob: Blob, onProgress: (fraction: number) => void): Promise<ApiResult<T>> {
    if (typeof XMLHttpRequest === 'undefined' || !isPlainPath(path)) return this.uploadBytes<T>(path, blob);
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

  /** Calls `listener` with the path of every write the server accepted; returns the way to stop. */
  onWrite(listener: (path: string) => void): () => void {
    this.writeListeners.add(listener);
    return () => this.writeListeners.delete(listener);
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const result = await this.send<T>(method, path, options);
    if (result.ok && MUTATING.has(method)) for (const listener of this.writeListeners) listener(path);
    return result;
  }

  private async send<T>(method: string, path: string, options: RequestOptions): Promise<ApiResult<T>> {
    if (!isPlainPath(path)) return OFF_PATH;
    const headers: Record<string, string> = { ...options.headers, 'x-device-id': deviceId() };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (MUTATING.has(method)) headers['idempotency-key'] = requestId();

    const attempt = async (): Promise<ApiResult<T>> => {
      const tokens = this.storage.get();
      // A credential the caller passed (the suspension screen's appeal token) wins over a stored session.
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
      // Suspended mid-session: the refresh answers ACCOUNT_SUSPENDED with the reasons for onSuspended, or a fresh token
      // when the suspension has just ended.
      if (await this.refreshOnce()) return attempt();
      return first;
    }
    if (first.ok || first.error.status !== 401 || options.signal?.aborted) return first;

    // A 401 without a stored session is an ordinary auth failure, such as a bad login, so its message is shown as is.
    if (!this.storage.get()) return first;

    const refreshed = await this.refreshOnce();
    if (!refreshed) return this.loggedOut();

    const second = await attempt();
    if (second.ok || second.error.status !== 401) return second;
    return this.loggedOut();
  }

  /** Revokes the stored session on the server so copies of its refresh token stop working. Best effort; never throws. */
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
      // Offline: the session still ends locally.
    }
  }

  /** Swaps in a new access token, keeping the refresh token where it lives; a password change issues one for this session. */
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
          // The API has already ended every session of this account.
          this.storage.clear();
          this.onSuspended(suspended);
        }
      }
      return false;
    }
    const next = (await res.json()) as TokenPair;
    // Keep the tokens in whichever storage they already live in.
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
    let envelope: { code?: string; message?: string; requestId?: string; details?: unknown; reason?: unknown; reviewId?: unknown } = {};
    try {
      envelope = (await res.json()) as typeof envelope;
    } catch {
      // Non-JSON error body.
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
          // E.g. a group's REQUEST_WAIT `until`, shown to the reader.
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
        // A refused picture's reason and review sit beside the code rather than in `details`.
        ...(isPictureRejection(envelope)
          ? { rejection: { code: envelope.code, message: envelope.message ?? '', reason: envelope.reason, reviewId: envelope.reviewId } }
          : {}),
      },
    };
  }
}

/**
 * Server codes precise enough to translate. Codes that carry several different messages (FORBIDDEN has seven) are
 * left out and fall through to the server's message.
 */
export const CODE_COPY: Record<string, MessageKey> = {
  ACCOUNT_NOT_ACTIVATED: 'error.notActivated',
  VERIFICATION_EMAIL_LIMIT: 'error.code.verificationEmailLimit',
  ACCOUNT_DISABLED: 'error.code.accountDisabled',
  CODE_EXPIRED: 'error.code.codeExpired',
  INVALID_CODE: 'error.code.invalidCode',
  INVALID_CREDENTIALS: 'error.code.invalidCredentials',
  INVALID_TOKEN: 'error.code.invalidLink',
  LOCKED: 'error.code.locked',
  SIGNUP_REJECTED: 'error.code.signupRejected',
  TOO_MANY_ATTEMPTS: 'error.code.tooManyAttempts',
  USERNAME_TAKEN: 'error.code.usernameTaken',
  // Worded so it does not reveal whether the address is registered.
  REGISTRATION_FAILED: 'error.code.registrationFailed',
  LOGIN_VERIFICATION_REQUIRED: 'error.code.loginCheck',
  // Any reason the server has for refusing a refresh.
  INVALID_REFRESH: 'error.sessionExpired',
  REFRESH_EXPIRED: 'error.sessionExpired',
  REFRESH_REUSED: 'error.sessionExpired',
  UNDER_MINIMUM_AGE: 'error.code.underMinimumAge',
  INVALID_BIRTH_MONTH: 'error.code.invalidBirthMonth',
  BIRTH_DATE_ALREADY_SET: 'error.code.birthDateAlreadySet',
  VISIBILITY_NOT_ALLOWED: 'error.code.visibilityNotAllowed',
  LEARN_FIRST: 'error.code.learnFirst',
  // Sign-up, reset and change.
  PASSWORD_BREACHED: 'error.code.passwordBreached',
  // The same for every reason, and whether or not the address has an account.
  CAPTCHA_REQUIRED: 'error.code.captchaRequired',
  // Changing the password while signed in.
  WRONG_PASSWORD: 'error.code.wrongPassword',
  NO_PASSWORD: 'error.code.noPassword',
  SESSION_NOT_FOUND: 'error.code.sessionNotFound',
  // The maintenance screen says the rest, so no generic server error is shown beside it.
  [MAINTENANCE_CODE]: 'maintenance.title',
};
/** Sentences for `WEAK_PASSWORD`'s `details.reason` (api/src/auth/password-policy.ts); the numbers are the policy's. */
const PASSWORD_REASON: Record<string, [MessageKey, Record<string, number>?]> = {
  'too-short': ['error.code.passwordTooShort', { count: 8 }],
  'too-long': ['error.code.passwordTooLong', { count: 128 }],
  'needs-letter': ['error.code.passwordNeedsLetter'],
  'needs-number': ['error.code.passwordNeedsNumber'],
};

function reasonOf(details: unknown): string | null {
  return details && typeof details === 'object' && typeof (details as { reason?: unknown }).reason === 'string'
    ? (details as { reason: string }).reason
    : null;
}

/** The sentence for a refusal whose code alone is not enough (password and username rules, form fields), or null. */
function detailedCopy(error: ApiError, t: Translate): string | null {
  if (error.code === 'WEAK_PASSWORD') {
    const found = PASSWORD_REASON[reasonOf(error.details) ?? ''];
    return found ? t(found[0], found[1]) : t('auth.passwordHint');
  }
  // The same words the username field's own check uses (lib/usernameText.ts).
  if (error.code === 'INVALID_USERNAME') return usernameRefusalText(reasonOf(error.details) ?? '', (error.details as { chars?: unknown } | null)?.chars, t);
  if (error.code === 'VALIDATION_ERROR') {
    // Name the field; the email address is the one most often mistyped.
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

/**
 * A readable sentence for an ApiError. `t` is required so no call site can silently fall back to English; the server's
 * own message still shows where it is more specific than anything here.
 */
export function describeError(error: ApiError, t: Translate, locale?: string): string {
  // I18nProvider keeps <html lang> in step with the reader's language.
  const lang = (locale ?? (typeof document !== 'undefined' ? document.documentElement.lang : '')) || 'en';

  // An account restriction says what is limited and until when (reports/restriction.ts).
  const restriction = restrictionOf(error);
  if (restriction) return restrictionText(restriction, t, lang);

  // A refused picture says why in the owner's words (pictures/words.ts), never the server's English.
  const refused = rejectionText(error, t);
  if (refused) return refused;

  // A count limit (lib/limits.ts) comes before any countdown: a full list of drafts does not empty by waiting.
  const limit = limitErrorText(error, t);
  if (limit) return limit;

  // A sign-in lockout reads as "about 15 minutes" rather than seconds; without a number, CODE_COPY's sentence is used.
  if (error.code === 'LOCKED') {
    const sec = lockedForSec(error);
    if (sec !== null) return t('error.code.lockedFor', { duration: durationInWords(sec, t, lang) });
  }

  // Every 429 carries a Retry-After, and a live countdown beats any sentence.
  if (error.kind === 'rate_limited' && error.retryAfterSec && error.retryAfterSec > 0) {
    const wait = Math.max(1, Math.ceil(error.retryAfterSec));
    return wait >= 90
      ? t('error.tooManyRetryInMin', { minutes: Math.ceil(wait / 60) })
      : t('error.tooManyRetryIn', { seconds: wait });
  }

  // Otherwise a precise code beats the generic sentence for the kind.
  const byCode = error.code ? CODE_COPY[error.code] : undefined;
  if (byCode) return t(byCode);
  const detailed = detailedCopy(error, t);
  if (detailed) return detailed;
  // A route the server lacks: this build is newer than the server (@kurda/shared isMissingRoute).
  if (isMissingRoute(error)) return t('error.notOnServer');
  switch (error.kind) {
    case 'network':
      return t('error.offline');
    case 'rate_limited':
      // No countdown here; the branch above took those.
      return t('error.tooMany');
    case 'unauthorized':
      // INVALID_CREDENTIALS is answered by code above, so this is a failed mid-session refresh or an unknown 401.
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
