/**
 * Reading letters and private chats, as the console words it: what each line of the Access log says happened and
 * why, what a conversation of a safety review is called, and what a review being opened still lacks. Kept apart from
 * the pages so they test without a browser; the API checks every rule again.
 */
import {
  SAFETY_REVIEW_NOTE_MAX,
  SAFETY_REVIEW_NOTE_MIN,
  SAFETY_REVIEW_REASON_INFO,
  type AccessLogEntry,
  type ReviewConversation,
  type ReviewConversationKind,
  type SafetyReviewReason,
} from '@kurda/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value.trim());
}

export function reasonLabel(reason: SafetyReviewReason): string {
  return SAFETY_REVIEW_REASON_INFO[reason]?.label ?? reason;
}

const at = (name: string | null | undefined): string => (name ? `@${name}` : 'a deleted account');

/** What one kind of conversation is, said without naming anyone in it. */
const KIND_TEXT: Readonly<Record<ReviewConversationKind, string>> = {
  letters: 'a correspondence of letters',
  birds: 'their own letters not yet in a correspondence',
  direct: 'direct messages',
  group: 'a group chat',
};

/** A conversation as a review lists it: with whom, or the group's name. */
export function conversationName(c: Pick<ReviewConversation, 'kind' | 'with' | 'title'>): string {
  switch (c.kind) {
    case 'letters':
      return `Letters with ${at(c.with?.username)}`;
    case 'birds':
      return 'Their letters not yet answered';
    case 'direct':
      return `Messages with ${at(c.with?.username)}`;
    case 'group':
      return `Group: ${c.title ?? 'a deleted group'}`;
  }
}

/** How many of what a conversation holds: "2 letters", "1 message". */
export function countText(kind: ReviewConversationKind, n: number): string {
  const letters = kind === 'letters' || kind === 'birds';
  const word = letters ? (n === 1 ? 'letter' : 'letters') : n === 1 ? 'message' : 'messages';
  return `${n} ${word}`;
}

/** What a line of the Access log says was done. */
export function accessWhat(e: AccessLogEntry): string {
  switch (e.kind) {
    case 'granted':
      if (e.review && e.review.reviewer.id !== e.staff.id) return `Opened a safety review for ${at(e.review.reviewer.username)} to read`;
      return 'Opened a safety review to read';
    case 'ended':
      return 'Ended a safety review early';
    case 'listed':
      return 'Looked at the list of their conversations';
    case 'read': {
      const kind = e.conversation?.kind ?? 'direct';
      return `Read ${countText(kind, e.messages ?? 0)} in ${KIND_TEXT[kind]}`;
    }
    case 'case':
      return e.basis === 'report' ? 'Read a reported letter or message in its case' : 'Read a flagged letter or message in its case';
  }
}

/** Why it could be read: the review's reason, or the report or flag behind the case. */
export function accessWhy(e: AccessLogEntry): string {
  if (e.basis === 'report') return 'Someone in the conversation reported it';
  if (e.basis === 'flag') return 'An automatic safety check flagged it';
  return e.review ? reasonLabel(e.review.reason) : 'A safety review';
}

export interface ReviewDraft {
  subjectId: string | null;
  reason: SafetyReviewReason | '';
  note: string;
  caseId: string;
}

/** What a review being opened still lacks, by field; empty when it can be sent. */
export function reviewDraftProblems(d: ReviewDraft): Partial<Record<keyof ReviewDraft, string>> {
  const problems: Partial<Record<keyof ReviewDraft, string>> = {};
  if (!d.subjectId) problems.subjectId = 'Find the account first.';
  if (!d.reason) problems.reason = 'Choose the reason.';
  const note = d.note.trim().length;
  if (note < SAFETY_REVIEW_NOTE_MIN) problems.note = `Say why in at least ${SAFETY_REVIEW_NOTE_MIN} characters.`;
  else if (note > SAFETY_REVIEW_NOTE_MAX) problems.note = `Keep it to ${SAFETY_REVIEW_NOTE_MAX} characters.`;
  if (d.caseId.trim() && !isUuid(d.caseId)) problems.caseId = 'A whole case id, as the case page shows it.';
  else if (d.reason === 'report_context' && !d.caseId.trim()) problems.caseId = 'Name the case that needs more context.';
  return problems;
}
