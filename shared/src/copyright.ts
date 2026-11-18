/**
 * Copyright notices, counter-notices and strikes. Anyone, with or without an account, can report from the public
 * /copyright page that a post copies their work; the notice becomes a moderation case decided in the usual case view.
 * One form satisfies the EU DSA (Art. 16) and the US DMCA (§512(c)(3)). The person whose post was taken down may send a
 * counter-notice (§512(g)), copied to the notifier. A confirmed decision is a strike, and three in twelve months suggest
 * closing the account (§512(i)). Shared because the API and the web form check the same fields and the admin renders the
 * case view's shapes.
 */
import { stripControlChars } from './sanitize.js';

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const COPYRIGHT_NAME_MAX = 200;
export const COPYRIGHT_EMAIL_MAX = 254;
export const COPYRIGHT_ADDRESS_MAX = 500;
export const COPYRIGHT_PHONE_MAX = 40;
export const COPYRIGHT_WORK_MAX = 2000;
export const COPYRIGHT_URL_MAX = 500;
export const COPYRIGHT_EXPLANATION_MAX = 4000;

/** Notices one network address may send in an hour; the page has no captcha. */
export const COPYRIGHT_NOTICES_PER_HOUR = 5;
/** Counter-notices one account may send in an hour. */
export const COUNTER_NOTICES_PER_HOUR = 5;

/** A counter-notice can be sent for six months after the decision, like an appeal. */
export const COUNTER_NOTICE_WINDOW_DAYS = 182;
/** The DMCA restores a post 10 to 14 business days after a counter-notice unless the notifier goes to court; the case view shows the earliest day. */
export const COUNTER_NOTICE_RESTORE_BUSINESS_DAYS = 10;

/** Confirmed strikes are counted over this many days … */
export const COPYRIGHT_STRIKE_WINDOW_DAYS = 365;
/** … and this many of them suggest closing the account. */
export const COPYRIGHT_STRIKES_FOR_TERMINATION = 3;

// ---------------------------------------------------------------------------
// Where the reported thing is
// ---------------------------------------------------------------------------

/** What a notice can point at: a written post, a picture post, or a profile (its photo, name, bio). */
export const COPYRIGHT_TARGET_TYPES = ['library_post', 'image_post', 'user'] as const;
export type CopyrightTargetType = (typeof COPYRIGHT_TARGET_TYPES)[number];

export interface CopyrightTargetRef {
  type: CopyrightTargetType;
  id: string;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`, 'i');
const PATHS: ReadonlyArray<{ re: RegExp; type: CopyrightTargetType }> = [
  { re: new RegExp(`^/app/library/(${UUID})/?$`, 'i'), type: 'library_post' },
  { re: new RegExp(`^/app/dimen/(${UUID})/?$`, 'i'), type: 'image_post' },
  { re: new RegExp(`^/app/users/(${UUID})/?$`, 'i'), type: 'user' },
];

/**
 * The post or profile a pasted Hevalo link points at: a full link (with or without `https://`, any host, since staging
 * and share links look alike), a path, or a written post's bare id; null for anything else. Only the shape is read:
 * whether the post exists is the server's to know, and the form never says.
 */
export function parseCopyrightTarget(input: string | null | undefined): CopyrightTargetRef | null {
  const text = (input ?? '').trim();
  if (!text || text.length > COPYRIGHT_URL_MAX) return null;
  if (UUID_RE.test(text)) return { type: 'library_post', id: text.toLowerCase() };
  let path = text;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : /^[^/\s]+\.[^/\s]+\//.test(text) ? `https://${text}` : null;
  if (withScheme) {
    try {
      path = new URL(withScheme).pathname;
    } catch {
      return null;
    }
  }
  for (const p of PATHS) {
    const m = p.re.exec(path);
    if (m) return { type: p.type, id: m[1]!.toLowerCase() };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The notice
// ---------------------------------------------------------------------------

/** Who is sending it: the rights holder, or someone allowed to act for them. */
export const COPYRIGHT_NOTIFIER_ROLES = ['owner', 'authorised'] as const;
export type CopyrightNotifierRole = (typeof COPYRIGHT_NOTIFIER_ROLES)[number];

/** `POST /copyright/notices` (no sign-in). */
export interface CopyrightNoticeRequest {
  /** the notifier's full name */
  name: string;
  email: string;
  /** a postal address (DMCA: contact details "such as an address") */
  address: string;
  phone?: string | null;
  role: CopyrightNotifierRole;
  /** the rights holder's name, when somebody else is sending it for them */
  rightsHolder?: string | null;
  /** the work that was copied */
  work: string;
  /** where the original can be seen, if it is online */
  workUrl?: string | null;
  /** the link to the post or profile on Hevalo */
  contentUrl: string;
  /** why it infringes */
  explanation: string;
  /** "I believe in good faith that this use is not authorised by the owner, its agent or the law" */
  goodFaith: true;
  /** "This notice is accurate and, under penalty of perjury, I am the owner or authorised to act for them" */
  accurate: true;
  /** the full name typed as a signature */
  signature: string;
  /** the language the receipt and the outcome are written in */
  locale?: string;
}

/** What `POST /copyright/notices` answers (201); nothing about the post, since the form never confirms it exists. */
export interface CopyrightNoticeReceipt {
  /** a short reference to quote in any reply */
  reference: string;
  receivedAt: string;
}

/** The field a notice or counter-notice problem is about, as the form names its inputs. */
export type CopyrightField =
  | 'name'
  | 'email'
  | 'address'
  | 'phone'
  | 'role'
  | 'rightsHolder'
  | 'work'
  | 'workUrl'
  | 'contentUrl'
  | 'explanation'
  | 'goodFaith'
  | 'accurate'
  | 'signature'
  | 'statement'
  | 'consent';

export type CopyrightProblemCode = 'REQUIRED' | 'TOO_LONG' | 'INVALID_EMAIL' | 'INVALID_LINK' | 'NOT_CONFIRMED';

export interface CopyrightProblem {
  field: CopyrightField;
  code: CopyrightProblemCode;
  max?: number;
}

/** Text as stored: control characters stripped and the ends trimmed. */
export function cleanCopyrightText(value: unknown): string {
  return typeof value === 'string' ? stripControlChars(value).trim() : '';
}

/** Deliberately loose: one @, something on each side, a dot in the domain, no spaces. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPlausibleEmail(value: string): boolean {
  return value.length <= COPYRIGHT_EMAIL_MAX && EMAIL_RE.test(value);
}

function checkText(problems: CopyrightProblem[], field: CopyrightField, value: unknown, max: number, required: boolean): string {
  const text = cleanCopyrightText(value);
  if (!text) {
    if (required) problems.push({ field, code: 'REQUIRED' });
  } else if (text.length > max) {
    problems.push({ field, code: 'TOO_LONG', max });
  }
  return text;
}

/** Everything wrong with a notice, in the form's field order; empty when it can be sent. The API answers 422 `INVALID_NOTICE` with these. */
export function copyrightNoticeProblems(input: Partial<Record<keyof CopyrightNoticeRequest, unknown>>): CopyrightProblem[] {
  const problems: CopyrightProblem[] = [];
  checkText(problems, 'name', input.name, COPYRIGHT_NAME_MAX, true);
  const email = checkText(problems, 'email', input.email, COPYRIGHT_EMAIL_MAX, true);
  if (email && email.length <= COPYRIGHT_EMAIL_MAX && !isPlausibleEmail(email)) problems.push({ field: 'email', code: 'INVALID_EMAIL' });
  checkText(problems, 'address', input.address, COPYRIGHT_ADDRESS_MAX, true);
  checkText(problems, 'phone', input.phone, COPYRIGHT_PHONE_MAX, false);
  if (!(COPYRIGHT_NOTIFIER_ROLES as readonly unknown[]).includes(input.role)) problems.push({ field: 'role', code: 'REQUIRED' });
  checkText(problems, 'rightsHolder', input.rightsHolder, COPYRIGHT_NAME_MAX, input.role === 'authorised');
  checkText(problems, 'work', input.work, COPYRIGHT_WORK_MAX, true);
  checkText(problems, 'workUrl', input.workUrl, COPYRIGHT_URL_MAX, false);
  const link = checkText(problems, 'contentUrl', input.contentUrl, COPYRIGHT_URL_MAX, true);
  if (link && link.length <= COPYRIGHT_URL_MAX && !parseCopyrightTarget(link)) problems.push({ field: 'contentUrl', code: 'INVALID_LINK' });
  checkText(problems, 'explanation', input.explanation, COPYRIGHT_EXPLANATION_MAX, true);
  if (input.goodFaith !== true) problems.push({ field: 'goodFaith', code: 'NOT_CONFIRMED' });
  if (input.accurate !== true) problems.push({ field: 'accurate', code: 'NOT_CONFIRMED' });
  checkText(problems, 'signature', input.signature, COPYRIGHT_NAME_MAX, true);
  return problems;
}

/** The reference a notifier quotes: "CN-" and the notice id's first eight characters upper-cased, only ever looked up with the full id. */
export function copyrightReference(noticeId: string): string {
  return `CN-${noticeId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// The counter-notice
// ---------------------------------------------------------------------------

/** `POST /me/copyright/notices/:id/counter`, from the person whose post was taken down. */
export interface CounterNoticeRequest {
  name: string;
  address: string;
  phone?: string | null;
  email: string;
  /** why the removal was a mistake or the post was misidentified */
  statement: string;
  /** "Under penalty of perjury, I believe in good faith the material was removed by mistake or misidentification" */
  goodFaith: true;
  /**
   * Consent to the jurisdiction the DMCA names (a US federal district court, or outside the US any district where Hevalo
   * may be found) and to service from the notifier.
   */
  consent: true;
  signature: string;
}

/** Everything wrong with a counter-notice, in the form's order. */
export function counterNoticeProblems(input: Partial<Record<keyof CounterNoticeRequest, unknown>>): CopyrightProblem[] {
  const problems: CopyrightProblem[] = [];
  checkText(problems, 'name', input.name, COPYRIGHT_NAME_MAX, true);
  checkText(problems, 'address', input.address, COPYRIGHT_ADDRESS_MAX, true);
  checkText(problems, 'phone', input.phone, COPYRIGHT_PHONE_MAX, false);
  const email = checkText(problems, 'email', input.email, COPYRIGHT_EMAIL_MAX, true);
  if (email && email.length <= COPYRIGHT_EMAIL_MAX && !isPlausibleEmail(email)) problems.push({ field: 'email', code: 'INVALID_EMAIL' });
  checkText(problems, 'statement', input.statement, COPYRIGHT_EXPLANATION_MAX, true);
  if (input.goodFaith !== true) problems.push({ field: 'goodFaith', code: 'NOT_CONFIRMED' });
  if (input.consent !== true) problems.push({ field: 'consent', code: 'NOT_CONFIRMED' });
  checkText(problems, 'signature', input.signature, COPYRIGHT_NAME_MAX, true);
  return problems;
}

export const COPYRIGHT_NOTICE_STATUSES = ['received', 'actioned', 'upheld', 'rejected', 'countered'] as const;
/**
 * received: waiting for a decision. actioned: the post was taken down. upheld: decided against the uploader with nothing
 * to take down, because the notice was about a profile or its link matched nothing; a notice about a post can only be
 * upheld by removing it (CONTENT_REMOVAL_REQUIRED), and there is no takedown to counter. rejected: found not to infringe.
 * countered: taken down, and its author sent a counter-notice.
 */
export type CopyrightNoticeStatus = (typeof COPYRIGHT_NOTICE_STATUSES)[number];

/**
 * A notice about something you posted (`GET /me/copyright/notices`); only notices that led to a removal are listed. The
 * notifier's contact details are not shown: the DMCA sends your counter-notice to them, not theirs to you.
 */
export interface MyCopyrightNotice {
  id: string;
  reference: string;
  /** the rights holder (or the notifier, when they are the holder) */
  claimant: string;
  work: string;
  target: CopyrightTargetRef | null;
  decidedAt: string | null;
  /** only these two, since a notice that took nothing down has nothing to answer */
  status: Extract<CopyrightNoticeStatus, 'actioned' | 'countered'>;
  counterNotice: { createdAt: string } | null;
  /** you can still send a counter-notice for this one */
  canCounter: boolean;
  /** the last moment you can */
  counterDeadline: string | null;
}

/** `GET /me/copyright/notices` */
export interface MyCopyrightNoticesPage {
  notices: MyCopyrightNotice[];
}

/** What `POST /me/copyright/notices/:id/counter` answers (201). */
export interface CounterNoticeReceipt {
  createdAt: string;
  /** the earliest day the post can be put back if the notifier does not go to court */
  restoreNotBefore: string;
}

// ---------------------------------------------------------------------------
// The case view (admin)
// ---------------------------------------------------------------------------

/** A notice in full, for the admin who decides it. */
export interface CopyrightNoticeView {
  id: string;
  reference: string;
  status: CopyrightNoticeStatus;
  receivedAt: string;
  notifier: {
    name: string;
    email: string;
    address: string;
    phone: string | null;
    role: CopyrightNotifierRole;
    rightsHolder: string | null;
    signature: string;
    locale: string;
  };
  work: string;
  workUrl: string | null;
  /** exactly what the notifier typed as the link */
  contentUrl: string;
  /** what that link was read as; null when it matched nothing on Hevalo (look into it by hand) */
  target: CopyrightTargetRef | null;
  /** the target existed when the notice arrived */
  targetFound: boolean;
  explanation: string;
  goodFaith: boolean;
  accurate: boolean;
  receiptSentAt: string | null;
  outcomeSentAt: string | null;
  counterNotice: CounterNoticeView | null;
}

export interface CounterNoticeView {
  id: string;
  userId: string | null;
  name: string;
  address: string;
  phone: string | null;
  email: string;
  statement: string;
  goodFaith: boolean;
  consent: boolean;
  signature: string;
  createdAt: string;
  /** the earliest day to put the post back, if the notifier has not reported a court action */
  restoreNotBefore: string;
  /** when the copy went to the notifier */
  forwardedAt: string | null;
}

/** A person's confirmed copyright strikes in the window. */
export interface CopyrightStrikes {
  count: number;
  windowDays: number;
  threshold: number;
  /** the repeat-infringer policy says the account should be closed; the admin decides */
  terminationSuggested: boolean;
  /** the cases behind them, newest first */
  caseIds: string[];
}

/**
 * `CaseDetail.copyright` (`GET /admin/moderation/cases/:id`): present for a case from a notice or about copyright (a report
 * in that category, or a decision under that rule); null otherwise.
 */
export interface CopyrightCaseInfo {
  notices: CopyrightNoticeView[];
  /** the reported person's strikes; null when the case has no reported person */
  strikes: CopyrightStrikes | null;
}

/**
 * The earliest day a post may be restored after a counter-notice: this many business days (Monday to Friday) after it
 * arrived. Public holidays are not skipped; the DMCA's window is 10 to 14, so a holiday still lands inside it.
 */
export function restoreNotBefore(receivedAt: Date, businessDays = COUNTER_NOTICE_RESTORE_BUSINESS_DAYS): Date {
  const d = new Date(receivedAt.getTime());
  let left = businessDays;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d;
}

/*
 * The copyright routes. Errors are the usual `{ code, message, details? }`.
 *
 * No sign-in:
 *   POST /copyright/notices            CopyrightNoticeRequest → 201 CopyrightNoticeReceipt
 *        (422 INVALID_NOTICE with details.problems: CopyrightProblem[]; 429 per address)
 *
 * Signed in:
 *   GET  /me/copyright/notices         → MyCopyrightNoticesPage
 *   POST /me/copyright/notices/:id/counter  CounterNoticeRequest → 201 CounterNoticeReceipt
 *        (403 COUNTER_NOTICE_ADULT_REQUIRED for an account not known to be 18 or over, since the copy with the sender's
 *         address goes to the notifier; a parent or guardian sends it by email instead;
 *         404 NOT_FOUND for a notice not about your post or that took nothing down;
 *         409 ALREADY_COUNTERED, COUNTER_WINDOW_CLOSED; 422 INVALID_COUNTER_NOTICE)
 *
 * Admins: the case view (`GET /admin/moderation/cases/:id`) carries `copyright`.
 */
