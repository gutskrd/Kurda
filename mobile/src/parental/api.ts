/**
 * The parental-controls endpoints and their shapes (api `/me/parental`, `/me/usage`), so every screen asks the same
 * way and reads the same fields. Each call returns the client's result; nothing here throws.
 */
import type { ParentalControls, SupervisionState } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/** Someone named on a parental page: enough to show their face and both their names, nothing more. */
export interface PersonRef {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ConnectedParent extends PersonRef {
  /** When they connected (ISO 8601). */
  since: string;
  /** The parent connected longest, the only one who may loosen a control again. */
  first?: boolean;
}

/** A teen on their parent's list, with today's two numbers. */
export interface WatchedTeen {
  teen: PersonRef;
  since: string;
  today: { minutes: number; lessons: number };
}

/** Why the account can be neither a parent nor a supervised teen right now. */
export type ParentalNoneReason = 'guest' | 'birth_month' | 'email' | 'standing';

/** GET /me/parental: which side of parental controls this account is on, and what it sees there. */
export interface ParentalOverview {
  role: 'teen' | 'parent' | 'none';
  reason?: ParentalNoneReason;
  parents?: ConnectedParent[];
  supervision?: SupervisionState | null;
  teens?: WatchedTeen[];
}

/** One day of a teen's week, oldest first, ending today in the teen's own time zone. */
export interface TeenDay {
  day: string;
  minutes: number;
  lessons: number;
  xp: number;
}

/** GET /me/parental/teens/:teenId: what a parent sees of one teen. */
export interface TeenDetail {
  teen: PersonRef;
  since: string;
  controls: ParentalControls;
  week: TeenDay[];
  streak: number;
  parents: Array<PersonRef & { first?: boolean }>;
  /** Whether this parent may loosen a control (only the first may; any parent may tighten). Absent reads as yes. */
  canLoosen?: boolean;
  /** The teen's own IANA time zone, where their day and bedtime are counted. */
  timeZone?: string;
}

/** A parent's fresh code, shown until it is used or a newer one is made. */
export interface ParentCode {
  code: string;
  expiresAt: string;
}

/** The name a person is shown by: the one they chose, else their username. */
export function nameOf(person: Pick<PersonRef, 'displayName' | 'username'>): string {
  return person.displayName?.trim() || person.username;
}

export const readParental = (client: ApiClient): Promise<ApiResult<ParentalOverview>> => client.get<ParentalOverview>('/me/parental');

export const makeParentCode = (client: ApiClient): Promise<ApiResult<ParentCode>> => client.post<ParentCode>('/me/parental/code');

export const lookupParentCode = (client: ApiClient, code: string): Promise<ApiResult<{ parent: PersonRef }>> =>
  client.post<{ parent: PersonRef }>('/me/parental/lookup', { code });

export const connectParent = (client: ApiClient, code: string): Promise<ApiResult<{ parents: ConnectedParent[]; supervision: SupervisionState | null }>> =>
  client.post('/me/parental/connect', { code });

export const readTeen = (client: ApiClient, teenId: string): Promise<ApiResult<TeenDetail>> =>
  client.get<TeenDetail>(`/me/parental/teens/${encodeURIComponent(teenId)}`);

export const changeControls = (client: ApiClient, teenId: string, patch: Partial<ParentalControls>): Promise<ApiResult<{ controls: ParentalControls }>> =>
  client.patch(`/me/parental/teens/${encodeURIComponent(teenId)}/controls`, patch);

export const stopSupervising = (client: ApiClient, teenId: string): Promise<ApiResult<{ ended: true }>> =>
  client.delete(`/me/parental/teens/${encodeURIComponent(teenId)}`);

export const disconnectParent = (client: ApiClient, parentId: string): Promise<ApiResult<{ ended: true }>> =>
  client.delete(`/me/parental/parents/${encodeURIComponent(parentId)}`);

/** A minute of the app in front of a supervised teen; anyone else is answered with nothing (204), and stops beating. */
export const usageBeat = (client: ApiClient, timeZone: string): Promise<ApiResult<SupervisionState | undefined>> =>
  client.post<SupervisionState | undefined>('/me/usage', { timeZone });
