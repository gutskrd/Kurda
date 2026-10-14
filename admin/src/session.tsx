/**
 * What this login may do in the admin, from GET /admin/session — read once by
 * the 2FA gate and shared with everything under it, so the nav, the landing
 * page and every page's own checks agree.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { SessionAccess } from './navigation';

export interface AdminSession extends SessionAccess {
  /** the RBAC roles (superadmin, content_editor, moderator, support) */
  roles: string[];
  needsEnrollment: boolean;
  needsVerification: boolean;
}

const SessionContext = createContext<AdminSession | null>(null);

export function SessionProvider({ value, children }: { value: AdminSession; children: ReactNode }): React.JSX.Element {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** The session; outside the gate (a test of one page) it is an empty one, which can open nothing gated. */
export function useSession(): AdminSession {
  return useContext(SessionContext) ?? { roles: [], staffRoles: [], capabilities: [], needsEnrollment: false, needsVerification: false };
}

/** The API answer, with what an older API leaves out filled in from what it does say. */
export function sessionFrom(raw: Partial<AdminSession> & { roles: string[] }): AdminSession {
  return {
    roles: raw.roles,
    needsEnrollment: !!raw.needsEnrollment,
    needsVerification: !!raw.needsVerification,
    capabilities: raw.capabilities ?? [],
    staffRoles: raw.staffRoles ?? raw.roles,
  };
}
