import { describe, expect, it } from 'vitest';
import { HELPLINE_URL } from '@kurda/shared';
import { appealDecidedNotice, caringMessage, formatUtc, reportOutcomeNotice, sanctionLiftedNotice, sanctionNotice } from './notices.js';

describe('sanction notices (the statement of reasons)', () => {
  const base = {
    sanctionId: 's1',
    policy: 'harassment' as const,
    statement: 'You sent the same insult to several people.',
    origin: 'report' as const,
    reviewedByPerson: true,
  };

  it('says what, which rule, until when, where it came from, and how to ask for a review', () => {
    const n = sanctionNotice({ ...base, kind: 'chat_mute', endsAt: new Date('2026-10-14T18:00:00Z') });
    expect(n.title).toBe("You can't send messages for a while");
    expect(n.body).toContain('You sent the same insult to several people.');
    expect(n.body).toContain("You can't send direct or group messages until 14 Oct 2026, 18:00 UTC.");
    expect(n.body).toContain('The rule: Bullying or harassment.');
    expect(n.body).toContain('This came from a report by another member, and a person reviewed it.');
    expect(n.body).toContain('ask for a review');
    expect(n.data).toEqual({ kind: 'sanction', sanctionId: 's1', sanction: 'chat_mute', policy: 'harassment', until: '2026-10-14T18:00:00.000Z' });
  });

  it('says when nobody has looked yet, and when there is no end', () => {
    const n = sanctionNotice({ ...base, kind: 'post_mute', endsAt: null, origin: 'automatic', reviewedByPerson: false });
    expect(n.body).toContain('with no end date');
    expect(n.body).toContain('This came from our automatic checks. No person has reviewed it yet.');
    expect(n.data).toMatchObject({ until: null });
  });

  it('tells someone whose post was taken down for copyright about the counter-notice', () => {
    const n = sanctionNotice({ ...base, policy: 'copyright', kind: 'content_removal', endsAt: null });
    expect(n.body).toContain('The rule: Copies someone else’s work.');
    expect(n.body).toContain('This came from a copyright complaint, and a person reviewed it.');
    expect(n.body).toContain('counter-notice from hevalo.app/copyright');
    expect(n.body).not.toContain('another member');
  });

  it('has a title and plain words for every kind', () => {
    for (const kind of ['warning', 'content_removal', 'feature_limit', 'suspension', 'permanent_ban'] as const) {
      const n = sanctionNotice({ ...base, kind, endsAt: kind === 'suspension' ? new Date('2026-10-20T00:00:00Z') : null });
      expect(n.title.length, kind).toBeGreaterThan(5);
      expect(n.body, kind).toContain('The rule:');
    }
  });
});

describe('what a reporter is told', () => {
  it('never says what the other person got', () => {
    const actioned = reportOutcomeNotice('actioned', ['r1']);
    expect(actioned.body).toBe('We took action. Thanks for keeping Hevalo safe.');
    expect(actioned.data).toEqual({ kind: 'report_outcome', reportIds: ['r1'], outcome: 'actioned' });
    const none = reportOutcomeNotice('no_violation', ['r2']);
    expect(none.body).toContain("doesn't break our rules");
    expect(none.body).toContain('block or mute');
    for (const n of [actioned, none]) expect(n.body).not.toMatch(/mute(d)? for|banned|suspended/i);
  });
});

describe('the caring message', () => {
  it('points to a helpline, with the admin’s own words first', () => {
    const n = caringMessage('We read your message and we are worried about you.');
    expect(n.body.startsWith('We read your message')).toBe(true);
    expect(n.body).toContain(HELPLINE_URL);
    expect(n.data).toEqual({ kind: 'caring_message', helplineUrl: HELPLINE_URL });
    expect(caringMessage(null).body).toContain(HELPLINE_URL);
  });
});

describe('other notices', () => {
  it('tells a person about a lifted restriction and an answered appeal', () => {
    expect(sanctionLiftedNotice('s9').data).toEqual({ kind: 'sanction_lifted', sanctionId: 's9' });
    const n = appealDecidedNotice('a1', 'overturned', 'The message was a quote.');
    expect(n.body).toContain('reversed our decision');
    expect(n.body).toContain('The message was a quote.');
    expect(appealDecidedNotice('a1', 'upheld', 'x').body).toContain('Our decision stands');
  });

  it('formats a time without depending on the server’s zone', () => {
    expect(formatUtc(new Date('2026-01-05T07:03:00Z'))).toBe('5 Jan 2026, 07:03 UTC');
  });
});
