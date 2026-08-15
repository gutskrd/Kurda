import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiClient } from '../api/client';
import { defaultApiBaseUrl } from '../api/env';
import type { TokenStorage } from '../api/types';
import { describeError } from '../api/errors';
import { createTokenStorage } from './storage';

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
}

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  client: ApiClient;
  /** API origin, used to derive the realtime WebSocket URL (KUR-054). */
  baseUrl: string;
  login(email: string, password: string): Promise<string | null>;
  register(input: {
    email: string;
    username: string;
    password: string;
  }): Promise<string | null>;
  /**
   * Sign in (or create an account) with a provider identity token (KUR-276).
   * The native flow (e.g. Sign in with Apple) obtains the token; we hand it to
   * the backend (POST /auth/oauth), which verifies it and returns a session —
   * stored via the same path as email login. Resolves to an error message, or
   * null on success.
   */
  oauthSignIn(provider: 'apple' | 'google', idToken: string): Promise<string | null>;
  requestPasswordReset(email: string): Promise<void>;
  logout(): Promise<void>;
  /**
   * Start account deletion (KUR-275). Schedules a grace-period delete server-side
   * (DELETE /me) and signs out locally; logging back in before it elapses cancels
   * it. Resolves to an error message, or null on success.
   */
  deleteAccount(): Promise<string | null>;
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
  const [baseUrl] = useState<string>(
    () => baseUrlProp ?? process.env.EXPO_PUBLIC_API_URL ?? defaultApiBaseUrl(),
  );

  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<SessionUser | null>(null);

  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl,
        storage,
        onLogout: () => {
          setUser(null);
          setStatus('signedOut');
        },
      }),
    [baseUrl, storage],
  );

  useEffect(() => {
    let cancelled = false;
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
      } else {
        // ApiClient already cleared storage on auth failures; network
        // failures also land signed out rather than hanging on restore
        setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, storage]);

  const applyAuth = async (payload: AuthPayload) => {
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
    client,
    baseUrl,
    login: async (email, password) => {
      const res = await client.post<AuthPayload>('/auth/login', { email, password });
      if (!res.ok) return describeError(res.error).message;
      await applyAuth(res.data);
      return null;
    },
    register: async (input) => {
      // consent is versioned server-side (KUR-109); the register screen
      // shows the ToS/privacy notice next to the submit button
      const res = await client.post<AuthPayload>('/auth/register', {
        ...input,
        acceptTerms: true,
      });
      if (!res.ok) return describeError(res.error).message;
      await applyAuth(res.data);
      return null;
    },
    oauthSignIn: async (provider, idToken) => {
      const res = await client.post<AuthPayload>('/auth/oauth', { provider, idToken });
      if (!res.ok) {
        // Append the server's own error code (e.g. OAUTH_NOT_CONFIGURED,
        // INVALID_OAUTH_TOKEN) when present — it names the actual cause, which
        // the friendly copy alone hides for 5xx/401 responses.
        const friendly = describeError(res.error).message;
        return res.error.code ? `${friendly} (${res.error.code})` : friendly;
      }
      await applyAuth(res.data);
      return null;
    },
    requestPasswordReset: async (email) => {
      await client.post('/auth/request-password-reset', { email });
    },
    logout: async () => {
      await storage.clear();
      setUser(null);
      setStatus('signedOut');
    },
    deleteAccount: async () => {
      const res = await client.delete<{ deletionScheduled: boolean; graceDays: number }>('/me');
      if (!res.ok) return describeError(res.error).message;
      await storage.clear();
      setUser(null);
      setStatus('signedOut');
      return null;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
