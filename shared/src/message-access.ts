/**
 * When staff may read letters and private chats, in the words the API and the admin console share. Staff read a letter
 * or a direct or group message only when someone in the conversation reports it, when an automatic check flags it, or
 * under a safety review: a superadmin letting one staff member read one account's letters and private chats,
 * read-only, for 24 hours, for a reason from a fixed list. Each reading is on the Access log, which every admin can
 * see; what was read never is.
 */
import type { LetterDecor } from './letter-paper.js';

export const SAFETY_REVIEW_REASONS = ['child_safety', 'threat_to_life', 'legal_request', 'report_context'] as const;
export type SafetyReviewReason = (typeof SAFETY_REVIEW_REASONS)[number];

/** How the console names each reason, and when it applies. */
export const SAFETY_REVIEW_REASON_INFO: Readonly<Record<SafetyReviewReason, { label: string; hint: string }>> = {
  child_safety: {
    label: 'Child safety',
    hint: 'A child or teen may be at risk, for example from grooming or sexual content.',
  },
  threat_to_life: {
    label: 'A threat to someone’s life or safety',
    hint: 'Someone may be hurt, or may hurt themselves or someone else.',
  },
  legal_request: {
    label: 'A legal request from the authorities',
    hint: 'A valid order or request from the police or a court. Put its reference in the note.',
  },
  report_context: {
    label: 'A report that needs more context',
    hint: 'A case cannot be decided from what was reported and the few letters or messages around it. Name the open case: the review opens only its conversation.',
  },
};

export function isSafetyReviewReason(value: unknown): value is SafetyReviewReason {
  return typeof value === 'string' && (SAFETY_REVIEW_REASONS as readonly string[]).includes(value);
}

/** How long a safety review stays open; it cannot be made longer, only ended sooner. */
export const SAFETY_REVIEW_HOURS = 24;
export const SAFETY_REVIEW_NOTE_MIN = 20;
export const SAFETY_REVIEW_NOTE_MAX = 1000;
/** Safety reviews one superadmin may open in 24 hours. */
export const SAFETY_REVIEWS_PER_DAY = 5;
/** Letters or messages one page of a conversation holds. */
export const SAFETY_REVIEW_PAGE = 50;
/** Pages of conversations one reader may open in an hour: a person reading, never a copy being taken. */
export const SAFETY_REVIEW_READS_PER_HOUR = 120;
/** A moderator opening the same case again within this many minutes is one reading on the Access log. */
export const CASE_READ_MINUTES = 15;

/**
 * What a safety review can open: a correspondence of letters (by its id), the account's own letters not in one yet
 * (`birds`, by the account's id), the direct messages with one friend (by the friend's id), and a group's chat. A
 * review for a report that needs more context opens only the conversation of its case.
 */
export const REVIEW_CONVERSATION_KINDS = ['letters', 'birds', 'direct', 'group'] as const;
export type ReviewConversationKind = (typeof REVIEW_CONVERSATION_KINDS)[number];

export interface AccessPerson {
  id: string;
  /** null once the account is gone */
  username: string | null;
}

export interface SafetyReview {
  id: string;
  subject: AccessPerson;
  reviewer: AccessPerson;
  grantedBy: AccessPerson;
  reason: SafetyReviewReason;
  /** why, in the superadmin's words; null for anyone but superadmins and the reader, who see the reason alone */
  note: string | null;
  /** the case it is about; null as the note is */
  caseId: string | null;
  grantedAt: string;
  expiresAt: string;
  endedAt: string | null;
  endedBy: AccessPerson | null;
  /** not ended and not past its 24 hours */
  open: boolean;
  /** the account asking is the one who reads it */
  yours: boolean;
}

export interface ReviewConversation {
  kind: ReviewConversationKind;
  id: string;
  /** the pen pal or friend; null for a group, and for the account's own letters not in a correspondence */
  with: AccessPerson | null;
  /** a group's name */
  title: string | null;
  messages: number;
  firstAt: string | null;
  lastAt: string | null;
}

/** `GET /admin/safety-reviews/:id`: the review and what it can open, without a word of any message. */
export interface ReviewOpened {
  review: SafetyReview;
  conversations: ReviewConversation[];
}

export interface ReviewMessage {
  id: string;
  /** null once the account is gone */
  sender: AccessPerson | null;
  /** written by the account under review */
  fromSubject: boolean;
  /** 'letter', or a chat message's kind: 'text', 'gift' or 'game' */
  kind: string;
  /** null for a message that was deleted: a review never shows what someone took back */
  body: string | null;
  createdAt: string;
  /** a letter's status; 'deleted' or 'removed' for a chat message its sender deleted or moderation took down */
  status: string | null;
  /** a letter's paper, drawing and notes; null for plain paper */
  decor?: LetterDecor | null;
}

/** `GET /admin/safety-reviews/:id/conversations/:kind/:conversationId`, a page at a time, oldest first within it. */
export interface ReviewConversationPage {
  conversation: ReviewConversation;
  messages: ReviewMessage[];
  /** pass back as `before` for the page before; null at the start of the conversation */
  olderCursor: string | null;
}

/** `POST /admin/users/:id/safety-reviews` */
export interface GrantSafetyReviewRequest {
  reason: SafetyReviewReason;
  note: string;
  /** who reads: a staff member who moderates; the superadmin granting it when left out */
  reviewerId?: string;
  /** the case it is about; required for `report_context` */
  caseId?: string;
}

export const ACCESS_LOG_KINDS = ['granted', 'ended', 'listed', 'read', 'case'] as const;
export type AccessLogKind = (typeof ACCESS_LOG_KINDS)[number];

/** Why staff could read at all: a safety review, a report from someone in the conversation, or an automatic flag. */
export type AccessBasis = 'safety_review' | 'report' | 'flag';

/** One line of the Access log. */
export interface AccessLogEntry {
  id: string;
  at: string;
  kind: AccessLogKind;
  /** who opened or granted */
  staff: AccessPerson;
  /** whose letters or messages */
  subject: AccessPerson | null;
  basis: AccessBasis;
  /** for a safety review: why, by whom and until when; the note only for superadmins */
  review: { id: string; reason: SafetyReviewReason; note: string | null; reviewer: AccessPerson; grantedBy: AccessPerson; expiresAt: string } | null;
  /** only for superadmins: a case id would tie a reporter's review to the person they reported */
  caseId: string | null;
  /** which kind of conversation was read, never with whom: the audit trail, for superadmins, has which one */
  conversation: { kind: ReviewConversationKind } | null;
  /** how many letters or messages a page showed */
  messages: number | null;
}

/** `GET /admin/message-access/log`: the reviews open now, then the log, newest first. */
export interface AccessLogPage {
  open: SafetyReview[];
  entries: AccessLogEntry[];
  /** pass back as `before` for older entries; null at the end */
  nextCursor: string | null;
}

/*
 * The routes, all under the admin console's second factor:
 *   POST /admin/users/:id/safety-reviews                 superadmin; GrantSafetyReviewRequest → 201 { review: SafetyReview }
 *        (403 FORBIDDEN for anyone else; 400 NOTE_REQUIRED; 404 NOT_FOUND; 409 REVIEW_OPEN; 422 OWN_MESSAGES,
 *         NOTHING_TO_REVIEW, REVIEWER_NOT_STAFF, REVIEWER_INVOLVED, CASE_REQUIRED, CASE_NOT_ABOUT_ACCOUNT, CASE_CLOSED,
 *         CASE_NO_CONVERSATION; 429 REVIEW_LIMIT)
 *   GET  /admin/safety-reviews                           moderators; → { reviews: SafetyReview[] } (open ones)
 *   POST /admin/safety-reviews/:id/end                   its reader or a superadmin → { review: SafetyReview } (403; 409 REVIEW_ENDED)
 *   GET  /admin/safety-reviews/:id                       its reader, while open → ReviewOpened
 *        (403 REVIEWER_INVOLVED once the reader writes with the account; 410 REVIEW_ENDED after)
 *   GET  /admin/safety-reviews/:id/conversations/:kind/:conversationId?before=  its reader, while open → ReviewConversationPage
 *        (404 for a conversation or a `before` not in it; 429 READ_LIMIT past SAFETY_REVIEW_READS_PER_HOUR)
 *   GET  /admin/message-access/log?before=               every admin → AccessLogPage (notes and cases for superadmins only)
 */
