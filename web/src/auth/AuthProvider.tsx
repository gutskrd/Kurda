import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiClient, createApiClient, describeError } from '../lib/api';
import { persistTokens } from '../lib/tokenStorage';
import type { AuthPayload, SessionUser } from '../lib/types';

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  client: ApiClient;
  /** Resolve to an error message, or null on success. */
  login(email: string, password: string, remember: boolean): Promise<string | null>;
  register(input: { email: string; username: string; password: string }): Promise<string | null>;
  requestPasswordReset(email: string): Promise<void>;
  logout(): Promise<void>;
  /** Re-fetch the profile (e.g. after editing it elsewhere). */
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<SessionUser | null>(null);

  // Build the client once. onLogout fires when a refresh fails mid-session.
  const { client, storage } = useMemo(
    () =>
      createApiClient(() => {
        setUser(null);
        setStatus('signedOut');
      }),
    [],
  );

  // Restore the session on load: if tokens exist, verify them against /me.
  useEffect(() => {
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
      } else {
        setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, storage]);

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
      const res = await client.post<AuthPayload>('/auth/login', { email, password });
      if (!res.ok) return describeError(res.error);
      applyAuth(res.data, remember);
      return null;
    },
    register: async (input) => {
      const res = await client.post<AuthPayload>('/auth/register', { ...input, acceptTerms: true });
      if (!res.ok) return describeError(res.error);
      applyAuth(res.data, true);
      return null;
    },
    requestPasswordReset: async (email) => {
      await client.post('/auth/request-password-reset', { email });
    },
    logout: async () => {
      storage.clear();
      setUser(null);
      setStatus('signedOut');
    },
    refreshUser: async () => {
      const me = await client.get<{ user: SessionUser }>('/me');
      if (me.ok) setUser(me.data.user);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
