// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderUi } from '../test/render';
import { BACKDROP, Backdrop } from './Backdrop';

let play: ReturnType<typeof vi.fn>;

beforeEach(() => {
  play = vi.fn(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play as () => Promise<void>);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
  delete (navigator as { connection?: unknown }).connection;
});

function lessMotion(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: query.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }),
  });
}

describe('the moving backdrop', () => {
  it('plays the rain silently, on a loop, in the page, out of reach of the keyboard and screen readers', () => {
    const { container } = renderUi(<Backdrop />, { kit: false });
    const layer = container.querySelector('.backdrop')!;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    const video = layer.querySelector('video')!;
    expect(video.muted).toBe(true);
    // a phone looks for the attribute before it will start a video by itself
    expect(video).toHaveAttribute('muted');
    expect(video.loop).toBe(true);
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('tabindex', '-1');
    expect(video).toHaveAttribute('poster', BACKDROP.poster);
    // the smaller file first, for the browsers that can play it
    expect([...video.querySelectorAll('source')].map((s) => [s.getAttribute('src'), s.getAttribute('type')])).toEqual([
      [BACKDROP.webm, 'video/webm'],
      [BACKDROP.mp4, 'video/mp4'],
    ]);
    expect(play).toHaveBeenCalled();
  });

  it('keeps to the still frame when less motion is asked for', () => {
    lessMotion();
    const { container } = renderUi(<Backdrop />, { kit: false });
    expect(container.querySelector('.backdrop')).not.toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('keeps to the still frame when the browser is saving data', () => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
    const { container } = renderUi(<Backdrop />, { kit: false });
    expect(container.querySelector('video')).toBeNull();
  });

  it('shows the still frame quietly when the browser will not play it', async () => {
    const refused = Promise.reject(new DOMException('not allowed', 'NotAllowedError'));
    play.mockReturnValue(refused);
    const { container } = renderUi(<Backdrop />, { kit: false });
    await refused.catch(() => undefined);
    expect(container.querySelector('.backdrop video')).not.toBeNull();
  });
});
