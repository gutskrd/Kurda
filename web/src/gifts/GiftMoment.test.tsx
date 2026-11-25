import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { GIFT_SENT_FADE_MS, GIFT_SENT_LOOK, GIFT_SENT_MS } from '@kurda/shared';
import { renderApp } from '../test/utils';
import { GiftSentMoment } from './GiftMoment';

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
