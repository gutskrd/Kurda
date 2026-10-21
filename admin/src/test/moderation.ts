/**
 * Moderation cases for the admin's tests: a queue row, and a case in full —
 * a reported group message with the chat around it, two reporters (one of
 * them a child), a reported person with an earlier mute, and a picture.
 */
import type { CaseDetail, CaseQueueItem, CaseReportView, CaseSanctionView, DecideResult } from '@kurda/shared';

export const CASE_ID = '5b0e2a1c-1111-4c2d-9e3f-000000000001';
export const SUBJECT_ID = '7d1c2c1e-0000-4000-8000-0000000000aa';
export const REPORTER_A = '7d1c2c1e-0000-4000-8000-0000000000b1';
export const REPORTER_B = '7d1c2c1e-0000-4000-8000-0000000000b2';
export const ME_ID = '7d1c2c1e-0000-4000-8000-0000000000ee';

const HOUR = 3_600_000;
const ago = (h: number): string => new Date(Date.now() - h * HOUR).toISOString();
const ahead = (h: number): string => new Date(Date.now() + h * HOUR).toISOString();

export function queueItem(over: Partial<CaseQueueItem> = {}): CaseQueueItem {
  return {
    id: CASE_ID,
    source: 'report',
    sourceGroup: 'reports',
    targetType: 'group_message',
    priority: 2,
    category: 'harassment',
    status: 'open',
    summary: 'Group message reported: “nobody wants you here”',
    subject: { id: SUBJECT_ID, username: 'baran', age: 'adult', accountCreatedAt: ago(24 * 90) },
    reportCount: 2,
    reporterCount: 2,
    minorInvolved: true,
    firstReportedAt: ago(5),
    lastReportedAt: ago(2),
    slaDueAt: ahead(67),
    slaBreached: false,
    claimedBy: null,
    leaseUntil: null,
    severity: 55,
    ...over,
  };
}

export function sanction(over: Partial<CaseSanctionView> = {}): CaseSanctionView {
  return {
    id: 's-old',
    userId: SUBJECT_ID,
    kind: 'chat_mute',
    policy: 'harassment',
    statement: 'Your messages broke Hevalo’s rule on bullying and harassment.',
    startsAt: ago(24 * 40),
    endsAt: ago(24 * 39),
    active: false,
    pendingApproval: false,
    zeroTolerance: false,
    singleApproved: false,
    createdBy: ME_ID,
    approvedBy: null,
    revokedAt: null,
    revokeReason: null,
    caseId: null,
    createdAt: ago(24 * 40),
    ...over,
  };
}

function report(id: string, reporterId: string, username: string, over: Partial<CaseReportView> = {}): CaseReportView {
  return {
    id,
    category: 'harassment',
    priority: 2,
    note: null,
    status: 'open',
    createdAt: ago(5),
    weight: 1,
    reporter: {
      id: reporterId,
      username,
      age: 'adult',
      accountCreatedAt: ago(24 * 200),
      accuracyPercent: 80,
      reportsLast30Days: 2,
    },
    evidence: {
      targetType: 'group_message',
      targetId: 'm-3',
      capturedAt: ago(5),
      author: { id: SUBJECT_ID, username: 'baran' },
      text: 'nobody wants you here',
      createdAt: ago(5.1),
      mediaKeys: [],
      group: { id: 'g-1', name: 'Kurmancî beginners', privacy: 'public' },
      context: [
        { id: 'm-1', senderId: REPORTER_A, username: username, kind: 'text', body: 'Silav! Can I join the reading?', createdAt: ago(5.3), reported: false },
        { id: 'm-3', senderId: SUBJECT_ID, username: 'baran', kind: 'text', body: 'nobody wants you here', createdAt: ago(5.1), reported: true },
      ],
    },
    ...over,
  };
}

export function caseDetail(over: { case?: Partial<CaseDetail['case']> } & Partial<Omit<CaseDetail, 'case'>> = {}): CaseDetail {
  const { case: caseOver, ...rest } = over;
  return {
    case: {
      ...queueItem(),
      sourceRef: 'group_message:m-3',
      policy: null,
      resolution: null,
      resolutionNote: null,
      resolvedAt: null,
      resolvedBy: null,
      evidence: {},
      contentRemoved: false,
      ...caseOver,
    },
    reports: [
      report('r-1', REPORTER_A, 'rojin', { note: 'He keeps saying this to new people.' }),
      report('r-2', REPORTER_B, 'zana', {
        reporter: { id: REPORTER_B, username: 'zana', age: 'minor', accountCreatedAt: ago(24 * 30), accuracyPercent: null, reportsLast30Days: 1 },
      }),
    ],
    subject: {
      id: SUBJECT_ID,
      username: 'baran',
      age: 'adult',
      accountCreatedAt: ago(24 * 90),
      activeSanctions: [],
      pastSanctions: [sanction()],
      priorCases: [{ id: 'c-old', status: 'actioned', category: 'harassment', createdAt: ago(24 * 40), resolvedAt: ago(24 * 40) }],
      linkedAccounts: [
        { id: 'u-alt', username: 'baran2', via: 'device', days: 1, lastSeenTogether: ago(24 * 3), banned: false },
        { id: 'u-flat', username: 'rojda7', via: 'network', days: 4, lastSeenTogether: ago(30), banned: false },
      ],
    },
    media: [],
    notes: [],
    audit: [{ at: ago(4), adminId: ME_ID, action: 'POST /admin/moderation/cases/:id/claim', detail: null }],
    sanctions: [],
    escalations: [],
    ...rest,
  };
}

export function preview(over: Partial<DecideResult> = {}): DecideResult {
  return {
    preview: true,
    status: 'open',
    messages: [
      {
        to: 'subject',
        userId: SUBJECT_ID,
        title: "You can't send messages for a while",
        body: 'Your messages broke Hevalo’s rule on bullying and harassment.\n\nYou can’t send direct or group messages until 16 Oct 2026, 12:00 UTC.',
      },
      { to: 'reporters', userId: null, title: 'We took action', body: 'Thanks for keeping Hevalo safe.' },
    ],
    sanctions: [],
    permanentBans: [],
    ...over,
  };
}
