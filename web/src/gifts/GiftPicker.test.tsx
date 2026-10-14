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
