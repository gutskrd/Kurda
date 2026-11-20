/**
 * Reports, moderation cases, sanctions and appeals: one way to report anything (a person, a message, a post, a group, a
 * game player), cases with the evidence frozen at report time, sanctions that say why and until when, and appeals.
 * Shared because the API decides, the browser and the phone ask and explain, and the admin panel triages, and all must
 * read categories, priorities and cases alike. The rules follow the EU DSA (Art. 16, 17 and 20: notice, statement of
 * reasons, complaints) and the UK Online Safety Act codes (an appeal for every decision).
 */
import { stripControlChars } from './sanitize.js';
import type { CopyrightCaseInfo } from './copyright.js';
import type { PlayGame } from './play.js';
import type { LetterDecor } from './letter-paper.js';
import type { PictureReviewNotificationData } from './picture-review.js';

// ---------------------------------------------------------------------------
// Categories and priority
// ---------------------------------------------------------------------------

/** 0 is the most urgent: imminent harm or a child at risk. 3 can wait a week. */
export type ReportPriority = 0 | 1 | 2 | 3;
export const REPORT_PRIORITIES: readonly ReportPriority[] = [0, 1, 2, 3];

/** How soon a case of each priority should be decided, in hours from the first report, not from when somebody opened the queue. */
export const PRIORITY_SLA_HOURS: Readonly<Record<ReportPriority, number>> = {
  0: 1,
  1: 24,
  2: 72,
  3: 168,
};

export const REPORT_CATEGORY_KEYS = [
  'child_safety',
  'self_harm',
  'violence',
  'sexual',
  'hate',
  'private_info',
  'harassment',
  'copyright',
  'spam',
  'impersonation',
  'other',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORY_KEYS)[number];

export interface ReportCategoryInfo {
  key: ReportCategory;
  priority: ReportPriority;
  /** i18n key of the child-friendly label on the report sheet */
  labelKey: string;
  /** the same label in plain English, for the admin panel and as a fallback */
  label: string;
  /** Shows help before anything else when picked: "Someone may hurt themselves" gets a short message and a helpline link. */
  showsHelp: boolean;
}

/** Every category a report can carry, most urgent first, which is also the report sheet's order. */
export const REPORT_CATEGORIES: readonly ReportCategoryInfo[] = [
  {
    key: 'child_safety',
    priority: 0,
    labelKey: 'report.category.childSafety',
    label: 'A child is being put at risk / sexual content involving a minor',
    showsHelp: false,
  },
  { key: 'self_harm', priority: 0, labelKey: 'report.category.selfHarm', label: 'Someone may hurt themselves', showsHelp: true },
  { key: 'violence', priority: 0, labelKey: 'report.category.violence', label: 'Threat of violence', showsHelp: false },
  { key: 'sexual', priority: 1, labelKey: 'report.category.sexual', label: 'Sexual or nude content', showsHelp: false },
  {
    key: 'hate',
    priority: 1,
    labelKey: 'report.category.hate',
    label: 'Hate, including attacks on ethnicity, religion or dialect',
    showsHelp: false,
  },
  { key: 'private_info', priority: 1, labelKey: 'report.category.privateInfo', label: 'Sharing private information', showsHelp: false },
  { key: 'harassment', priority: 2, labelKey: 'report.category.harassment', label: 'Bullying or harassment', showsHelp: false },
  /*
   * A member's report waits like harassment; a formal notice from the rights holder (/copyright) is queued at P1, since
   * hosts give a provider about two working days.
   */
  { key: 'copyright', priority: 2, labelKey: 'report.category.copyright', label: 'Copies someone else’s work', showsHelp: false },
  { key: 'spam', priority: 3, labelKey: 'report.category.spam', label: 'Scam or spam', showsHelp: false },
  { key: 'impersonation', priority: 3, labelKey: 'report.category.impersonation', label: 'Pretending to be someone', showsHelp: false },
  { key: 'other', priority: 3, labelKey: 'report.category.other', label: 'Something else', showsHelp: false },
];

const CATEGORY_BY_KEY: ReadonlyMap<string, ReportCategoryInfo> = new Map(REPORT_CATEGORIES.map((c) => [c.key, c]));

export function isReportCategory(value: unknown): value is ReportCategory {
  return typeof value === 'string' && CATEGORY_BY_KEY.has(value);
}

export function reportCategoryInfo(category: ReportCategory): ReportCategoryInfo {
  return CATEGORY_BY_KEY.get(category)!;
}

/** The priority a category starts at, before minors and new accounts move it. */
export function categoryPriority(category: ReportCategory): ReportPriority {
  return reportCategoryInfo(category).priority;
}

/** The values older clients and the old report tables used, mapped onto the categories above; the web once keyed self-harm `selfHarm`. */
export const LEGACY_REPORT_CATEGORIES: Readonly<Record<string, ReportCategory>> = {
  harassment: 'harassment',
  spam: 'spam',
  impersonation: 'impersonation',
  hate: 'hate',
  self_harm: 'self_harm',
  selfHarm: 'self_harm',
  other: 'other',
};

/** A category from anything a client or an old row might send; null when it is none. */
export function reportCategoryFrom(value: unknown): ReportCategory | null {
  if (isReportCategory(value)) return value;
  if (typeof value === 'string' && Object.hasOwn(LEGACY_REPORT_CATEGORIES, value)) return LEGACY_REPORT_CATEGORIES[value]!;
  return null;
}

/** Where someone in crisis can find a helpline in their own country. */
export const HELPLINE_URL = 'https://findahelpline.com';

// ---------------------------------------------------------------------------
// What can be reported
// ---------------------------------------------------------------------------

export const REPORT_TARGET_TYPES = [
  'user',
  'dm_message',
  'group_message',
  'group',
  'library_post',
  'library_comment',
  'image_post',
  'image_comment',
  'game_player',
  'letter',
] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/** The games whose players can be reported by seat. */
export type ReportableGame = PlayGame;

/** Limits on a report. A note is optional and has no minimum length. */
export const MAX_REPORT_NOTE_LEN = 1000;
/** Reports one account may file in 24 hours, every surface counted together. */
export const REPORTS_PER_DAY = 20;
/** Reports from accounts younger than this weigh less when the queue is ordered. */
export const NEW_ACCOUNT_HOURS = 24;

/** A note as stored: control characters stripped, trimmed, cut to `MAX_REPORT_NOTE_LEN`, and null when nothing is left. */
export function normalizeReportNote(note: unknown): string | null {
  if (typeof note !== 'string') return null;
  const clean = [...stripControlChars(note).trim()].slice(0, MAX_REPORT_NOTE_LEN).join('').trim();
  return clean.length > 0 ? clean : null;
}

/** `POST /reports` */
export interface FileReportRequest {
  targetType: ReportTargetType;
  /**
   * The id of the thing reported. For `game_player` it is the game's id and `game` plus `seat` name the player, which the
   * server maps to the person, so a client never needs anyone's account id.
   */
  targetId: string;
  category: ReportCategory;
  note?: string;
  game?: ReportableGame;
  /** The player's 1-based seat as the game's view shows it, never reused in a game; only a player of that game may report one (else 404). */
  seat?: number;
}

export const REPORT_STATUSES = ['open', 'actioned', 'no_violation'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** One of your own reports, as "My reports" lists it; never says what the sanction was. */
export interface MyReport {
  id: string;
  targetType: ReportTargetType;
  category: ReportCategory;
  status: ReportStatus;
  /** A short label for what was reported (a username, a post title), or null when the reporter may not see one, always for a game player. */
  targetLabel: string | null;
  createdAt: string;
  closedAt: string | null;
  /** you may ask for a second look at a "doesn't break our rules" answer */
  canAppeal: boolean;
  /** The case that decided the report, which `POST /me/appeals {caseId}` asks to review; null while no case holds it. */
  caseId: string | null;
}

/** What `POST /reports` answers: 201 new, 200 when the same open report already exists. */
export interface ReportReceipt {
  report: MyReport;
  /** you had already reported this and that report is still open */
  deduped: boolean;
  /** present for `self_harm`, shown before anything else */
  help?: { url: string };
}

/** `GET /me/reports` */
export interface MyReportsPage {
  reports: MyReport[];
}

// ---------------------------------------------------------------------------
// Sanctions
// ---------------------------------------------------------------------------

export const SANCTION_KINDS = [
  'warning',
  'content_removal',
  'chat_mute',
  'post_mute',
  'feature_limit',
  'suspension',
  'permanent_ban',
] as const;
export type SanctionKind = (typeof SANCTION_KINDS)[number];

export function isSanctionKind(value: unknown): value is SanctionKind {
  return typeof value === 'string' && (SANCTION_KINDS as readonly string[]).includes(value);
}

/**
 * What a sanction stops while it lasts: `chat`, direct and group messages with the gifts and game cards posted into them;
 * `post`, library and image posts and comments; `media`, uploading pictures and voice; `account`, signing in at all. A
 * warning or a content removal stops nothing by itself.
 */
export type RestrictionScope = 'chat' | 'post' | 'media' | 'account';

export const SANCTION_SCOPE: Readonly<Record<SanctionKind, RestrictionScope | null>> = {
  warning: null,
  content_removal: null,
  chat_mute: 'chat',
  post_mute: 'post',
  feature_limit: 'media',
  suspension: 'account',
  permanent_ban: 'account',
};

/** Kinds whose length matters (null hours: no end); the others are moments, not periods. */
export function sanctionHasDuration(kind: SanctionKind): boolean {
  return SANCTION_SCOPE[kind] !== null && kind !== 'permanent_ban';
}

/** The length presets the action panel offers, in hours (null: permanent). */
export const SANCTION_DURATION_PRESETS: readonly (number | null)[] = [24, 72, 168, 720, null];

export const MAX_STATEMENT_LEN = 2000;

/** How a sanction came about, which the statement of reasons must say. */
export type SanctionOrigin = 'report' | 'automatic' | 'moderator';

/** 403 `MUTED` details: not allowed until `until` (null: no end set); clients say "You can't send messages until …" in local time. */
export interface MutedErrorDetails {
  until: string | null;
  scope: Exclude<RestrictionScope, 'account'>;
}

/**
 * 403 `ACCOUNT_SUSPENDED` details from `POST /auth/login`, `/auth/refresh` and `/auth/oauth`. `appealToken` is a
 * short-lived Bearer token that can only read `GET /me/standing` and file `POST /me/appeals`.
 */
export interface SuspendedErrorDetails {
  /** null: permanent */
  until: string | null;
  policy: ReportCategory | null;
  statement: string;
  appealable: boolean;
  appealToken: string;
}

/** The appeal token's lifetime; signing in again gives a fresh one. */
export const APPEAL_TOKEN_TTL_SECONDS = 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Account standing and appeals
// ---------------------------------------------------------------------------

/** A decision can be appealed for six months, once. */
export const APPEAL_WINDOW_DAYS = 182;
export const MAX_APPEAL_LEN = 2000;

export const APPEAL_STATUSES = ['open', 'upheld', 'overturned', 'modified'] as const;
export type AppealStatus = (typeof APPEAL_STATUSES)[number];
export type AppealOutcome = Exclude<AppealStatus, 'open'>;

/** An appeal as its author sees it. */
export interface AppealView {
  id: string;
  sanctionId: string | null;
  caseId: string | null;
  text: string;
  status: AppealStatus;
  /** the reviewer's answer, once decided */
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** One sanction with its statement of reasons (DSA Art. 17), as the user sees it. */
export interface StandingSanction {
  id: string;
  kind: SanctionKind;
  /** the rule broken */
  policy: ReportCategory;
  policyLabelKey: string;
  /** what the reviewer wrote to you */
  statement: string;
  startsAt: string;
  /** null: no end (a permanent ban, or a warning, which has none) */
  endsAt: string | null;
  origin: SanctionOrigin;
  /** a person looked at it; always true unless it was automatic and nobody has yet */
  reviewedByPerson: boolean;
  active: boolean;
  revokedAt: string | null;
  acknowledged: boolean;
  appeal: {
    /** you can still ask for a review of this one */
    allowed: boolean;
    /** the last moment you can */
    deadline: string;
    /** your appeal, if you filed one */
    current: AppealView | null;
  };
}

export type StandingStatus = 'good' | 'limited' | 'suspended' | 'banned';

/** `GET /me/standing` (normal token or appeal token). */
export interface AccountStanding {
  status: StandingStatus;
  active: StandingSanction[];
  past: StandingSanction[];
  /** warnings to show once as a dialog; `POST /me/standing/ack` clears them */
  unacknowledgedWarnings: StandingSanction[];
  /** appeals about a report of yours that was found not to break the rules */
  reportAppeals: AppealView[];
  /** what is restricted now, and until when (null: no end) */
  restrictions: Partial<Record<RestrictionScope, { until: string | null }>>;
}

/** `POST /me/appeals`: about a sanction you received, or a report of yours that was closed. */
export interface FileAppealRequest {
  sanctionId?: string;
  caseId?: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Inbox notifications
// ---------------------------------------------------------------------------

/** `data` of moderation's inbox notifications; title and body are plain English, and clients may word their own from these fields. */
export type ModerationNotificationData =
  | { kind: 'report_outcome'; reportIds: string[]; outcome: 'actioned' | 'no_violation' }
  | {
      kind: 'sanction';
      sanctionId: string;
      sanction: SanctionKind;
      policy: ReportCategory;
      until: string | null;
    }
  | { kind: 'sanction_lifted'; sanctionId: string }
  | { kind: 'appeal_decided'; appealId: string; outcome: AppealOutcome }
  | PictureReviewNotificationData
  | {
      kind: 'caring_message';
      helplineUrl: string;
      /** the moderator's own words, if any: the one part a client cannot say for itself in the reader's language */
      message?: string;
    };

/** What a removed chat message reads as, for both people in the conversation. */
export const MODERATED_MESSAGE_BODY = 'Removed by Hevalo';

// ---------------------------------------------------------------------------
// Cases (admin)
// ---------------------------------------------------------------------------

export const CASE_STATUSES = ['open', 'in_review', 'actioned', 'no_violation', 'needs_second_approval', 'escalated'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
/** The statuses of a case still on somebody's desk. */
export const OPEN_CASE_STATUSES: readonly CaseStatus[] = ['open', 'in_review', 'needs_second_approval', 'escalated'];

/** Where a case came from: `report` for user reports, `copyright` for the public /copyright form (copyright.ts), the rest automated feeds. */
export const CASE_SOURCES = [
  'report',
  'text_flag',
  'image_flag',
  'bot_flag',
  'anti_cheat',
  'chat_report',
  'library_report',
  'image_report',
  'user_report',
  'copyright',
] as const;
export type CaseSource = (typeof CASE_SOURCES)[number];

/** The groups the queue filter offers: people's reports, machine flags, bots, cheating. */
export type CaseSourceGroup = 'reports' | 'automated' | 'bots' | 'anti_cheat';

export const CASE_SOURCE_GROUP: Readonly<Record<CaseSource, CaseSourceGroup>> = {
  report: 'reports',
  chat_report: 'reports',
  library_report: 'reports',
  image_report: 'reports',
  user_report: 'reports',
  copyright: 'reports',
  text_flag: 'automated',
  image_flag: 'automated',
  bot_flag: 'bots',
  anti_cheat: 'anti_cheat',
};

/** A claim holds a case for this long; claiming again refreshes it. */
export const CLAIM_LEASE_MINUTES = 15;
/** A permanent ban waits this long for a second admin. */
export const SECOND_APPROVAL_HOURS = 72;
/** Evidence is kept while a case is open and this long after it closes. */
export const EVIDENCE_RETENTION_DAYS = 365;

export type AgeBadge = 'minor' | 'adult' | 'unknown';

export interface CasePerson {
  id: string;
  username: string;
  age: AgeBadge;
  accountCreatedAt: string;
}

/** One row of `GET /admin/moderation/queue`. */
export interface CaseQueueItem {
  id: string;
  source: CaseSource;
  sourceGroup: CaseSourceGroup;
  targetType: ReportTargetType | null;
  priority: ReportPriority;
  category: ReportCategory | null;
  status: CaseStatus;
  summary: string;
  subject: CasePerson | null;
  reportCount: number;
  reporterCount: number;
  minorInvolved: boolean;
  firstReportedAt: string;
  lastReportedAt: string;
  /** when the SLA for its priority runs out */
  slaDueAt: string;
  slaBreached: boolean;
  claimedBy: { id: string; username: string | null } | null;
  leaseUntil: string | null;
  /** the old 0–100 score, kept for the automated feeds */
  severity: number;
  /** a row that could not be read in full; shown, and never allowed to break the page */
  degraded?: boolean;
}

/** `GET /admin/moderation/queue` query; by default every open case, most urgent first, then oldest first report. */
export interface CaseQueueQuery {
  /**
   * A status, or `open` (the default: open, in review, waiting for a second admin, escalated), `closed` (actioned or no
   * violation) or `all`.
   */
  status?: CaseStatus | 'closed' | 'all';
  priority?: ReportPriority;
  category?: ReportCategory;
  /** a source, or a group of them as the queue filter shows them */
  source?: CaseSource | CaseSourceGroup;
  /** words in the summary, a username, or an id of the case or the reported thing */
  q?: string;
  /** `nextCursor` from the previous page */
  cursor?: string;
  /** 1–200, default 50 */
  limit?: number;
}

export interface CaseQueuePage {
  cases: CaseQueueItem[];
  /** pass back as `cursor` for the next page; null at the end */
  nextCursor: string | null;
  /** cases the automated feeds opened while this page was read */
  added?: number;
}

/** `GET /admin/moderation/summary`, for the dashboard and the nav badge. */
export interface ModerationSummary {
  open: number;
  byPriority: Record<ReportPriority, number>;
  byStatus: Partial<Record<CaseStatus, number>>;
  /** seconds since the oldest open case's first report; null when the queue is empty */
  oldestOpenAgeSeconds: number | null;
  slaBreaches: number;
  slaBreachesByPriority: Record<ReportPriority, number>;
  appealsWaiting: number;
  pendingApprovals: number;
  openEscalations: number;
  /** pictures waiting for a person on the Picture checks page (held, asked about or reported) */
  picturesWaiting: number;
  /** of those, child-safety hits, which need a person first */
  picturesUrgent: number;
}

/** A chat message inside an evidence snapshot. */
export interface EvidenceMessage {
  id: string;
  senderId: string | null;
  username: string | null;
  kind: string;
  body: string | null;
  createdAt: string;
  /** the message that was reported */
  reported: boolean;
  /** a letter's notes as they were sent (letter-paper.ts) */
  notes?: string[];
  /** a letter with something drawn on it */
  drawn?: boolean;
}

/** What the server froze when the report was filed, never edited afterwards: editing or deleting the content changes nothing here. */
export interface EvidenceSnapshot {
  targetType: ReportTargetType;
  targetId: string;
  capturedAt: string;
  /** whose content it is: the reported person */
  author: { id: string; username: string } | null;
  title?: string | null;
  text?: string | null;
  caption?: string | null;
  createdAt?: string | null;
  editedAt?: string | null;
  /** the live status at capture (published, draft, removed …) */
  status?: string | null;
  /** stored media, kept from cleanup as long as the evidence is */
  mediaKeys: string[];
  /** A written post's pictures in order with their alt text (keys also in `mediaKeys`), so the case shows them after edits or deletion. */
  pictures?: Array<{ mediaKey: string; altText: string | null }>;
  /** for chats: about 10 messages before and 5 after, from a conversation the reporter is in */
  context?: EvidenceMessage[];
  group?: {
    id: string;
    name: string;
    /** only on evidence frozen while a group could still be open: 'open' or 'invite' then */
    privacy?: string;
    /** who last changed the name or description and who put up the picture, since they answer for them too */
    editedBy?: { id: string; username: string } | null;
    photoSetBy?: { id: string; username: string } | null;
  } | null;
  game?: {
    game: ReportableGame;
    gameId: string;
    status: string | null;
    seat: number;
    players: Array<{ seat: number; userId: string; username: string | null }>;
  } | null;
  /** A reported letter's paper, drawing and notes as sent (letter-paper.ts); null for plain paper with nothing on it. */
  decor?: LetterDecor | null;
  /** anything else a resolver knew, such as the post type, the language or a comment's post id */
  extra?: Record<string, unknown>;
}

export interface CaseReporter extends CasePerson {
  /** the share of their decided reports that led to action; null before any was decided */
  accuracyPercent: number | null;
  reportsLast30Days: number;
}

export interface CaseReportView {
  id: string;
  category: ReportCategory;
  priority: ReportPriority;
  note: string | null;
  status: ReportStatus;
  createdAt: string;
  /** a new account's report counts half when ordering the queue */
  weight: number;
  reporter: CaseReporter | null;
  evidence: EvidenceSnapshot | Record<string, unknown>;
}

export interface CaseSanctionView {
  id: string;
  userId: string | null;
  kind: SanctionKind;
  policy: ReportCategory;
  statement: string;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  pendingApproval: boolean;
  zeroTolerance: boolean;
  singleApproved: boolean;
  createdBy: string | null;
  approvedBy: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  caseId: string | null;
  createdAt: string;
}

export interface CaseSubjectView extends CasePerson {
  activeSanctions: CaseSanctionView[];
  pastSanctions: CaseSanctionView[];
  priorCases: Array<{ id: string; status: CaseStatus; category: ReportCategory | null; createdAt: string; resolvedAt: string | null }>;
  /**
   * Accounts that shared a device or a network with this one, strongest first. A device is a device id both signed up or
   * in with. A network counts only when both used it within 48 hours of each other and few other established accounts
   * did, so a carrier's NAT, a campus or a VPN does not link strangers. `days` counts distinct days of such evidence;
   * `lastSeenTogether` is the latest.
   */
  linkedAccounts: Array<{
    id: string;
    username: string;
    via: 'device' | 'network';
    days: number;
    lastSeenTogether: string;
    banned: boolean;
  }>;
}

export interface CaseNote {
  id: string;
  authorId: string | null;
  authorUsername: string | null;
  text: string;
  createdAt: string;
}

export interface CaseAuditEntry {
  at: string;
  adminId: string | null;
  action: string;
  detail: Record<string, unknown> | null;
}

/**
 * Where evidence media is. null: on the public bucket as usual. 'pending': being moved off it, by the CSAM action or for a
 * closed child's file a report still holds. 'done': only in private storage, and the public URL no longer serves it.
 */
export type QuarantineState = 'pending' | 'done';

/** A file the CSAM action took off the public bucket, as the filing task shows it. */
export interface EscalationMedia {
  key: string;
  quarantine: QuarantineState | null;
  /** true: the CDN forgot the URL; false: the purge failed; null: no purge is configured */
  cdnPurged: boolean | null;
  /** the address it was public at; purge it by hand in the CDN when `cdnPurged` is not true */
  publicUrl: string | null;
}

export interface CaseEscalation {
  id: string;
  kind: 'csam' | 'escalation';
  reason: string | null;
  links: Array<{ label: string; url: string }>;
  status: 'open' | 'filed';
  reference: string | null;
  createdAt: string;
  filedAt: string | null;
  /** for 'csam': the files taken down, to attach to the hotline report from the case view */
  media: EscalationMedia[];
}

/** One evidence file in the case view. */
export interface CaseMediaItem {
  key: string;
  /** a five-minute signed link (to the private copy once quarantined); null when there is nothing to fetch */
  url: string | null;
  contentType: string | null;
  quarantine: QuarantineState | null;
}

/** `GET /admin/moderation/cases/:id` */
export interface CaseDetail {
  case: CaseQueueItem & {
    sourceRef: string;
    policy: ReportCategory | null;
    resolution: string | null;
    resolutionNote: string | null;
    resolvedAt: string | null;
    resolvedBy: string | null;
    /** what the automated feeds recorded, or the old reports' summary */
    evidence: Record<string, unknown>;
    contentRemoved: boolean;
  };
  reports: CaseReportView[];
  subject: CaseSubjectView | null;
  /** short-lived signed links to the evidence media; show images blurred until revealed */
  media: CaseMediaItem[];
  notes: CaseNote[];
  audit: CaseAuditEntry[];
  sanctions: CaseSanctionView[];
  escalations: CaseEscalation[];
  /** For a copyright case, its notices and the reported person's strikes (copyright.ts); null otherwise. Optional for older panels. */
  copyright?: CopyrightCaseInfo | null;
}

/** Who an action is for: the reported person, or one of the reporters (a false report). */
export type DecisionTarget = 'subject' | `reporter:${string}`;

/** `caring_message` is not a sanction but a kind note with helplines, for someone at risk. */
export type DecisionActionKind = SanctionKind | 'caring_message';

export interface DecisionAction {
  target: DecisionTarget;
  kind: DecisionActionKind;
  /** null: no end; ignored for warnings, content removal and caring messages */
  durationHours?: number | null;
  /** shown to the person; optional only for a caring message */
  statement?: string;
  /** The rule for this action when it differs from the decision's: a reporter is sanctioned for misusing reports ('spam' unless given). */
  policy?: ReportCategory;
}

/** `POST /admin/moderation/cases/:id/decide` */
export interface DecideRequest {
  outcome: 'no_violation' | 'actioned';
  /** the rule; required when actioned */
  policy?: ReportCategory;
  actions: DecisionAction[];
  removeContent: boolean;
  notifyReporters: boolean;
  /** return the exact messages people would receive, and change nothing */
  preview?: boolean;
  /** the only moderating admin typing the person's username to confirm a permanent ban */
  confirmUsername?: string;
  /** Every username typed, for a decision that bans more than one person for good; a ban is confirmed when its name is here or in `confirmUsername`. */
  confirmUsernames?: string[];
  /** a private note for the case record */
  note?: string;
}

/** A message a person would receive (the preview) or did receive. */
export interface UserMessagePreview {
  to: DecisionTarget | 'reporters';
  userId: string | null;
  title: string;
  body: string;
}

/**
 * How a permanent ban is confirmed: `zero_tolerance` (child safety) is in force at once and a second admin, if any,
 * confirms it afterwards; `second_approval` waits up to 72 hours for another admin, with an emergency suspension
 * meanwhile; `single`, when only one admin moderates, is confirmed by typing the username and records that nobody else
 * looked.
 */
export type PermanentBanMode = 'zero_tolerance' | 'second_approval' | 'single';

export interface DecideResult {
  preview: boolean;
  status: CaseStatus;
  /** the exact messages people receive; a removal comes with its own statement of reasons */
  messages: UserMessagePreview[];
  sanctions: CaseSanctionView[];
  /** Every permanent ban in the decision and how it is confirmed; a preview fills it without refusing, so the panel can ask or warn first. */
  permanentBans: Array<{
    target: DecisionTarget;
    userId: string;
    username: string;
    mode: PermanentBanMode;
    usernameRequired: boolean;
  }>;
}

/** One permanent ban waiting for (or confirmed after the fact by) a second admin. */
export interface PendingApproval {
  sanction: CaseSanctionView;
  user: { id: string; username: string } | null;
  caseId: string | null;
  /** when it stops waiting and lapses */
  expiresAt: string;
  /** already in force (zero tolerance), so confirmation comes after the fact */
  inForce: boolean;
}

/** A report on the admin's user page (against the person, or filed by them). */
export interface AdminUserReport {
  id: string;
  targetType: ReportTargetType;
  category: ReportCategory;
  status: ReportStatus;
  caseId: string | null;
  createdAt: string;
}

/** What `GET /admin/users/:id` adds for moderation, only for a reader with `moderation.act`; support staff get the page without it. */
export interface AdminUserModeration {
  reportsAgainst: AdminUserReport[];
  reportsFiled: AdminUserReport[];
  sanctions: CaseSanctionView[];
  appeals: AppealView[];
  cases: Array<{ id: string; status: CaseStatus; priority: ReportPriority; category: ReportCategory | null; summary: string; createdAt: string }>;
  linkedAccounts: CaseSubjectView['linkedAccounts'];
  /** the automatic flagged-message ladder, lifted with `POST /admin/users/:id/chat-mute/lift` */
  chatOffenses: { count: number; mutedUntil: string | null; permanent: boolean } | null;
  /** a chat mute with no end, which `mutedUntil` cannot express */
  mutedPermanently: boolean;
}

/** An appeal in the admin's list. */
export interface AdminAppealItem extends AppealView {
  user: { id: string; username: string } | null;
  sanction: CaseSanctionView | null;
  /** who made the decision being appealed; another admin should review it */
  originalDeciderId: string | null;
  /** the picture a picture removal took down, shown through `GET /admin/pictures/:caseId/image`; `sensitive` asks before showing */
  picture: { caseId: string; sensitive: boolean } | null;
}

/** `POST /admin/users/:id/sanctions`, under the same rules as a case decision: a permanent ban waits for a second admin or needs `confirmUsername`. */
export interface ApplySanctionRequest {
  kind: SanctionKind;
  /** null: no end; required for a suspension; ignored for a warning or removal */
  durationHours?: number | null;
  policy: ReportCategory;
  /** shown to the person */
  statement: string;
  /** for the admins only */
  internalNote?: string;
  confirmUsername?: string;
}

/** What `POST /admin/users/:id/sanctions` answers (201). */
export interface ApplySanctionResult {
  /** a ban waiting for a second admin comes as two: the emergency suspension and the waiting ban */
  sanctions: CaseSanctionView[];
  pendingApproval: boolean;
}

/** `POST /admin/appeals/:id/decide` */
export interface DecideAppealRequest {
  outcome: AppealOutcome;
  /** the person reads this */
  note: string;
  /** for `modified`: what the sanction becomes, never a permanent ban */
  modifiedSanction?: { kind: SanctionKind; durationHours?: number | null; statement: string };
}

/** What `POST /admin/moderation/cases/:id/csam` answers. */
export interface CsamActionResult {
  status: CaseStatus;
  /** the filing task with the hotlines' links; close it with the reference they give */
  escalation: CaseEscalation;
  sanctions: CaseSanctionView[];
}

/*
 * The moderation routes, for the apps and the admin panel. Errors are the
 * usual `{ code, message, details? }`.
 *
 * Everyone (signed in):
 *   POST /reports                     FileReportRequest → 201|200 ReportReceipt
 *   GET  /me/reports                  → MyReportsPage
 *   GET  /me/standing                 → AccountStanding (an access token, or the appeal token)
 *   POST /me/standing/ack             { ids?: string[] } → { acknowledged: number }
 *   POST /me/appeals                  FileAppealRequest → 201 AppealView (an access token, or the appeal token)
 *   403 MUTED (MutedErrorDetails) from any route that creates text or media while restricted;
 *   403 ACCOUNT_SUSPENDED (SuspendedErrorDetails) from sign-in, refresh and social sign-in.
 *
 * Admins with `moderation.act` (moderator, superadmin, legacy admin; 2FA verified). Every route about a case answers 403
 * CONFLICT_OF_INTEREST to a moderator who is its reported person or one of its reporters, and the queue hides it from
 * them; nobody sanctions themselves or someone with an open report about them, lifts their own sanction or reviews their
 * own appeal (same 403):
 *   GET  /admin/moderation/queue      CaseQueueQuery → CaseQueuePage
 *   GET  /admin/moderation/summary    → ModerationSummary
 *   GET  /admin/moderation/sla        → { medianSeconds: number | null; resolved: number }
 *   GET  /admin/moderation/cases/:id  → CaseDetail
 *   POST /admin/moderation/cases/:id/claim     → { claimed: true; leaseUntil }   (409 ALREADY_CLAIMED)
 *   POST /admin/moderation/cases/:id/release   → { released: boolean }
 *   POST /admin/moderation/cases/:id/note      { text } → 201 CaseNote
 *   POST /admin/moderation/cases/:id/decide    DecideRequest → DecideResult
 *        (409 CLAIMED_BY_OTHER, CONFIRM_USERNAME_REQUIRED, PENDING_APPROVAL, CASE_CLOSED;
 *         422 SELF_HARM_NOT_SANCTIONED, NOTHING_TO_REMOVE, CONTRADICTORY_DECISION, NOT_A_REPORTER)
 *   POST /admin/moderation/cases/:id/reopen    { reason } → { reopened: true }
 *   POST /admin/moderation/cases/:id/escalate  { reason } → { escalation: CaseEscalation }
 *   POST /admin/moderation/cases/:id/csam      { note? } → CsamActionResult
 *   POST /admin/moderation/escalations/:id/filed  { reference } → { escalation: CaseEscalation }
 *   GET  /admin/moderation/approvals           → { approvals: PendingApproval[] }
 *   POST /admin/moderation/approvals/:sanctionId/approve  → { sanction: CaseSanctionView }
 *   POST /admin/moderation/approvals/:sanctionId/reject   { reason } → { sanction: CaseSanctionView }
 *   GET  /admin/users/:id             → the user page, with AdminUserModeration (support role: without it)
 *   POST /admin/users/:id/sanctions   ApplySanctionRequest → 201 ApplySanctionResult
 *        (409 CONFIRM_USERNAME_REQUIRED; 422 SELF_HARM_NOT_SANCTIONED for the self-harm rule)
 *   POST /admin/sanctions/:id/revoke  { reason } → { sanction: CaseSanctionView }
 *   POST /admin/users/:id/unmute      { reason } → { lifted: number }
 *   POST /admin/users/:id/chat-mute/lift  { reason } → { lifted: boolean }
 *   POST /admin/users/:id/sessions/revoke → { revoked: number }
 *   GET  /admin/appeals?status=open|upheld|overturned|modified|all → { appeals: AdminAppealItem[] }
 *   POST /admin/appeals/:id/decide    DecideAppealRequest → { appeal: AppealView }
 */

/** Where child sexual abuse material is reported. Hevalo files these by hand: the CSAM action creates a task with these links and sends nothing. */
export const CSAM_REPORTING_LINKS: ReadonlyArray<{ label: string; url: string }> = [
  { label: 'NCMEC CyberTipline (US)', url: 'https://report.cybertip.org/' },
  { label: 'IWF (UK)', url: 'https://report.iwf.org.uk/' },
  {
    label: 'UK NCA industry reporting (Ofcom guidance)',
    url: 'https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/duty-to-report-child-sexual-exploitation-and-abuse-csea-content-know-the-rules-and-how-to-comply',
  },
  { label: 'INHOPE hotlines (EU and worldwide)', url: 'https://www.inhope.org/EN' },
];
