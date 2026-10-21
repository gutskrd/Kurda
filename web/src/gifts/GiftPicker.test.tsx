import { describe, it, expect, vi, afterEach } from 'vitest';
import { useEffect, useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GiftCatalogItem } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { GiftPicker } from './GiftPicker';

afterEach(() => vi.restoreAllMocks());

const item = (over: Partial<GiftCatalogItem> = {}): GiftCatalogItem => ({
  sku: 'bg-sunset',
  name: 'Sunset over Amed',
  category: 'background',
  assetUrl: null,
  currency: 'zer',
  price: 500,
  tier: 'common',
  alreadyOwnedBy: [],
  ...over,
});

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function stub(items: GiftCatalogItem[], send: unknown = null, balance = { zer: 1200, gems: 10 }): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : null });
      if (url.includes('/gifts/catalog')) return jsonResponse(200, { items, balance });
      if (url.endsWith('/gifts')) {
        return jsonResponse(200, send ?? { batchId: 'b1', sent: ['u-rojda'], skipped: [], balance: { zer: 700, gems: 10 }, message: null });
      }
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

const rojda = { userId: 'u-rojda', name: 'rojda', avatarUrl: null };

describe('GiftPicker in a direct message', () => {
  it('shows what can be given, its price, what they already have, and your balance', async () => {
    const calls = stub([item(), item({ sku: 'ic-1', name: 'Pomegranate', category: 'icon', alreadyOwnedBy: ['u-rojda'] }), item({ sku: 'bg-gem', name: 'Night sky', currency: 'gems', price: 40, tier: 'rare' })]);
    renderApp(<GiftPicker open onClose={() => undefined} chat={{ kind: 'dm', userId: 'u-rojda' }} people={[rojda]} onSent={() => undefined} />);

    expect(screen.getByRole('dialog', { name: 'A gift for rojda' })).toBeInTheDocument();
    const sunset = (await screen.findByText('Sunset over Amed')).closest('button')!;
    expect(within(sunset).getByText('500')).toBeInTheDocument();
    const owned = screen.getByText('Pomegranate').closest('button')!;
    expect(owned).toBeDisabled();
    expect(within(owned).getByText('Already has it')).toBeInTheDocument();
    // dearer than what you hold: shown, priced, but not sendable
    const night = screen.getByText('Night sky').closest('button')!;
    expect(within(night).getByText('Rare')).toBeInTheDocument();
    expect(screen.getByLabelText('You have 1,200 Zêr and 10 gems')).toBeInTheDocument();
    expect(calls[0]!.url).toContain('/gifts/catalog?to=u-rojda');
  });

  it('sends the chosen item to them, in this chat, with a key a retry reuses', async () => {
    const calls = stub([item()]);
    const onSent = vi.fn();
    renderApp(<GiftPicker open onClose={() => undefined} chat={{ kind: 'dm', userId: 'u-rojda' }} people={[rojda]} onSent={onSent} />);

    await userEvent.click(await screen.findByRole('button', { name: /Sunset over Amed/ }));
    expect(screen.getByText('Sunset over Amed for rojda')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));

    const sent = calls.find((c) => c.url.endsWith('/gifts'))!;
    expect(sent.body).toMatchObject({
      sku: 'bg-sunset',
      toUserIds: ['u-rojda'],
      chat: { kind: 'dm', userId: 'u-rojda' },
      expectedPrice: 500,
    });
    expect((sent.body as { idempotencyKey: string }).idempotencyKey.length).toBeGreaterThanOrEqual(8);
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ batchId: 'b1', item: expect.objectContaining({ sku: 'bg-sunset' }) }));
  });

  it('finds its recipient when the friend arrives after the sheet has opened', async () => {
    // the chat opens the sheet at once; who the friend is comes a moment later
    const calls = stub([item()]);
    function Thread(): React.JSX.Element {
      const [people, setPeople] = useState<(typeof rojda)[] | null>(null);
      useEffect(() => {
        const id = window.setTimeout(() => setPeople([rojda]), 10);
        return () => window.clearTimeout(id);
      }, []);
      return <GiftPicker open onClose={() => undefined} chat={{ kind: 'dm', userId: 'u-rojda' }} people={people} onSent={() => undefined} />;
    }
    renderApp(<Thread />);

    expect(await screen.findByText('Sunset over Amed')).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/gifts/catalog?to=u-rojda'))).toBe(true);
  });

  it('says why nobody could be given it, and stays open', async () => {
    stub([item()], { batchId: 'b1', sent: [], skipped: [{ userId: 'u-rojda', reason: 'daily_limit' }], balance: { zer: 1200, gems: 10 }, message: null });
    const onSent = vi.fn();
    renderApp(<GiftPicker open onClose={() => undefined} chat={{ kind: 'dm', userId: 'u-rojda' }} people={[rojda]} onSent={onSent} />);
    await userEvent.click(await screen.findByRole('button', { name: /Sunset over Amed/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    const why = await screen.findByRole('alert');
    expect(why).toHaveTextContent('You’ve reached today’s gift limit for rojda.');
    // beside the Send button, which stays on screen, not under a long shelf
    expect(why.closest('.gift-confirm')).not.toBeNull();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('after a price change, shows and sends the new price', async () => {
    const calls: Call[] = [];
    let price = 520;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : null;
        calls.push({ url, method: init?.method ?? 'GET', body });
        if (url.includes('/gifts/catalog')) return jsonResponse(200, { items: [item({ price })], balance: { zer: 1200, gems: 0 } });
        if (body?.expectedPrice !== price) return jsonResponse(409, { code: 'PRICE_CHANGED', message: 'price changed' });
        return jsonResponse(200, { batchId: 'b1', sent: ['u-rojda'], skipped: [], balance: { zer: 670, gems: 0 }, message: null });
      }),
    );
    const onSent = vi.fn();
    renderApp(<GiftPicker open onClose={() => undefined} chat={{ kind: 'dm', userId: 'u-rojda' }} people={[rojda]} onSent={onSent} />);
    await userEvent.click(await screen.findByRole('button', { name: /Sunset over Amed/ }));
    price = 530; // it changes while they look
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The price just changed.');

    // the shelf is fetched again, and the choice now costs what the shelf says
    const bar = (await screen.findByRole('button', { name: 'Send gift' })).closest('.gift-confirm') as HTMLElement;
    expect(await within(bar).findByText('530')).toBeInTheDocument();
    await userEvent.click(within(bar).getByRole('button', { name: 'Send gift' }));
    const sends = calls.filter((c) => c.url.endsWith('/gifts'));
    expect(sends.map((c) => (c.body as { expectedPrice: number }).expectedPrice)).toEqual([520, 530]);
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('says calmly when a chat mute stops it', async () => {
    stub([item()]);
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).endsWith('/gifts')
        ? jsonResponse(403, { code: 'MUTED', message: 'no', details: { scope: 'chat', until: null } })
        : jsonResponse(200, { items: [item()], balance: { zer: 1200, gems: 0 } }),
    );
    renderApp(<GiftPicker open onClose={() => undefined} chat={{ kind: 'dm', userId: 'u-rojda' }} people={[rojda]} onSent={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: /Sunset over Amed/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You can’t send messages right now.');
    expect(screen.getByRole('link', { name: 'See your account standing' })).toBeInTheDocument();
  });
});

describe('GiftPicker in a group', () => {
  const people = [rojda, { userId: 'u-baran', name: 'baran', avatarUrl: null }];

  it('asks who first — your friends here, with Select all — then what', async () => {
    const calls = stub([item({ alreadyOwnedBy: ['u-baran'] })]);
    renderApp(<GiftPicker open onClose={() => undefined} chat={{ kind: 'group', groupId: 'g1' }} people={people} onSent={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Select all'));
    expect(screen.getByLabelText('rojda')).toBeChecked();
    expect(screen.getByLabelText('baran')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Already has it: baran')).toBeInTheDocument();
    expect(calls.find((c) => c.url.includes('/gifts/catalog'))!.url).toContain('to=u-rojda,u-baran');
    // only the one who does not have it is given it, and only they are paid for
    await userEvent.click(screen.getByRole('button', { name: /Sunset over Amed/ }));
    expect(screen.getByText('Sunset over Amed for rojda')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(calls.find((c) => c.url.endsWith('/gifts'))!.body).toMatchObject({ toUserIds: ['u-rojda'], chat: { kind: 'group', groupId: 'g1' } });
  });

  it('says who got it and why the others did not, when only some could be given it', async () => {
    stub([item()], {
      batchId: 'b1',
      sent: ['u-rojda'],
      skipped: [{ userId: 'u-baran', reason: 'not_allowed' }],
      balance: { zer: 700, gems: 10 },
      message: null,
    });
    const onSent = vi.fn();
    renderApp(<GiftPicker open onClose={() => undefined} chat={{ kind: 'group', groupId: 'g1' }} people={people} onSent={onSent} />);
    await userEvent.click(screen.getByLabelText('Select all'));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(await screen.findByRole('button', { name: /Sunset over Amed/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ partialNote: 'Sent to rojda. You can’t send baran a gift yet.' }));
  });

  it('has nothing to add when everyone chosen was given it', async () => {
    stub([item()]);
    const onSent = vi.fn();
    renderApp(<GiftPicker open onClose={() => undefined} chat={{ kind: 'group', groupId: 'g1' }} people={[rojda]} onSent={onSent} />);
    await userEvent.click(screen.getByLabelText('rojda'));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(await screen.findByRole('button', { name: /Sunset over Amed/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ partialNote: null }));
  });

  it('says so when none of your friends are in the group', () => {
    stub([]);
    renderApp(<GiftPicker open onClose={() => undefined} chat={{ kind: 'group', groupId: 'g1' }} people={[]} onSent={() => undefined} />);
    expect(screen.getByText('None of your friends are in this group yet. Gifts only go to friends.')).toBeInTheDocument();
  });
});

describe('GiftPicker’s shelf, by kind', () => {
  /** The shelf as `/gifts/catalog` sends it: in the shop's order, every priced kind. */
  const shelf = (): GiftCatalogItem[] => [
    item({ sku: 'bg-sunset', name: 'Sunset over Amed', price: 500 }),
    item({ sku: 'bg-kilim', name: 'Kilîma Sor', price: 600, alreadyOwnedBy: ['u-rojda'] }),
    item({ sku: 'icon-caydan', name: 'Îstîkan', category: 'icon', price: 900 }),
    item({ sku: 'icon-roj', name: 'Roj', category: 'icon', price: 600 }),
    item({ sku: 'bg-night', name: 'Night sky', currency: 'gems', price: 40, tier: 'rare' }),
    item({ sku: 'tag_kurdish', name: 'Kurdish Tag', category: 'tag', price: 500 }),
  ];
  const tiles = (): string[] => [...document.querySelectorAll('.gift-tile .gift-tile-name')].map((el) => el.textContent ?? '');
  const open = (people = [rojda], chat: { kind: 'dm'; userId: string } | { kind: 'group'; groupId: string } = { kind: 'dm', userId: 'u-rojda' }) =>
    renderApp(<GiftPicker open onClose={() => undefined} chat={chat} people={people} onSent={() => undefined} />);

  it('puts each kind on a tab with its count, and under All gives each its own titled shelf', async () => {
    stub(shelf());
    open();
    await screen.findByText('Sunset over Amed');

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['All6', 'Backgrounds3', 'Icons2', 'Tags1']);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Backgrounds3', 'Icons2', 'Tags1']);
    // each shelf is a list named by its heading
    expect(screen.getByRole('list', { name: /Icons/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Icons/ }));
    expect(tiles()).toEqual(['Îstîkan', 'Roj']);
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('finds a Kurdish name typed without its Kurdish letters', async () => {
    stub(shelf());
    open();
    await screen.findByText('Sunset over Amed');
    await userEvent.type(screen.getByLabelText('Search gifts'), 'istikan');
    expect(tiles()).toEqual(['Îstîkan']);
    expect(screen.getByRole('status')).toHaveTextContent('1 item');
  });

  it('sorts by price — Zêr before gems, dearest first when asked', async () => {
    stub(shelf());
    open();
    await screen.findByText('Sunset over Amed');
    await userEvent.click(screen.getByRole('tab', { name: /Backgrounds/ }));
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'price-desc');
    expect(tiles()).toEqual(['Night sky', 'Kilîma Sor', 'Sunset over Amed']);
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'price-asc');
    expect(tiles()).toEqual(['Sunset over Amed', 'Kilîma Sor', 'Night sky']);
  });

  it('holds each gift against its own currency, for everyone it would go to', async () => {
    // 1,200 Zêr and 10 gems; two friends chosen, so each gift costs twice its price
    stub(shelf(), null, { zer: 1200, gems: 10 });
    open([rojda, { userId: 'u-baran', name: 'baran', avatarUrl: null }], { kind: 'group', groupId: 'g1' });
    await userEvent.click(screen.getByLabelText('Select all'));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Sunset over Amed');

    await userEvent.click(screen.getByLabelText('Within my balance'));
    // 2 × 500 and 2 × 600 fit in 1,200 Zêr; Kilîma Sor is 600 for baran alone (rojda has it);
    // 2 × 900 does not; 40 gems is more than the 10 held, whatever the Zêr
    expect(tiles()).toEqual(['Sunset over Amed', 'Kilîma Sor', 'Roj', 'Kurdish Tag']);
  });

  it('hides what everyone chosen already has, and only that', async () => {
    stub(shelf());
    open();
    await screen.findByText('Sunset over Amed');
    expect(screen.getByText('Kilîma Sor').closest('button')).toBeDisabled();

    await userEvent.click(screen.getByLabelText('Hide ones they already have'));
    expect(screen.queryByText('Kilîma Sor')).not.toBeInTheDocument();
    expect(tiles()).toHaveLength(5);
  });

  it('keeps a hidden choice chosen, and says so by the Send button', async () => {
    const calls = stub(shelf());
    open();
    await userEvent.click(await screen.findByRole('button', { name: /Sunset over Amed/ }));
    const bar = screen.getByRole('button', { name: 'Send gift' }).closest('.gift-confirm') as HTMLElement;
    expect(within(bar).queryByText('Your filters hide it, but it’s still chosen.')).not.toBeInTheDocument();

    // a filter that hides it from the shelf
    await userEvent.click(screen.getByRole('tab', { name: /Icons/ }));
    expect(screen.queryByRole('button', { name: /Sunset over Amed/ })).not.toBeInTheDocument();
    // …and the bar still says what is chosen, drawn, and that the filter hides it
    expect(within(bar).getByText('Sunset over Amed for rojda')).toBeInTheDocument();
    expect(within(bar).getByText('Your filters hide it, but it’s still chosen.')).toBeInTheDocument();
    expect(bar.querySelector('.gift-confirm-art')).not.toBeNull();

    await userEvent.click(within(bar).getByRole('button', { name: 'Send gift' }));
    expect(calls.find((c) => c.url.endsWith('/gifts'))!.body).toMatchObject({ sku: 'bg-sunset', toUserIds: ['u-rojda'] });
  });

  it('clears every narrowing at once, and says so when nothing matches', async () => {
    stub(shelf());
    open();
    await screen.findByText('Sunset over Amed');
    await userEvent.click(screen.getByLabelText('Within my balance'));
    await userEvent.type(screen.getByLabelText('Search gifts'), 'zzzz');
    expect(screen.getByText(/Nothing matches that/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(tiles()).toHaveLength(6);
    expect(screen.getByLabelText('Within my balance')).not.toBeChecked();
    expect(screen.getByLabelText('Search gifts')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });
});
