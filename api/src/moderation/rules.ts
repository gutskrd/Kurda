import {
  PRIORITY_SLA_HOURS,
  categoryPriority,
  reportCategoryInfo,
  type AgeBadge,
  type PermanentBanMode,
  type ReportCategory,
  type ReportPriority,
  type ReportTargetType,
} from '@kurda/shared';

/**
 * Moderation rules that need no database: report urgency, a case's queue name, its SLA deadline, permanent-ban
 * confirmation, and the queue cursor. Pure, so every branch is unit-tested.
 */

export interface PriorityInput {
  category: ReportCategory;
  /** the reporter is 13–17 */
  reporterMinor: boolean;
  /** the reported person, if there is one */
  subjectAge: AgeBadge | null;
  /** the reporter's account is less than a day old */
  newAccount: boolean;
}

/**
 * A report's priority: its category's, then adjusted for the people involved.
 * - An adult reaching a minor with sexual content, or a minor's child-safety report about an adult, is P0 regardless:
 *   grooming is the case this system exists to catch quickly.
 * - Any other report with a minor on either side moves up one level.
 * - A report from an account under a day old moves down one (never to P0, never below P3), since new accounts are the
 *   cheapest way to flood the queue. A P0 report (a child at risk, self-harm, a threat) is never demoted: a child
 *   making an account to ask for help must not wait.
 */
export function reportPriority(input: PriorityInput): ReportPriority {
  const base = categoryPriority(input.category);
  if (
    input.reporterMinor &&
    input.subjectAge === 'adult' &&
    (input.category === 'sexual' || input.category === 'child_safety')
  ) {
    return 0;
  }
  const minorInvolved = input.reporterMinor || input.subjectAge === 'minor';
  if (minorInvolved) return Math.max(0, base - 1) as ReportPriority;
  if (input.newAccount && base > 0) return Math.min(3, base + 1) as ReportPriority;
  return base;
}

/** The weight a report carries when the queue counts reporters: half for a day-old account. */
export function reportWeight(newAccount: boolean): number {
  return newAccount ? 0.5 : 1;
}

const TARGET_LABEL: Readonly<Record<ReportTargetType, string>> = {
  user: 'Profile',
  dm_message: 'Direct message',
  group_message: 'Group message',
  group: 'Group',
  library_post: 'Library post',
  library_comment: 'Library comment',
  image_post: 'Image post',
  image_comment: 'Image comment',
  game_player: 'Game player',
  letter: 'Letter',
};

export function targetTypeLabel(type: ReportTargetType): string {
  return TARGET_LABEL[type];
}

/**
 * What the queue calls a report case, built in code from values that may all be missing (a gotin has no title, a
 * deleted account no username), so it is never NULL.
 */
export function reportCaseSummary(input: {
  reportCount: number;
  category: ReportCategory;
  targetType: ReportTargetType;
  subjectUsername: string | null;
}): string {
  const count = input.reportCount === 1 ? '1 report' : `${input.reportCount} reports`;
  const who = input.subjectUsername ? ` by @${input.subjectUsername}` : '';
  return `${count} · ${reportCategoryInfo(input.category).label} · ${targetTypeLabel(input.targetType)}${who}`;
}

/** When a case's SLA runs out: its priority's hours after the first report. */
export function slaDueAt(priority: ReportPriority, firstReportedAt: Date): Date {
  return new Date(firstReportedAt.getTime() + PRIORITY_SLA_HOURS[priority] * 3_600_000);
}

/** How a permanent ban is confirmed (see `PermanentBanMode` in @kurda/shared). */
export function permanentBanMode(moderatorCount: number, zeroTolerance: boolean): PermanentBanMode {
  if (zeroTolerance) return 'zero_tolerance';
  return moderatorCount >= 2 ? 'second_approval' : 'single';
}

/** Whether a policy makes a ban zero-tolerance (no wait for a second admin). */
export function isZeroTolerance(policy: ReportCategory): boolean {
  return policy === 'child_safety';
}

// ---------------------------------------------------------------------------
// Queue cursor
// ---------------------------------------------------------------------------

export interface QueueCursor {
  priority: number;
  firstReportedAt: string;
  id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(c: QueueCursor): string {
  return Buffer.from(JSON.stringify([c.priority, c.firstReportedAt, c.id]), 'utf8').toString('base64url');
}

/** A cursor the client sent back, or null when it is not one of ours. */
export function decodeCursor(raw: string | undefined): QueueCursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    const [priority, at, id] = parsed as [unknown, unknown, unknown];
    if (typeof priority !== 'number' || !Number.isInteger(priority) || priority < 0 || priority > 3) return null;
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
    if (typeof id !== 'string' || !UUID_RE.test(id)) return null;
    return { priority, firstReportedAt: at, id };
  } catch {
    return null;
  }
}
