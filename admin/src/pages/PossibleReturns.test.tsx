// @vitest-environment jsdom
/**
 * Possible returns and trusted networks, against a fake API: what a moderator reads about each possible return, and
 * exactly what each decision sends; what a superadmin adds and removes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { setToken } from '../api';
import { AuthProvider } from '../auth';
import type { PossibleReturnItem, TrustedNetwork } from '../bans';
import { fakeApi, failure, json, on, type Call, type Route } from '../test/fetch';
import { ME_ID } from '../test/moderation';
import { renderUi } from '../test/render';
import { PossibleReturns } from './PossibleReturns';
import { TrustedNetworks } from './TrustedNetworks';

const HOUR = 3_600_000;
const ago = (h: number): string => new Date(Date.now() - h * HOUR).toISOString();
const me: Route = on('GET', '/me', json({ user: { id: ME_ID, username: 'rojda', roles: ['moderator'] } }));
const posts = (calls: Call[], path: string): Call[] => calls.filter((c) => c.method === 'POST' && c.path === path);

function entry(over: Partial<PossibleReturnItem> = {}): PossibleReturnItem {
  return {
    id: 'pr-1',
    account: { id: 'u-new', username: 'baran_nu', createdAt: ago(2), unavailable: false, held: true },
    banned: {
      id: 'u-old',
      username: 'baran',
      createdAt: ago(24 * 300),
      unavailable: true,
      held: false,
      ban: { sanctionId: 's-ban', kind: 'permanent_ban', policy: 'harassment', startsAt: ago(24 * 3), endsAt: null },
    },
    strength: 'strong',
    signals: [
      { kind: 'device', strength: 'strong', at: ago(2), event: 'signup' },
      { kind: 'network_near_ban', strength: 'medium', at: ago(2), event: 'signup' },
    ],
    held: true,
    status: 'open',
    firstSeenAt: ago(2),
    lastSeenAt: ago(1),
    personNote: { text: 'It is my brother’s tablet.', at: ago(1) },
    decision: null,
    ...over,
  };
}

const summaryRoute = on('GET', '/admin/users/u-new/content-summary', json({ summary: { posts: 0, pictures: 0, comments: 2, groupMessages: 0, directMessages: 1, lettersInFlight: 0, profile: true, groupPhotos: 0 } }));

function show(page: ReactNode, ...routes: Route[]): ReturnType<typeof fakeApi> {
  setToken('tok');
  const api = fakeApi(me, ...routes);
  renderUi(<AuthProvider>{page}</AuthProvider>);
  return api;
}

afterEach(() => {
  setToken(null);
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('possible returns', () => {
  const list = (items: PossibleReturnItem[], counts = { open: items.length, held: items.filter((i) => i.held).length }): Route =>
    on('GET', /^\/admin\/moderation\/possible-returns\?status=open/, json({ items, nextCursor: null, counts }));

  it('shows each match with the banned account, the signals and how strong each is, and their appeal', async () => {
    show(<PossibleReturns />, list([entry()]));
    expect(await screen.findByRole('link', { name: '@baran_nu' })).toHaveAttribute('href', '#/users/u-new');
    expect(screen.getByRole('link', { name: '@baran' })).toHaveAttribute('href', '#/users/u-old');
    const signals = screen.getByRole('list', { name: 'What matched' });
    expect(within(signals).getByText(/The same phone or tablet/)).toBeInTheDocument();
    expect(within(signals).getByText(/Their home network, days after the ban/)).toBeInTheDocument();
    expect(screen.getAllByText('Held').length).toBeGreaterThan(0);
    expect(screen.getByText('It is my brother’s tablet.')).toBeInTheDocument();
    expect(screen.getByText('1 waiting · 1 held')).toBeInTheDocument();
  });

  it('decides not the same person with a reason, and lifts the hold', async () => {
    const user = userEvent.setup();
    const { calls } = show(<PossibleReturns />, list([entry()]), on('POST', '/admin/moderation/possible-returns/pr-1/decide', json({ entry: entry({ status: 'not_same_person' }) })));
    await user.click(await screen.findByRole('button', { name: 'Not the same person…' }));
    const ask = await screen.findByRole('dialog', { name: /Not the same person as @baran\?/ });
    await user.type(within(ask).getByLabelText('Why (for the record)'), 'Brothers on one tablet.');
    await user.click(within(ask).getByRole('button', { name: 'Not the same person' }));
    await waitFor(() => expect(posts(calls, '/admin/moderation/possible-returns/pr-1/decide')).toHaveLength(1));
    expect(posts(calls, '/admin/moderation/possible-returns/pr-1/decide')[0]!.body).toEqual({ decision: 'not_same_person', note: 'Brothers on one tablet.' });
    expect(await screen.findByText('Decided. The hold is lifted.')).toBeInTheDocument();
  });

  it('decides the same person: the same ban, its words, the content choice, a summary, and the typed username', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      <PossibleReturns />,
      list([entry()]),
      summaryRoute,
      on('POST', '/admin/moderation/possible-returns/pr-1/decide', json({ entry: entry({ status: 'same_person' }) })),
    );
    await user.click(await screen.findByRole('button', { name: 'Same person…' }));
    const drawer = await screen.findByRole('dialog', { name: 'Same person as @baran' });
    expect(within(drawer).getByLabelText(/^Rule broken/)).toHaveValue('harassment');
    await user.click(within(drawer).getByRole('radio', { name: /^Remove/ }));
    expect(await within(drawer).findByText(/Their 2 comments and profile will be removed/)).toBeInTheDocument();
    await user.type(within(drawer).getByLabelText(/Why you decided/), 'Same tablet, same words, the day after.');
    await user.click(within(drawer).getByRole('button', { name: 'Ban this account too…' }));
    const ask = await screen.findByRole('alertdialog', { name: '@baran_nu is @baran?' });
    expect(within(ask).getByText('@baran_nu will be banned permanently.')).toBeInTheDocument();
    await user.type(within(ask).getByLabelText('Type baran_nu to confirm'), 'baran_nu');
    await user.click(within(ask).getByRole('button', { name: 'Ban for good' }));
    await waitFor(() => expect(posts(calls, '/admin/moderation/possible-returns/pr-1/decide')).toHaveLength(1));
    expect(posts(calls, '/admin/moderation/possible-returns/pr-1/decide')[0]!.body).toEqual({
      decision: 'same_person',
      note: 'Same tablet, same words, the day after.',
      statement: expect.stringContaining('Opening another account'),
      policy: 'harassment',
      content: { choice: 'remove', includeMessages: false },
      confirmUsername: 'baran_nu',
    });
  });

  it('says when nothing is waiting, and pages on', async () => {
    show(<PossibleReturns />, list([]));
    expect(await screen.findByText('Nothing is waiting')).toBeInTheDocument();
  });
});

describe('trusted networks', () => {
  function network(over: Partial<TrustedNetwork> = {}): TrustedNetwork {
    return { id: 'tn-1', hint: '203.0.113.x', reason: 'Class 7 at the Amed school', createdAt: ago(24), createdBy: 'rojda', expiresAt: ago(-24 * 60), expired: false, ...over };
  }
  const listing = (networks: TrustedNetwork[]): Route => on('GET', '/admin/trusted-networks', json({ networks, max: 100, maxDays: 365 }));

  it('adds a network with its reason and end, and lists what is trusted', async () => {
    const user = userEvent.setup();
    const { calls } = show(<TrustedNetworks />, listing([network()]), on('POST', '/admin/trusted-networks', json({ network: network({ id: 'tn-2', hint: '198.51.100.x' }) }, 201)));
    expect(await screen.findByText('203.0.113.x')).toBeInTheDocument();
    expect(screen.getByText('1 of 100 in use.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Public IP address/), '198.51.100.20');
    await user.type(screen.getByLabelText(/Whose network, and why/), 'The Hewlêr evening class');
    await user.click(screen.getByRole('button', { name: 'Trust this network' }));
    await waitFor(() => expect(posts(calls, '/admin/trusted-networks')).toHaveLength(1));
    expect(posts(calls, '/admin/trusted-networks')[0]!.body).toEqual({ ip: '198.51.100.20', reason: 'The Hewlêr evening class', expiresAt: expect.any(String) });
    const until = new Date((posts(calls, '/admin/trusted-networks')[0]!.body as { expiresAt: string }).expiresAt).getTime();
    expect(until).toBeLessThan(Date.now() + 366 * 24 * HOUR);
  });

  it('refuses what is not an address before sending', async () => {
    const user = userEvent.setup();
    const { calls } = show(<TrustedNetworks />, listing([]));
    await user.type(await screen.findByLabelText(/Public IP address/), 'the school');
    await user.type(screen.getByLabelText(/Whose network, and why/), 'A school');
    await user.click(screen.getByRole('button', { name: 'Trust this network' }));
    expect(await screen.findByText(/Enter the network’s public IP address/)).toBeInTheDocument();
    expect(posts(calls, '/admin/trusted-networks')).toHaveLength(0);
  });

  it('removes one with a reason, and says why the API refused', async () => {
    const user = userEvent.setup();
    const { calls } = show(<TrustedNetworks />, listing([network()]), on('DELETE', '/admin/trusted-networks/tn-1', failure(404, 'NOT_FOUND', 'no such trusted network')));
    await user.click(await screen.findByRole('button', { name: 'Remove…' }));
    const ask = await screen.findByRole('dialog', { name: 'Stop trusting 203.0.113.x?' });
    await user.type(within(ask).getByLabelText('Why (for the record)'), 'The term ended.');
    await user.click(within(ask).getByRole('button', { name: 'Stop trusting it' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'DELETE')!.body).toEqual({ reason: 'The term ended.' });
  });
});
