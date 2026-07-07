import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiClient } from '../api/client';
import { apiBaseUrl } from '../api/env';
import type { TokenStorage } from '../api/types';
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
  login(email: string, password: string): Promise<string | null>;
  register(input: {
    email: string;
    username: string;
    password: string;
  }): Promise<string | null>;
  requestPasswordReset(email: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthPayload {
  user: SessionUser;
  tokens: { accessToken: string; refreshToken: string };
}

export function AuthProvider({
  children,
  storage = createTokenStorage(),
  baseUrl = process.env.EXPO_PUBLIC_API_URL ?? apiBaseUrl('development'),
}: {
  children: ReactNode;
  storage?: TokenStorage;
  baseUrl?: string;
}) {
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
    login: async (email, password) => {
      const res = await client.post<AuthPayload>('/auth/login', { email, password });
      if (!res.ok) return res.error.message;
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
      if (!res.ok) return res.error.message;
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
