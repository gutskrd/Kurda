// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { ModerationSummary } from '@kurda/shared';
import { setToken } from './api';
import { App } from './App';
import { fakeApi, json, on } from './test/fetch';
import { renderUi } from './test/render';

const SUMMARY: ModerationSummary = {
  open: 7,
  byPriority: { 0: 1, 1: 2, 2: 3, 3: 1 },
  byStatus: { open: 7 },
  oldestOpenAgeSeconds: 3 * 3600,
  slaBreaches: 1,
  slaBreachesByPriority: { 0: 1, 1: 0, 2: 0, 3: 0 },
  appealsWaiting: 2,
  pendingApprovals: 1,
  openEscalations: 0,
};

function session(staffRoles: string[], capabilities: string[]) {
  return on('GET', '/admin/session', json({ roles: staffRoles.filter((r) => r !== 'admin' && r !== 'founder'), staffRoles, capabilities, needsEnrollment: false, needsVerification: false }));
}

const me = (username: string) => on('GET', '/me', json({ user: { id: 'me-1', username, roles: [] } }));

async function openAt(hash: string): Promise<void> {
  location.hash = hash;
  renderUi(<App />, { kit: false });
  await screen.findAllByRole('navigation', { name: 'Admin pages' });
}

function sidebarLinks(): string[] {
  const nav = screen.getAllByRole('navigation', { name: 'Admin pages' })[0]!;
  return within(nav)
    .getAllByRole('link')
    .map((a) => a.querySelector('.navlink-label')?.textContent ?? '');
}

beforeEach(() => {
  setToken('tok');
});

afterEach(() => {
  setToken(null);
  vi.unstubAllGlobals();
  location.hash = '';
});

describe('the admin’s navigation', () => {
  it('shows a moderator only the pages the API lets them open, grouped, and starts them on the dashboard', async () => {
    fakeApi(
      session(['moderator'], ['users.view', 'users.moderate', 'moderation.act']),
      me('rojda'),
      on('GET', '/admin/moderation/summary', json(SUMMARY)),
      on('GET', '/admin/moderation/sla', json({ medianSeconds: 5400, resolved: 12 })),
      on('GET', '/admin/feedback/summary', json({ total: { count: 0, averageStars: null, distribution: [0, 0, 0, 0, 0] }, last30Days: { count: 3, averageStars: 4.3, distribution: [0, 0, 1, 0, 2] }, daily: [], byStatus: { new: 3, read: 0, archived: 0 }, byCategory: {} })),
    );
    await openAt('');
    await waitFor(() => expect(location.hash).toBe('#/dashboard'));
    expect(sidebarLinks()).toEqual(['Dashboard', 'Users', 'Queue', 'Appeals', 'Ban approvals', 'Automated flags', 'Feedback', 'Playbook', 'My security']);
    const nav = screen.getAllByRole('navigation', { name: 'Admin pages' })[0]!;
    expect(within(nav).getByRole('heading', { name: 'Moderation' })).toBeInTheDocument();
    expect(within(nav).queryByRole('heading', { name: 'Economy' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /dashboard/i })).toHaveAttribute('aria-current', 'page');

    // the queue's size is beside its link, and said to be urgent
    await waitFor(() => expect(within(nav).getByRole('link', { name: /queue/i })).toHaveTextContent('7'));
    expect(within(nav).getByRole('link', { name: /queue/i })).toHaveTextContent('7 open, urgent');

    // and the dashboard has the queue by priority, with links into it
    const urgent = await screen.findByRole('link', { name: /^urgent/i });
    expect(urgent).toHaveAttribute('href', '#/moderation?priority=0');
    expect(urgent).toHaveTextContent('Decide within 1 h · 1 overdue');
    expect(screen.getByRole('link', { name: /^Appeals waiting:/ })).toHaveAttribute('href', '#/appeals');
    expect(screen.getByRole('link', { name: /^Bans waiting for a second admin:/ })).toHaveAttribute('href', '#/ban-approvals');
    // how long a decision typically takes
    expect(await screen.findByText(/Median time to a decision:/)).toHaveTextContent('Median time to a decision: 1 h 30 min (of 12 decided)');
  });

  it('tells a role it cannot open a page it reached by its address', async () => {
    fakeApi(session(['moderator'], ['moderation.act']), me('rojda'), on('GET', '/admin/moderation/summary', json(SUMMARY)));
    await openAt('#/shop');
    expect(await screen.findByText('Your role can’t open this page')).toBeInTheDocument();
  });

  it('says when there is no page at an address', async () => {
    fakeApi(session(['superadmin', 'admin'], ['moderation.act']), me('owner'), on('GET', '/admin/moderation/summary', json(SUMMARY)));
    await openAt('#/nowhere');
    expect(await screen.findByText('There is no page here')).toBeInTheDocument();
  });

  it('puts recording in a group of its own, in plain words, and keeps the old address working', async () => {
    fakeApi(
      session(['content_editor'], ['content.edit', 'content.publish', 'events.manage']),
      me('dilan'),
      on('GET', '/admin/alphabet/audio', json({ recordings: [] })),
      on('GET', '/admin/lesson-audio', json({ items: [], summary: { needed: 0, recorded: 0, missing: 0, unused: 0 } })),
    );
    await openAt('#/alphabet');
    const nav = screen.getAllByRole('navigation', { name: 'Admin pages' })[0]!;
    const group = within(nav).getByRole('list', { name: 'Record audio' });
    expect(within(group).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Record the alphabet',
      'Record lesson sentences',
      'Record story sentences',
    ]);
    expect(within(group).getByRole('link', { name: 'Record the alphabet' })).toHaveAttribute('aria-current', 'page');
    expect(within(group).getByRole('link', { name: 'Record lesson sentences' })).toHaveAttribute('href', '#/audio/lessons');
  });

  it('finds a page by what it is for, and opens it with Enter', async () => {
    const user = userEvent.setup();
    fakeApi(
      session(['content_editor'], ['content.edit']),
      me('dilan'),
      on('GET', '/admin/alphabet/audio', json({ recordings: [] })),
      on('GET', '/admin/lesson-audio', json({ items: [], summary: { needed: 0, recorded: 0, missing: 0, unused: 0 } })),
    );
    await openAt('#/dashboard');
    const search = screen.getAllByRole('searchbox', { name: 'Find a page' })[0]!;
    await user.type(search, 'microphone');
    expect(sidebarLinks()).toEqual(['Record the alphabet', 'Record lesson sentences', 'Record story sentences']);
    await user.clear(search);
    await user.type(search, 'race{Enter}');
    await waitFor(() => expect(location.hash).toBe('#/race'));
  });

  it('opens the menu as a drawer on a phone, and closes it once a page is chosen', async () => {
    const user = userEvent.setup();
    fakeApi(session(['founder'], []), me('ferhad'), on('GET', '/tags', json({ tags: [] })));
    await openAt('#/dashboard');
    const open = screen.getByRole('button', { name: 'Open the menu' });
    await user.click(open);
    const drawer = screen.getByRole('dialog', { name: /hevalo admin/i });
    expect(open).toHaveAttribute('aria-expanded', 'true');
    await user.click(within(drawer).getByRole('link', { name: /tags/i }));
    await act(async () => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(location.hash).toBe('#/tags');
  });
});
