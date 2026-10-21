// @vitest-environment jsdom
/**
 * The shop's backgrounds and icons in the admin: cards with their art, adding
 * one with an uploaded picture, editing it, and deleting it — which the
 * dialog says, before anything happens, will delete it or retire it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { failure, fakeApi, json, on, type Call } from '../test/fetch';
import { renderUi } from '../test/render';
import { Shop } from '../pages/Shop';
import type { ShopItem } from './model';

// a test browser decodes no pictures: the size each picked file "has"
const picked = vi.hoisted(() => ({ size: { width: 1920, height: 1080 } as { width: number; height: number } | null }));
vi.mock('./measure', () => ({
  measureImage: vi.fn(async () => picked.size),
  fileBytes: vi.fn(async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
}));

const SHA = 'ab'.repeat(32);
const UPLOADED = `cosmetic/background/${SHA}.webp`;

const bg = (over: Partial<ShopItem> = {}): ShopItem => ({
  sku: 'bg-newroz',
  name: 'Newroz',
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
  assetUrl: '/cosmetics/backgrounds/made-20-newroz.webp',
  premiumOnly: true,
  displayOrder: 20,
  retiredAt: null,
  owners: 0,
  ...over,
});

const shop = (items: ShopItem[]) => [
  on('GET', '/admin/shop/items?retired=include', json({ items })),
  on('GET', '/admin/config/changes', json({ pending: [] })),
];

const sent = (calls: Call[], method: string, path: string): Call[] => calls.filter((c) => c.method === method && c.path === path);

const stored = { key: UPLOADED, url: `https://media.test/${UPLOADED}`, width: 1920, height: 1080, bytes: 86_016, contentType: 'image/webp', trimmed: false };

function png(name = 'newroz.png', type = 'image/png', bytes = 2048): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  picked.size = { width: 1920, height: 1080 };
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('the backgrounds and icons', () => {
  it('shows each background as a card with its art, state, price and owners', async () => {
    fakeApi(
      ...shop([
        bg({ owners: 3 }),
        bg({ sku: 'bg-sor', name: 'Şeva Sor', assetKey: UPLOADED, assetUrl: `https://media.test/${UPLOADED}`, inStock: false, availableFrom: null, availableTo: null }),
        bg({ sku: 'bg-gone', name: 'Old hills', active: false, inStock: false, retiredAt: '2030-01-01T00:00:00.000Z', owners: 2 }),
        bg({ sku: 'icon-roj', name: 'Roj', category: 'icon', assetKey: 'icons/made-02-roj.png', assetUrl: '/cosmetics/icons/made-02-roj.png' }),
      ]),
    );
    const { container } = renderUi(<Shop />);
    const grid = await screen.findByRole('list', { name: 'Backgrounds' });
    const cards = within(grid).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    const [newroz, sor] = cards as [HTMLElement, HTMLElement];
    expect(within(newroz).getByRole('heading', { name: 'Newroz' })).toBeInTheDocument();
    expect(within(newroz).getByText('500 Zêr')).toBeInTheDocument();
    expect(within(newroz).getByText('3 owners')).toBeInTheDocument();
    expect(within(sor).getByText('Off sale')).toBeInTheDocument();
    // the art that ships is on the site; uploaded art is on the CDN already
    const srcs = [...container.querySelectorAll('.art-thumb img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual(['https://hevalo.app/cosmetics/backgrounds/made-20-newroz.webp', `https://media.test/${UPLOADED}`]);
    // the retired one, on request, with nothing left to delete
    expect(screen.queryByText('Old hills')).not.toBeInTheDocument();
    await userEvent.setup().selectOptions(screen.getByLabelText('Show'), 'retired');
    expect(screen.getByText('Old hills')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete “Old hills”' })).not.toBeInTheDocument();
  });

  it('shows icons square, on their own tab', async () => {
    const user = userEvent.setup();
    fakeApi(...shop([bg(), bg({ sku: 'icon-roj', name: 'Roj', category: 'icon', assetKey: 'icons/made-02-roj.png', assetUrl: '/cosmetics/icons/made-02-roj.png' })]));
    const { container } = renderUi(<Shop />);
    await user.click(await screen.findByRole('tab', { name: /icons/i }));
    const grid = await screen.findByRole('list', { name: 'Icons' });
    expect(within(grid).getAllByRole('listitem')).toHaveLength(1);
    expect(container.querySelector('.art-thumb.is-icon img')).toHaveAttribute('src', 'https://hevalo.app/cosmetics/icons/made-02-roj.png');
    expect(screen.getByRole('button', { name: 'New icon' })).toBeInTheDocument();
  });

  it('adds a background: picture uploaded the moment it is chosen, SKU made from the name', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      ...shop([bg()]),
      on('POST', '/admin/shop/art/background', json(stored, 201)),
      on('POST', '/admin/shop/items', json(bg({ sku: 'bg-seva-sor' }), 201)),
    );
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'New background' }));
    const sheet = screen.getByRole('dialog', { name: 'New background' });
    await user.upload(within(sheet).getByLabelText('Background picture file'), png());
    expect(await within(sheet).findByText(/Stored at 1920×1080, 84 KB/)).toBeInTheDocument();
    expect(within(sheet).getByRole('img', { name: 'The new background' })).toHaveAttribute('src', 'blob:preview');
    expect(sent(calls, 'POST', '/admin/shop/art/background')).toHaveLength(1);

    await user.type(within(sheet).getByLabelText(/^name/i), 'Şeva Sor');
    expect(within(sheet).getByLabelText(/^sku/i)).toHaveValue('bg-seva-sor');
    await user.type(within(sheet).getByLabelText(/^description/i), 'A red night');
    await user.click(within(sheet).getByRole('button', { name: 'Add background' }));
    await waitFor(() => expect(sent(calls, 'POST', '/admin/shop/items')).toHaveLength(1));
    expect(sent(calls, 'POST', '/admin/shop/items')[0]!.body).toEqual({
      sku: 'bg-seva-sor',
      name: 'Şeva Sor',
      description: 'A red night',
      category: 'background',
      currency: 'zer',
      price: 500,
      isUnique: true,
      active: true,
      inStock: true,
      assetKey: UPLOADED,
      premiumOnly: true,
      // after the last background
      displayOrder: 21,
    });
    expect(await screen.findByText('Added “Şeva Sor” to the backgrounds.')).toBeInTheDocument();
  });

  it('takes a picture dropped on the frame', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(...shop([]), on('POST', '/admin/shop/art/background', json(stored, 201)));
    const { container } = renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'New background' }));
    fireEvent.drop(container.ownerDocument.querySelector('.art-frame')!, { dataTransfer: { files: [png()] } });
    expect(await screen.findByText(/Stored at 1920×1080/)).toBeInTheDocument();
    expect(sent(calls, 'POST', '/admin/shop/art/background')).toHaveLength(1);
  });

  it('says what is wrong with a picture before sending it, and sends nothing', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { calls } = fakeApi(...shop([bg()]));
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'New background' }));
    const sheet = screen.getByRole('dialog', { name: 'New background' });
    const input = within(sheet).getByLabelText('Background picture file');

    picked.size = { width: 1600, height: 1200 };
    await user.upload(input, png());
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('A background must be 16:9, like 1920×1080. This picture is 1600×1200.');

    picked.size = { width: 960, height: 540 };
    await user.upload(input, png());
    await waitFor(() => expect(within(sheet).getByRole('alert')).toHaveTextContent('must be at least 1280×720'));

    await user.upload(input, png('anim.gif', 'image/gif'));
    await waitFor(() => expect(within(sheet).getByRole('alert')).toHaveTextContent('That file isn’t a PNG, WebP or JPEG picture.'));

    await user.upload(input, png('huge.png', 'image/png', 6 * 1024 * 1024));
    await waitFor(() => expect(within(sheet).getByRole('alert')).toHaveTextContent('That file is 6 MB; the limit is 5 MB.'));

    expect(sent(calls, 'POST', '/admin/shop/art/background')).toHaveLength(0);
    // and the form will not add a background without one; what was wrong stays said
    await user.type(within(sheet).getByLabelText(/^name/i), 'Hills');
    await user.click(within(sheet).getByRole('button', { name: 'Add background' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent('That file is 6 MB');
    expect(sent(calls, 'POST', '/admin/shop/items')).toHaveLength(0);
  });

  it('asks for a picture before adding a background without one', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(...shop([bg()]));
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'New background' }));
    const sheet = screen.getByRole('dialog', { name: 'New background' });
    await user.type(within(sheet).getByLabelText(/^name/i), 'Hills');
    await user.click(within(sheet).getByRole('button', { name: 'Add background' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Choose a background picture.');
    expect(sent(calls, 'POST', '/admin/shop/items')).toHaveLength(0);
  });

  it('says the server’s refusal in plain words', async () => {
    const user = userEvent.setup();
    const { use } = fakeApi(
      ...shop([]),
      on('POST', '/admin/shop/art/icon', failure(503, 'STORAGE_UNAVAILABLE', 'picture storage is not set up on this server')),
    );
    renderUi(<Shop />);
    await user.click(await screen.findByRole('tab', { name: /icons/i }));
    // the page's own button (the empty list offers one too)
    await user.click(screen.getAllByRole('button', { name: 'New icon' })[0]!);
    const sheet = screen.getByRole('dialog', { name: 'New icon' });
    picked.size = { width: 512, height: 512 };
    const input = within(sheet).getByLabelText('Icon picture file');
    await user.upload(input, png());
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Picture storage isn’t set up on this server, so art can’t be uploaded yet.');

    use(on('POST', '/admin/shop/art/icon', failure(422, 'WRONG_SHAPE', 'an icon must be square', { width: 600, height: 400, shape: 'square' })));
    await user.upload(input, png());
    await waitFor(() => expect(within(sheet).getByRole('alert')).toHaveTextContent('An icon must be square, like 512×512. This picture is 600×400.'));

    use(on('POST', '/admin/shop/art/icon', failure(422, 'IMAGE_TOO_DETAILED', 'too detailed', { maxBytes: 81920 })));
    await user.upload(input, png());
    await waitFor(() => expect(within(sheet).getByRole('alert')).toHaveTextContent('too much fine detail to fit in 80 KB'));
  });

  it('edits only what changed, and keeps the sale window it does not show', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(...shop([bg()]), on('PATCH', '/shop/items/bg-newroz', json(bg({ name: 'Newroz fire' }))));
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'Edit “Newroz”' }));
    const sheet = screen.getByRole('dialog', { name: 'Edit “Newroz”' });
    expect(within(sheet).getByRole('img', { name: 'The background as it is now' })).toHaveAttribute(
      'src',
      'https://hevalo.app/cosmetics/backgrounds/made-20-newroz.webp',
    );
    expect(within(sheet).getByLabelText(/^sku/i)).toHaveAttribute('readonly');
    const name = within(sheet).getByLabelText(/^name/i);
    await user.clear(name);
    await user.type(name, 'Newroz fire');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(calls, 'PATCH', '/shop/items/bg-newroz')).toHaveLength(1));
    expect(sent(calls, 'PATCH', '/shop/items/bg-newroz')[0]!.body).toEqual({ name: 'Newroz fire' });
    expect(await screen.findByText('Saved “Newroz fire”.')).toBeInTheDocument();
  });

  it('replaces the art, and takes an item off sale without unlisting it', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      ...shop([bg()]),
      on('POST', '/admin/shop/art/background', json(stored, 201)),
      on('PATCH', '/shop/items/bg-newroz', json(bg())),
    );
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'Edit “Newroz”' }));
    await user.upload(screen.getByLabelText('Background picture file'), png());
    expect(await screen.findByText(/Stored at/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('On sale'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(calls, 'PATCH', '/shop/items/bg-newroz')).toHaveLength(1));
    expect(sent(calls, 'PATCH', '/shop/items/bg-newroz')[0]!.body).toEqual({ assetKey: UPLOADED, inStock: false });
  });

  it('sends a new price of 1,000 or more to Approvals, and follows the server when it says so', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(...shop([bg()]), on('POST', '/admin/config/changes', json({ id: 'c1', status: 'pending' }, 202)));
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'Edit “Newroz”' }));
    const price = screen.getByLabelText(/^price/i);
    await user.clear(price);
    await user.type(price, '1500');
    expect(screen.getByText('A second admin approves this price')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(sent(calls, 'POST', '/admin/config/changes')).toHaveLength(1));
    expect(sent(calls, 'POST', '/admin/config/changes')[0]!.body).toEqual({
      target: 'shop_item',
      payload: { sku: 'bg-newroz', name: 'Newroz', currency: 'zer', price: 1500 },
    });
    expect(sent(calls, 'PATCH', '/shop/items/bg-newroz')).toHaveLength(0);
    expect(await screen.findByText(/waiting in Approvals/)).toBeInTheDocument();
  });

  it('turns the save into a request for approval when the server says the price needs one', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      ...shop([bg({ price: 900 })]),
      on('PATCH', '/shop/items/bg-newroz', failure(409, 'PRICE_NEEDS_APPROVAL', 'a price of 1,000 or more goes through Approvals')),
    );
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'Edit “Newroz”' }));
    await user.type(screen.getByLabelText(/^description/i), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/This price needs a second admin/)).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('button', { name: 'Send for approval' })).toBeInTheDocument();
    expect(sent(calls, 'PATCH', '/shop/items/bg-newroz')).toHaveLength(1);
  });
});

describe('deleting a background', () => {
  it('says it will be deleted when nobody has it, and deletes it', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      ...shop([bg()]),
      on('GET', '/admin/shop/items/bg-newroz/usage', json({ sku: 'bg-newroz', owners: 0, equipped: 0, gifts: 0, refunds: 0, builtIn: false, outcome: 'delete' })),
      on('DELETE', '/shop/items/bg-newroz', json({ sku: 'bg-newroz', outcome: 'deleted', owners: 0, equipped: 0, gifts: 0, refunds: 0, builtIn: false, unequipped: 0, artReleased: false })),
    );
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'Delete “Newroz”' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete “Newroz”?' });
    expect(await within(dialog).findByText(/Nobody owns it, wears it or has been given it, so it will be deleted for good/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent(calls, 'DELETE', '/shop/items/bg-newroz')).toHaveLength(1));
    expect(await screen.findByText('Deleted “Newroz”.')).toBeInTheDocument();
  });

  it('says it will be retired because people own it, and that they keep it', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      ...shop([bg({ owners: 3 })]),
      on('GET', '/admin/shop/items/bg-newroz/usage', json({ sku: 'bg-newroz', owners: 3, equipped: 1, gifts: 0, refunds: 0, builtIn: false, outcome: 'retire' })),
      on('DELETE', '/shop/items/bg-newroz', json({ sku: 'bg-newroz', outcome: 'retired', owners: 3, equipped: 1, gifts: 0, refunds: 0, builtIn: false, unequipped: 0, artReleased: false })),
    );
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'Delete “Newroz”' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Retire “Newroz”?' });
    expect(within(dialog).getByText('3 people own it, so it can’t be deleted.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Everyone who owns it keeps it and can still wear it/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Retire' }));
    await waitFor(() => expect(sent(calls, 'DELETE', '/shop/items/bg-newroz')).toHaveLength(1));
    expect(await screen.findByText('Retired “Newroz”. 3 people own it and can still wear it.')).toBeInTheDocument();
  });

  it('says the art that ships with the app is retired, not deleted', async () => {
    const user = userEvent.setup();
    fakeApi(
      ...shop([bg()]),
      on('GET', '/admin/shop/items/bg-newroz/usage', json({ sku: 'bg-newroz', owners: 0, equipped: 0, gifts: 0, refunds: 0, builtIn: true, outcome: 'retire' })),
    );
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'Delete “Newroz”' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Retire “Newroz”?' });
    expect(within(dialog).getByText(/part of the art that ships with the app/)).toBeInTheDocument();
    // and nothing is gone until it is confirmed
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('says why a delete was refused, and leaves the dialog open', async () => {
    const user = userEvent.setup();
    fakeApi(
      ...shop([bg()]),
      on('GET', '/admin/shop/items/bg-newroz/usage', json({ sku: 'bg-newroz', owners: 0, equipped: 0, gifts: 0, refunds: 0, builtIn: false, outcome: 'delete' })),
      on('DELETE', '/shop/items/bg-newroz', failure(409, 'CHANGE_PENDING', 'a change to this item is waiting in Approvals; approve or reject it first')),
    );
    renderUi(<Shop />);
    await user.click(await screen.findByRole('button', { name: 'Delete “Newroz”' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete “Newroz”?' });
    await user.click(await within(dialog).findByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/waiting in Approvals/);
  });
});
