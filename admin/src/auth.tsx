import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { deviceNameFrom } from '@kurda/shared';
import { api, ApiError, endSession, getRefreshToken, setToken, getToken } from './api';

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

  // The token survives a reload but `me` does not, so it is fetched again.
  useEffect(() => {
    if (!getToken() || me) return;
    void api<{ user: Me }>('/me')
      .then((res) => setMe(res.user))
      .catch((err) => {
        // A 401 already bounced us to login via the api client; ignore others.
        if (!(err instanceof ApiError)) throw err;
      });
    // Run once on mount; login()/logout() keep `me` in sync afterwards.
  }, []);

  async function login(email: string, password: string, remember = true): Promise<void> {
    const res = await api<{ tokens: { accessToken: string; refreshToken: string } }>('/admin/auth/login', {
      method: 'POST',
      // The name the admin's own Settings lists this session under; "Remember
      // me" left off keeps the session on the server for a day, not a month.
      body: { email, password, deviceName: consoleName(), remember },
    });
    setToken(res.tokens.accessToken, remember, res.tokens.refreshToken);
    // The login payload omits roles — fetch the full profile so role-based UI works.
    const meRes = await api<{ user: Me }>('/me');
    setMe(meRes.user);
  }

  function logout(): void {
    // Best effort, before the tokens go: the session and its 2FA end on the server too. A session with no refresh
    // token can only end its 2FA.
    const refresh = getRefreshToken();
    if (refresh) void endSession(refresh);
    else void api('/admin/session/end', { method: 'POST' }).catch(() => undefined);
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

/** "Admin console · Chrome on Mac": how this browser's session is listed in the admin's own Settings. */
export function consoleName(): string {
  const browser = typeof navigator === 'undefined' ? null : deviceNameFrom(navigator.userAgent ?? '', navigator.maxTouchPoints ?? 0);
  return browser ? `Admin console · ${browser}` : 'Admin console';
}

/** Whether we currently hold a token (persisted across reloads). */
export function hasSession(): boolean {
  return getToken() !== null;
}
