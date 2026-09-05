import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, setToken, getToken } from './api';

interface Me {
  id: string;
  username: string;
  roles: string[];
}
interface AuthState {
  me: Me | null;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [me, setMe] = useState<Me | null>(null);

  // Rehydrate the current user after a reload — the token persists in
  // localStorage but `me` is in-memory only, so without this the @username
  // (and any role-based UI) disappears on refresh.
  useEffect(() => {
    if (!getToken() || me) return;
    void api<{ user: Me }>('/me')
      .then((res) => setMe(res.user))
      .catch((err) => {
        // a 401 already bounced us to login via the api client; ignore others
        if (!(err instanceof ApiError)) throw err;
      });
    // run once on mount; login()/logout() keep `me` in sync afterwards
  }, []);

  async function login(email: string, password: string, remember = true): Promise<void> {
    const res = await api<{ tokens: { accessToken: string } }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setToken(res.tokens.accessToken, remember);
    // the login payload omits roles — fetch the full profile so role-based UI works
    const meRes = await api<{ user: Me }>('/me');
    setMe(meRes.user);
  }

  function logout(): void {
    // best effort, and before the token goes: ends this login's 2FA server-side
    // so signing out is not merely local
    void api('/admin/session/end', { method: 'POST' }).catch(() => undefined);
    setToken(null);
    setMe(null);
  }

  return <AuthContext.Provider value={{ me, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Whether we currently hold a token (persisted across reloads). */
export function hasSession(): boolean {
  return getToken() !== null;
}
