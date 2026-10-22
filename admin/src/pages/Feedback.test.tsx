// @vitest-environment jsdom
/**
 * The feedback inbox, against a fake API: the summary, the filters in the
 * address, and what marking, archiving and a note send.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { AdminFeedbackItem, AdminFeedbackSummary } from '@kurda/shared';
import { setToken } from '../api';
import { failure, fakeApi, json, on, type Call, type Route } from '../test/fetch';
import { renderUi } from '../test/render';
import { Feedback, feedbackFilters, feedbackPath, feedbackQuery } from './Feedback';

const summary: AdminFeedbackSummary = {
  total: { count: 40, averageStars: 4.1, distribution: [2, 3, 5, 10, 20] },
  last30Days: { count: 12, averageStars: 3.8, distribution: [1, 2, 1, 3, 5] },
  daily: [
    { day: '2026-10-12', count: 3, averageStars: 4 },
    { day: '2026-10-13', count: 0, averageStars: null },
    { day: '2026-10-14', count: 2, averageStars: 2.5 },
  ],
  byStatus: { new: 4, read: 30, archived: 6 },
  byCategory: { lessons: 2, games: 0, stories: 0, bugs: 3, too_hard: 1, too_easy: 0, other: 0 },
};

function item(over: Partial<AdminFeedbackItem> = {}): AdminFeedbackItem {
  return {
    id: 'fb-1',
    user: { id: 'u-1', username: 'rojin' },
    stars: 2,
    categories: ['bugs', 'too_hard'],
    comment: 'The Peyvok keyboard has no ê on my phone.',
    source: 'first_game',
    platform: 'android',
    appVersion: '1.8.0',
    locale: 'en',
    status: 'new',
    adminNote: null,
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    ...over,
  };
}

function show(hash: string, ...routes: Route[]): ReturnType<typeof fakeApi> {
  setToken('tok');
  location.hash = hash;
  const api = fakeApi(on('GET', '/admin/feedback/summary', json(summary)), ...routes);
  renderUi(<Feedback />);
  return api;
}

const patches = (calls: Call[]): Call[] => calls.filter((c) => c.method === 'PATCH');

afterEach(() => {
  setToken(null);
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('the filters', () => {
  it('read from the address, the inbox by default, and go back to it without the defaults', () => {
    const f = feedbackFilters(new URLSearchParams('stars=2,1,9&category=bugs&platform=ios&q=wordle'));
    expect(f).toEqual({ status: 'new', stars: [1, 2], category: 'bugs', platform: 'ios', q: 'wordle' });
    expect(feedbackQuery(f)).toBe('stars=1%2C2&category=bugs&platform=ios&q=wordle');
    expect(feedbackFilters(new URLSearchParams('status=nonsense&category=nope')).status).toBe('new');
  });

  it('ask the API for a page, with no status for "all"', () => {
    const f = feedbackFilters(new URLSearchParams('status=all&stars=1'));
    expect(feedbackPath(f)).toBe('/admin/feedback?stars=1&limit=50');
    expect(feedbackPath(feedbackFilters(new URLSearchParams('')), 'fb-50')).toBe('/admin/feedback?status=new&limit=50&beforeId=fb-50');
  });
});

describe('the inbox', () => {
  it('shows the average, the spread of stars and every new answer with who sent it from where', async () => {
    show('#/feedback', on('GET', /^\/admin\/feedback\?/, json({ items: [item()], total: 1 })));
    expect(await screen.findByText('The Peyvok keyboard has no ê on my phone.')).toBeInTheDocument();
    expect(screen.getByText('3.8')).toBeInTheDocument();
    const dist = screen.getByRole('list', { name: 'Answers by stars, last 30 days' });
    expect(within(dist).getAllByRole('listitem')[0]).toHaveTextContent('5 ★5 with 5 stars');
    const row = within(screen.getByRole('list', { name: 'Feedback' })).getAllByRole('listitem')[0]!;
    expect(within(row).getByRole('img', { name: '2 of 5 stars' })).toBeInTheDocument();
    expect(within(row).getByText('Bugs')).toBeInTheDocument();
    expect(within(row).getByText('Too hard')).toBeInTheDocument();
    expect(within(row).getByText('Android 1.8.0')).toBeInTheDocument();
    expect(within(row).getByText('After their first game')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: '@rojin' })).toHaveAttribute('href', '#/users/u-1');
    expect(screen.getByRole('tab', { name: /New\s*4/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('filters by stars and category through the address, and asks the API for them', async () => {
    const user = userEvent.setup();
    const { calls } = show('#/feedback', on('GET', /^\/admin\/feedback\?/, json({ items: [], total: 0 })));
    expect(await screen.findByText('Nothing new')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '1 ★ star' }));
    await waitFor(() => expect(location.hash).toBe('#/feedback?stars=1'));
    await user.click(screen.getByRole('button', { name: '2 ★ stars' }));
    await user.selectOptions(screen.getByLabelText('Category'), 'bugs');
    await waitFor(() => expect(location.hash).toBe('#/feedback?stars=1%2C2&category=bugs'));
    await waitFor(() => expect(calls.some((c) => c.path === '/admin/feedback?status=new&stars=1%2C2&category=bugs&limit=50')).toBe(true));
    expect(await screen.findByText('No answer matches these filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(location.hash).toBe('#/feedback'));
  });

  it('marks an answer read and archives one, in place', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/feedback',
      on('GET', /^\/admin\/feedback\?/, json({ items: [item()], total: 1 })),
      on('PATCH', '/admin/feedback/fb-1', (c) => json({ ...item(), ...(c.body as object) })),
    );
    await user.click(await screen.findByRole('button', { name: 'Mark read' }));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0]!.body).toEqual({ status: 'read' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark read' })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(patches(calls)).toHaveLength(2));
    expect(patches(calls)[1]!.body).toEqual({ status: 'archived' });
    expect(await screen.findByRole('button', { name: 'Unarchive' })).toBeInTheDocument();
  });

  it('keeps a private note, and clears it when emptied', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/feedback',
      on('GET', /^\/admin\/feedback\?/, json({ items: [item()], total: 1 })),
      on('PATCH', '/admin/feedback/fb-1', (c) => json({ ...item(), ...(c.body as object) })),
    );
    await user.click(await screen.findByRole('button', { name: 'Add note' }));
    const ask = await screen.findByRole('dialog', { name: 'Add a note' });
    await user.type(within(ask).getByLabelText('Note (only admins see it)'), 'Filed as bug 812.');
    await user.click(within(ask).getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0]!.body).toEqual({ adminNote: 'Filed as bug 812.' });
    expect(await screen.findByText('Filed as bug 812.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit note' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit the note' });
    await user.clear(within(edit).getByLabelText('Note (only admins see it)'));
    await user.click(within(edit).getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(patches(calls)).toHaveLength(2));
    expect(patches(calls)[1]!.body).toEqual({ adminNote: null });
  });

  it('pages on after the last answer shown, so answers marked read on the way skip none', async () => {
    const user = userEvent.setup();
    const marked = (c: Call) => json({ ...item({ id: c.path.split('/').pop()! }), ...(c.body as object) });
    const { calls } = show(
      '#/feedback',
      // by now one of the first page has been read: the server counts two new answers
      on('GET', /beforeId=fb-2$/, json({ items: [item({ id: 'fb-3', comment: 'Answer three' })], total: 2 })),
      on('GET', '/admin/feedback?status=new&limit=50', json({ items: [item(), item({ id: 'fb-2', comment: 'Answer two' })], total: 3 })),
      on('PATCH', /^\/admin\/feedback\/fb-\d$/, marked),
    );
    expect(await screen.findByRole('button', { name: 'Show more (1 left)' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Mark read' })[0]!);
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    // still one to come: the answer marked stays on screen, and is not counted twice
    expect(await screen.findByRole('button', { name: 'Show more (1 left)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show more (1 left)' }));
    expect(await screen.findByText('Answer three')).toBeInTheDocument();
    // asked for what comes after the last one shown, not for an offset that would now skip "Answer three"
    expect(calls.some((c) => c.path === '/admin/feedback?status=new&limit=50&beforeId=fb-2')).toBe(true);
    expect(calls.some((c) => c.path.includes('offset='))).toBe(false);
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument();
    // marking one of the first page keeps the pages shown after it
    await user.click(screen.getAllByRole('button', { name: 'Mark read' })[0]!);
    await waitFor(() => expect(patches(calls)).toHaveLength(2));
    expect(screen.getByText('Answer three')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Feedback' })).getAllByRole('listitem')).toHaveLength(3);
  });

  it('keeps a search within what the API takes', async () => {
    show('#/feedback', on('GET', /^\/admin\/feedback\?/, json({ items: [], total: 0 })));
    expect(await screen.findByRole('searchbox', { name: 'Search feedback' })).toHaveAttribute('maxlength', '80');
    const long = feedbackPath({ ...feedbackFilters(new URLSearchParams('')), q: 'x'.repeat(200) });
    expect(new URLSearchParams(long.split('?')[1]).get('q')).toHaveLength(80);
  });

  it('says a failed load failed', async () => {
    show('#/feedback', on('GET', /^\/admin\/feedback\?/, failure(500, 'INTERNAL', 'boom')));
    expect(await screen.findByText('The server had a problem')).toBeInTheDocument();
    expect(screen.queryByText('Nothing new')).not.toBeInTheDocument();
  });
});
