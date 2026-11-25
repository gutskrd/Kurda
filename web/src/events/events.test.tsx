import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventQuest, EventQuests } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import { EventCard } from './EventCard';
import { EventsPage } from './EventsPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const quest = (over: Partial<EventQuest>): EventQuest => ({
  id: 'q',
  type: 'earn_xp',
  target: 100,
  current: 0,
  complete: false,
  claimed: false,
  claimable: false,
  reward: {},
  ...over,
});

const newroz: EventQuests = {
  eventKey: 'newroz',
  name: 'Newroz',
  endsAt: '2099-03-28T00:00:00.000Z',
  claimDeadline: '2099-03-31T00:00:00.000Z',
  quests: [
    quest({ id: 'done', type: 'complete_lessons', target: 3, current: 3, complete: true, claimed: true, reward: { zer: 50 } }),
    quest({ id: 'going', type: 'story_quizzes', target: 5, current: 2, reward: { zer: 50 } }),
    quest({ id: 'ready', titleEn: 'Light the fire', target: 100, current: 100, complete: true, claimable: true, reward: { zer: 350 } }),
  ],
};

interface Call {
  method: string;
  path: string;
}

/** Answers the events endpoints from a table, recording each request. */
function serve(table: Record<string, unknown>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? 'GET';
      calls.push({ method, path });
      const reply = table[`${method} ${path}`];
      if (reply instanceof Response) return reply;
      return reply === undefined ? jsonResponse(404, { code: 'NOT_FOUND', message: 'not found' }) : jsonResponse(200, reply);
    }),
  );
  return calls;
}

describe('the events page', () => {
  it('lists an event’s quests, those to claim first and those claimed last, each with its reward and progress in words', async () => {
    serve({ 'GET /events/active': { events: [{ key: 'newroz', name: 'Newroz', endsAt: newroz.endsAt, theme: null }] }, 'GET /events/newroz/quests': newroz });
    renderApp(<EventsPage />, ['/app/events']);

    const event = await screen.findByRole('region', { name: 'Newroz' });
    const day = new Date(newroz.endsAt).toLocaleDateString('en', { day: 'numeric', month: 'long' });
    expect(within(event).getByText(`Ends ${day}`)).toBeInTheDocument();
    const rows = within(event).getAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('.event-quest-title')?.textContent)).toEqual(['Light the fire', 'Finish story games', 'Complete lessons']);
    expect(within(rows[0]!).getByRole('button', { name: 'Claim' })).toBeInTheDocument();
    // The amount is read with the currency's name; the coin is a picture only.
    expect(rows[0]).toHaveTextContent(/Reward:.*350.*Zêr/);
    expect(within(rows[1]!).getByRole('progressbar', { name: 'Finish story games' })).toHaveAttribute('aria-valuetext', '2 of 5');
    expect(within(rows[2]!).getByText('Claimed')).toBeInTheDocument();
  });

  it('claims a reward, then reads the quests again to show it claimed', async () => {
    const claimedView = { ...newroz, quests: newroz.quests.map((q) => (q.id === 'ready' ? { ...q, claimable: false, claimed: true } : q)) };
    const table: Record<string, unknown> = {
      'GET /events/active': { events: [{ key: 'newroz', name: 'Newroz', endsAt: newroz.endsAt, theme: null }] },
      'GET /events/newroz/quests': newroz,
      'POST /events/newroz/quests/ready/claim': { ok: true },
    };
    const calls = serve(table);
    renderApp(<EventsPage />, ['/app/events']);
    const claim = await screen.findByRole('button', { name: 'Claim' });
    table['GET /events/newroz/quests'] = claimedView;
    await userEvent.click(claim);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Claim' })).toBeNull());
    expect(screen.getAllByText('Claimed')).toHaveLength(2);
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual(['/events/newroz/quests/ready/claim']);
  });

  it('says so above the quests when a claim is refused', async () => {
    serve({
      'GET /events/active': { events: [{ key: 'newroz', name: 'Newroz', endsAt: newroz.endsAt, theme: null }] },
      'GET /events/newroz/quests': newroz,
      'POST /events/newroz/quests/ready/claim': jsonResponse(410, { code: 'GRACE_EXPIRED', message: 'the claim window has closed' }),
    });
    renderApp(<EventsPage />, ['/app/events']);
    await userEvent.click(await screen.findByRole('button', { name: 'Claim' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This reward can’t be claimed right now.');
  });

  it('explains events between them, and leads back to Learn', async () => {
    serve({ 'GET /events/active': { events: [] } });
    renderApp(<EventsPage />, ['/app/events']);
    expect(await screen.findByRole('heading', { name: 'No events are running right now.' })).toBeInTheDocument();
    expect(screen.getByText(/When one starts, it shows on Learn/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Learn' })).toHaveAttribute('href', '/app/learn');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the events that loaded when another did not, and offers to try again', async () => {
    serve({
      'GET /events/active': {
        events: [
          { key: 'newroz', name: 'Newroz', endsAt: newroz.endsAt, theme: null },
          { key: 'autumn', name: 'Autumn', endsAt: newroz.endsAt, theme: null },
        ],
      },
      'GET /events/newroz/quests': newroz,
      'GET /events/autumn/quests': jsonResponse(500, { code: 'INTERNAL', message: 'boom' }),
    });
    renderApp(<EventsPage />, ['/app/events']);
    expect(await screen.findByRole('region', { name: 'Newroz' })).toBeInTheDocument();
    const note = screen.getByRole('alert');
    expect(note).toHaveTextContent('Some events didn’t load.');
    expect(within(note).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('the event card on Learn', () => {
  it('names the event running now and opens its quests', async () => {
    serve({ 'GET /events/active': { events: [{ key: 'newroz', name: 'Newroz', endsAt: newroz.endsAt, theme: null }] } });
    renderApp(<EventCard />, ['/app/learn']);
    const card = await screen.findByRole('link', { name: /Newroz/ });
    expect(card).toHaveAttribute('href', '/app/events');
    expect(card).toHaveTextContent('Quests and rewards while it lasts');
  });

  it('takes no room between events', async () => {
    const calls = serve({ 'GET /events/active': { events: [] } });
    const { container } = renderApp(<EventCard />, ['/app/learn']);
    await waitFor(() => expect(calls.some((c) => c.path === '/events/active')).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });
});
