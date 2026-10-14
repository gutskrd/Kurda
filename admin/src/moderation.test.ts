// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  caseNotice,
  categoryName,
  contentTarget,
  decisionRequest,
  defaultStatement,
  draftProblems,
  durationName,
  durationShort,
  filtersFrom,
  filtersQuery,
  historyLine,
  humanize,
  initialDraft,
  liftEffect,
  mediaKind,
  neighbourCase,
  newAction,
  noticeFields,
  policyOptions,
  queueOrder,
  queuePath,
  rememberQueueOrder,
  sanctionPeriod,
  slaState,
  statusName,
  withDuration,
  withKind,
  withPolicy,
  type DecisionDraft,
} from './moderation';

afterEach(() => sessionStorage.clear());

describe('names', () => {
  it('names every rule briefly, and a rule this build does not know by its key', () => {
    expect(categoryName('child_safety')).toBe('Child safety');
    expect(categoryName('harassment')).toBe('Bullying or harassment');
    expect(categoryName('copyright')).toBe('Copyright');
    expect(categoryName(null)).toBe('No rule given');
    expect(statusName('needs_second_approval')).toBe('Waiting for a second admin');
    expect(humanize('rightsHolder_name')).toBe('Rights holder name');
  });

  it('offers every rule as a policy, and the case’s own when it is new to this build', () => {
    const plain = policyOptions('harassment');
    expect(plain.map((o) => o.value)).toEqual(['child_safety', 'self_harm', 'violence', 'sexual', 'hate', 'private_info', 'harassment', 'spam', 'impersonation', 'other']);
    expect(plain[0]!.label).toBe('Child safety · urgent');
    expect(policyOptions('copyright').at(-1)).toEqual({ value: 'copyright', label: 'Copyright' });
  });

  it('knows which cases are about a piece of content that can come down', () => {
    expect(contentTarget('library_post')).toBe(true);
    expect(contentTarget('dm_message')).toBe(true);
    expect(contentTarget('user')).toBe(false);
    expect(contentTarget('game_player')).toBe(false);
    expect(contentTarget(null)).toBe(false);
    expect(contentTarget(null, 'image_flag')).toBe(true);
  });

  it('says lengths the way the presets show them', () => {
    expect([24, 72, 168, 720, null].map(durationShort)).toEqual(['24 h', '3 d', '7 d', '30 d', 'Permanent']);
    expect(durationName(72)).toBe('3 days');
    expect(durationName(24)).toBe('24 hours');
    expect(durationName(5)).toBe('5 hours');
  });
});

describe('the service level', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  it('says how long is left, and warns in the last quarter', () => {
    expect(slaState({ slaDueAt: '2026-10-14T12:00:00Z', slaBreached: false, status: 'open', priority: 1 }, now)).toEqual({ text: 'Due in 24 h', tone: 'neutral' });
    expect(slaState({ slaDueAt: '2026-10-13T15:00:00Z', slaBreached: false, status: 'in_review', priority: 1 }, now)).toEqual({ text: 'Due in 3 h', tone: 'warn' });
  });
  it('says how late an overdue case is, and nothing for a closed one', () => {
    expect(slaState({ slaDueAt: '2026-10-13T10:00:00Z', slaBreached: true, status: 'open', priority: 0 }, now)).toEqual({ text: 'Overdue by 2 h', tone: 'bad' });
    expect(slaState({ slaDueAt: '2026-10-13T10:00:00Z', slaBreached: false, status: 'actioned', priority: 0 }, now)).toBeNull();
  });
});

describe('the queue in the address', () => {
  it('reads filters from the address and writes back only what differs from the defaults', () => {
    const f = filtersFrom(new URLSearchParams('priority=0&source=bots'));
    expect(f).toEqual({ status: 'open', priority: '0', category: '', source: 'bots', q: '' });
    expect(filtersQuery(f)).toBe('priority=0&source=bots');
    expect(filtersQuery({ ...f, status: 'closed', q: '  heval ' })).toBe('status=closed&priority=0&source=bots&q=heval');
  });

  it('asks the API for open cases by default, a page at a time, from a cursor', () => {
    const f = filtersFrom(new URLSearchParams(''));
    expect(queuePath(f)).toBe('/admin/moderation/queue?status=open&limit=50');
    expect(queuePath({ ...f, category: 'hate' }, 'abc')).toBe('/admin/moderation/queue?category=hate&status=open&limit=50&cursor=abc');
  });

  it('remembers the order for j and k, and stops at either end', () => {
    rememberQueueOrder(['a', 'b', 'c'], 'priority=0');
    expect(queueOrder()).toEqual({ ids: ['a', 'b', 'c'], query: 'priority=0' });
    expect(neighbourCase('b', 1)).toBe('c');
    expect(neighbourCase('b', -1)).toBe('a');
    expect(neighbourCase('c', 1)).toBeNull();
    expect(neighbourCase('zzz', 1)).toBeNull();
  });
});

describe('a decision being put together', () => {
  const ban = (d: DecisionDraft): DecisionDraft => ({ ...d, actions: [newAction('subject', 'chat_mute', d.policy)] });

  it('writes a statement naming the rule, and rewrites it when the rule changes unless it was typed', () => {
    let d = ban(initialDraft('harassment'));
    expect(d.actions[0]!.statement).toBe('Your messages broke Hevalo’s rule on bullying and harassment.');
    d = withPolicy(d, 'hate');
    expect(d.actions[0]!.statement).toBe('Your messages broke Hevalo’s rule on hate.');
    d = { ...d, actions: [{ ...d.actions[0]!, statement: 'My own words.', statementEdited: true }] };
    expect(withPolicy(d, 'spam').actions[0]!.statement).toBe('My own words.');
  });

  it('tells a false reporter about reporting, not about the rule they reported', () => {
    expect(newAction('reporter:r1', 'warning', 'child_safety').statement).toMatch(/report button is for real problems/);
    expect(defaultStatement('caring_message', 'self_harm')).toBe('');
  });

  it('turns an endless suspension into a permanent ban, and a ban with a length into a suspension', () => {
    expect(withDuration('suspension', null)).toEqual({ kind: 'permanent_ban', durationHours: null });
    expect(withDuration('permanent_ban', 72)).toEqual({ kind: 'suspension', durationHours: 72 });
    expect(withDuration('chat_mute', null)).toEqual({ kind: 'chat_mute', durationHours: null });
  });

  it('carries a length over to another kind that can have it', () => {
    const mute = { ...newAction('subject', 'chat_mute', 'spam'), durationHours: 168 };
    expect(withKind(mute, 'post_mute', 'spam').durationHours).toBe(168);
    expect(withKind(mute, 'warning', 'spam').durationHours).toBeNull();
    expect(withKind({ ...mute, durationHours: null }, 'suspension', 'spam').durationHours).toBe(168);
    expect(withKind(mute, 'permanent_ban', 'spam').durationHours).toBeNull();
  });

  it('becomes the request the API takes: lengths only where they mean something', () => {
    const d: DecisionDraft = {
      ...initialDraft('harassment'),
      actions: [
        { ...newAction('subject', 'suspension', 'harassment'), durationHours: 72 },
        newAction('reporter:7d1c2c1e-0000-4000-8000-000000000001', 'warning', 'harassment'),
        newAction('subject', 'permanent_ban', 'harassment'),
      ],
      removeContent: true,
      note: '  seen twice  ',
    };
    const req = decisionRequest(d, { preview: true });
    expect(req).toMatchObject({ outcome: 'actioned', policy: 'harassment', removeContent: true, notifyReporters: true, note: 'seen twice', preview: true });
    expect(req.actions[0]).toEqual({ target: 'subject', kind: 'suspension', durationHours: 72, statement: 'Your account broke Hevalo’s rule on bullying and harassment.' });
    expect(req.actions[1]).not.toHaveProperty('durationHours');
    expect(req.actions[2]).not.toHaveProperty('durationHours');
    expect(decisionRequest({ ...d, outcome: 'no_violation' }).removeContent).toBe(false);
    expect(decisionRequest(d, { confirmUsername: 'heval' }).confirmUsername).toBe('heval');
  });

  it('says what is plainly missing before asking the server', () => {
    expect(draftProblems({ ...initialDraft(null) })).toEqual(['Choose the rule that was broken.', 'Add an action, or remove the content.']);
    expect(draftProblems({ ...initialDraft('spam'), removeContent: true })).toEqual([]);
    const blank = { ...newAction('subject', 'warning', 'spam'), statement: ' ' };
    expect(draftProblems({ ...initialDraft('spam'), actions: [blank] }, () => '@heval')).toEqual(['Write what @heval will be told.']);
    const sanctionAtRisk = { ...initialDraft('self_harm'), actions: [newAction('subject', 'chat_mute', 'self_harm')] };
    expect(draftProblems(sanctionAtRisk)).toContain('Someone who may hurt themselves gets a caring message, not a sanction.');
    expect(draftProblems({ ...initialDraft('self_harm'), actions: [newAction('subject', 'caring_message', 'self_harm')] })).toEqual([]);
    const cleared = { ...initialDraft('spam'), outcome: 'no_violation' as const, actions: [newAction('subject', 'warning', 'spam')] };
    expect(draftProblems(cleared)[0]).toMatch(/can’t sanction the reported person/);
    const falseReport = { ...initialDraft('spam'), outcome: 'no_violation' as const, actions: [newAction('reporter:r1', 'warning', 'spam')] };
    expect(draftProblems(falseReport)).toEqual([]);
  });
});

describe('sanctions and history', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const base = { startsAt: '2026-10-10T12:00:00Z', endsAt: null, revokedAt: null, active: true, pendingApproval: false };
  it('says where a sanction stands', () => {
    expect(sanctionPeriod({ ...base, kind: 'permanent_ban' }, now)).toBe('No end');
    expect(sanctionPeriod({ ...base, kind: 'permanent_ban', pendingApproval: true }, now)).toBe('Waiting for a second admin');
    expect(sanctionPeriod({ ...base, kind: 'warning' }, now)).toMatch(/^Given /);
    expect(sanctionPeriod({ ...base, kind: 'chat_mute', revokedAt: '2026-10-12T12:00:00Z', active: false }, now)).toMatch(/^Lifted /);
    expect(sanctionPeriod({ ...base, kind: 'chat_mute', endsAt: '2026-10-11T12:00:00Z', active: false }, now)).toMatch(/^Ended /);
    expect(sanctionPeriod({ ...base, kind: 'chat_mute', endsAt: '2026-10-20T12:00:00Z' }, now)).toMatch(/^Until /);
  });

  it('reads the history in words, the request log included', () => {
    expect(historyLine('case_decision')).toBe('Decided');
    expect(historyLine('perm_ban')).toBe('Permanent ban');
    expect(historyLine('POST /admin/moderation/cases/:id/claim')).toBe('Claimed it');
    expect(historyLine('session_revoke')).toBe('Signed out everywhere');
  });

  it('says truthfully what lifting a sanction does', () => {
    // a limit is lifted and the person told (the API sends the notice)
    expect(liftEffect('chat_mute', '@baran')).toBe('@baran is told it was lifted. What it stopped works again at once.');
    expect(liftEffect('permanent_ban', '@baran')).toMatch(/^@baran is told/);
    // a warning or a removal only comes off the record: no notice, and removed content stays hidden
    expect(liftEffect('warning', '@baran')).toBe('It comes off @baran’s record; they are not told.');
    expect(liftEffect('content_removal', '@baran')).toMatch(/content stays hidden/);
  });

  it('tells pictures from voice', () => {
    expect(mediaKind({ key: 'a/b.webp', contentType: null })).toBe('image');
    expect(mediaKind({ key: 'a/b', contentType: 'audio/mp4' })).toBe('audio');
    expect(mediaKind({ key: 'a/b.bin', contentType: null })).toBe('file');
  });
});

describe('a notice that came with a case', () => {
  it('is found on the detail or on its case, whatever its shape', () => {
    expect(caseNotice({ notice: { work: 'My song' } })).toEqual({ work: 'My song' });
    expect(caseNotice({ case: { notice: { work: 'My song' } } })).toEqual({ work: 'My song' });
    expect(caseNotice({ case: {} })).toBeNull();
    expect(caseNotice({ notice: ['x'] })).toBeNull();
  });

  it('lists every field with a readable label, nested ones by their path, empty ones left out', () => {
    const fields = noticeFields({
      claimantName: 'Rojda Ahmed',
      isRightsHolder: true,
      urls: ['https://hevalo.app/p/1', 'https://hevalo.app/p/2'],
      signature: { typedName: 'Rojda Ahmed' },
      phone: null,
      copies: 3,
    });
    expect(fields).toEqual([
      { label: 'Claimant name', value: 'Rojda Ahmed' },
      { label: 'Is rights holder', value: 'Yes' },
      { label: 'Urls', value: 'https://hevalo.app/p/1, https://hevalo.app/p/2' },
      { label: 'Signature › Typed name', value: 'Rojda Ahmed' },
      { label: 'Copies', value: '3' },
    ]);
  });
});
