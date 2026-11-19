import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { PEEK_PLACE, PEEK_POP, PEEK_VIEW, characterArt, cropBox } from '@kurda/shared';
import { I18nProvider } from '../i18n/I18nProvider';
import { HevaloPeek } from './HevaloPeek';

/*
 * Hevalo through a torn page: his head cut at the tear's foot between what lies behind him and what is on our side of
 * him, his rise (skipped under Reduce Motion or with `pop` off), his cheer, asleep when resting, and mirrored on request.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function show(ui: React.ReactNode): HTMLElement {
  const { container } = render(<I18nProvider>{ui}</I18nProvider>);
  return container.querySelector<HTMLElement>('.hevalo-peek')!;
}

describe('HevaloPeek', () => {
  it('lays the tear behind him, his cast shadow, him, the tear in front and the shade under his chin, for light and dark', () => {
    const peek = show(<HevaloPeek size={150} />);
    expect([...peek.children].map((el) => el.className)).toEqual([
      'hevalo-peek-art is-light is-back',
      'hevalo-peek-art is-dark is-back',
      'hevalo-peek-art is-light is-cast',
      'hevalo-peek-art is-dark is-cast',
      'hevalo-peek-cut',
      'hevalo-peek-art is-light is-front',
      'hevalo-peek-art is-dark is-front',
      'hevalo-peek-art is-light is-shadow',
      'hevalo-peek-art is-dark is-shadow',
    ]);
    const deer = peek.querySelector<HTMLElement>('.hevalo-peek-cut .speaking-character')!;
    expect(deer).toHaveAttribute('data-crop', 'head');
    const box = cropBox(characterArt('hevalo'), 'head');
    expect(deer.querySelector('svg')).toHaveAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
    expect(parseFloat(deer.style.height)).toBeCloseTo(PEEK_PLACE.figure.height * 150);
    expect(parseFloat(peek.style.width)).toBeCloseTo((150 * PEEK_VIEW.w) / PEEK_VIEW.h);
    expect(peek.style.getPropertyValue('--peek-cut')).toBe(`${PEEK_PLACE.cut * 100}%`);
    expect(peek).toHaveAttribute('aria-hidden', 'true');
  });

  it('rises through the tear and cheers as he comes, unless he is already there or the reader asked for less motion', async () => {
    const peek = show(<HevaloPeek size={150} />);
    expect(peek).toHaveClass('is-popping');
    expect(peek.style.getPropertyValue('--peek-drop')).toBe(`${PEEK_PLACE.drop * 150}px`);
    // the cheer starts once he is through, and its smile a little into it
    await act(() => new Promise((r) => setTimeout(r, PEEK_POP.delayMs + PEEK_POP.ms * 0.55 + 50)));
    await act(() => new Promise((r) => setTimeout(r, 500)));
    expect(peek.querySelector('[data-eyes="happy"]')).not.toHaveAttribute('visibility');
    expect(show(<HevaloPeek size={150} pop={false} />)).not.toHaveClass('is-popping');
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    expect(show(<HevaloPeek size={150} />)).not.toHaveClass('is-popping');
  });

  it('dozes when resting: eyes shut, the "z"s by his head, and no cheer even when he rises', async () => {
    const peek = show(<HevaloPeek size={150} resting />);
    const deer = peek.querySelector<HTMLElement>('.speaking-character')!;
    expect(deer).toHaveClass('is-resting');
    expect(deer.querySelectorAll('.sc-z')).toHaveLength(3);
    await act(() => new Promise((r) => setTimeout(r, PEEK_POP.delayMs + PEEK_POP.ms * 0.55 + 50)));
    await act(() => new Promise((r) => setTimeout(r, 500)));
    expect(deer.querySelector('[data-eyes="happy"]')).toHaveAttribute('visibility', 'hidden');
  });

  it('mirrors the whole picture when flipped', () => {
    expect(show(<HevaloPeek size={120} />)).not.toHaveClass('is-mirrored');
    const peek = show(<HevaloPeek size={120} flip />);
    expect(peek).toHaveClass('is-mirrored');
  });
});
