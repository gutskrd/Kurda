import { createContext, useContext, useState, type ReactNode } from 'react';
import { api, setToken, getToken } from './api';

interface Me {
  id: string;
  username: string;
  roles: string[];
}
interface AuthState {
  me: Me | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [me, setMe] = useState<Me | null>(null);

  async function login(email: string, password: string): Promise<void> {
    const res = await api<{ tokens: { accessToken: string }; user: Me }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setToken(res.tokens.accessToken);
    setMe(res.user);
  }

  function logout(): void {
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
