// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import { LETTER_CLIPS, WORD_SET_CLIPS } from '@kurda/shared';
import type { Listing } from '../lessonAudio';
import { AuthProvider } from '../auth';
import { SessionProvider, type AdminSession } from '../session';
import { failure, fakeApi, json, on } from '../test/fetch';
import { renderUi } from '../test/render';
import { Dashboard } from './Dashboard';

const EDITOR: AdminSession = {
  roles: ['content_editor'],
  staffRoles: ['content_editor'],
  capabilities: ['content.edit', 'content.publish', 'events.manage'],
  needsEnrollment: false,
  needsVerification: false,
};

const usage = (courseId: string) => ({
  courseId,
  courseTitle: 'x',
  unitId: 'u',
  unitTitle: 'u',
  skillId: 's',
  skillTitle: 's',
  lessonPosition: 1,
  lessonId: 'l',
  lessonTitle: 'l',
  lessonStatus: 'draft' as const,
  lessonVersion: 1,
  live: false,
  exerciseTypes: [],
  listeningNeedsIt: false,
});

const LISTING: Listing = {
  items: [
    { key: 'a', text: 'A', recorded: false, url: null, durationMs: null, updatedAt: null, usedIn: [usage('c1')], unused: false },
    { key: 'b', text: 'B', recorded: true, url: 'u', durationMs: 1, updatedAt: 'x', usedIn: [usage('c1')], unused: false },
    { key: 'c', text: 'C', recorded: false, url: null, durationMs: null, updatedAt: null, usedIn: [usage('stories:kurmanci')], unused: false },
  ],
  summary: { needed: 3, recorded: 1, missing: 2, unused: 0 },
};

function show(session: AdminSession): void {
  renderUi(
    <AuthProvider>
      <SessionProvider value={session}>
        <Dashboard />
      </SessionProvider>
    </AuthProvider>,
  );
}

describe('the dashboard', () => {
  it('shows a content editor what still needs a recording, each line going straight to what is missing', async () => {
    fakeApi(
      on('GET', '/admin/lesson-audio', json(LISTING)),
      on('GET', '/admin/alphabet/audio', json({ recordings: [{ key: LETTER_CLIPS[0]!.key }, { key: WORD_SET_CLIPS[0]!.key }, { key: WORD_SET_CLIPS[1]!.key }] })),
      on('GET', '/admin/stories', json({ stories: [{ status: 'in_review' }, { status: 'draft' }] })),
      on('GET', '/admin/content/lessons?status=in_review&limit=1', json({ total: 2, lessons: [], skills: [] })),
    );
    show(EDITOR);
    const card = (await screen.findByRole('heading', { name: 'What still needs a recording' })).closest('section')!;
    await waitFor(() => expect(within(card).getByText(`of ${LETTER_CLIPS.length} still to record`)).toBeInTheDocument());
    expect(within(card).getByRole('link', { name: 'Record: Alphabet: letters and example words' })).toHaveAttribute('href', '#/audio/letters?show=missing');
    // the colours, numbers, days and months, counted on a line of their own and recorded on the same side
    const words = within(card).getByText('Words to know: colours, numbers, days, months').closest('li')!;
    expect(within(words).getByText(`${WORD_SET_CLIPS.length - 2}`)).toBeInTheDocument();
    expect(within(words).getByText(`of ${WORD_SET_CLIPS.length} still to record`)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Record: Words to know: colours, numbers, days, months' })).toHaveAttribute('href', '#/audio/letters?show=missing');
    expect(within(card).getByRole('link', { name: 'Record: Lesson sentences and words' })).toHaveAttribute('href', '#/audio/lessons?show=missing');
    expect(within(card).getByRole('link', { name: 'Record: Story sentences' })).toHaveAttribute('href', '#/audio/stories?show=missing');
    expect(within(card).getByRole('link', { name: /record what’s missing/i })).toHaveAttribute('href', '#/audio/letters?show=missing');

    // and what is waiting for review, for the pages this role opens — nothing about people or money
    await waitFor(() => expect(screen.getByRole('link', { name: /lessons in review/i })).toHaveTextContent('2'));
    expect(screen.getByRole('link', { name: /stories in review/i })).toHaveTextContent('1');
    expect(screen.queryByText('Moderation')).not.toBeInTheDocument();
    expect(screen.queryByText(/purchases on hold/i)).not.toBeInTheDocument();
  });

  it('keeps every other part when one cannot load', async () => {
    fakeApi(
      on('GET', '/admin/lesson-audio', failure(500, 'INTERNAL', 'boom')),
      on('GET', '/admin/alphabet/audio', json({ recordings: [] })),
      on('GET', '/admin/stories', json({ stories: [] })),
      on('GET', '/admin/content/lessons?status=in_review&limit=1', json({ total: 0, lessons: [], skills: [] })),
    );
    show(EDITOR);
    await waitFor(() => expect(screen.getAllByText('Could not count these.')).toHaveLength(2));
    expect(screen.getByText(`${LETTER_CLIPS.length}`)).toBeInTheDocument();
    expect(screen.getByText(`${WORD_SET_CLIPS.length}`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /lessons in review/i })).toHaveTextContent('0');
  });
});

describe('the dashboard’s ranks and leagues', () => {
  const ADMIN: AdminSession = { roles: [], staffRoles: ['admin'], capabilities: ['moderation.act'], needsEnrollment: false, needsVerification: false };
  const run = (over: object) => ({ kind: 'settle', weekKey: '2026-10-12', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), attempts: 1, lastError: null, result: {}, ...over });
  const pair = (score: number) => ({ game: 'wordle-battle', a: { userId: 'a', username: 'a' }, b: { userId: 'b', username: 'b' }, games: 6, aWins: 6, bWins: 0, draws: 0, peak24h: 6, sharedDevice: true, sharedIp: false, lastGameAt: new Date().toISOString(), score });

  it('says whether this week’s settle and merge went through, and how many rating pairs are worth a look', async () => {
    fakeApi(
      on('GET', '/admin/leagues', json({ weekKey: '2026-10-12', goalXp: 150, settle: run({}), closedBy: null, merge: run({ kind: 'merge', finishedAt: null, lastError: 'boom' }), groups: [{ id: 'g', tier: 'cem', members: 9, active: 9, xpBand: 0, tzOffsetMin: 0, settled: false, mergedInto: null }], tiers: {} })),
      on('GET', '/admin/ranks/suspicious-pairs', json({ pairs: [pair(7), pair(2)] })),
    );
    show(ADMIN);
    const settle = await screen.findByRole('link', { name: /this week’s settle/i });
    await waitFor(() => expect(settle).toHaveTextContent('Done'));
    expect(settle).toHaveAttribute('href', '#/leagues');
    const merge = screen.getByRole('link', { name: /wednesday merge/i });
    expect(merge).toHaveTextContent('Failed');
    expect(merge).toHaveTextContent('1 group this week');
    const pairs = screen.getByRole('link', { name: /rating pairs to check/i });
    await waitFor(() => expect(pairs).toHaveTextContent('2'));
    expect(pairs).toHaveTextContent('1 with strong signals');
    expect(pairs).toHaveAttribute('href', '#/ranks/pairs');
  });

  it('leaves them out for a role that cannot open those pages', async () => {
    fakeApi(on('GET', '/admin/lesson-audio', json(LISTING)), on('GET', '/admin/alphabet/audio', json({ recordings: [] })));
    show(EDITOR);
    await screen.findByRole('heading', { name: 'What still needs a recording' });
    expect(screen.queryByRole('heading', { name: 'Ranks and leagues' })).not.toBeInTheDocument();
  });
});

describe('the dashboard’s security line', () => {
  const OWNER: AdminSession = { roles: ['superadmin'], staffRoles: ['superadmin'], capabilities: [], needsEnrollment: false, needsVerification: false };

  it('puts what the security log wants looked at first, for a superadmin', async () => {
    fakeApi(
      on('GET', '/admin/security/summary', json({ open: { warning: 2, critical: 1 }, failedSignIns: { now: 40, before: 12 } })),
      on('GET', /^\/admin\/audit/, json({ entries: [] })),
    );
    show(OWNER);
    const attention = await screen.findByRole('link', { name: /needs attention/i });
    expect(attention).toHaveTextContent('3');
    expect(attention).toHaveTextContent('1 critical: look now');
    expect(attention).toHaveAttribute('href', '#/security-log');
    expect(screen.getByRole('link', { name: /failed sign-ins/i })).toHaveTextContent('12 the day before');
  });

  it('is not there for a role that cannot open the security log', async () => {
    fakeApi(on('GET', '/admin/lesson-audio', json(LISTING)), on('GET', '/admin/alphabet/audio', json({ recordings: [] })));
    show(EDITOR);
    await screen.findByRole('heading', { name: 'What still needs a recording' });
    expect(screen.queryByRole('heading', { name: 'Security' })).not.toBeInTheDocument();
  });
});
