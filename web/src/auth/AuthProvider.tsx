import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiClient, createApiClient, describeError } from '../lib/api';
import { persistTokens } from '../lib/tokenStorage';
import { forgetAnswers } from '../lib/apiMemory';
import { forgetDrafts } from '../letters/drafts';
import { thisDeviceName } from '../lib/deviceName';
import { pollWhileVisible } from '../lib/pollWhileVisible';
import type { AuthPayload, SessionUser } from '../lib/types';
import { useT } from '../i18n/I18nProvider';
import type { MaintenanceNotice, SuspendedErrorDetails } from '@kurda/shared';
import { suspensionOf } from '../reports/restriction';
import { sameNotice } from '../maintenance/notice';
import { authErrorField, type AuthField } from './fieldProblem';

type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

interface RegisterInput {
  email: string;
  username: string;
  password: string;
  locale?: string;
  /** Asked on the form with no default; the server refuses under 13. */
  birthYear: number;
  birthMonth: number;
}

/** Why a sign-in or sign-up was refused: the message, the server's code, and the field it concerns, if any. */
interface AuthRefusal {
  message: string;
  code?: string;
  field: AuthField | null;
}

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  client: ApiClient;
  /**
   * Resolves to the refusal, or null on success. The code lets a paused sign-in offer a new password; the field lets
   * the form show the problem there (auth/fieldProblem.ts).
   */
  login(email: string, password: string, remember: boolean): Promise<AuthRefusal | null>;
  /** Resolves to the refusal, or null on success. The code matters because UNDER_MINIMUM_AGE replaces the form. */
  register(input: RegisterInput): Promise<AuthRefusal | null>;
  requestPasswordReset(email: string): Promise<void>;
  logout(): Promise<void>;
  /** Re-fetches the profile, such as after editing it elsewhere. */
  refreshUser(): Promise<void>;
  /**
   * Set when the account is suspended, at sign-in or mid-session, with the reasons and appeal token; the suspension
   * screen (reports/SuspensionGate.tsx) replaces the app until dismissed.
   */
  suspension: SuspendedErrorDetails | null;
  dismissSuspension(): void;
  /**
   * Set while Hevalo is offline, with the admin's notice, by any request that finds out (lib/api.ts). The offline
   * screen (maintenance/MaintenanceGate.tsx) replaces the app, updates it, and clears it when Hevalo is back.
   */
  maintenance: MaintenanceNotice | null;
  setMaintenance(notice: MaintenanceNotice | null): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const t = useT();
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [suspension, setSuspension] = useState<SuspendedErrorDetails | null>(null);
  const [maintenance, setMaintenanceState] = useState<MaintenanceNotice | null>(null);
  // The same, synchronously, for requests still running when they find out.
  const offline = useRef(false);
  const setMaintenance = useCallback((notice: MaintenanceNotice | null) => {
    offline.current = notice !== null;
    setMaintenanceState((was) => (sameNotice(was, notice) ? was : notice));
  }, []);

  // Build the client once. onLogout fires when a refresh fails mid-session, onSuspended when that failure is a
  // suspension, and onMaintenance when Hevalo goes offline. Signing out also drops the remembered answers.
  const { client, storage } = useMemo(
    () =>
      createApiClient(
        () => {
          forgetAnswers();
          setUser(null);
          setStatus('signedOut');
        },
        (details) => {
          forgetAnswers();
          setUser(null);
          setStatus('signedOut');
          setSuspension(details);
        },
        setMaintenance,
        // A refusal can arrive before /me is read again, so the account shows as held from then on.
        () => setUser((u) => (u && !u.accountHold ? { ...u, accountHold: { reason: 'possible_return', since: new Date().toISOString() } } : u)),
      ),
    [setMaintenance],
  );

  // Restore the session on load by verifying any tokens against /me. While Hevalo is offline there is no answer, so
  // the check waits until it is back.
  useEffect(() => {
    if (status !== 'restoring' || maintenance) return;
    let cancelled = false;
    void (async () => {
      if (!storage.get()) {
        if (!cancelled) setStatus('signedOut');
        return;
      }
      const me = await client.get<{ user: SessionUser }>('/me');
      if (cancelled) return;
      if (me.ok) {
        setUser(me.data.user);
        setStatus('signedIn');
      } else if (!offline.current) {
        setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, storage, status, maintenance]);

  // Presence heartbeat while signed in and the tab is in view: at once, then every two minutes, well inside the
  // server's five-minute online window (social/presence.ts). Coming back to the tab beats at once.
  useEffect(() => {
    if (status !== 'signedIn') return;
    const ping = (): void => {
      void client.post('/me/heartbeat');
    };
    ping();
    return pollWhileVisible(ping, 120_000);
  }, [status, client]);

  const applyAuth = (payload: AuthPayload, remember: boolean): void => {
    // Whoever signs in, nothing remembered from before is theirs to see.
    forgetAnswers();
    persistTokens(payload.tokens, remember);
    setUser(payload.user);
    setStatus('signedIn');
  };

  const value: AuthContextValue = {
    status,
    user,
    client,
    login: async (email, password, remember) => {
      // The device name is what Settings lists this session under. Without "remember", the server keeps the session
      // for a day rather than a month, as this browser forgets it when the window closes.
      const res = await client.post<AuthPayload>('/auth/login', { email, password, deviceName: thisDeviceName(), remember });
      if (!res.ok) {
        // A suspended account gets the suspension screen, not a message under the form.
        const suspended = suspensionOf(res.error);
        if (suspended) setSuspension(suspended);
        return { message: describeError(res.error, t), code: res.error.code, field: authErrorField(res.error) };
      }
      setSuspension(null);
      applyAuth(res.data, remember);
      return null;
    },
    register: async (input) => {
      const res = await client.post<AuthPayload>('/auth/register', { ...input, deviceName: thisDeviceName(), acceptTerms: true });
      if (!res.ok) return { message: describeError(res.error, t), code: res.error.code, field: authErrorField(res.error) };
      applyAuth(res.data, true);
      return null;
    },
    requestPasswordReset: async (email) => {
      await client.post('/auth/request-password-reset', { email });
    },
    logout: async () => {
      // End the session on the server too. Not awaited: the token is read before this returns, and signing out must
      // not wait on a slow network.
      void client.endSession();
      storage.clear();
      // Nothing this account loaded or was writing stays behind for the next person.
      forgetAnswers();
      forgetDrafts();
      setUser(null);
      setStatus('signedOut');
    },
    refreshUser: async () => {
      const me = await client.get<{ user: SessionUser }>('/me');
      if (me.ok) setUser(me.data.user);
    },
    suspension,
    dismissSuspension: () => setSuspension(null),
    maintenance,
    setMaintenance,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The signed-in user, or null outside the provider, for small parts that also render on their own (reports/SendError). */
export function useSessionUser(): SessionUser | null {
  return useContext(AuthContext)?.user ?? null;
}
