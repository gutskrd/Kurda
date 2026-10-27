// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderUi } from '../test/render';
import { HevaloMark } from './HevaloMark';
import { followPointer } from './eyes';

/** An element whose box on the screen is `box`. */
function placed(box: { left: number; top: number; width: number; height: number }): HTMLElement {
  const el = document.createElement('span');
  el.getBoundingClientRect = () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => box });
  return el;
}

describe("Hevalo's icon", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('is the picture at three sizes with a pupil in each eye, and decorative', () => {
    const { container } = renderUi(<HevaloMark size={40} />, { kit: false });
    const mark = container.querySelector('.hevalo-mark');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    const img = mark?.querySelector('img');
    expect(img).toHaveAttribute('alt', '');
    expect(img?.getAttribute('srcset')).toMatch(/hevalo-96\.webp 96w.*hevalo-192\.webp 192w.*hevalo-288\.webp 288w/);
    expect(mark?.querySelectorAll('.hevalo-eye .hevalo-pupil')).toHaveLength(2);
  });

  it('looks toward the pointer, and back to where the icon has its eyes when stopped', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
    const eyes = [placed({ left: 100, top: 100, width: 58, height: 68 }), placed({ left: 200, top: 100, width: 58, height: 68 })];
    const pupils = eyes.map((eye) => eye.appendChild(document.createElement('span')));
    const stop = followPointer(pupils[0]!, pupils[1]!);
    // the DOM the tests run in has no PointerEvent: a mouse event carries the same fields
    window.dispatchEvent(Object.assign(new MouseEvent('pointermove', { clientX: 1000, clientY: 134 }), { pointerType: 'mouse' }));
    for (let i = 0; i < 60 && frames.length; i++) frames.shift()!(i * 16);
    // both look right: each pupil has moved that way from where it is drawn
    for (const pupil of pupils) expect(Number.parseFloat(pupil.style.translate)).toBeGreaterThan(0);
    stop();
    for (const pupil of pupils) expect(pupil.style.translate).toBe('');
  });

  it('stays as drawn for whoever asks for less motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const listen = vi.spyOn(window, 'addEventListener');
    const pupils = [placed({ left: 0, top: 0, width: 58, height: 68 }), placed({ left: 80, top: 0, width: 58, height: 68 })];
    followPointer(pupils[0]!, pupils[1]!)();
    expect(listen).not.toHaveBeenCalledWith('pointermove', expect.anything(), expect.anything());
  });
});
