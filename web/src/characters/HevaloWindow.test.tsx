import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { WINDOW_PLACE, WINDOW_VIEW, characterArt, cropBox } from '@kurda/shared';
import { I18nProvider } from '../i18n/I18nProvider';
import { HevaloWindow } from './HevaloWindow';

/*
 * Hevalo leaning out of his window on the website: the window behind him,
 * his head and neck cut off at the sill, the sill in front; his head popping
 * up as it appears, but not for a reader who asked for less motion; his
 * reactions as ever; the window mirrored on a page read from the right.
 */

afterEach(() => {
  document.documentElement.dir = 'ltr';
  vi.unstubAllGlobals();
});

function show(ui: React.ReactNode): HTMLElement {
  const { container } = render(<I18nProvider>{ui}</I18nProvider>);
  return container.querySelector<HTMLElement>('.hevalo-window')!;
}

describe('HevaloWindow', () => {
  it('draws his head and neck between the window behind him and the sill in front, for a light page and a dark one', () => {
    const win = show(<HevaloWindow size={200} />);
    const parts = [...win.children].map((el) => el.className);
    expect(parts).toEqual([
      'hevalo-window-art is-light',
      'hevalo-window-art is-dark',
      'hevalo-window-cut',
      'hevalo-window-art is-light',
      'hevalo-window-art is-dark',
    ]);
    // his head and neck, never the whole figure, drawn as tall as his box in the window
    const deer = win.querySelector<HTMLElement>('.hevalo-window-cut .speaking-character')!;
    expect(deer).toHaveAttribute('data-speaker', 'hevalo');
    expect(deer).toHaveAttribute('data-crop', 'head');
    const box = cropBox(characterArt('hevalo'), 'head');
    expect(deer.querySelector('svg')).toHaveAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
    expect(parseFloat(deer.style.height)).toBeCloseTo(WINDOW_PLACE.figure.height * 200);
    expect(parseFloat(win.style.width)).toBeCloseTo((200 * WINDOW_VIEW.w) / WINDOW_VIEW.h);
    // cut off at the sill
    expect(win.style.getPropertyValue('--window-sill')).toBe(`${WINDOW_PLACE.sill * 100}%`);
    // a picture beside words that say it all
    expect(win).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps two windows on a page apart: each drawing its own ids', () => {
    const { container } = render(
      <I18nProvider>
        <HevaloWindow size={120} />
        <HevaloWindow size={120} />
      </I18nProvider>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pops his head up from under the sill, but only for a reader who has not asked for less motion', () => {
    const win = show(<HevaloWindow size={200} />);
    expect(win).toHaveClass('is-popping');
    // from all under the sill, the top of his antlers at it
    expect(win.style.getPropertyValue('--window-drop')).toBe(`${WINDOW_PLACE.drop * 200}px`);
    expect(show(<HevaloWindow size={200} pop={false} />)).not.toHaveClass('is-popping');
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    expect(show(<HevaloWindow size={200} />)).not.toHaveClass('is-popping');
  });

  it('reacts as he always does: a cheer smiles', async () => {
    const win = show(<HevaloWindow size={200} reaction="cheer" />);
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(win.querySelector('[data-eyes="happy"]')).not.toHaveAttribute('visibility');
    expect(win.querySelector('[data-eyes="open"]')).toHaveAttribute('visibility', 'hidden');
  });

  it('mirrors the window on a page read from the right, its curtain and flowers changing sides', () => {
    expect(show(<HevaloWindow size={160} />)).not.toHaveClass('is-mirrored');
    document.documentElement.dir = 'rtl';
    expect(show(<HevaloWindow size={160} />)).toHaveClass('is-mirrored');
  });
});
