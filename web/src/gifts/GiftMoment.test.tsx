import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GIFT_SENT_FADE_MS, GIFT_SENT_LOOK, GIFT_SENT_MS, type GiftCard } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import { GiftSentMoment, PostGiftOpen } from './GiftMoment';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tea = { sku: 'gift-cay', assetUrl: '/cosmetics/gifts/made-01-cay.png', category: 'gift' };

describe('the sender’s moment', () => {
  it('shows the gift in its light, smaller, with who it went to, and is gone after a moment', async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    renderApp(<GiftSentMoment item={tea} line="Sent to rojda." announce onDone={onDone} />);
    expect(screen.getByRole('status')).toHaveTextContent('Sent to rojda.');
    const light = document.querySelector('.gift-sent .gift-light')!;
    expect(light.querySelector('.gift-light-rays path')!.getAttribute('d')!.match(/M/g)).toHaveLength(GIFT_SENT_LOOK.rays);
    expect(light.querySelectorAll('.gift-light-sparkle')).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(GIFT_SENT_MS);
    });
    expect(document.querySelector('.gift-sent')).toHaveClass('is-leaving');
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(GIFT_SENT_FADE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('says nothing to a screen reader in a chat, which announces the send itself', () => {
    renderApp(<GiftSentMoment item={tea} line="Sent to rojda." onDone={() => undefined} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('.gift-sent')).toHaveAttribute('aria-hidden', 'true');
  });

  it('goes at a tap, and stands still under Reduce Motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    const onDone = vi.fn();
    renderApp(<GiftSentMoment item={tea} line="Sent to rojda." onDone={onDone} />);
    expect(document.querySelector('.gift-sent .gift-light')).toHaveClass('is-still');
    (document.querySelector('.gift-sent') as HTMLElement).click();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('a gift given onto your post, opened from its notice', () => {
  const opened: GiftCard = {
    batchId: 'b1',
    sku: 'gift-gul',
    name: 'Gul',
    category: 'gift',
    assetUrl: '/cosmetics/gifts/made-03-gul.png',
    tier: 'common',
    recipients: [{ name: 'baran', avatarUrl: null, isMe: true, opened: true }],
    from: { userId: 'u-rojda', username: 'rojda', displayName: 'Rojda', avatarUrl: null },
    myGiftId: 'g1',
    myOpened: true,
    equippable: null,
  };

  it('opens it on the server and plays its moment, with Close alone since a post has no chat', async () => {
    const posts: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') posts.push(url);
        if (url.endsWith('/gifts/g1/open')) return jsonResponse(200, { card: opened, equippable: null });
        return jsonResponse(200, {});
      }),
    );
    const onDone = vi.fn();
    renderApp(<PostGiftOpen giftId="g1" onDone={onDone} />);
    const moment = await screen.findByRole('dialog', { name: 'A gift from Rojda' });
    expect(posts.some((u) => u.endsWith('/gifts/g1/open'))).toBe(true);
    await userEvent.click(within(moment).getByRole('button', { name: 'Skip' }));
    expect(await within(moment).findByText('Gul')).toBeInTheDocument();
    expect(within(moment).queryByRole('button', { name: 'Say thanks' })).toBeNull();
    await userEvent.click(within(moment).getByRole('button', { name: 'Close' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows nothing, and lets the post be, when the gift cannot be opened', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { code: 'GIFT_NOT_FOUND', message: 'no such gift' })));
    const onDone = vi.fn();
    renderApp(<PostGiftOpen giftId="g1" onDone={onDone} />);
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
