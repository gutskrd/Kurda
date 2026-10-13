// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { failure, fakeApi, json, on, type Call } from '../test/fetch';
import { renderUi } from '../test/render';
import { Shop, needsApproval, saleState, type ShopItem } from './Shop';

const DAY = 86_400_000;

const item = (over: Partial<ShopItem> = {}): ShopItem => ({
  sku: 'bg-newroz',
  name: 'Newroz',
  description: 'Fire on the hills',
  category: 'background',
  currency: 'zer',
  price: 500,
  isUnique: true,
  active: true,
  inStock: true,
  availableFrom: null,
  availableTo: null,
  assetKey: 'backgrounds/made-20-newroz.webp',
  premiumOnly: true,
  displayOrder: 20,
  ...over,
});

const posts = (calls: Call[], path: string): Call[] => calls.filter((c) => c.method !== 'GET' && c.path === path);

const shop = (items: ShopItem[], pending: unknown[] = []) => [
  on('GET', '/admin/shop/items', json({ items })),
  on('GET', '/admin/config/changes', json({ pending })),
];

describe('the shop', () => {
  it('keeps the sale window, the art and the rest of an item when only its name changes', async () => {
    const user = userEvent.setup();
    const windowed = item({ availableFrom: '2030-03-01T09:00:00.000Z', availableTo: '2030-03-31T21:00:00.000Z' });
    const { calls } = fakeApi(...shop([windowed]), on('POST', '/shop/items', json(windowed)));
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'Edit “Newroz”' }));
    const name = screen.getByLabelText(/^name/i);
    await user.clear(name);
    await user.type(name, 'Newroz fire');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posts(calls, '/shop/items')).toHaveLength(1));
    expect(posts(calls, '/shop/items')[0]!.body).toEqual({
      sku: 'bg-newroz',
      name: 'Newroz fire',
      description: 'Fire on the hills',
      category: 'background',
      currency: 'zer',
      price: 500,
      isUnique: true,
      active: true,
      inStock: true,
      availableFrom: '2030-03-01T09:00:00.000Z',
      availableTo: '2030-03-31T21:00:00.000Z',
      assetKey: 'backgrounds/made-20-newroz.webp',
      premiumOnly: true,
      displayOrder: 20,
    });
    expect(await screen.findByText('Saved “Newroz fire”.')).toBeInTheDocument();
  });

  it('sends a price of 1,000 or more to Approvals, and says it waits there', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(...shop([item()]), on('POST', '/admin/config/changes', json({ id: 'c1', status: 'pending' }, 202)));
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'Edit “Newroz”' }));
    const price = screen.getByLabelText(/^price/i);
    await user.clear(price);
    await user.type(price, '1500');
    expect(screen.getByText('A second admin approves this price')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(posts(calls, '/admin/config/changes')).toHaveLength(1));
    const sent = posts(calls, '/admin/config/changes')[0]!.body as { target: string; payload: Record<string, unknown> };
    expect(sent.target).toBe('shop_item');
    expect(sent.payload).toMatchObject({ sku: 'bg-newroz', price: 1500, premiumOnly: true, availableTo: null });
    expect(posts(calls, '/shop/items')).toHaveLength(0);
    expect(await screen.findByText(/waiting in Approvals/)).toBeInTheDocument();
  });

  it('saves the rest of a dear item at once when its price stays', async () => {
    const user = userEvent.setup();
    const dear = item({ price: 2000, currency: 'gems' });
    const { calls } = fakeApi(...shop([dear]), on('POST', '/shop/items', json(dear)));
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'Edit “Newroz”' }));
    await user.click(screen.getByLabelText(/one per person/i));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posts(calls, '/shop/items')).toHaveLength(1));
    expect(posts(calls, '/shop/items')[0]!.body).toMatchObject({ price: 2000, isUnique: false });
    expect(posts(calls, '/admin/config/changes')).toHaveLength(0);
  });

  it('adds a tag item, a category the old form did not have, and checks the SKU first', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(...shop([item()]), on('POST', '/shop/items', json(item({ sku: 'tag-kurdish' }))));
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'New item' }));
    await user.type(screen.getByLabelText(/^name/i), 'Kurdish tag');
    await user.type(screen.getByLabelText(/^sku/i), 'bg-newroz');
    await user.selectOptions(screen.getByLabelText(/^category/i), 'tag');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    expect(screen.getByText('An item already has this SKU. Edit that one instead.')).toBeInTheDocument();
    expect(posts(calls, '/shop/items')).toHaveLength(0);

    const sku = screen.getByLabelText(/^sku/i);
    await user.clear(sku);
    await user.type(sku, 'tag-kurdish');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(posts(calls, '/shop/items')).toHaveLength(1));
    const body = posts(calls, '/shop/items')[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({ sku: 'tag-kurdish', category: 'tag', price: 0 });
    // left empty: not sent, so the catalogue route stores nothing for them
    expect(body).not.toHaveProperty('availableFrom');
    expect(body).not.toHaveProperty('assetKey');
  });

  it('says the server refused a dear price in words that lead to Approvals', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      ...shop([item({ price: 900 })]),
      on('POST', '/shop/items', failure(409, 'PRICE_NEEDS_APPROVAL', 'a price of 1,000 or more goes through Approvals')),
      on('POST', '/admin/config/changes', json({ id: 'c1', status: 'pending' }, 202)),
    );
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'Edit “Newroz”' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/This price needs a second admin\. Send it for approval/)).toHaveAttribute('role', 'alert');
    // the next save goes where the server pointed
    await user.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(posts(calls, '/admin/config/changes')).toHaveLength(1));
  });

  it('takes an item off sale straight away, and says owners keep it', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(...shop([item()]), on('PATCH', '/shop/items/bg-newroz/stock', json({ ok: true })));
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'Take off sale' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')[0]?.body).toEqual({ inStock: false }));
    expect(await screen.findByText(/off sale\. Anyone who owns it keeps it\./)).toBeInTheDocument();
  });

  it('finds items by name or SKU and by status, and says when nothing matches', async () => {
    const user = userEvent.setup();
    fakeApi(...shop([item(), item({ sku: 'ic-star', name: 'Star', category: 'icon', inStock: false })]));
    renderUi(<Shop />);
    expect(await screen.findByText('Star')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'off');
    expect(screen.queryByText('Newroz')).not.toBeInTheDocument();
    expect(screen.getByText('Star')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search items'), 'newroz');
    expect(screen.getByText('No item matches these filters.')).toBeInTheDocument();
  });

  it('says a failed load is a failure, not an empty shop', async () => {
    fakeApi(on('GET', '/admin/shop/items', failure(403, 'FORBIDDEN', 'insufficient permissions')), on('GET', '/admin/config/changes', json({ pending: [] })));
    renderUi(<Shop />);
    expect(await screen.findByText('Your role can’t open this')).toBeInTheDocument();
    expect(screen.queryByText(/No items yet/)).not.toBeInTheDocument();
  });

  it('points at Approvals while shop changes wait there', async () => {
    fakeApi(...shop([item()], [{ id: 'c1', target: 'shop_item' }, { id: 'c2', target: 'event' }]));
    renderUi(<Shop />);
    const banner = (await screen.findByText('1 shop change waits for a second admin')).closest('.banner') as HTMLElement;
    expect(within(banner).getByRole('link', { name: 'Open Approvals' })).toHaveAttribute('href', '#/approvals');
  });
});

describe('an item’s sale state', () => {
  const now = Date.parse('2030-06-01T12:00:00Z');
  it('tells retired, off sale, not yet and ended apart', () => {
    expect(saleState(item({ active: false, inStock: false }), now)).toBe('hidden');
    expect(saleState(item({ inStock: false }), now)).toBe('off');
    expect(saleState(item({ availableFrom: new Date(now + DAY).toISOString() }), now)).toBe('scheduled');
    expect(saleState(item({ availableTo: new Date(now - DAY).toISOString() }), now)).toBe('ended');
    expect(saleState(item({ availableFrom: new Date(now - DAY).toISOString(), availableTo: new Date(now + DAY).toISOString() }), now)).toBe('on');
  });

  it('needs a second admin only for a new price at or over 1,000', () => {
    expect(needsApproval(null, 999, 'zer')).toBe(false);
    expect(needsApproval(null, 1000, 'zer')).toBe(true);
    expect(needsApproval({ price: 1500, currency: 'gems' }, 1500, 'gems')).toBe(false);
    expect(needsApproval({ price: 1500, currency: 'gems' }, 1500, 'zer')).toBe(true);
    expect(needsApproval({ price: 500, currency: 'zer' }, 1200, 'zer')).toBe(true);
  });
});
