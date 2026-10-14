/**
 * Moderation, as data: the words the admin uses for a case's priority, rule,
 * status and source, the sanctions and how long they last, the decision a
 * moderator is putting together and the request it becomes, where a case sits
 * in the queue (for j/k), and how a case's history reads. Kept apart from the
 * pages so all of it is tested without a browser.
 *
 * The API stays the judge of a decision. `draftProblems` only catches what is
 * plainly missing before the panel asks the server for a preview — the
 * preview (`preview: true` on the same request) is where every rule is
 * checked, by the same code that will apply it.
 */
import {
  OPEN_CASE_STATUSES,
  PRIORITY_SLA_HOURS,
  REPORT_CATEGORIES,
  SANCTION_DURATION_PRESETS,
  SANCTION_SCOPE,
  isSanctionKind,
  sanctionHasDuration,
  type CaseMediaItem,
  type CaseSanctionView,
  type CaseSource,
  type CaseSourceGroup,
  type CaseStatus,
  type DecideRequest,
  type DecisionActionKind,
  type DecisionTarget,
  type EvidenceSnapshot,
  type PermanentBanMode,
  type ReportCategory,
  type ReportPriority,
  type ReportTargetType,
  type SanctionKind,
} from '@kurda/shared';
import type { Tone } from './ui/basics';
import { absoluteTime, duration, shortDate } from './ui/Time';

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** 'private_info' → 'Private info', 'copyrightNotice' → 'Copyright notice': a key nobody named yet, readable. */
export function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : key;
}

function named<K extends string>(names: Readonly<Record<K, string>>, key: string | null | undefined, none: string): string {
  if (!key) return none;
  return Object.hasOwn(names, key) ? names[key as K] : humanize(key);
}

export const PRIORITY_NAME: Readonly<Record<ReportPriority, string>> = { 0: 'Urgent', 1: 'High', 2: 'Normal', 3: 'Low' };
export const PRIORITY_TONE: Readonly<Record<ReportPriority, Tone>> = { 0: 'bad', 1: 'warn', 2: 'info', 3: 'neutral' };

/** "within 1 h", "within 3 days" — how soon each priority should be decided. */
export function slaTarget(p: ReportPriority): string {
  const h = PRIORITY_SLA_HOURS[p];
  return h < 48 ? `within ${h} h` : `within ${Math.round(h / 24)} days`;
}

/**
 * The rules, as short names for a list. The report sheet's own labels
 * (REPORT_CATEGORIES) are written for a child picking one and run to a line
 * each; a moderator scanning a queue needs two words. A rule this build does
 * not know yet (another part of Hevalo may add one, like copyright) is shown
 * by its key rather than breaking the page.
 */
const CATEGORY_NAME: Readonly<Record<ReportCategory, string>> = {
  child_safety: 'Child safety',
  self_harm: 'Self-harm',
  violence: 'Threat of violence',
  sexual: 'Sexual content',
  hate: 'Hate',
  private_info: 'Private information',
  harassment: 'Bullying or harassment',
  spam: 'Scam or spam',
  impersonation: 'Impersonation',
  other: 'Something else',
};

export function categoryName(category: string | null | undefined): string {
  return named(CATEGORY_NAME, category, 'No rule given');
}

/** The rule as a statement to a person says it: "… broke Hevalo’s rule on bullying and harassment." */
const RULE_PHRASE: Readonly<Record<ReportCategory, string>> = {
  child_safety: 'keeping children safe',
  self_harm: 'self-harm',
  violence: 'threats and violence',
  sexual: 'sexual content',
  hate: 'hate',
  private_info: 'sharing private information',
  harassment: 'bullying and harassment',
  spam: 'spam and scams',
  impersonation: 'pretending to be someone else',
  other: 'how we treat each other',
};

function rulePhrase(policy: string | null | undefined): string {
  if (!policy) return 'how we treat each other';
  return Object.hasOwn(RULE_PHRASE, policy) ? RULE_PHRASE[policy as ReportCategory] : humanize(policy).toLowerCase();
}

/** The rules a decision can be made under, most urgent first, with the case's own when this build does not list it. */
export function policyOptions(current?: string | null): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = REPORT_CATEGORIES.map((c) => ({
    value: c.key,
    label: `${CATEGORY_NAME[c.key]} · ${PRIORITY_NAME[c.priority].toLowerCase()}`,
  }));
  if (current && !out.some((o) => o.value === current)) out.push({ value: current, label: categoryName(current) });
  return out;
}

const STATUS_NAME: Readonly<Record<CaseStatus, string>> = {
  open: 'Open',
  in_review: 'In review',
  actioned: 'Action taken',
  no_violation: 'No rule broken',
  needs_second_approval: 'Waiting for a second admin',
  escalated: 'Escalated',
};
const STATUS_TONE: Readonly<Record<CaseStatus, Tone>> = {
  open: 'info',
  in_review: 'info',
  actioned: 'ok',
  no_violation: 'neutral',
  needs_second_approval: 'warn',
  escalated: 'bad',
};

export function statusName(status: string): string {
  return named(STATUS_NAME, status, 'Unknown');
}
export function statusTone(status: string): Tone {
  return Object.hasOwn(STATUS_TONE, status) ? STATUS_TONE[status as CaseStatus] : 'neutral';
}
export function isOpenStatus(status: string): boolean {
  return (OPEN_CASE_STATUSES as readonly string[]).includes(status);
}

export const SOURCE_GROUP_NAME: Readonly<Record<CaseSourceGroup, string>> = {
  reports: 'Reports',
  automated: 'Automated',
  bots: 'Bots',
  anti_cheat: 'Anti-cheat',
};

const SOURCE_NAME: Readonly<Record<CaseSource, string>> = {
  report: 'Report',
  text_flag: 'Automatic text check',
  image_flag: 'Automatic picture check',
  bot_flag: 'Bot score',
  anti_cheat: 'Anti-cheat',
  chat_report: 'Chat report (older app)',
  library_report: 'Post report (older app)',
  image_report: 'Picture report (older app)',
  user_report: 'Profile report (older app)',
};

export function sourceName(source: string): string {
  return named(SOURCE_NAME, source, 'Unknown source');
}

const TARGET_NAME: Readonly<Record<ReportTargetType, string>> = {
  user: 'Profile',
  dm_message: 'Direct message',
  group_message: 'Group message',
  group: 'Group',
  library_post: 'Post',
  library_comment: 'Comment on a post',
  image_post: 'Picture post',
  image_comment: 'Comment on a picture',
  game_player: 'Player in a game',
};

export function targetName(target: string | null | undefined): string {
  return named(TARGET_NAME, target, 'Account');
}

/** Whether a decision can take this case's content down (the server checks again). */
export function contentTarget(target: string | null | undefined, source?: string): boolean {
  if (source === 'image_flag' || source === 'library_report' || source === 'image_report' || source === 'chat_report') return true;
  return !!target && !['user', 'group', 'game_player'].includes(target);
}

// ---------------------------------------------------------------------------
// Sanctions
// ---------------------------------------------------------------------------

const SANCTION_NAME: Readonly<Record<SanctionKind, string>> = {
  warning: 'Warning',
  content_removal: 'Content removed',
  chat_mute: 'Chat mute',
  post_mute: 'Posting mute',
  feature_limit: 'No pictures or voice',
  suspension: 'Suspension',
  permanent_ban: 'Permanent ban',
};

export function sanctionName(kind: string): string {
  if (kind === 'caring_message') return 'Caring message';
  return named(SANCTION_NAME, kind, 'Sanction');
}

/**
 * What lifting a sanction does, for the dialog that asks why. The API tells
 * the person only when it lifts something that limited them; a warning or a
 * removal is struck from their record and nothing more — removed content
 * comes back only when an appeal overturns the decision.
 */
export function liftEffect(kind: SanctionKind, who: string): string {
  if (SANCTION_SCOPE[kind] !== null) return `${who} is told it was lifted. What it stopped works again at once.`;
  const record = `It comes off ${who}’s record; they are not told.`;
  return kind === 'content_removal' ? `${record} The content stays hidden: only an overturned appeal brings it back.` : record;
}

/** What each sanction stops, in a line. */
export const SANCTION_EFFECT: Readonly<Record<SanctionKind | 'caring_message', string>> = {
  warning: 'Nothing is limited. They are told what was wrong.',
  content_removal: 'The content is hidden from everyone.',
  chat_mute: 'No direct or group messages.',
  post_mute: 'No posts or comments.',
  feature_limit: 'No uploading pictures or voice.',
  suspension: 'They can’t sign in until it ends.',
  permanent_ban: 'The account is closed for good, and its email can’t sign up again.',
  caring_message: 'Not a sanction: a kind note with places to find help.',
};

/** The kinds the action panel offers, in order of weight. Removal is the panel's own checkbox. */
export const ACTION_KINDS: readonly DecisionActionKind[] = ['warning', 'chat_mute', 'post_mute', 'feature_limit', 'suspension', 'permanent_ban'];

/** Lengths a sanction can have: 24 h, 3 d, 7 d, 30 d, permanent. */
export const DURATION_PRESETS: readonly (number | null)[] = SANCTION_DURATION_PRESETS;

export function hasDuration(kind: DecisionActionKind): boolean {
  return kind === 'permanent_ban' || (isSanctionKind(kind) && sanctionHasDuration(kind));
}

/** "24 hours", "3 days", "Permanent". */
export function durationName(hours: number | null): string {
  if (hours === null) return 'Permanent';
  if (hours % 24 === 0) return hours === 24 ? '24 hours' : `${hours / 24} days`;
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

/** "24 h", "3 d", "Permanent" — for a row of chips. */
export function durationShort(hours: number | null): string {
  if (hours === null) return 'Permanent';
  return hours % 24 === 0 && hours > 24 ? `${hours / 24} d` : `${hours} h`;
}

/**
 * Choosing a length can change the kind: a suspension with no end is a
 * permanent ban (the API refuses an endless suspension), and a ban given a
 * length is a suspension again.
 */
export function withDuration(kind: DecisionActionKind, hours: number | null): { kind: DecisionActionKind; durationHours: number | null } {
  if (kind === 'suspension' && hours === null) return { kind: 'permanent_ban', durationHours: null };
  if (kind === 'permanent_ban' && hours !== null) return { kind: 'suspension', durationHours: hours };
  return { kind, durationHours: hours };
}

/** The length a newly chosen kind starts at. */
export function defaultDuration(kind: DecisionActionKind): number | null {
  if (kind === 'permanent_ban' || !hasDuration(kind)) return null;
  return kind === 'suspension' ? 168 : 24;
}

/**
 * What the person is told, unless the moderator writes their own: plain and
 * short, naming the rule. The API puts it inside the full notice (what
 * happens, until when, who decided, how to ask for a review) — the preview
 * shows the whole of it.
 */
export function defaultStatement(kind: DecisionActionKind, policy: string | null | undefined, forReporter = false): string {
  if (kind === 'caring_message') return '';
  if (forReporter) {
    return 'You reported things that don’t break our rules, more than once. The report button is for real problems — please use it only for those.';
  }
  const rule = rulePhrase(policy);
  switch (kind) {
    case 'warning':
      return `Something you shared broke Hevalo’s rule on ${rule}. Please keep Hevalo kind and safe.`;
    case 'content_removal':
      return `Something you shared broke Hevalo’s rule on ${rule}, so we removed it.`;
    case 'chat_mute':
      return `Your messages broke Hevalo’s rule on ${rule}.`;
    case 'post_mute':
      return `What you posted broke Hevalo’s rule on ${rule}.`;
    case 'feature_limit':
      return `Pictures or voice you shared broke Hevalo’s rule on ${rule}.`;
    case 'suspension':
      return `Your account broke Hevalo’s rule on ${rule}.`;
    case 'permanent_ban':
      return `Your account broke Hevalo’s rule on ${rule}, seriously or more than once.`;
  }
}

/** How a permanent ban is confirmed, said before it is sent. */
export function banModeText(mode: PermanentBanMode): string {
  switch (mode) {
    case 'zero_tolerance':
      return 'Child safety is zero tolerance: the ban applies at once. Another moderator confirms it afterwards, when there is one.';
    case 'second_approval':
      return 'Another moderator has to approve a permanent ban within 72 hours. Until then the account is suspended.';
    case 'single':
      return 'You are the only moderator, so nobody else can approve it. Type the username to confirm.';
  }
}

/** "until 14 Oct", "no end", "lifted 2 Oct" — where a sanction stands. */
export function sanctionPeriod(
  s: Pick<CaseSanctionView, 'kind' | 'startsAt' | 'endsAt' | 'revokedAt' | 'active' | 'pendingApproval'>,
  now = new Date(),
): string {
  if (s.revokedAt) return `Lifted ${shortDate(new Date(s.revokedAt), now)}`;
  if (s.pendingApproval) return 'Waiting for a second admin';
  // a warning and a removal happen once; they have a day, not a length
  if (s.kind === 'warning' || s.kind === 'content_removal') return `Given ${shortDate(new Date(s.startsAt), now)}`;
  if (!s.endsAt) return s.active ? 'No end' : 'Ended';
  const end = new Date(s.endsAt);
  return end.getTime() > now.getTime() ? `Until ${absoluteTime(end)}` : `Ended ${shortDate(end, now)}`;
}

// ---------------------------------------------------------------------------
// The service level: how soon a case should be decided
// ---------------------------------------------------------------------------

/** "Overdue by 2 h", "Due in 40 min" — or null for a closed case. */
export function slaState(
  c: { slaDueAt: string; slaBreached: boolean; status: string; priority: ReportPriority },
  now = new Date(),
): { text: string; tone: Tone } | null {
  if (!isOpenStatus(c.status)) return null;
  const due = new Date(c.slaDueAt).getTime();
  const left = (due - now.getTime()) / 1000;
  if (c.slaBreached || left <= 0) return { text: `Overdue by ${duration(Math.abs(left))}`, tone: 'bad' };
  // the last quarter of the time it was given: soon
  const soon = left <= (PRIORITY_SLA_HOURS[c.priority] * 3600) / 4;
  return { text: `Due in ${duration(left)}`, tone: soon ? 'warn' : 'neutral' };
}

// ---------------------------------------------------------------------------
// The queue's filters, in the address
// ---------------------------------------------------------------------------

export interface QueueFilters {
  status: string;
  priority: string;
  category: string;
  source: string;
  q: string;
}

export const EMPTY_FILTERS: QueueFilters = { status: 'open', priority: '', category: '', source: '', q: '' };

/** The filters an address asks for (#/moderation?priority=0&source=bots). */
export function filtersFrom(query: URLSearchParams): QueueFilters {
  return {
    status: query.get('status') || 'open',
    priority: query.get('priority') ?? '',
    category: query.get('category') ?? '',
    source: query.get('source') ?? '',
    q: query.get('q') ?? '',
  };
}

/** The filters as a query string, the defaults left out: "priority=0&source=bots". */
export function filtersQuery(f: QueueFilters): string {
  const p = new URLSearchParams();
  if (f.status && f.status !== 'open') p.set('status', f.status);
  if (f.priority !== '') p.set('priority', f.priority);
  if (f.category) p.set('category', f.category);
  if (f.source) p.set('source', f.source);
  if (f.q.trim()) p.set('q', f.q.trim());
  return p.toString();
}

export const QUEUE_PAGE = 50;

/** The API path for a page of the queue. */
export function queuePath(f: QueueFilters, cursor?: string | null): string {
  const p = new URLSearchParams(filtersQuery(f));
  if (f.status === 'open') p.set('status', 'open');
  p.set('limit', String(QUEUE_PAGE));
  if (cursor) p.set('cursor', cursor);
  return `/admin/moderation/queue?${p}`;
}

// ---------------------------------------------------------------------------
// Where a case sits in the queue, for j/k from the case view
// ---------------------------------------------------------------------------

const ORDER_KEY = 'hevalo-admin-queue-order';

/** The queue's order as it was last shown, kept for this tab only. */
export function rememberQueueOrder(ids: readonly string[], query = ''): void {
  try {
    sessionStorage.setItem(ORDER_KEY, JSON.stringify({ ids, query }));
  } catch {
    // private mode, or storage full: j/k then simply has nowhere to go
  }
}

export function queueOrder(): { ids: string[]; query: string } {
  try {
    const raw = sessionStorage.getItem(ORDER_KEY);
    const parsed = raw ? (JSON.parse(raw) as { ids?: unknown; query?: unknown }) : null;
    if (parsed && Array.isArray(parsed.ids)) {
      return { ids: parsed.ids.filter((x): x is string => typeof x === 'string'), query: typeof parsed.query === 'string' ? parsed.query : '' };
    }
  } catch {
    // unreadable: no order
  }
  return { ids: [], query: '' };
}

/** The case after (1) or before (-1) this one, as the queue listed them; null at either end. */
export function neighbourCase(id: string, step: 1 | -1, order = queueOrder().ids): string | null {
  const at = order.indexOf(id);
  if (at < 0) return null;
  return order[at + step] ?? null;
}

// ---------------------------------------------------------------------------
// A decision being put together
// ---------------------------------------------------------------------------

export interface ActionDraft {
  /** the panel's own key for the row */
  key: string;
  target: DecisionTarget;
  kind: DecisionActionKind;
  durationHours: number | null;
  statement: string;
  /** typed by the moderator: a change of rule or kind leaves it alone */
  statementEdited: boolean;
}

export interface DecisionDraft {
  outcome: 'actioned' | 'no_violation';
  /** '' until one is chosen */
  policy: string;
  actions: ActionDraft[];
  removeContent: boolean;
  notifyReporters: boolean;
  /** for the case record, not the person */
  note: string;
}

let nextKey = 1;

export function newAction(target: DecisionTarget, kind: DecisionActionKind, policy: string): ActionDraft {
  return {
    key: `a${nextKey++}`,
    target,
    kind,
    durationHours: defaultDuration(kind),
    statement: defaultStatement(kind, policy, target !== 'subject'),
    statementEdited: false,
  };
}

/** The draft a case opens with: its own rule picked, nothing applied yet, reporters told. */
export function initialDraft(policy: string | null): DecisionDraft {
  return { outcome: 'actioned', policy: policy ?? '', actions: [], removeContent: false, notifyReporters: true, note: '' };
}

/** A new rule rewrites every statement nobody has typed into, so the default never names the wrong rule. */
export function withPolicy(d: DecisionDraft, policy: string): DecisionDraft {
  return {
    ...d,
    policy,
    actions: d.actions.map((a) => (a.statementEdited ? a : { ...a, statement: defaultStatement(a.kind, policy, a.target !== 'subject') })),
  };
}

/**
 * Another kind for the same row: the length chosen carries over when the new
 * kind can have it (a 7-day chat mute becomes a 7-day posting mute), and the
 * statement follows unless the moderator wrote their own.
 */
export function withKind(a: ActionDraft, kind: DecisionActionKind, policy: string): ActionDraft {
  let hours: number | null;
  if (!hasDuration(kind) || kind === 'permanent_ban') hours = null;
  else if (!hasDuration(a.kind) || a.kind === 'permanent_ban') hours = defaultDuration(kind);
  // "no end" is a length for a mute, not for a suspension
  else hours = a.durationHours === null && kind === 'suspension' ? defaultDuration(kind) : a.durationHours;
  return {
    ...a,
    kind,
    durationHours: hours,
    statement: a.statementEdited ? a.statement : defaultStatement(kind, policy, a.target !== 'subject'),
  };
}

/** The request the draft is: what the preview asks about and what the decision sends. */
export function decisionRequest(d: DecisionDraft, extra: { preview?: boolean; confirmUsernames?: string[] } = {}): DecideRequest {
  // one name typed goes as confirmUsername; a decision that bans two people for good sends both
  const typed = extra.confirmUsernames ?? [];
  const actioned = d.outcome === 'actioned';
  return {
    outcome: d.outcome,
    ...(d.policy ? { policy: d.policy as ReportCategory } : {}),
    actions: d.actions.map((a) => ({
      target: a.target,
      kind: a.kind,
      ...(hasDuration(a.kind) && a.kind !== 'permanent_ban' ? { durationHours: a.durationHours } : {}),
      ...(a.statement.trim() ? { statement: a.statement.trim() } : {}),
    })),
    removeContent: actioned && d.removeContent,
    notifyReporters: d.notifyReporters,
    ...(d.note.trim() ? { note: d.note.trim() } : {}),
    ...(extra.preview ? { preview: true } : {}),
    ...(typed.length === 1 ? { confirmUsername: typed[0] } : typed.length > 1 ? { confirmUsernames: typed } : {}),
  };
}

/**
 * What is plainly missing, said the way to fix it — before the panel asks for
 * a preview. The server's own checks come back through the preview.
 */
export function draftProblems(d: DecisionDraft, names: (target: DecisionTarget) => string = () => 'them'): string[] {
  const out: string[] = [];
  const actioned = d.outcome === 'actioned';
  if (actioned && !d.policy) out.push('Choose the rule that was broken.');
  if (actioned && d.actions.length === 0 && !d.removeContent) out.push('Add an action, or remove the content.');
  for (const a of d.actions) {
    if (a.target === 'subject' && a.kind !== 'caring_message') {
      if (!actioned) out.push('A case where no rule was broken can’t sanction the reported person. Send a caring message, or act on a reporter.');
      else if (d.policy === 'self_harm') out.push('Someone who may hurt themselves gets a caring message, not a sanction.');
    }
    if (a.kind !== 'caring_message' && !a.statement.trim()) out.push(`Write what ${names(a.target)} will be told.`);
    if (a.kind === 'suspension' && a.durationHours === null) out.push('A suspension needs an end. For none, choose a permanent ban.');
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/** A report's evidence is a snapshot when it carries what was captured; older reports carry only a reason. */
export function isSnapshot(e: unknown): e is EvidenceSnapshot {
  return typeof e === 'object' && e !== null && typeof (e as { targetType?: unknown }).targetType === 'string' && 'capturedAt' in e;
}

/** What a file is, from its type or, failing that, its name. */
export function mediaKind(m: Pick<CaseMediaItem, 'key' | 'contentType'>): 'image' | 'audio' | 'video' | 'file' {
  const t = m.contentType ?? '';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  const ext = m.key.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic'].includes(ext)) return 'image';
  if (['m4a', 'mp3', 'wav', 'ogg', 'opus', 'aac', 'webm'].includes(ext)) return 'audio';
  if (['mp4', 'mov'].includes(ext)) return 'video';
  return 'file';
}

// ---------------------------------------------------------------------------
// A notice that came with a case (a copyright notice, say)
// ---------------------------------------------------------------------------

/**
 * A formal notice filed with a case, wherever the detail carries it. Another
 * part of Hevalo adds copyright notices; the case view shows whatever fields
 * the notice has rather than depending on its exact shape.
 */
export function caseNotice(detail: unknown): Record<string, unknown> | null {
  const d = detail as { notice?: unknown; case?: { notice?: unknown } } | null;
  const n = d?.notice ?? d?.case?.notice;
  return typeof n === 'object' && n !== null && !Array.isArray(n) ? (n as Record<string, unknown>) : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function valueText(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return v.toLocaleString();
  if (typeof v === 'string') return ISO_DATE.test(v) && !Number.isNaN(Date.parse(v)) ? absoluteTime(new Date(v)) : v;
  if (Array.isArray(v)) {
    const parts = v.map(valueText).filter((x): x is string => x !== null);
    return parts.length ? parts.join(', ') : null;
  }
  return null;
}

/** A notice's fields as label and text, nested ones named by their path ("Signature › Name"); empty ones left out. */
export function noticeFields(notice: Record<string, unknown>, prefix = ''): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  for (const [key, v] of Object.entries(notice)) {
    const label = prefix ? `${prefix} › ${humanize(key)}` : humanize(key);
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out.push(...noticeFields(v as Record<string, unknown>, label));
      continue;
    }
    if (Array.isArray(v) && v.some((x) => typeof x === 'object' && x !== null)) {
      v.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) out.push(...noticeFields(item as Record<string, unknown>, `${label} ${i + 1}`));
        else {
          const t = valueText(item);
          if (t !== null) out.push({ label: `${label} ${i + 1}`, value: t });
        }
      });
      continue;
    }
    const t = valueText(v);
    if (t !== null) out.push({ label, value: t });
  }
  return out;
}

// ---------------------------------------------------------------------------
// A case's history
// ---------------------------------------------------------------------------

/** `admin_actions` as people say them (the names are the API's, migration 154). */
const HISTORY_ACTION: Readonly<Record<string, string>> = {
  case_decision: 'Decided',
  case_reopen: 'Reopened',
  case_escalate: 'Escalated',
  csam: 'CSAM action: hidden, preserved, banned',
  approve_ban: 'Approved a permanent ban',
  reject_ban: 'Turned a permanent ban down',
  caring_message: 'Sent a caring message',
  appeal_decision: 'Answered an appeal',
  revoke_sanction: 'Lifted a sanction',
  warn: 'Warning',
  mute: 'Chat mute',
  post_mute: 'Posting mute',
  feature_limit: 'No pictures or voice',
  content_removal: 'Content removed',
  temp_ban: 'Suspension',
  perm_ban: 'Permanent ban',
  unban: 'Ban lifted',
  unmute: 'Mute lifted',
  lift_chat_mute: 'Automatic chat mute lifted',
  auto_mute: 'Muted automatically',
  auto_suspend: 'Suspended automatically',
  session_revoke: 'Signed out everywhere',
  wallet_adjust: 'Balance adjusted',
  item_grant: 'Item given',
  item_revoke: 'Item taken back',
};

/** One line of a case's (or a person's) history: what happened, in words. */
export function historyLine(action: string): string {
  if (Object.hasOwn(HISTORY_ACTION, action)) return HISTORY_ACTION[action]!;
  const m = /^(GET|POST|PUT|PATCH|DELETE) \/admin\/moderation\/cases\/:id\/([a-z_-]+)$/.exec(action);
  if (m) {
    const step = m[2]!;
    const words: Record<string, string> = {
      claim: 'Claimed it',
      release: 'Let it go',
      note: 'Added a note',
      decide: 'Sent the decision',
      reopen: 'Reopened it',
      escalate: 'Escalated it',
      csam: 'Took the CSAM action',
      resolve: 'Resolved it (old queue)',
    };
    return words[step] ?? humanize(step);
  }
  return isSanctionKind(action) ? sanctionName(action) : humanize(action.replace(/^(GET|POST|PUT|PATCH|DELETE) /, ''));
}
