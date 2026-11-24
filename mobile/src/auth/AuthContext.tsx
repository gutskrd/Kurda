import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { ApiClient } from '../api/client';
import { useHeartbeat } from './useHeartbeat';
import { deviceTimeZone, useTimeZoneSync } from './timeZone';
import { defaultApiBaseUrl } from '../api/env';
import type { ApiError, TokenStorage } from '../api/types';
import { describeError, describeErrorOr, isMaintenance } from '../api/errors';
import { useI18n } from '../i18n/I18nContext';
import type { Locale } from '../i18n/translations';
import { createDeviceIdStore, createTokenStorage } from './storage';
import { loadDeviceId } from './deviceId';
import { deviceName } from './deviceName';
import type { AgeStopKind } from './birthMonth';
import type { AccountHold, SupervisionState, SuspendedErrorDetails } from '@kurda/shared';
import { suspendedDetails } from '../reports/suspension';
import { onMaintenanceOver, showMaintenance } from '../maintenance/maintenance';
import { notifyGuestRefused } from './guestRefused';
import { unregisterThisDevice } from '../push/thisDevice';
import { openFirstLessonNext } from '../learn/firstLesson';
import { noteParentalRefusal } from '../parental/refusals';

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  /** Their own picture, for the profile tab. `/me` returns it, so the session already holds it. */
  profilePhotoUrl: string | null;
  /** The avatar everyone sees: their photo, their chosen avatar or the default deer (/me only). */
  avatarUrl?: string | null;
  /** Whether the user has confirmed their email address. */
  emailVerified: boolean;
  /**
   * No birth month on record (a Google or Apple sign-up, or an older account): the app asks once before anything else.
   * Absent on older responses, which reads as nothing to ask.
   */
  birthDateRequired?: boolean;
  /** 13–17 today, as the server works it out (/me only). */
  minor?: boolean;
  /** Takes part in the weekly leagues (/me only). */
  leaguesEnabled?: boolean;
  /**
   * A guest: an account made by "Try Hevalo first" with a generated username and no email, which learns like anyone but
   * is refused the social, public and purchasable routes until claimed (POST /auth/claim). Absent on an older server,
   * which reads as a full account.
   */
  guest?: boolean;
  /** The IANA zone the server counts this account's days in (auth/timeZone.ts); absent on an older server. */
  timezone?: string;
  /** Set while a person checks the account before it may post or message (/me only); null or absent for nearly everyone. */
  accountHold?: AccountHold | null;
  /** A supervised teen's limits and where they stand today (/me only); null or absent for everyone else (parental/). */
  supervision?: SupervisionState | null;
}

/** A failed request, with the server's code when it sent one. */
export interface AuthFailure {
  message: string;
  code?: string;
}

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

/**
 * What asking to delete the account came to. A full account is kept for `graceDays` (from DELETE /me), and signing in
 * again before then keeps it; a guest is closed at once, so its `graceDays` is 0.
 */
export type AccountDeletion = { ok: true; graceDays: number } | { ok: false; message: string };

/** What Sign in with Apple gives the app besides the identity token. */
export interface AppleSignInExtras {
  authorizationCode?: string | null;
  /** Given and family name, joined; Apple shares it on the first sign-in only. */
  fullName?: string | null;
}

/** What a guest fills in to make the account their own: the register form's fields, as POST /auth/claim takes them. */
export interface ClaimInput {
  email: string;
  password: string;
  /** A chosen username; left out, the generated one stays. */
  username?: string;
  locale?: Locale;
  birthYear: number;
  birthMonth: number;
}

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  /**
   * Signed in as a guest (`user.guest`). A guest is `signedIn` like anyone; places that need an account ask through the
   * account gate (auth/AccountGate).
   */
  isGuest: boolean;
  client: ApiClient;
  /** API origin, used to derive the realtime WebSocket URL. */
  baseUrl: string;
  /**
   * Resolves to the failure, or null on success. The code rides along so the form can offer the matching way on (Reset
   * password after CAPTCHA_REQUIRED or LOCKED).
   */
  login(email: string, password: string): Promise<AuthFailure | null>;
  /**
   * Resolves to the failure, or null on success. The code rides along because UNDER_MINIMUM_AGE replaces the form with
   * an explanation.
   */
  register(input: {
    email: string;
    username: string;
    password: string;
    /**
     * The language the account is created in. It is stored on the user and decides the language of the confirmation
     * email.
     */
    locale?: Locale;
    /** Asked on the form with no default; the server refuses under 13. */
    birthYear: number;
    birthMonth: number;
  }): Promise<AuthFailure | null>;
  /**
   * Start as a guest (POST /auth/guest): a session for an account with a generated name, so somebody can try the
   * lessons before giving an email address. Applied like a sign-in; resolves to the failure, or null on success.
   */
  continueAsGuest(): Promise<AuthFailure | null>;
  /**
   * Make the guest account a full one (POST /auth/claim): the same account and progress, now with an email, password
   * and birth month. The server answers with the user (`guest` false, `emailVerified` false, a code on its way) and the
   * verify-email gate takes over. The tokens stay. Resolves to the failure, with its code, as `register` does.
   */
  claimAccount(input: ClaimInput): Promise<AuthFailure | null>;
  /** Re-read the signed-in account (after answering the birth month question). */
  refreshUser(): Promise<void>;
  /**
   * Set when an answer stopped at age, for as long as the app is open, so the explanation stays rather than inviting a
   * different year. 'closed' also signs out, since the server has just closed the account.
   */
  ageStop: AgeStopKind | null;
  stopForAge(kind: AgeStopKind): Promise<void>;
  /**
   * Set when a sign-in or refresh was refused because the account is suspended or banned (403 ACCOUNT_SUSPENDED): the
   * reasons and the appeal token, for the suspension screen. Signed out meanwhile.
   */
  suspension: SuspendedErrorDetails | null;
  /** Leave the suspension screen for the sign-in form. */
  clearSuspension(): void;
  /**
   * Sign in (or create an account) with a provider identity token from the native flow, which the server verifies (POST
   * /auth/oauth) and answers with a session, stored as for email login. Resolves to an error message, or null on
   * success.
   *
   * For Apple, `apple` carries the one-time authorization code (exchanged by the server for the token it revokes when
   * the account is deleted) and the name the person shared, which Apple gives on the first sign-in only.
   */
  oauthSignIn(provider: 'apple' | 'google', idToken: string, apple?: AppleSignInExtras): Promise<string | null>;
  /**
   * Submit the 6-digit email code. On success the user is marked verified, lifting the verification gate. Resolves to
   * an error message, or null on success.
   */
  verifyEmailCode(code: string): Promise<string | null>;
  /** Ask the server to email a fresh verification code. */
  resendVerificationCode(): Promise<string | null>;
  /**
   * Correct the address of a sign-up that has not confirmed it yet; the server sends the code there and the old one
   * stops working. Resolves to what went wrong, or null once a code is on its way.
   */
  changePendingEmail(email: string): Promise<string | null>;
  /**
   * Ask for a reset link. The server answers the same whether or not the address has an account, so the only failures
   * are no answer at all (offline, a fault, too many requests). Resolves to that failure in words, or null.
   */
  requestPasswordReset(email: string): Promise<string | null>;
  logout(): Promise<void>;
  /**
   * Start account deletion: schedules a grace-period delete server-side (DELETE /me) and signs out locally; signing in
   * before it elapses cancels it. Resolves to the grace period, or to why it failed.
   */
  deleteAccount(): Promise<AccountDeletion>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** A restore that could not reach Hevalo is asked again this long after, doubling each time up to the longest wait. */
const RESTORE_RETRY_MS = 2000;
const RESTORE_RETRY_MAX_MS = 30_000;

/** The network, or Hevalo itself, did not answer: nothing was said about the session. */
function unreachable(error: ApiError): boolean {
  return error.kind === 'network' || error.kind === 'server' || error.kind === 'rate_limited';
}

/**
 * Calls `again` once: when the phone comes back online, when the app returns to the front, or after `waitMs`, whichever
 * is first. Returns the way to stop waiting.
 */
function whenReachable(again: () => void, waitMs: number): () => void {
  let done = false;
  let wasOffline = false;
  const once = (): void => {
    if (done) return;
    done = true;
    stop();
    again();
  };
  const timer = setTimeout(once, waitMs);
  // Told the state at once and on every change: only offline to online is a reason to ask now.
  const net = NetInfo.addEventListener((state) => {
    if (state.isConnected === false) wasOffline = true;
    else if (state.isConnected === true && wasOffline) once();
  });
  const front = AppState.addEventListener('change', (state) => {
    if (state === 'active') once();
  });
  function stop(): void {
    clearTimeout(timer);
    net();
    front.remove();
  }
  return () => {
    done = true;
    stop();
  };
}

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
  // Storage and baseUrl are fixed for the provider's lifetime: a default parameter would make a new storage each
  // render, recreating the client and re-running the restore effect in a loop.
  const [storage] = useState<TokenStorage>(() => storageProp ?? createTokenStorage());
  // Trailing slashes are stripped because every consumer joins `${baseUrl}${path}` with absolute paths; a doubled slash
  // would 404 every request.
  const [baseUrl] = useState<string>(
    () => (baseUrlProp ?? process.env.EXPO_PUBLIC_API_URL ?? defaultApiBaseUrl()).replace(/\/+$/, ''),
  );
  // Read once as the app starts, then held in memory for every request (auth/deviceId.ts).
  const [deviceStore] = useState(() => {
    const store = createDeviceIdStore();
    void loadDeviceId(store);
    return store;
  });
  // What the list of signed-in devices calls this one; the same for the life of the app.
  const [device] = useState(() => {
    const name = deviceName();
    return name ? { deviceName: name } : {};
  });
  // The zone a new account counts its days in (auth/timeZone.ts); read when sent, since a phone travels.
  const zone = (): { timezone?: string } => {
    const timezone = deviceTimeZone();
    return timezone ? { timezone } : {};
  };

  const { t, locale } = useI18n();
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ageStop, setAgeStop] = useState<AgeStopKind | null>(null);
  const [suspension, setSuspension] = useState<SuspendedErrorDetails | null>(null);
  // A restore asked again once Hevalo or the network is back.
  const [restoreRound, setRestoreRound] = useState(0);
  // How many restores in a row could not reach Hevalo, so each waits a little longer than the last.
  const unreached = useRef(0);

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
        // Hevalo offline for a while: the notice over the app, and the session kept.
        onMaintenance: showMaintenance,
        // A guest refused something only an account may do: the offer to make one (auth/AccountGate).
        onGuestRefused: notifyGuestRefused,
        // A refusal can come before /me is read again, so the account shows as held from then on (reports/HeldNotice).
        onHeld: () => setUser((u) => (u && !u.accountHold ? { ...u, accountHold: { reason: 'possible_return', since: new Date().toISOString() } } : u)),
        // A parent's switch or pause met at a write: the teen's limits are read again (parental/supervision.tsx).
        onParental: noteParentalRefusal,
        deviceId: () => loadDeviceId(deviceStore),
      }),
    [baseUrl, storage, deviceStore],
  );

  // A guest has no friends to be seen online by, so no presence beat is sent for one.
  useHeartbeat(client, status === 'signedIn' && user?.guest !== true);

  // The account's days are the learner's own: its time zone follows the device's (auth/timeZone.ts).
  const zoneTaken = useCallback((timezone: string) => setUser((u) => (u ? { ...u, timezone } : u)), []);
  useTimeZoneSync(client, user?.timezone, status === 'signedIn', zoneTaken);

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
        unreached.current = 0;
        setUser(me.data.user);
        setStatus('signedIn');
      } else if (isMaintenance(me.error)) {
        // Hevalo is offline, not the session: it waits under the notice and is restored once Hevalo is back.
        stopWaiting = onMaintenanceOver(() => setRestoreRound((n) => n + 1));
      } else if (unreachable(me.error) && (await storage.get())) {
        // No network, or a server slow to wake, is not a failed session either: it waits on the launch screen and is
        // asked again as soon as it may answer, so a tapped notification is still followed once in.
        const wait = Math.min(RESTORE_RETRY_MAX_MS, RESTORE_RETRY_MS * 2 ** unreached.current);
        unreached.current += 1;
        if (!cancelled) stopWaiting = whenReachable(() => setRestoreRound((n) => n + 1), wait);
      } else {
        // ApiClient already cleared storage on auth failures.
        setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
      stopWaiting?.();
    };
  }, [client, storage, restoreRound]);

  // Back from being offline: the account as it is now, with the rest of the app's data.
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
    // Signing in answers with the account's identity only; the rest of it (the avatar, leagues, age) follows from /me.
    void client.get<{ user: SessionUser }>('/me').then((me) => {
      if (me.ok) setUser(me.data.user);
    });
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
        // A suspended account is shown why, not a sign-in error (Root renders the screen).
        const suspended = res.error.code === 'ACCOUNT_SUSPENDED' ? suspendedDetails(res.error.details) : null;
        if (suspended) setSuspension(suspended);
        return { message: describeError(res.error, t), code: res.error.code };
      }
      await applyAuth(res.data);
      return null;
    },
    register: async (input) => {
      // Consent is versioned server-side; the register screen shows the terms and privacy notice next to the submit
      // button.
      const res = await client.post<AuthPayload>('/auth/register', {
        ...input,
        ...device,
        ...zone(),
        acceptTerms: true,
      });
      if (!res.ok) return { message: describeError(res.error, t), code: res.error.code };
      await applyAuth(res.data);
      return null;
    },
    continueAsGuest: async () => {
      // The language chosen in the intro is the account's, as for a sign-up; a later claim keeps it.
      const res = await client.post<AuthPayload>('/auth/guest', { ...device, ...zone(), locale });
      if (!res.ok) return { message: describeError(res.error, t), code: res.error.code };
      // Start learning means a lesson, as a new account's first screen is.
      openFirstLessonNext();
      await applyAuth(res.data);
      return null;
    },
    claimAccount: async (input) => {
      // Consent is versioned server-side, as at sign-up; the claim form shows the same notice.
      const res = await client.post<{ user: SessionUser }>('/auth/claim', { ...input, acceptTerms: true });
      if (!res.ok) return { message: describeError(res.error, t), code: res.error.code };
      // The same session: only who it belongs to has changed.
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
        // The account is gone and its tokens with it.
        await storage.clear();
        setUser(null);
        setStatus('signedOut');
      }
    },
    oauthSignIn: async (provider, idToken, apple) => {
      /*
       * Signed in as a guest, an OAuth sign-in claims the guest's own account (api/src/auth/oauth.ts), but only when it
       * carries the guest's session. This route does not renew an expired access token, so asking for the account first
       * renews it; otherwise a second account is made and the progress left behind.
       */
      if (user?.guest === true) await client.get('/me');
      const extras =
        provider === 'apple'
          ? {
              ...(apple?.authorizationCode ? { authorizationCode: apple.authorizationCode } : {}),
              ...(apple?.fullName ? { fullName: apple.fullName } : {}),
            }
          : {};
      const res = await client.post<AuthPayload & { created?: boolean }>('/auth/oauth', { provider, idToken, ...extras, ...device });
      if (!res.ok) {
        const suspended = res.error.code === 'ACCOUNT_SUSPENDED' ? suspendedDetails(res.error.details) : null;
        if (suspended) {
          setSuspension(suspended);
          return describeError(res.error, t);
        }
        // Only the reader's own language: the codes that name a cause each have their sentence, and anything else is
        // the plain "couldn't confirm that sign-in", never the server's English.
        return describeErrorOr(res.error, t, 'error.code.oauthFailed');
      }
      // A new account starts in its first lesson, once its birth month is asked.
      if (res.data.created === true) openFirstLessonNext();
      await applyAuth(res.data);
      return null;
    },
    verifyEmailCode: async (code) => {
      const res = await client.post<{ verified: boolean }>('/auth/verify-email-code', { code });
      if (!res.ok) return describeError(res.error, t);
      // Confirmed: the account's first screen is its first lesson, as on the website.
      openFirstLessonNext();
      setUser((prev) => (prev ? { ...prev, emailVerified: true } : prev));
      return null;
    },
    resendVerificationCode: async () => {
      const res = await client.post<{ sent: boolean }>('/auth/resend-verification-code', {});
      if (!res.ok) return describeError(res.error, t);
      return null;
    },
    changePendingEmail: async (email) => {
      const res = await client.post<{ user: { email: string }; sent: boolean }>('/auth/change-pending-email', { email });
      if (!res.ok) return describeError(res.error, t);
      const address = res.data.user.email;
      setUser((prev) => (prev ? { ...prev, email: address } : prev));
      // Changed, but the day's limit of emails is reached: say so rather than promise a code.
      return res.data.sent ? null : t('error.code.verificationEmailLimit');
    },
    requestPasswordReset: async (email) => {
      const res = await client.post('/auth/request-password-reset', { email });
      return res.ok ? null : describeError(res.error, t);
    },
    logout: async () => {
      // The phone off the account's notifications first, while the session can still say whose phone it is.
      await unregisterThisDevice(client);
      // End the session on the server too, not only on this phone.
      await client.endSession();
      await storage.clear();
      setUser(null);
      setStatus('signedOut');
    },
    deleteAccount: async () => {
      // Before the deletion, which ends every session the account has; after it, nothing could say whose phone this is.
      await unregisterThisDevice(client);
      const res = await client.delete<{ deletionScheduled: boolean; graceDays: number }>('/me');
      if (!res.ok) return { ok: false, message: describeError(res.error, t) };
      // And the session ends on the server as signing out ends it, whatever the deletion did with it.
      await client.endSession();
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
