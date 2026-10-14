// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import { ALPHABET_CLIPS } from '@kurda/shared';
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
      on('GET', '/admin/alphabet/audio', json({ recordings: [{ key: ALPHABET_CLIPS[0]!.key }] })),
      on('GET', '/admin/stories', json({ stories: [{ status: 'in_review' }, { status: 'draft' }] })),
      on('GET', '/admin/content/lessons?status=in_review&limit=1', json({ total: 2, lessons: [], skills: [] })),
    );
    show(EDITOR);
    const card = (await screen.findByRole('heading', { name: 'What still needs a recording' })).closest('section')!;
    await waitFor(() => expect(within(card).getByText(`of ${ALPHABET_CLIPS.length} still to record`)).toBeInTheDocument());
    expect(within(card).getByRole('link', { name: 'Record: Alphabet: letters and example words' })).toHaveAttribute('href', '#/audio/letters?show=missing');
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
    expect(screen.getByText(`${ALPHABET_CLIPS.length}`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /lessons in review/i })).toHaveTextContent('0');
  });
});
