/**
 * The family endpoints and their shapes (api `/me/family`, `/auth/child/*`), so every screen asks the same way and
 * reads the same fields. Each call returns the client's result; nothing here throws.
 */
import type { FamilyBoardRow, FamilyPerson, FamilyRole, PurchaseRequestKind, PurchaseRequestStatus } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/** Why an account may not take an adult's part in a family. */
export type NotAdultReason = 'guest' | 'birth_month' | 'email' | 'standing' | 'minor' | 'child' | 'leaving';

export interface FamilyMember extends FamilyPerson {
  joinedAt: string;
  /** a child's parent, who looks after the profile */
  parentId?: string;
}

/** A child as their parent's family page lists them. */
export interface ChildSummary {
  userId: string;
  name: string;
  avatarUrl: string | null;
  avatarKey: string | null;
  birthYear: number;
  birthMonth: number;
  age: number;
  inFamily: boolean;
  today: { minutes: number; lessons: number };
  /** 13 now: the profile can become the teen's own account */
  canConvert: boolean;
}

/** GET /me/family: the caller's part, their family and its board, their children, and what waits. */
export interface FamilyOverview {
  role: FamilyRole | null;
  adult: boolean;
  reason?: NotAdultReason | null;
  family: {
    id: string;
    ownerId: string;
    size: number;
    max: number;
    plusUntil: string | null;
    members: FamilyMember[];
    board: FamilyBoardRow[];
    invite: { expiresAt: string } | null;
  } | null;
  children: ChildSummary[];
  teensToAdd: FamilyPerson[];
  pinSet: boolean;
  asks: number;
}

/** One phone a child is signed in on: their own, or the parent's by a profile switch. */
export interface ChildDevice {
  id: string;
  onParentPhone: boolean;
  startedAt: string;
  lastUsedAt: string;
}

/** GET /me/family/children/:id: one child beyond the week, which parental controls' teen page holds. */
export interface ChildDetail {
  child: ChildSummary;
  remindersAllowed: boolean;
  purchasesAllowed: boolean;
  consentedAt: string;
  consentVersion: string;
  devices: ChildDevice[];
}

export interface PurchaseRequest {
  id: string;
  childId: string;
  childName: string;
  kind: PurchaseRequestKind;
  product: string;
  status: PurchaseRequestStatus;
  createdAt: string;
  decidedAt: string | null;
}

/** A code that works once until it runs out: the family's for an adult, or the six digits for a child's phone. */
export interface TimedCode {
  code: string;
  expiresAt: string;
}

/** What a child's sign-in or a phone given back answers with, as any sign-in does. */
export interface SignedIn<User> {
  user: User;
  tokens: { accessToken: string; refreshToken: string; accessExpiresInSeconds: number };
}

const child = (id: string) => `/me/family/children/${encodeURIComponent(id)}`;

export const readFamily = (client: ApiClient): Promise<ApiResult<FamilyOverview>> => client.get<FamilyOverview>('/me/family');
export const startFamily = (client: ApiClient): Promise<ApiResult<FamilyOverview>> => client.post<FamilyOverview>('/me/family', {});
export const endFamily = (client: ApiClient): Promise<ApiResult<{ ended: true }>> => client.delete('/me/family');
export const makeInvite = (client: ApiClient): Promise<ApiResult<TimedCode>> => client.post<TimedCode>('/me/family/invite', {});
export const joinFamily = (client: ApiClient, code: string): Promise<ApiResult<FamilyOverview>> => client.post<FamilyOverview>('/me/family/join', { code });
export const leaveFamily = (client: ApiClient): Promise<ApiResult<{ left: true }>> => client.post('/me/family/leave', {});
export const removeMember = (client: ApiClient, userId: string): Promise<ApiResult<{ removed: true }>> =>
  client.delete(`/me/family/members/${encodeURIComponent(userId)}`);
export const addTeen = (client: ApiClient, teenId: string): Promise<ApiResult<FamilyOverview>> =>
  client.post<FamilyOverview>(`/me/family/teens/${encodeURIComponent(teenId)}`, {});

export interface NewChild {
  name: string;
  birthYear: number;
  birthMonth: number;
  avatar: string;
}

export const addChild = (client: ApiClient, input: NewChild): Promise<ApiResult<{ child: ChildSummary }>> =>
  client.post('/me/family/children', { ...input, consent: true });
export const readChild = (client: ApiClient, id: string): Promise<ApiResult<ChildDetail>> => client.get<ChildDetail>(child(id));
export const changeChild = (client: ApiClient, id: string, patch: Partial<{ name: string; avatar: string; remindersAllowed: boolean }>): Promise<ApiResult<ChildDetail>> =>
  client.patch<ChildDetail>(child(id), patch);
export const deleteChild = (client: ApiClient, id: string): Promise<ApiResult<{ deleted: true }>> => client.delete(child(id));
export const askChildExport = (client: ApiClient, id: string): Promise<ApiResult<{ requested: true; reused: boolean }>> => client.post(`${child(id)}/export`, {});
export const readChildExport = (client: ApiClient, id: string): Promise<ApiResult<{ status: 'none' | 'pending' | 'ready'; downloadUrl?: string }>> =>
  client.get(`${child(id)}/export`);
export const makePairingCode = (client: ApiClient, id: string): Promise<ApiResult<TimedCode>> => client.post<TimedCode>(`${child(id)}/pairing`, {});
export const signOutChildDevice = (client: ApiClient, id: string, deviceId: string): Promise<ApiResult<{ revoked: true }>> =>
  client.delete(`${child(id)}/devices/${encodeURIComponent(deviceId)}`);
export const convertChild = (client: ApiClient, id: string, input: { email: string; password: string; username: string }): Promise<ApiResult<{ converted: true; username: string }>> =>
  client.post(`${child(id)}/convert`, input);

export const setFamilyPin = (client: ApiClient, pin: string, proof: { currentPin?: string; password?: string } = {}): Promise<ApiResult<{ pinSet: true }>> =>
  client.put('/me/family/pin', { pin, ...proof });

export const readAsks = (client: ApiClient): Promise<ApiResult<{ requests: PurchaseRequest[] }>> => client.get('/me/family/purchase-requests');
export const askParent = (client: ApiClient, kind: PurchaseRequestKind, product: string): Promise<ApiResult<{ request: PurchaseRequest }>> =>
  client.post('/me/family/purchase-requests', { kind, product });
export const answerAsk = (client: ApiClient, id: string, answer: 'approve' | 'decline'): Promise<ApiResult<{ request: PurchaseRequest }>> =>
  client.post(`/me/family/purchase-requests/${encodeURIComponent(id)}/${answer}`, {});
