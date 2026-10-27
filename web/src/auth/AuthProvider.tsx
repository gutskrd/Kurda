import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiClient, createApiClient, describeError } from '../lib/api';
import { persistTokens } from '../lib/tokenStorage';
import { thisDeviceName } from '../lib/deviceName';
import type { AuthPayload, SessionUser } from '../lib/types';
import { useT } from '../i18n/I18nProvider';
import type { MaintenanceNotice, SuspendedErrorDetails } from '@kurda/shared';
import { suspensionOf } from '../reports/restriction';
import { sameNotice } from '../maintenance/notice';

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  locale?: string;
  /** asked on the form with no default; the server refuses under 13 */
  birthYear: number;
  birthMonth: number;
}

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  client: ApiClient;
  /**
   * Resolve to the error, or null on success. The code rides along because
   * some refusals need a way on beside the words: a paused sign-in offers a
   * new password.
   */
  login(email: string, password: string, remember: boolean): Promise<{ message: string; code?: string } | null>;
  /**
   * Resolve to the error, or null on success. The code rides along because one
   * refusal is not a message to show under a form: UNDER_MINIMUM_AGE replaces
   * the form with an explanation.
   */
  register(input: RegisterInput): Promise<{ message: string; code?: string } | null>;
  requestPasswordReset(email: string): Promise<void>;
  logout(): Promise<void>;
  /** Re-fetch the profile (e.g. after editing it elsewhere). */
  refreshUser(): Promise<void>;
  /**
   * Set when the account is suspended — at sign-in, or found out mid-session —
   * with the reasons and the appeal token; the suspension screen shows it
   * (reports/SuspensionGate.tsx) in place of the app until it is dismissed.
   */
  suspension: SuspendedErrorDetails | null;
  dismissSuspension(): void;
  /**
   * Set while Hevalo is offline, with what an admin wrote to show meanwhile;
   * any request can find out (lib/api.ts). The offline screen
   * (maintenance/MaintenanceGate.tsx) shows it in place of the app, keeps it
   * up to date, and sets it back to null when Hevalo is open again.
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
  // the same, at once: a request that has just found out is still running
  const offline = useRef(false);
  const setMaintenance = useCallback((notice: MaintenanceNotice | null) => {
    offline.current = notice !== null;
    setMaintenanceState((was) => (sameNotice(was, notice) ? was : notice));
  }, []);

  // Build the client once. onLogout fires when a refresh fails mid-session;
  // onSuspended when that failure is a suspension, with its reasons;
  // onMaintenance when Hevalo has been taken offline.
  const { client, storage } = useMemo(
    () =>
      createApiClient(
        () => {
          setUser(null);
          setStatus('signedOut');
        },
        (details) => {
          setUser(null);
          setStatus('signedOut');
          setSuspension(details);
        },
        setMaintenance,
      ),
    [setMaintenance],
  );

  // Restore the session on load: if tokens exist, verify them against /me.
  // While Hevalo is offline the answer is neither yes nor no, so the question
  // waits, and is asked again once Hevalo is back.
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

  // Presence heartbeat: while signed in, tell the server we're active so friends
  // see us as online. Fires immediately and then once a minute; the server
  // derives "online" from the last beat within a short window.
  useEffect(() => {
    if (status !== 'signedIn') return;
    const ping = (): void => {
      void client.post('/me/heartbeat');
    };
    ping();
    const id = setInterval(ping, 60_000);
    return () => clearInterval(id);
  }, [status, client]);

  const applyAuth = (payload: AuthPayload, remember: boolean): void => {
    persistTokens(payload.tokens, remember);
    setUser(payload.user);
    setStatus('signedIn');
  };

  const value: AuthContextValue = {
    status,
    user,
    client,
    login: async (email, password, remember) => {
      // the name is what Settings lists this session under ("Chrome on Windows");
      // not remembered, the server keeps the session a day rather than a month,
      // as this browser forgets it when the window closes
      const res = await client.post<AuthPayload>('/auth/login', { email, password, deviceName: thisDeviceName(), remember });
      if (!res.ok) {
        // a suspended account gets the suspension screen, not a line under the form
        const suspended = suspensionOf(res.error);
        if (suspended) setSuspension(suspended);
        return { message: describeError(res.error, t), code: res.error.code };
      }
      setSuspension(null);
      applyAuth(res.data, remember);
      return null;
    },
    register: async (input) => {
      const res = await client.post<AuthPayload>('/auth/register', { ...input, deviceName: thisDeviceName(), acceptTerms: true });
      if (!res.ok) return { message: describeError(res.error, t), code: res.error.code };
      applyAuth(res.data, true);
      return null;
    },
    requestPasswordReset: async (email) => {
      await client.post('/auth/request-password-reset', { email });
    },
    logout: async () => {
      // end the session on the server too, not only in this browser. Not
      // awaited: the token is read before this returns, and signing out must
      // not wait on a slow network
      void client.endSession();
      storage.clear();
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
