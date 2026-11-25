import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PostGifts } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import { PostGiftsRow } from './PostGifts';

/* A post's gifts on the website: who gave them in one line, and every giver on a press, never naming one this reader may not see. */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const HAMO = { userId: 'u-hamo', username: 'hamo', displayName: 'Hamo', avatarUrl: null };
const gifts = (over: Partial<PostGifts> = {}): PostGifts => ({
  count: 5,
  items: [{ sku: 'sticker-lale', name: 'Lale', assetUrl: null, count: 5 }],
  senders: 4,
  from: HAMO,
  ...over,
});
const post = (g: PostGifts | undefined) => ({ targetType: 'library' as const, id: 'p1', gifts: g });

describe('the gifts on a post', () => {
  it('shows nothing until there is a gift, or on an older answer without any', () => {
    const none = renderApp(<PostGiftsRow item={post(gifts({ count: 0, items: [], senders: 0, from: null }))} />);
    expect(none.container.querySelector('.fcard-gifts')).toBeNull();
    none.unmount();
    const older = renderApp(<PostGiftsRow item={post(undefined)} />);
    expect(older.container.querySelector('.fcard-gifts')).toBeNull();
  });

  it('says how many and who gave them, and lists every giver on a press', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/gifts/posts/library/p1')
          ? jsonResponse(200, {
              gifts: gifts(),
              senders: [
                { from: HAMO, sku: 'sticker-lale', itemName: 'Lale', assetUrl: null, at: '2026-11-20T10:00:00Z' },
                { from: null, sku: 'sticker-lale', itemName: 'Lale', assetUrl: null, at: '2026-11-19T10:00:00Z' },
              ],
            })
          : jsonResponse(200, {}),
      ),
    );
    renderApp(<PostGiftsRow item={post(gifts())} />);
    expect(screen.getByText('Gifts from Hamo and 3 others')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Gifts from Hamo and 3 others, Gifts: 5' }));
    const sheet = await screen.findByRole('dialog', { name: 'Gifts on this post' });
    expect(await within(sheet).findByText('Gift from Hamo')).toBeInTheDocument();
    expect(within(sheet).getByText('Gift from a Hevalo member')).toBeInTheDocument();
  });

  it('says a Hevalo member when the latest giver may not be named here', () => {
    renderApp(<PostGiftsRow item={post(gifts({ count: 1, senders: 1, from: null }))} />);
    expect(screen.getByText('Gift from a Hevalo member')).toBeInTheDocument();
  });
});
