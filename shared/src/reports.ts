/**
 * Reports, moderation cases, sanctions and appeals.
 *
 * The owner asked for a report button the admin "actually gets something" from:
 * the content and everything around it, the power to ban the reported person —
 * or the reporter — and to do it professionally. That means one way to report
 * anything (a person, a message, a post, a group, a game player), a case the
 * admin can act on with the evidence frozen at report time, sanctions that say
 * why and until when, and a way to ask for a review.
 *
 * Shared because four programs must agree on it: the API decides, the browser
 * and the phone ask and explain, and the admin panel triages. A category's
 * priority, a sanction's name or the shape of a case read differently in any one
 * of them would be a bug nobody could see from the others.
 *
 * The rules behind the numbers are in the research brief (research3-moderation):
 * EU DSA Art. 16/17/20 (notice, statement of reasons, complaints), the UK Online
 * Safety Act codes (appeals for every service), Santa Clara (appeals by someone
 * not involved), and how Discord, Instagram and Twitch tell people what happened.
 */
import { stripControlChars } from './sanitize.js';
import type { CopyrightCaseInfo } from './copyright.js';
import type { PlayGame } from './play.js';

// ---------------------------------------------------------------------------
// Categories and priority
// ---------------------------------------------------------------------------

/** 0 is the most urgent: imminent harm or a child at risk. 3 can wait a week. */
export type ReportPriority = 0 | 1 | 2 | 3;
export const REPORT_PRIORITIES: readonly ReportPriority[] = [0, 1, 2, 3];

/**
 * How soon a case of each priority should get a decision, in hours, counted from
 * the first report (never from when an admin happened to open the queue).
 * No published industry numbers exist; these are the targets the research
 * recommends for a small, staffed team.
 */
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
  /** i18n key of the child-friendly label the report sheet shows */
  labelKey: string;
  /** the same label in plain English, for the admin panel and as a fallback */
  label: string;
  /**
   * Show help at once, before anything else, when this is picked ("Someone may
   * hurt themselves" → a short message and a helpline link).
   */
  showsHelp: boolean;
}

/**
 * Every category a report can carry, most urgent first. The order is the order
 * the report sheet lists them in, so the ones that matter most are never below
 * the fold.
 */
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
   * Someone else's work posted as if it were theirs. A member's report waits
   * like harassment; a formal notice from the rights holder (/copyright) is
   * queued at P1, since hosts give a provider about two working days.
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

/**
 * The values older clients and the old report tables used, mapped onto the
 * categories above. The web app's catalogue keyed self-harm as `selfHarm`.
 */
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
] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export function isReportTargetType(value: unknown): value is ReportTargetType {
  return typeof value === 'string' && (REPORT_TARGET_TYPES as readonly string[]).includes(value);
}

/** The games whose players can be reported by seat. */
export type ReportableGame = PlayGame;

/** Limits on a report. A note is optional and has no minimum length. */
export const MAX_REPORT_NOTE_LEN = 1000;
/** Reports one account may file in 24 hours (every surface counted together). */
export const REPORTS_PER_DAY = 20;
/** Reports from accounts younger than this weigh less when the queue is ordered. */
export const NEW_ACCOUNT_HOURS = 24;

/**
 * A note as it is stored: control characters stripped (invisible tricks, never
 * Kurdish diacritics), trimmed, at most `MAX_REPORT_NOTE_LEN` characters, and
 * null when nothing is left.
 */
export function normalizeReportNote(note: unknown): string | null {
  if (typeof note !== 'string') return null;
  const clean = [...stripControlChars(note).trim()].slice(0, MAX_REPORT_NOTE_LEN).join('').trim();
  return clean.length > 0 ? clean : null;
}

/** `POST /reports` */
export interface FileReportRequest {
  targetType: ReportTargetType;
  /**
   * The id of the thing reported. For `game_player` it is the game's id, and
   * `game` + `seat` say which player: the server maps the seat to the person,
   * so a client never needs anyone's account id to report them.
   */
  targetId: string;
  category: ReportCategory;
  note?: string;
  game?: ReportableGame;
  /**
   * The player's seat as the game's own view shows it (`seat`, 1-based, never
   * reused within a game). Only someone who played in that game can report one
   * of its players; the server answers 404 for anything else.
   */
  seat?: number;
}

export const REPORT_STATUSES = ['open', 'actioned', 'no_violation'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** One of your own reports, as "My reports" lists it. Never says what the sanction was. */
export interface MyReport {
  id: string;
  targetType: ReportTargetType;
  category: ReportCategory;
  status: ReportStatus;
  /**
   * A short label for what was reported: a username, or a post's title. Null
   * when there is nothing the reporter may be shown — always for a game player
   * (a game shows people who are not your friends as "Player N").
   */
  targetLabel: string | null;
  createdAt: string;
  closedAt: string | null;
  /** you may ask for a second look at a "doesn't break our rules" answer */
  canAppeal: boolean;
  /**
   * The case the report was decided in — what `POST /me/appeals {caseId}`
   * asks a second look at. Null while no case holds it.
   */
  caseId: string | null;
}

/** What `POST /reports` answers (201 new, 200 when the same open report already exists). */
export interface ReportReceipt {
  report: MyReport;
  /** true when you had already reported this and that report is still open */
  deduped: boolean;
  /** present for `self_harm`: shown at once, before anything else */
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
 * What a sanction stops, while it lasts:
 * - `chat` — direct messages and group messages, and the gifts and game cards
 *   posted into them;
 * - `post` — library posts and comments, image posts and comments;
 * - `media` — uploading pictures and voice (feature limit);
 * - `account` — signing in at all (suspension, permanent ban).
 * A warning and a content removal stop nothing by themselves.
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

/** Kinds whose length matters (null hours = no end). The others are moments, not periods. */
export function sanctionHasDuration(kind: SanctionKind): boolean {
  return SANCTION_SCOPE[kind] !== null && kind !== 'permanent_ban';
}

/** The length presets the action panel offers, in hours (null = permanent). */
export const SANCTION_DURATION_PRESETS: readonly (number | null)[] = [24, 72, 168, 720, null];

export const MAX_STATEMENT_LEN = 2000;

/** How a sanction came about, as the statement of reasons has to say. */
export type SanctionOrigin = 'report' | 'automatic' | 'moderator';

/**
 * 403 `MUTED` details: the account may not do this until `until` (null = no end
 * set). Clients say "You can't send messages until …" in local time.
 */
export interface MutedErrorDetails {
  until: string | null;
  scope: Exclude<RestrictionScope, 'account'>;
}

/**
 * 403 `ACCOUNT_SUSPENDED` details, from `POST /auth/login`, `/auth/refresh` and
 * `/auth/oauth`. `appealToken` is a short-lived token that can only read
 * `GET /me/standing` and file `POST /me/appeals` — the suspension screen sends it
 * as `Authorization: Bearer <appealToken>`.
 */
export interface SuspendedErrorDetails {
  /** null = permanent */
  until: string | null;
  policy: ReportCategory | null;
  statement: string;
  appealable: boolean;
  appealToken: string;
}

/** The appeal token's lifetime. Signing in again gives a fresh one. */
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
  /** null = no end (a permanent ban, or a warning, which has none) */
  endsAt: string | null;
  origin: SanctionOrigin;
  /** a person looked at it (always true unless it was automatic and nobody has yet) */
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
  /** what is currently restricted, and until when (null = no end) */
  restrictions: Partial<Record<RestrictionScope, { until: string | null }>>;
}

/** `POST /me/appeals` — about a sanction you received, or a report of yours that was closed. */
export interface FileAppealRequest {
  sanctionId?: string;
  caseId?: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Inbox notifications
// ---------------------------------------------------------------------------

/**
 * `data` of the inbox notifications moderation sends. The title and body are
 * plain English; clients may render their own words from these fields.
 */
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
  | {
      kind: 'caring_message';
      helplineUrl: string;
      /**
       * The moderator's own words, when they wrote some — the one part of the
       * message a client cannot say for itself in the reader's language.
       */
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

/**
 * Where a case came from. `report` is every user report; `copyright` a notice
 * from the public /copyright form (copyright.ts); the rest are older or
 * automated feeds.
 */
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
  /** a row that could not be read in full; shown, never allowed to break the page */
  degraded?: boolean;
}

/**
 * `GET /admin/moderation/queue` query. Every field is optional; the default is
 * every open case, most urgent first, oldest first report first.
 */
export interface CaseQueueQuery {
  /**
   * A single status, or `open` (default: every status still on someone's desk —
   * open, in review, waiting for a second admin, escalated), `closed` (actioned
   * or no violation) or `all`.
   */
  status?: CaseStatus | 'closed' | 'all';
  priority?: ReportPriority;
  category?: ReportCategory;
  /** a source, or a group of them as the queue filter shows them */
  source?: CaseSource | CaseSourceGroup;
  /** words in the summary, a username, or an id (the case's, or the reported thing's) */
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

/** `GET /admin/moderation/summary` — feeds the dashboard and the nav badge. */
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
}

/**
 * What the server froze when the report was filed. Never edited afterwards: an
 * author deleting or changing the post changes nothing here.
 */
export interface EvidenceSnapshot {
  targetType: ReportTargetType;
  targetId: string;
  capturedAt: string;
  /** whose content it is (the reported person) */
  author: { id: string; username: string } | null;
  title?: string | null;
  text?: string | null;
  caption?: string | null;
  createdAt?: string | null;
  editedAt?: string | null;
  /** the live status at capture (published, draft, removed …) */
  status?: string | null;
  /** stored media, kept from cleanup while the evidence is */
  mediaKeys: string[];
  /**
   * A written post's pictures, in order, with the alt text its author wrote
   * for each (their keys are in `mediaKeys` too) — so the case still shows
   * them after the author edits them off or deletes the post.
   */
  pictures?: Array<{ mediaKey: string; altText: string | null }>;
  /** chats: ~10 messages before and 5 after, from a conversation the reporter is in */
  context?: EvidenceMessage[];
  group?: { id: string; name: string; privacy?: string } | null;
  game?: {
    game: ReportableGame;
    gameId: string;
    status: string | null;
    seat: number;
    players: Array<{ seat: number; userId: string; username: string | null }>;
  } | null;
  /** anything else a resolver knew (post type, language, a comment's post id) */
  extra?: Record<string, unknown>;
}

export interface CaseReporter extends CasePerson {
  /** of their reports that were decided, the share that led to action (null: none decided yet) */
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
  /** accounts that shared a hashed device or network with this one at sign-up or sign-in */
  linkedAccounts: Array<{ id: string; username: string; via: 'device' | 'ip'; banned: boolean }>;
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
 * Where a piece of evidence media is. null: on the public bucket as usual.
 * 'pending': being moved off it (the CSAM action, or a closed child's file a
 * report still holds). 'done': kept only in private storage — the public URL
 * no longer serves it.
 */
export type QuarantineState = 'pending' | 'done';

/** A file the CSAM action took off the public bucket, as the filing task shows it. */
export interface EscalationMedia {
  key: string;
  quarantine: QuarantineState | null;
  /** true: the CDN forgot the URL; false: the purge failed; null: no purge is configured */
  cdnPurged: boolean | null;
  /** the address it was public at — purge it by hand in the CDN when `cdnPurged` is not true */
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
  /** for 'csam': the files taken down (attach them to the hotline report from the case view) */
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
    /** what the automated feeds recorded (scores, flags) or the old reports' summary */
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
  /**
   * The copyright notices behind the case and the reported person's strikes,
   * for a case about copyright; null for every other case (copyright.ts).
   * The API always sends it; optional so a panel built before it still reads.
   */
  copyright?: CopyrightCaseInfo | null;
}

/** Who an action is for: the reported person, or one of the reporters (a false report). */
export type DecisionTarget = 'subject' | `reporter:${string}`;

/** `caring_message` is not a sanction: a kind note with helplines, for someone at risk. */
export type DecisionActionKind = SanctionKind | 'caring_message';

export interface DecisionAction {
  target: DecisionTarget;
  kind: DecisionActionKind;
  /** null = no end; ignored for warnings, content removal and caring messages */
  durationHours?: number | null;
  /** shown to the person; optional only for a caring message */
  statement?: string;
  /**
   * The rule for this action when it is not the decision's: a reporter is
   * sanctioned for misusing reports ('spam' unless given), not under the rule
   * they reported.
   */
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
  /** the only moderation admin typing the person's username to confirm a permanent ban */
  confirmUsername?: string;
  /**
   * The same, for a decision that bans more than one person for good (the
   * reported person and a reporter acting in bad faith): every username
   * typed. A ban is confirmed when its person's name is here or is
   * `confirmUsername`.
   */
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
 * How a permanent ban is confirmed:
 * - `zero_tolerance` (child safety): in force at once; a second admin, when
 *   there is one, confirms it afterwards;
 * - `second_approval`: two or more admins can moderate, so the ban waits for
 *   another one (72 hours) with an emergency suspension in force meanwhile;
 * - `single`: only one admin can moderate; they confirm by typing the person's
 *   username (`confirmUsername`), and the ban records that nobody else looked.
 */
export type PermanentBanMode = 'zero_tolerance' | 'second_approval' | 'single';

export interface DecideResult {
  preview: boolean;
  status: CaseStatus;
  /** the exact messages people receive (a removal comes with its own statement of reasons) */
  messages: UserMessagePreview[];
  sanctions: CaseSanctionView[];
  /**
   * Every permanent ban in the decision and how it will be confirmed. A preview
   * fills it without refusing, so the panel can ask for the typed username
   * (`usernameRequired`) or warn that a second admin must approve.
   */
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
  /** when it stops waiting; after this it lapses */
  expiresAt: string;
  /** already in force (zero tolerance), confirmation is after the fact */
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

/**
 * What `GET /admin/users/:id` adds for moderation, next to the profile, wallet,
 * ledger and sessions it already sent — only for a reader with
 * `moderation.act` (support staff get the page without these fields).
 */
export interface AdminUserModeration {
  reportsAgainst: AdminUserReport[];
  reportsFiled: AdminUserReport[];
  sanctions: CaseSanctionView[];
  appeals: AppealView[];
  cases: Array<{ id: string; status: CaseStatus; priority: ReportPriority; category: ReportCategory | null; summary: string; createdAt: string }>;
  linkedAccounts: CaseSubjectView['linkedAccounts'];
  /** the automatic flagged-message ladder (lifted with `POST /admin/users/:id/chat-mute/lift`) */
  chatOffenses: { count: number; mutedUntil: string | null; permanent: boolean } | null;
  /** a chat mute with no end (the `mutedUntil` field cannot say "permanent") */
  mutedPermanently: boolean;
}

/** An appeal in the admin's list. */
export interface AdminAppealItem extends AppealView {
  user: { id: string; username: string } | null;
  sanction: CaseSanctionView | null;
  /** who made the decision being appealed (another admin should review it) */
  originalDeciderId: string | null;
}

/**
 * `POST /admin/users/:id/sanctions` — a sanction from the user page, under the
 * same rules as a case decision (a permanent ban waits for a second admin, or
 * needs `confirmUsername` from the only one).
 */
export interface ApplySanctionRequest {
  kind: SanctionKind;
  /** null = no end; required for a suspension; ignored for a warning or removal */
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
  /** a ban that waits for a second admin comes as two: the emergency suspension and the waiting ban */
  sanctions: CaseSanctionView[];
  pendingApproval: boolean;
}

/** `POST /admin/appeals/:id/decide` */
export interface DecideAppealRequest {
  outcome: AppealOutcome;
  /** the person reads this */
  note: string;
  /** for `modified`: what the sanction becomes (never a permanent ban) */
  modifiedSanction?: { kind: SanctionKind; durationHours?: number | null; statement: string };
}

/** What `POST /admin/moderation/cases/:id/csam` answers. */
export interface CsamActionResult {
  status: CaseStatus;
  /** the filing task, with the hotlines' links; close it with the reference they gave */
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
 * Admins with `moderation.act` (moderator, superadmin, legacy admin; 2FA verified).
 * A moderator who is a case's reported person or one of its reporters gets 403
 * CONFLICT_OF_INTEREST from every route about that case (detail, claim, note,
 * decide, escalate, reopen, CSAM, approving or rejecting its ban) and does not see
 * it in the queue; nobody sanctions themselves or someone with an open report about
 * them, lifts their own sanction, or reviews their own appeal (same 403):
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

/**
 * Where child sexual abuse material is reported. Hevalo files these by hand:
 * the CSAM action creates a task with these links, never sends anything itself.
 */
export const CSAM_REPORTING_LINKS: ReadonlyArray<{ label: string; url: string }> = [
  { label: 'NCMEC CyberTipline (US)', url: 'https://report.cybertip.org/' },
  { label: 'IWF (UK)', url: 'https://report.iwf.org.uk/' },
  {
    label: 'UK NCA industry reporting (Ofcom guidance)',
    url: 'https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/duty-to-report-child-sexual-exploitation-and-abuse-csea-content-know-the-rules-and-how-to-comply',
  },
  { label: 'INHOPE hotlines (EU and worldwide)', url: 'https://www.inhope.org/EN' },
];
