import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiClient } from '../api/client';
import { useHeartbeat } from './useHeartbeat';
import { defaultApiBaseUrl } from '../api/env';
import type { TokenStorage } from '../api/types';
import { describeError, describeErrorOr, isMaintenance } from '../api/errors';
import { useI18n } from '../i18n/I18nContext';
import type { Locale } from '../i18n/translations';
import { createDeviceIdStore, createTokenStorage } from './storage';
import { loadDeviceId } from './deviceId';
import { deviceName } from './deviceName';
import type { AgeStopKind } from './birthMonth';
import type { SuspendedErrorDetails } from '@kurda/shared';
import { suspendedDetails } from '../reports/suspension';
import { onMaintenanceOver, showMaintenance } from '../maintenance/maintenance';
import { notifyGuestRefused } from './guestRefused';

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  /**
   * Their own picture, for the profile tab.
   *
   * `/me` has always returned it and this type has always dropped it, so the
   * profile screen fetched `/me` a second time to get it. Declaring it here
   * costs no request: the session already holds the whole object.
   */
  profilePhotoUrl: string | null;
  /** Whether the user has proven ownership of their email (KUR-014). */
  emailVerified: boolean;
  /**
   * No birth month on record (a Google or Apple sign-up, or an account from
   * before it was asked): the app asks once before anything else. Absent on
   * older responses, which reads as "nothing to ask".
   */
  birthDateRequired?: boolean;
  /** 13–17 today, as the server works it out (/me only) */
  minor?: boolean;
  /** takes part in the weekly leagues (/me only) */
  leaguesEnabled?: boolean;
  /**
   * A guest: an account made by "Try Hevalo first" with a generated username
   * and no email, which learns like anyone and is refused the social, public
   * and purchasable routes until it is claimed (POST /auth/claim). Absent on
   * an older server, which reads as a full account.
   */
  guest?: boolean;
}

/** A failed request, with the server's code when it sent one. */
export interface AuthFailure {
  message: string;
  code?: string;
}

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

/**
 * What asking to delete the account came to. A full account is kept for
 * `graceDays` (the server's DELETE /me says how many), and signing in again
 * before then keeps it; a guest is closed at once, so its `graceDays` is 0.
 */
export type AccountDeletion = { ok: true; graceDays: number } | { ok: false; message: string };

/** What Sign in with Apple gives the app besides the identity token. */
export interface AppleSignInExtras {
  authorizationCode?: string | null;
  /** given and family name, joined; Apple shares it on the first sign-in only */
  fullName?: string | null;
}

/** What a guest fills in to make the account their own: the register form's fields, as POST /auth/claim takes them. */
export interface ClaimInput {
  email: string;
  password: string;
  /** a chosen username; left out, the generated one stays */
  username?: string;
  locale?: Locale;
  birthYear: number;
  birthMonth: number;
}

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  /**
   * Signed in as a guest (`user.guest`). A guest is `signedIn` like anyone —
   * the lessons, the map and the games neither know nor care — and the places
   * that need an account ask through the account gate (auth/AccountGate).
   */
  isGuest: boolean;
  client: ApiClient;
  /** API origin, used to derive the realtime WebSocket URL (KUR-054). */
  baseUrl: string;
  /**
   * Resolves to the failure, or null on success. The code rides along so the
   * form can offer the way on that goes with it: a sign-in held back after
   * several failed attempts (CAPTCHA_REQUIRED, LOCKED) gets Reset password.
   */
  login(email: string, password: string): Promise<AuthFailure | null>;
  /**
   * Resolves to the failure, or null on success. The code rides along because
   * one refusal is not a message to show under a form: UNDER_MINIMUM_AGE
   * replaces the form with an explanation.
   */
  register(input: {
    email: string;
    username: string;
    password: string;
    /**
     * The language the account is created in.
     *
     * Not cosmetic: it is stored on the user and is what the confirmation
     * email is written in, so leaving it off meant somebody who picked
     * Kurmancî in the intro was emailed in English and signed in to English
     * on the web. The browser has always sent it.
     */
    locale?: Locale;
    /** asked on the form with no default; the server refuses under 13 */
    birthYear: number;
    birthMonth: number;
  }): Promise<AuthFailure | null>;
  /**
   * Start as a guest (POST /auth/guest): a session for an account with a
   * generated name, made on the spot, so somebody can try the lessons before
   * they give an email address. Applied like a sign-in. Resolves to the
   * failure, or null on success.
   */
  continueAsGuest(): Promise<AuthFailure | null>;
  /**
   * Make the guest account a full one (POST /auth/claim): the same account,
   * with everything learned on it, now with an email, a password and a birth
   * month. The server answers with the user — `guest` false and
   * `emailVerified` false, a code on its way by email — and the app's
   * verify-email gate takes over from there. The tokens stay: it is the same
   * session. Resolves to the failure, with its code, as `register` does.
   */
  claimAccount(input: ClaimInput): Promise<AuthFailure | null>;
  /** Re-read the signed-in account (after answering the birth month question). */
  refreshUser(): Promise<void>;
  /**
   * Set when an answer stopped at age, for as long as the app is open: the
   * explanation stays instead of handing back a form that invites a different
   * year. 'closed' also signs out — the server has just closed the account.
   */
  ageStop: AgeStopKind | null;
  stopForAge(kind: AgeStopKind): Promise<void>;
  /**
   * Set when sign-in, social sign-in or a refresh was refused because the
   * account is suspended or banned (403 ACCOUNT_SUSPENDED): the reasons and
   * the appeal token, for the suspension screen. Signed out meanwhile.
   */
  suspension: SuspendedErrorDetails | null;
  /** Leave the suspension screen for the sign-in form. */
  clearSuspension(): void;
  /**
   * Sign in (or create an account) with a provider identity token (KUR-276).
   * The native flow (e.g. Sign in with Apple) obtains the token; we hand it to
   * the backend (POST /auth/oauth), which verifies it and returns a session —
   * stored via the same path as email login. Resolves to an error message, or
   * null on success.
   *
   * Apple's sign-in also passes on what Apple gave with the token (`apple`):
   * the one-time authorization code, which the server exchanges for the token
   * it revokes at Apple when the account is deleted, and the name the person
   * shared, which Apple gives on their first sign-in only and the server uses
   * for a new account.
   */
  oauthSignIn(provider: 'apple' | 'google', idToken: string, apple?: AppleSignInExtras): Promise<string | null>;
  /**
   * Submit the 6-digit email-ownership code (KUR-014). On success the session
   * user is marked verified, which lifts the verification gate. Resolves to an
   * error message, or null on success.
   */
  verifyEmailCode(code: string): Promise<string | null>;
  /** Ask the server to email a fresh verification code. */
  resendVerificationCode(): Promise<string | null>;
  /**
   * Ask for a reset link. The server answers the same whether or not the
   * address has an account, so the only failures are its not answering at all
   * (offline, a fault, too many requests). Resolves to that failure in words,
   * or null once the request was taken.
   */
  requestPasswordReset(email: string): Promise<string | null>;
  logout(): Promise<void>;
  /**
   * Start account deletion (KUR-275). Schedules a grace-period delete server-side
   * (DELETE /me) and signs out locally; logging back in before it elapses cancels
   * it. Resolves to how long the grace period is, so the screen can say it, or
   * to why it failed.
   */
  deleteAccount(): Promise<AccountDeletion>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthPayload {
  user: SessionUser;
  tokens: { accessToken: string; refreshToken: string };
}

export function AuthProvider({
  children,
  storage: storageProp,
  baseUrl: baseUrlProp,
}: {
  children: ReactNode;
  storage?: TokenStorage;
  baseUrl?: string;
}) {
  // Stabilise storage and baseUrl for the lifetime of the provider.
  // A plain default parameter (createTokenStorage()) runs on EVERY
  // render, producing a new storage instance each time, which recreates
  // the client and re-runs the restore effect in a loop — bouncing the
  // user back to the login screen. useState initialisers run once.
  const [storage] = useState<TokenStorage>(() => storageProp ?? createTokenStorage());
  // Trailing slashes are stripped because every consumer joins `${baseUrl}${path}`
  // with absolute paths — a hand-typed EXPO_PUBLIC_API_URL ending in `/` would
  // otherwise double the slash on every request and 404.
  const [baseUrl] = useState<string>(
    () => (baseUrlProp ?? process.env.EXPO_PUBLIC_API_URL ?? defaultApiBaseUrl()).replace(/\/+$/, ''),
  );
  // read once as the app starts, then held in memory for every request (auth/deviceId.ts)
  const [deviceStore] = useState(() => {
    const store = createDeviceIdStore();
    void loadDeviceId(store);
    return store;
  });
  // what the list of signed-in devices calls this one; the same for the life of the app
  const [device] = useState(() => {
    const name = deviceName();
    return name ? { deviceName: name } : {};
  });

  const { t, locale } = useI18n();
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ageStop, setAgeStop] = useState<AgeStopKind | null>(null);
  const [suspension, setSuspension] = useState<SuspendedErrorDetails | null>(null);
  // a restore asked again once Hevalo is back from being offline
  const [restoreRound, setRestoreRound] = useState(0);

  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl,
        storage,
        onLogout: () => {
          setUser(null);
          setStatus('signedOut');
        },
        onSuspended: setSuspension,
        // Hevalo offline for a while: the screen over the app, and the session kept
        onMaintenance: showMaintenance,
        // a guest refused something only an account may do: the offer to make one (auth/AccountGate)
        onGuestRefused: notifyGuestRefused,
        deviceId: () => loadDeviceId(deviceStore),
      }),
    [baseUrl, storage, deviceStore],
  );

  // a guest has no friends to be seen online by, so the presence beat is not sent for one
  useHeartbeat(client, status === 'signedIn' && user?.guest !== true);

  useEffect(() => {
    let cancelled = false;
    let stopWaiting: (() => void) | null = null;
    (async () => {
      const tokens = await storage.get();
      if (!tokens) {
        if (!cancelled) setStatus('signedOut');
        return;
      }
      const me = await client.get<{ user: SessionUser }>('/me');
      if (cancelled) return;
      if (me.ok) {
        setUser(me.data.user);
        setStatus('signedIn');
      } else if (isMaintenance(me.error)) {
        // Hevalo is offline, not the session: it waits under the notice and
        // is restored once Hevalo is back, rather than landing on sign-in
        stopWaiting = onMaintenanceOver(() => setRestoreRound((n) => n + 1));
      } else {
        // ApiClient already cleared storage on auth failures; network
        // failures also land signed out rather than hanging on restore
        setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
      stopWaiting?.();
    };
  }, [client, storage, restoreRound]);

  // back from being offline: the account as it is now, with the rest of the app's data
  useEffect(() => {
    if (status !== 'signedIn') return;
    return onMaintenanceOver(() => {
      void client.get<{ user: SessionUser }>('/me').then((me) => {
        if (me.ok) setUser(me.data.user);
      });
    });
  }, [client, status]);

  const applyAuth = async (payload: AuthPayload) => {
    setSuspension(null);
    await storage.set({
      accessToken: payload.tokens.accessToken,
      refreshToken: payload.tokens.refreshToken,
    });
    setUser(payload.user);
    setStatus('signedIn');
  };

  const value: AuthContextValue = {
    status,
    user,
    isGuest: user?.guest === true,
    client,
    baseUrl,
    login: async (email, password) => {
      const res = await client.post<AuthPayload>('/auth/login', { email, password, ...device });
      if (!res.ok) {
        // a suspended account is shown why, not a sign-in error (Root renders the screen)
        const suspended = res.error.code === 'ACCOUNT_SUSPENDED' ? suspendedDetails(res.error.details) : null;
        if (suspended) setSuspension(suspended);
        return { message: describeError(res.error, t), code: res.error.code };
      }
      await applyAuth(res.data);
      return null;
    },
    register: async (input) => {
      // consent is versioned server-side (KUR-109); the register screen
      // shows the ToS/privacy notice next to the submit button
      const res = await client.post<AuthPayload>('/auth/register', {
        ...input,
        ...device,
        acceptTerms: true,
      });
      if (!res.ok) return { message: describeError(res.error, t), code: res.error.code };
      await applyAuth(res.data);
      return null;
    },
    continueAsGuest: async () => {
      // the language chosen in the intro is the account's, as it is for a sign-up: a claim later keeps it
      const res = await client.post<AuthPayload>('/auth/guest', { ...device, locale });
      if (!res.ok) return { message: describeError(res.error, t), code: res.error.code };
      await applyAuth(res.data);
      return null;
    },
    claimAccount: async (input) => {
      // consent is versioned server-side, as at sign-up; the claim form shows the same notice
      const res = await client.post<{ user: SessionUser }>('/auth/claim', { ...input, acceptTerms: true });
      if (!res.ok) return { message: describeError(res.error, t), code: res.error.code };
      // the same session: only who it belongs to has changed
      setUser(res.data.user);
      return null;
    },
    refreshUser: async () => {
      const me = await client.get<{ user: SessionUser }>('/me');
      if (me.ok) setUser(me.data.user);
    },
    ageStop,
    suspension,
    clearSuspension: () => setSuspension(null),
    stopForAge: async (kind) => {
      setAgeStop(kind);
      if (kind === 'closed') {
        // the account is gone and its tokens with it
        await storage.clear();
        setUser(null);
        setStatus('signedOut');
      }
    },
    oauthSignIn: async (provider, idToken, apple) => {
      /*
       * Signed in as a guest, the sign-in claims the guest's own account and
       * keeps what was learned (api/src/auth/oauth.ts) — but only when it
       * carries the guest's session. On this route an access token that has
       * run out is not refused and renewed, just not read, so the sign-in
       * made a second account and left the progress behind. Asking for the
       * account first renews a token that ran out.
       */
      if (user?.guest === true) await client.get('/me');
      const extras =
        provider === 'apple'
          ? {
              ...(apple?.authorizationCode ? { authorizationCode: apple.authorizationCode } : {}),
              ...(apple?.fullName ? { fullName: apple.fullName } : {}),
            }
          : {};
      const res = await client.post<AuthPayload>('/auth/oauth', { provider, idToken, ...extras, ...device });
      if (!res.ok) {
        const suspended = res.error.code === 'ACCOUNT_SUSPENDED' ? suspendedDetails(res.error.details) : null;
        if (suspended) {
          setSuspension(suspended);
          return describeError(res.error, t);
        }
        // Only the reader's own language: the codes that name a cause
        // (OAUTH_NOT_CONFIGURED, INVALID_OAUTH_TOKEN, an address waiting to
        // be confirmed) each have their sentence, and anything else is the
        // plain "couldn't confirm that sign-in", never the server's English
        // or its code in brackets.
        return describeErrorOr(res.error, t, 'error.code.oauthFailed');
      }
      await applyAuth(res.data);
      return null;
    },
    verifyEmailCode: async (code) => {
      const res = await client.post<{ verified: boolean }>('/auth/verify-email-code', { code });
      if (!res.ok) return describeError(res.error, t);
      setUser((prev) => (prev ? { ...prev, emailVerified: true } : prev));
      return null;
    },
    resendVerificationCode: async () => {
      const res = await client.post<{ sent: boolean }>('/auth/resend-verification-code', {});
      if (!res.ok) return describeError(res.error, t);
      return null;
    },
    requestPasswordReset: async (email) => {
      const res = await client.post('/auth/request-password-reset', { email });
      return res.ok ? null : describeError(res.error, t);
    },
    logout: async () => {
      // end the session on the server too, not only on this phone
      await client.endSession();
      await storage.clear();
      setUser(null);
      setStatus('signedOut');
    },
    deleteAccount: async () => {
      const res = await client.delete<{ deletionScheduled: boolean; graceDays: number }>('/me');
      if (!res.ok) return { ok: false, message: describeError(res.error, t) };
      await storage.clear();
      setUser(null);
      setStatus('signedOut');
      return { ok: true, graceDays: res.data.deletionScheduled ? res.data.graceDays : 0 };
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
