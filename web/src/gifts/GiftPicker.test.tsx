import { describe, it, expect, vi, afterEach } from 'vitest';
import { useEffect, useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BagEntry, GiftCatalogItem, GiftDayLeft, GiftSendLimits } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { GiftPicker } from './GiftPicker';

afterEach(() => vi.restoreAllMocks());

const gift = (id: string, name: string, price: number, over: Partial<GiftCatalogItem> = {}): GiftCatalogItem => ({
  sku: `gift-${id}`,
  name,
  category: 'gift',
  assetUrl: `/cosmetics/gifts/${id}.png`,
  price,
  tier: price >= 20_000 ? 'grand' : 'common',
  alreadyOwnedBy: [],
  freeGiftEligible: price <= 150,
  ...over,
});

const CAY = gift('cay', 'Çay', 1);
const QEHWE = gift('qehwe', 'Qehwe', 2);
const GUL = gift('gul', 'Gul', 25);
const PISIK = gift('pisik', 'Pisîk', 150);
const BELEM = gift('belem', 'Belem', 2_000);
const HEYV = gift('heyv', 'Heyv', 20_000);
const SHELF = [CAY, QEHWE, GUL, PISIK, BELEM, HEYV];
const OPEN: GiftSendLimits = { maxPrice: null, left: null, confirmFrom: 2_000 };

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

interface Stub {
  items?: GiftCatalogItem[];
  bag?: BagEntry[];
  balance?: number;
  limits?: GiftSendLimits;
  hold?: string | null;
  dayLeft?: GiftDayLeft[];
  /** answers each POST /gifts in turn; the last one repeats */
  sends?: Array<[number, unknown]>;
}

function stub({ items = SHELF, bag = [], balance = 30_000, limits = OPEN, hold = null, dayLeft = [], sends }: Stub = {}): Call[] {
  const calls: Call[] = [];
  const answers = sends ?? [[200, { batchId: 'b1', sent: ['u-rojda'], skipped: [], balance: { zer: balance - 25 }, freeGifts: 0, message: null }]];
  let n = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      calls.push({ url, method: init?.method ?? 'GET', body });
      if (url.includes('/gifts/catalog')) return jsonResponse(200, { items, bag, balance: { zer: balance }, freeGifts: 0, hold, limits, dayLeft, nudges: true });
      if (url.endsWith('/gifts')) {
        const [status, answer] = answers[Math.min(n++, answers.length - 1)]!;
        return jsonResponse(status, answer);
      }
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

const rojda = { userId: 'u-rojda', name: 'rojda', avatarUrl: null };
const dm = { kind: 'dm' as const, userId: 'u-rojda' };
const sends = (calls: Call[]) => calls.filter((c) => c.url.endsWith('/gifts'));

describe('the gift sheet', () => {
  it('opens on the bag with its counts, then the gifts by shelf, cheapest first, each named in Kurmancî with its meaning and its worth', async () => {
    stub({ bag: [{ sku: CAY.sku, name: 'Çay', assetUrl: CAY.assetUrl, count: 3 }] });
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);

    expect(screen.getByRole('dialog', { name: 'A gift for rojda' })).toBeInTheDocument();
    const headings = (await screen.findAllByRole('heading', { level: 3 })).map((h) => h.textContent);
    expect(headings).toEqual(['Your bag', 'Tea and treats', 'Flowers', 'Animals', 'The sky', 'Boats']);
    const bag = screen.getByRole('list', { name: 'Your bag' });
    expect(within(bag).getByText('3 in your bag')).toBeInTheDocument();
    expect(within(bag).getByText('A glass of tea')).toBeInTheDocument();

    const rose = screen.getByText('Gul').closest('button')!;
    expect(within(rose).getByText('A red rose')).toBeInTheDocument();
    expect(within(rose).getByText('25')).toBeInTheDocument();
    expect(within(rose).getByText('≈ €0.25')).toBeInTheDocument();
    // the Kurmancî name is marked as Kurmancî, whatever the page's language
    expect(screen.getByText('Gul')).toHaveAttribute('lang', 'ku');
    const moon = screen.getByText('Heyv').closest('button')!;
    expect(within(moon).getByText('≈ €200')).toBeInTheDocument();
    expect(within(moon).getByText('Grand')).toBeInTheDocument();
    expect(screen.getByLabelText('You have 30,000 Zêr')).toBeInTheDocument();
  });

  it('shows what there is to pay with by the price, and how many gifts are left for a friend today when few are', async () => {
    stub({ balance: 334, dayLeft: [{ userId: 'u-rojda', left: 2, moreAt: null }] });
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    expect(await screen.findByText('You can give rojda 2 more today.')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Çay').closest('button')!);
    expect(within(screen.getByRole('button', { name: 'Send gift' }).parentElement!).getByText('You have 334 Zêr')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send gift' })).toBeEnabled();
  });

  it('holds the send once the day is full for a friend, and says from when they can give again', async () => {
    // later today, so the time alone
    const at = new Date();
    at.setHours(23, 59, 0, 0);
    const calls = stub({ dayLeft: [{ userId: 'u-rojda', left: 0, moreAt: at.toISOString() }] });
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    const time = at.toLocaleString('en', { hour: '2-digit', minute: '2-digit' });
    const line = `That’s all for rojda today. You can give again from ${time}.`;
    expect(await screen.findByText(line)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Çay').closest('button')!);
    expect(screen.getByRole('button', { name: 'Send gift' })).toBeDisabled();
    expect(screen.getAllByText(line)).toHaveLength(2);
    expect(screen.queryByRole('group', { name: 'How many' })).toBeNull();
    expect(sends(calls)).toHaveLength(0);
  });

  it.each([
    [300, '300', '300'],
    [3400, '3.4K', '3,400'],
    [5_600_000, '5.6M', '5,600,000'],
  ])('counts %i of one gift in the bag short, and says it whole', async (count, shown, said) => {
    stub({ bag: [{ sku: CAY.sku, name: 'Çay', assetUrl: CAY.assetUrl, count }] });
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    const bag = await screen.findByRole('list', { name: 'Your bag' });
    expect(within(bag).getByText(`${shown} in your bag`)).toBeInTheDocument();
    expect(within(bag).getByRole('button', { name: new RegExp(`${said} in your bag`) })).toBeInTheDocument();
  });

  it('says what fills an empty bag, rather than leaving a blank', async () => {
    stub();
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    expect(await screen.findByText(/Your bag is empty\. Daily lessons, streaks, wins/)).toBeInTheDocument();
  });

  it('gives from the bag for free, saying so by the send button', async () => {
    const calls = stub({ bag: [{ sku: CAY.sku, name: 'Çay', assetUrl: CAY.assetUrl, count: 2 }] });
    const onSent = vi.fn();
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={onSent} />);
    await userEvent.click(within(await screen.findByRole('list', { name: 'Your bag' })).getByRole('button', { name: /Çay/ }));
    expect(screen.getByText('From your bag, free')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(sends(calls)[0]!.body).toMatchObject({ sku: CAY.sku, fromBag: true, toUserIds: ['u-rojda'], chat: dm });
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ item: expect.objectContaining({ sku: CAY.sku }) }));
  });

  it('sends a paid gift to them in this chat, with its price and a key a retry reuses', async () => {
    const calls = stub();
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: /Gul/ }));
    expect(screen.getByText('Gul for rojda')).toBeInTheDocument();
    expect(screen.getByText('Gifts are final too: once it’s sent, it’s theirs to keep.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    const sent = sends(calls)[0]!.body!;
    expect(sent).toMatchObject({ sku: GUL.sku, toUserIds: ['u-rojda'], chat: dm, expectedPrice: 25 });
    expect(sent.fromBag).toBeUndefined();
    expect(String(sent.idempotencyKey).length).toBeGreaterThanOrEqual(8);
  });

  it('locks what the Zêr cannot cover, and never offers to buy Zêr on the website', async () => {
    stub({ balance: 100 });
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    const kitten = (await screen.findByText('Pisîk')).closest('button')!;
    expect(within(kitten).getByText('Not enough Zêr')).toBeInTheDocument();
    await userEvent.click(kitten);
    expect(screen.getByRole('button', { name: 'Send gift' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Get Zêr/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Get Zêr/ })).toBeNull();
  });

  it('locks what the safeguards rule out for these recipients, and says how far is left to spend', async () => {
    stub({ limits: { maxPrice: 500, left: 120, confirmFrom: 2_000 } });
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    const boat = (await screen.findByText('Belem')).closest('button')!;
    expect(boat).toBeDisabled();
    expect(within(boat).getByText('Up to 500 Zêr here')).toBeInTheDocument();
    const kitten = screen.getByText('Pisîk').closest('button')!;
    expect(kitten).toBeDisabled();
    expect(within(kitten).getByText('Over your gift limit')).toBeInTheDocument();
    expect(screen.getByText('You can spend 120 more Zêr on gifts for now.')).toBeInTheDocument();
    expect(screen.getByText('Gul').closest('button')).toBeEnabled();
  });

  it('asks a second time for a big gift, with the money amount said large, and sends it with the server’s token', async () => {
    const calls = stub({
      sends: [
        [409, { code: 'GIFT_NEEDS_CONFIRM', message: 'confirm', details: { confirmToken: 'tok-1', total: 20_000, recipients: 1, expiresAt: '2030-01-01T00:00:00Z' } }],
        [200, { batchId: 'b9', sent: ['u-rojda'], skipped: [], balance: { zer: 10_000 }, freeGifts: 0, message: null }],
      ],
    });
    const onSent = vi.fn();
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={onSent} />);
    await userEvent.click(await screen.findByRole('button', { name: /Heyv/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));

    const check = await screen.findByRole('region', { name: 'One more look before it goes' });
    expect(within(check).getByText('≈ €200')).toBeInTheDocument();
    expect(within(check).getByText('20,000 Zêr')).toBeInTheDocument();
    expect(within(check).getByText(/for rojda/)).toBeInTheDocument();
    expect(onSent).not.toHaveBeenCalled();
    await userEvent.click(within(check).getByRole('button', { name: /Send it/ }));

    const [first, second] = sends(calls);
    expect(first!.body!.confirmToken).toBeUndefined();
    expect(second!.body).toMatchObject({ sku: HEYV.sku, confirmToken: 'tok-1', idempotencyKey: first!.body!.idempotencyKey });
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ batchId: 'b9' }));
  });

  it('goes back from the second look without sending, and nothing is chosen for them', async () => {
    const calls = stub({
      sends: [[409, { code: 'GIFT_NEEDS_CONFIRM', message: 'confirm', details: { confirmToken: 'tok-2', total: 2_000, recipients: 1, expiresAt: '2030-01-01T00:00:00Z' } }]],
    });
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: /Belem/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    const check = await screen.findByRole('region', { name: 'One more look before it goes' });
    // both choices weigh the same: neither is pre-chosen and "Go back" says only that
    expect(within(check).getByRole('button', { name: 'Go back' })).toBeEnabled();
    await userEvent.click(within(check).getByRole('button', { name: 'Go back' }));
    expect(screen.queryByRole('region', { name: 'One more look before it goes' })).toBeNull();
    expect(sends(calls)).toHaveLength(1);
  });

  it('says calmly what a safeguard refused', async () => {
    stub({ sends: [[409, { code: 'GIFT_SPEND_LIMIT', message: 'no', details: { left: 40, by: 'minor_month' } }]] });
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: /Gul/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That’s more than this month’s gift limit leaves: 40 Zêr.');
  });

  it('says why nobody could be given it, and stays open', async () => {
    stub({ sends: [[200, { batchId: 'b1', sent: [], skipped: [{ userId: 'u-rojda', reason: 'daily_limit' }], balance: { zer: 1200 }, message: null }]] });
    const onSent = vi.fn();
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={onSent} />);
    await userEvent.click(await screen.findByRole('button', { name: /Gul/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    const why = await screen.findByRole('alert');
    expect(why).toHaveTextContent('You’ve reached today’s gift limit for rojda.');
    expect(why.closest('.gift-confirm')).not.toBeNull();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('finds its recipient when the friend arrives after the sheet has opened', async () => {
    const calls = stub();
    function Thread(): React.JSX.Element {
      const [people, setPeople] = useState<(typeof rojda)[] | null>(null);
      useEffect(() => {
        const id = window.setTimeout(() => setPeople([rojda]), 10);
        return () => window.clearTimeout(id);
      }, []);
      return <GiftPicker open onClose={() => undefined} chat={dm} people={people} onSent={() => undefined} />;
    }
    renderApp(<Thread />);
    expect(await screen.findByText('Gul')).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/gifts/catalog?to=u-rojda'))).toBe(true);
  });

  it('says in one calm line when a gift cannot go yet', async () => {
    stub({ hold: 'new_friend' });
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    expect(await screen.findByText('You can give rojda a gift once you’ve been friends for a day.')).toBeInTheDocument();
    expect(screen.queryByText('Gul')).toBeNull();
  });

  it('gives onto a post, to its author', async () => {
    const calls = stub();
    renderApp(<GiftPicker open onClose={() => undefined} post={{ type: 'library', id: 'p1' }} people={[rojda]} onSent={() => undefined} />);
    expect(screen.getByRole('dialog', { name: 'A gift on rojda’s post' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Gul/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(calls[0]!.url).toContain('/gifts/catalog?post=library%3Ap1');
    expect(sends(calls)[0]!.body).toMatchObject({ sku: GUL.sku, post: { type: 'library', id: 'p1' } });
    expect(sends(calls)[0]!.body!.chat).toBeUndefined();
  });
});

describe('the gift sheet in a group', () => {
  const people = [rojda, { userId: 'u-baran', name: 'baran', avatarUrl: null }];
  const group = { kind: 'group' as const, groupId: 'g1' };

  it('asks who first — your friends here, with Select all — then what', async () => {
    const calls = stub();
    renderApp(<GiftPicker open onClose={() => undefined} chat={group} people={people} onSent={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Select all'));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(await screen.findByRole('button', { name: /Gul/ }));
    expect(screen.getByText('Gul for rojda, baran')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(calls.find((c) => c.url.includes('/gifts/catalog'))!.url).toContain('to=u-rojda,u-baran');
    expect(sends(calls)[0]!.body).toMatchObject({ toUserIds: ['u-rojda', 'u-baran'], chat: group });
  });

  it('opens on what to give when sending one back to a friend here', async () => {
    stub();
    renderApp(<GiftPicker open onClose={() => undefined} chat={group} people={people} onSent={() => undefined} initialChosen={['u-baran']} />);
    expect(await screen.findByText('Gul')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('says who got it and why the others did not, when only some could be given it', async () => {
    stub({ sends: [[200, { batchId: 'b1', sent: ['u-rojda'], skipped: [{ userId: 'u-baran', reason: 'not_allowed' }], balance: { zer: 700 }, message: null }]] });
    const onSent = vi.fn();
    renderApp(<GiftPicker open onClose={() => undefined} chat={group} people={people} onSent={onSent} />);
    await userEvent.click(screen.getByLabelText('Select all'));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(await screen.findByRole('button', { name: /Gul/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ partialNote: 'Sent to rojda. You can’t send baran a gift yet.' }));
  });

  it('says so when none of your friends are in the group', () => {
    stub();
    renderApp(<GiftPicker open onClose={() => undefined} chat={group} people={[]} onSent={() => undefined} />);
    expect(screen.getByText(/None of your friends are in this group yet/)).toBeInTheDocument();
  });
});

describe('several of one gift at once', () => {
  const stepper = () => screen.getByRole('group', { name: 'How many' });
  const more = () => within(stepper()).getByRole('button', { name: 'One more' });
  const fewer = () => within(stepper()).getByRole('button', { name: 'One fewer' });
  const count = () => within(stepper()).getByRole('status');
  const footer = () => screen.getByRole('button', { name: 'Send gift' }).parentElement!;
  const press = async (button: () => HTMLElement, times: number) => {
    for (let i = 0; i < times; i++) await userEvent.click(button());
  };

  it('counts up to what the day’s caps and the Zêr allow, prices the whole send, and sends that many', async () => {
    const calls = stub({ balance: 230, dayLeft: [{ userId: 'u-rojda', left: 20, moreAt: null }] });
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: /Gul/ }));
    expect(count()).toHaveTextContent('1');
    expect(count()).toHaveAttribute('aria-live', 'polite');
    expect(fewer()).toHaveAttribute('aria-disabled', 'true');
    expect(more()).toHaveAttribute('aria-disabled', 'false');

    await press(more, 2);
    expect(count()).toHaveTextContent('3');
    expect(screen.getByText('3 × Gul for rojda')).toBeInTheDocument();
    expect(within(footer()).getByText('75')).toBeInTheDocument();
    expect(within(footer()).getByText('≈ €0.75')).toBeInTheDocument();
    await press(fewer, 1);
    expect(count()).toHaveTextContent('2');

    // 230 Zêr of 25-Zêr roses is nine; past that the button rests and keeps the keyboard where it is
    await press(more, 10);
    expect(count()).toHaveTextContent('9');
    expect(more()).toHaveAttribute('aria-disabled', 'true');
    expect(more()).toHaveFocus();
    expect(within(footer()).getByText('225')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(sends(calls)[0]!.body).toMatchObject({ sku: GUL.sku, quantity: 9, expectedPrice: 25, toUserIds: ['u-rojda'] });
  });

  it('stops at what the day’s caps leave for the friend, and at what the spending limit leaves', async () => {
    stub({ dayLeft: [{ userId: 'u-rojda', left: 3, moreAt: null }] });
    const first = renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: /Çay/ }));
    await press(more, 5);
    expect(count()).toHaveTextContent('3');
    first.unmount();

    stub({ limits: { maxPrice: null, left: 350, confirmFrom: 2_000 } });
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: /Pisîk/ }));
    await press(more, 5);
    expect(count()).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'Send gift' })).toBeEnabled();
  });

  it('gives each friend in a group that many, priced for them all', async () => {
    const calls = stub({ balance: 230 });
    const people = [rojda, { userId: 'u-baran', name: 'baran', avatarUrl: null }];
    renderApp(<GiftPicker open onClose={() => undefined} chat={{ kind: 'group', groupId: 'g1' }} people={people} onSent={() => undefined} />);
    await userEvent.click(screen.getByLabelText('Select all'));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(await screen.findByRole('button', { name: /Gul/ }));
    // nine roses' worth of Zêr is four each for two
    await press(more, 6);
    expect(count()).toHaveTextContent('4');
    expect(screen.getByText('4 × Gul for rojda, baran')).toBeInTheDocument();
    expect(within(footer()).getByText('200')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(sends(calls)[0]!.body).toMatchObject({ quantity: 4, toUserIds: ['u-rojda', 'u-baran'] });
  });

  it('gives several from the bag, as many as it holds', async () => {
    const calls = stub({ bag: [{ sku: CAY.sku, name: 'Çay', assetUrl: CAY.assetUrl, count: 2 }] });
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    await userEvent.click(within(await screen.findByRole('list', { name: 'Your bag' })).getByRole('button', { name: /Çay/ }));
    await press(more, 3);
    expect(count()).toHaveTextContent('2');
    expect(screen.getByText('2 × Çay for rojda')).toBeInTheDocument();
    expect(screen.getByText('From your bag, free')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(sends(calls)[0]!.body).toMatchObject({ sku: CAY.sku, fromBag: true, quantity: 2 });
  });

  it('starts again at one when another gift is picked, and sends one without a number', async () => {
    const calls = stub();
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: /Gul/ }));
    await press(more, 2);
    expect(screen.getByText('3 × Gul for rojda')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Qehwe/ }));
    expect(count()).toHaveTextContent('1');
    expect(screen.getByText('Qehwe for rojda')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(sends(calls)[0]!.body!.quantity).toBeUndefined();
  });

  it('shows no stepper when only one can go: one gift’s worth of Zêr, or something one of a kind', async () => {
    stub({ balance: 30 });
    const first = renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: /Gul/ }));
    expect(screen.getByText('Gul for rojda')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'How many' })).toBeNull();
    first.unmount();

    // something a friend here already has is one of a kind, and goes one at a time
    stub({ items: [{ ...GUL, alreadyOwnedBy: ['u-baran'] }] });
    const people = [rojda, { userId: 'u-baran', name: 'baran', avatarUrl: null }];
    renderApp(<GiftPicker open onClose={() => undefined} chat={{ kind: 'group', groupId: 'g1' }} people={people} onSent={() => undefined} />);
    await userEvent.click(screen.getByLabelText('Select all'));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(await screen.findByRole('button', { name: /Gul/ }));
    expect(screen.getByText('Gul for rojda')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'How many' })).toBeNull();
  });

  it('keeps the key and the number on a retry of the same send, and takes a new key for another number', async () => {
    const calls = stub({
      sends: [
        [500, { code: 'INTERNAL', message: 'broken' }],
        [200, { batchId: 'b1', sent: ['u-rojda'], skipped: [], balance: { zer: 29_925 }, freeGifts: 0, message: null }],
      ],
    });
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: /Gul/ }));
    await press(more, 2);
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    const [failed, retry] = sends(calls);
    expect(retry!.body).toMatchObject({ quantity: 3, idempotencyKey: failed!.body!.idempotencyKey });
    expect(failed!.body!.quantity).toBe(3);

    await press(more, 1);
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    const other = sends(calls)[2]!.body!;
    expect(other.quantity).toBe(4);
    expect(other.idempotencyKey).not.toBe(failed!.body!.idempotencyKey);
  });

  it('asks the second look for the whole send, and sends that many with the server’s token', async () => {
    const calls = stub({
      sends: [
        [409, { code: 'GIFT_NEEDS_CONFIRM', message: 'confirm', details: { confirmToken: 'tok-3', total: 6_000, recipients: 1, expiresAt: '2030-01-01T00:00:00Z' } }],
        [200, { batchId: 'b9', sent: ['u-rojda'], skipped: [], balance: { zer: 24_000 }, freeGifts: 0, message: null }],
      ],
    });
    renderApp(<GiftPicker open onClose={() => undefined} chat={dm} people={[rojda]} onSent={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: /Belem/ }));
    await press(more, 2);
    expect(within(footer()).getByText('6,000')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    const check = await screen.findByRole('region', { name: 'One more look before it goes' });
    expect(within(check).getByText('6,000 Zêr')).toBeInTheDocument();
    expect(within(check).getByText(/for rojda/)).toHaveTextContent('3 × Belem · for rojda');
    await userEvent.click(within(check).getByRole('button', { name: /Send it/ }));
    const [first, second] = sends(calls);
    expect(second!.body).toMatchObject({ quantity: 3, confirmToken: 'tok-3', idempotencyKey: first!.body!.idempotencyKey });
  });
});
