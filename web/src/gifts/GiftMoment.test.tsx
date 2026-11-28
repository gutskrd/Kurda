import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GIFT_BOX_EXIT_MS, GIFT_BOX_SEND_MS, GIFT_BOX_UNWRAPS, GIFT_SENT_FADE_MS, GIFT_SENT_LOOK, GIFT_SENT_MS, type GiftCard } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import { GiftMoment, GiftSentMoment, PostGiftOpen } from './GiftMoment';

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

  it('wraps the gift in its tier’s box, ties it and sends it off, and simply shows the gift under Reduce Motion', () => {
    vi.useFakeTimers();
    const { unmount } = renderApp(<GiftSentMoment item={{ ...tea, tier: 'rare' }} line="Sent to rojda." onDone={() => undefined} />);
    expect(document.querySelector('.gift-sent .gift-box')).toHaveAttribute('data-motion', 'send');
    expect(document.querySelector('.gift-sent .gift-box')).toHaveClass('gift-box-rare');
    expect(document.querySelector('.gift-sent .gift-item-art')).not.toBeNull();
    // it stays until its box has flown, then fades
    act(() => {
      vi.advanceTimersByTime(GIFT_SENT_MS);
    });
    expect(document.querySelector('.gift-sent')).not.toHaveClass('is-leaving');
    act(() => {
      vi.advanceTimersByTime(GIFT_BOX_SEND_MS - GIFT_SENT_MS);
    });
    expect(document.querySelector('.gift-sent')).toHaveClass('is-leaving');
    unmount();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    renderApp(<GiftSentMoment item={{ ...tea, tier: 'rare' }} line="Sent to rojda." onDone={() => undefined} />);
    expect(document.querySelector('.gift-sent .gift-box')).toBeNull();
    expect(document.querySelector('.gift-sent .gift-item-art')).not.toBeNull();
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

describe('the gift’s moment', () => {
  const card: GiftCard = {
    batchId: 'b1',
    sku: 'gift-heyv',
    name: 'Heyv',
    category: 'gift',
    assetUrl: null,
    tier: 'grand',
    recipients: [{ name: 'baran', avatarUrl: null, isMe: true, opened: false }],
    from: null,
    myGiftId: 'g1',
    myOpened: false,
    equippable: null,
  };
  function Stage(): React.JSX.Element {
    const [revealed, setRevealed] = useState(false);
    return <GiftMoment card={card} from="Rojda" revealed={revealed} onSkip={() => setRevealed(true)} onClose={() => undefined} />;
  }

  it('unwraps the box in its light, brings the rays up as the light bursts out, and lets the box give way to the gift', () => {
    vi.useFakeTimers();
    renderApp(<Stage />);
    const box = (): Element | null => document.querySelector('.gift-moment .gift-box');
    expect(box()).toHaveAttribute('data-motion', 'unwrap');
    expect(box()).toHaveClass('gift-box-grand');
    const light = document.querySelector('.gift-moment .gift-light')!;
    expect(light).not.toHaveClass('is-lit');
    act(() => {
      vi.advanceTimersByTime(GIFT_BOX_UNWRAPS.grand.burstMs);
    });
    expect(light).toHaveClass('is-lit');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    // the gift is out, and the open box stays a moment as it springs out of it
    expect(screen.getByText('Heyv')).toBeInTheDocument();
    expect(box()).toHaveAttribute('data-motion', 'exit');
    act(() => {
      vi.advanceTimersByTime(GIFT_BOX_EXIT_MS);
    });
    expect(box()).toBeNull();
  });

  it('says how many when several were given, with the count at the picture’s corner', () => {
    renderApp(<GiftMoment card={{ ...card, quantity: 3 }} from="Rojda" revealed onSkip={() => undefined} onClose={() => undefined} />);
    const name = screen.getByText('Heyv');
    expect(name).toHaveAttribute('lang', 'ku');
    expect(name.closest('b')).toHaveTextContent('3 × Heyv');
    const chip = document.querySelector('.gift-moment .gift-count-chip')!;
    expect(chip).toHaveTextContent('×3');
    expect(chip.parentElement!.querySelector('.gift-item-art')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('You got 3 × Heyv from Rojda.');
  });

  it('shows one gift by its name alone, with no count', () => {
    renderApp(<GiftMoment card={card} from="Rojda" revealed onSkip={() => undefined} onClose={() => undefined} />);
    expect(screen.getByText('Heyv', { selector: 'b' })).toHaveAttribute('lang', 'ku');
    expect(document.querySelector('.gift-count-chip')).toBeNull();
  });

  it('keeps the box still under Reduce Motion, and lets the gift simply take its place', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    renderApp(<Stage />);
    expect(document.querySelector('.gift-moment .gift-box')).toHaveAttribute('data-motion', 'still');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByText('Heyv')).toBeInTheDocument();
    expect(document.querySelector('.gift-moment .gift-box')).toBeNull();
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
