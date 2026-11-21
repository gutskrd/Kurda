import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { PEEK_LEAN, PEEK_PLACE, PEEK_POP, PEEK_VIEW, characterArt, cropBox, mapPath } from '@kurda/shared';
import { I18nProvider } from '../i18n/I18nProvider';
import { HevaloPeek } from './HevaloPeek';

/*
 * Hevalo through a torn page: his head cut at the tear's foot between what lies behind him and what is on our side of
 * him, his shadows under it all, his coming through (skipped under Reduce Motion or with `pop` off), his cheer, asleep
 * when resting, mirrored on request, leaning with the phone's tilt, and turning his head as it tilts and swings.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** How far across his nose is seen, in his own units (the middle of his face is 255): its outline's points where its piece puts them. */
function noseX(root: Element): number {
  const xs = [...root.querySelectorAll('[data-sc="nose"] path')].flatMap((p) => {
    // A turned piece is moved and scaled across as `matrix(wide 0 0 tall x y)`.
    const placed = (p.closest('[data-piece]')?.getAttribute('transform') ?? '').match(/matrix\(([^)]+)\)/)?.[1]?.split(' ').map(Number);
    const [wide, , , , x] = placed ?? [1, 0, 0, 1, 0, 0];
    const pairs = mapPath(p.getAttribute('d') ?? '', (px, py) => [px, py]).match(/-?[\d.]+,-?[\d.]+/g) ?? [];
    return pairs.map((pair) => wide! * Number(pair.split(',')[0]) + x!);
  });
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function show(ui: React.ReactNode): HTMLElement {
  const { container } = render(<I18nProvider>{ui}</I18nProvider>);
  return container.querySelector<HTMLElement>('.hevalo-peek')!;
}

describe('HevaloPeek', () => {
  it('lays his shadows on the page, the tear behind him, him, the tear in front and the shade under his chin, for light and dark', () => {
    const peek = show(<HevaloPeek size={150} />);
    expect([...peek.children].map((el) => el.className)).toEqual([
      'hevalo-peek-art is-light is-cast',
      'hevalo-peek-art is-dark is-cast',
      'hevalo-peek-art is-light is-cast-ears',
      'hevalo-peek-art is-dark is-cast-ears',
      'hevalo-peek-art is-light is-back',
      'hevalo-peek-art is-dark is-back',
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

  it('bursts through the tear toward us and cheers as he comes, unless he is already there or the reader asked for less motion', async () => {
    const peek = show(<HevaloPeek size={150} />);
    expect(peek).toHaveClass('is-popping');
    // his shadow slides down the page as he comes; the tear bursts from its middle, and he turns where his neck meets it
    expect(peek.style.getPropertyValue('--peek-fall')).toBe(`${(PEEK_PLACE.fall * 150 * 0.85).toFixed(1)}px`);
    expect(peek.style.getPropertyValue('--peek-tear-at')).toBe(`${(PEEK_PLACE.tear.x * 100).toFixed(2)}% ${(PEEK_PLACE.tear.y * 100).toFixed(2)}%`);
    expect(peek.querySelector<HTMLElement>('.hevalo-peek-place')!.style.transformOrigin).toBe(
      `${(PEEK_PLACE.pivot.x * 100).toFixed(2)}% ${(PEEK_PLACE.pivot.y * 100).toFixed(2)}%`,
    );
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

  it('leans with the phone’s tilt, right with right and left with left, and lets go of it when gone', async () => {
    vi.stubGlobal('DeviceOrientationEvent', class extends Event {});
    const stop = vi.spyOn(window, 'removeEventListener');
    const { container, unmount } = render(
      <I18nProvider>
        <HevaloPeek size={150} pop={false} />
      </I18nProvider>,
    );
    const peek = container.querySelector<HTMLElement>('.hevalo-peek')!;
    const lean = (): number => parseFloat(peek.style.getPropertyValue('--peek-lean') || '0');
    const tilt = (gamma: number): void => {
      window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 0, gamma }));
    };
    tilt(24);
    await waitFor(() => expect(lean()).toBeGreaterThan(5), { timeout: 3000 });
    expect(lean()).toBeLessThanOrEqual(PEEK_LEAN.maxDeg * 1.1);
    tilt(-24);
    await waitFor(() => expect(lean()).toBeLessThan(-5), { timeout: 3000 });
    unmount();
    expect(stop.mock.calls.filter(([type]) => type === 'deviceorientation')).toHaveLength(1);
    stop.mockRestore();
  });

  it('stands upright for a nearly level phone, and under Reduce Motion', async () => {
    vi.stubGlobal('DeviceOrientationEvent', class extends Event {});
    const peek = show(<HevaloPeek size={150} pop={false} />);
    window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 0, gamma: PEEK_LEAN.deadDeg * 0.8 }));
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(peek.style.getPropertyValue('--peek-lean')).toBe('');
    cleanup();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const still = show(<HevaloPeek size={150} pop={false} />);
    window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 0, gamma: 30 }));
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(still.style.getPropertyValue('--peek-lean')).toBe('');
  });

  it('turns his whole head toward the side the phone swings back on, and toward the side it tilts down on', async () => {
    vi.stubGlobal('DeviceOrientationEvent', class extends Event {});
    const { container } = render(
      <I18nProvider>
        <HevaloPeek size={150} pop={false} />
      </I18nProvider>,
    );
    const art = characterArt('hevalo');
    // Ready to turn: the antlers and ears as groups to turn, the rest in paths to redraw, one copy of each eye state.
    for (const name of ['antler-left', 'antler-right', 'ear-left', 'ear-right']) expect(container.querySelector(`[data-turn="${name}"]`), name).not.toBeNull();
    expect(container.querySelectorAll('[data-round] ellipse, [data-round] circle')).toHaveLength(0);
    expect(container.querySelectorAll('[data-eyes="closed"]')).toHaveLength(1);
    expect(noseX(container)).toBeCloseTo(art.rig!.sniff.x, 0);
    for (let i = 0; i < 12; i++) {
      window.dispatchEvent(Object.assign(new Event('devicemotion'), { rotationRate: { alpha: 0, beta: 0, gamma: 150 } }));
      await act(() => new Promise((r) => setTimeout(r, 40)));
    }
    await waitFor(() => expect(noseX(container)).toBeGreaterThan(280), { timeout: 3000 });
    // The antlers, behind the middle of his head, go the other way.
    expect(container.querySelector('[data-turn="antler-left"]')!.getAttribute('transform')).toMatch(/^translate\((-?[\d.]+)/);
    cleanup();
    const again = render(
      <I18nProvider>
        <HevaloPeek size={150} pop={false} />
      </I18nProvider>,
    ).container;
    window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 0, gamma: -16 }));
    await waitFor(() => expect(noseX(again)).toBeLessThan(240), { timeout: 3000 });
  });
});

