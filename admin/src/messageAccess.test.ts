import { describe, expect, it } from 'vitest';
import type { AccessLogEntry } from '@kurda/shared';
import { accessWhat, accessWhy, conversationName, countText, reviewDraftProblems } from './messageAccess';

const CASE = '5b0e2a1c-1111-4c2d-9e3f-000000000001';

function entry(over: Partial<AccessLogEntry> = {}): AccessLogEntry {
  return {
    id: 'e-1',
    at: new Date().toISOString(),
    kind: 'read',
    staff: { id: 'm-1', username: 'rojin' },
    subject: { id: 'u-1', username: 'baran' },
    basis: 'safety_review',
    review: {
      id: 'rv-1',
      reason: 'child_safety',
      note: 'A report says an adult asks a teen to meet in secret.',
      reviewer: { id: 'm-1', username: 'rojin' },
      grantedBy: { id: 'o-1', username: 'owner' },
      expiresAt: new Date().toISOString(),
    },
    caseId: null,
    conversation: { kind: 'letters' },
    messages: 2,
    ...over,
  };
}

describe('the Access log, in words', () => {
  it('says what was read without saying with whom', () => {
    expect(accessWhat(entry())).toBe('Read 2 letters in a correspondence of letters');
    expect(accessWhat(entry({ conversation: { kind: 'direct' }, messages: 1 }))).toBe('Read 1 message in direct messages');
    expect(accessWhat(entry({ conversation: { kind: 'group' }, messages: 50 }))).toBe('Read 50 messages in a group chat');
    expect(accessWhat(entry({ kind: 'listed', conversation: null, messages: null }))).toBe('Looked at the list of their conversations');
  });

  it('names who a review was opened for, when it was someone else', () => {
    expect(accessWhat(entry({ kind: 'granted', staff: { id: 'o-1', username: 'owner' } }))).toBe('Opened a safety review for @rojin to read');
    expect(accessWhat(entry({ kind: 'granted', staff: { id: 'm-1', username: 'rojin' } }))).toBe('Opened a safety review to read');
    expect(accessWhat(entry({ kind: 'ended' }))).toBe('Ended a safety review early');
  });

  it('says why: the review’s reason, a report from the conversation, or an automatic flag', () => {
    expect(accessWhy(entry())).toBe('Child safety');
    expect(accessWhy(entry({ kind: 'case', basis: 'report', review: null, caseId: CASE }))).toBe('Someone in the conversation reported it');
    expect(accessWhat(entry({ kind: 'case', basis: 'report', review: null, caseId: CASE }))).toBe('Read a reported letter or message in its case');
    expect(accessWhy(entry({ kind: 'case', basis: 'flag', review: null, caseId: CASE }))).toBe('An automatic safety check flagged it');
  });

  it('names a conversation of a review, and counts what it holds', () => {
    expect(conversationName({ kind: 'letters', with: { id: 'u-2', username: 'dilan' }, title: null })).toBe('Letters with @dilan');
    expect(conversationName({ kind: 'direct', with: { id: 'u-2', username: null }, title: null })).toBe('Messages with a deleted account');
    expect(conversationName({ kind: 'group', with: null, title: 'Kurmancî beginners' })).toBe('Group: Kurmancî beginners');
    expect(conversationName({ kind: 'birds', with: null, title: null })).toBe('Their letters not yet answered');
    expect(countText('birds', 1)).toBe('1 letter');
    expect(countText('group', 3)).toBe('3 messages');
  });
});

describe('opening a review', () => {
  const ready = { subjectId: 'u-1', reason: 'threat_to_life' as const, note: 'Says in a letter they will hurt their sister tonight.', caseId: '' };

  it('needs the account, a reason and a real note', () => {
    expect(reviewDraftProblems(ready)).toEqual({});
    expect(reviewDraftProblems({ subjectId: null, reason: '', note: 'why', caseId: '' })).toEqual({
      subjectId: 'Find the account first.',
      reason: 'Choose the reason.',
      note: 'Say why in at least 20 characters.',
    });
  });

  it('asks for the case when a report needs more context, and a whole id when one is given', () => {
    expect(reviewDraftProblems({ ...ready, reason: 'report_context' }).caseId).toBe('Name the case that needs more context.');
    expect(reviewDraftProblems({ ...ready, reason: 'report_context', caseId: CASE })).toEqual({});
    expect(reviewDraftProblems({ ...ready, caseId: '5b0e2a1c' }).caseId).toBe('A whole case id, as the case page shows it.');
  });
});
