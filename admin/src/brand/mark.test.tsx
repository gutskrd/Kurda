// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/dom';
import { renderUi } from '../test/render';
import { HevaloMark } from './HevaloMark';
import { PEEK_EYES, caretPoint, followPointer } from './eyes';

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

describe('the sign-in’s Hevalo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('has lids and takes its mood; the small icons have neither', () => {
    const { container, rerender } = renderUi(<HevaloMark size={104} lively mood="shy" />, { kit: false });
    const mark = container.querySelector('.hevalo-mark')!;
    expect(mark).toHaveClass('is-lively');
    // shut, as the Hevalo character shuts them: the white covered and the lashes along a curve
    const lids = mark.querySelectorAll('.hevalo-lids');
    expect(lids).toHaveLength(2);
    for (const lid of lids) {
      expect(lid).toHaveAttribute('data-eye', 'closed');
      expect(lid.querySelector('ellipse')).not.toBeNull();
    }
    expect(mark).toHaveAttribute('data-mood', 'shy');
    rerender(<HevaloMark size={30} />);
    expect(container.querySelector('.hevalo-lids')).toBeNull();
  });

  it('peeks with one eye, passing half shut on the way from open to shut', async () => {
    const { container, rerender } = renderUi(<HevaloMark size={104} lively />, { kit: false });
    const eyes = (): Array<string | null> => [...container.querySelectorAll('.hevalo-lids')].map((l) => l.getAttribute('data-eye'));
    expect(eyes()).toEqual(['open', 'open']);
    rerender(<HevaloMark size={104} lively mood="peek" />);
    expect(eyes()).toEqual(['half', 'half']);
    await waitFor(() => expect(eyes()).toEqual(['closed', 'half']));
  });

  it('hops when tapped, and only when looking about', async () => {
    const { container } = renderUi(<HevaloMark size={104} lively />, { kit: false });
    const mark = container.querySelector('.hevalo-mark')!;
    fireEvent.pointerDown(mark);
    expect(mark).toHaveAttribute('data-mood', 'happy');
    await waitFor(() => expect(mark).toHaveAttribute('data-mood', 'idle'));
  });

  it('looks at what it is given instead of the pointer, and leans that way', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
    const eyes = [placed({ left: 100, top: 100, width: 58, height: 68 }), placed({ left: 200, top: 100, width: 58, height: 68 })];
    const pupils = eyes.map((eye) => eye.appendChild(document.createElement('span')));
    const head = document.createElement('span');
    // the pointer to the right, the caret far to the left: the eyes go left
    window.dispatchEvent(Object.assign(new MouseEvent('pointermove', { clientX: 1000, clientY: 134 }), { pointerType: 'mouse' }));
    const stop = followPointer(pupils[0]!, pupils[1]!, { gaze: () => ({ x: -800, y: 134 }), tilt: head });
    for (let i = 0; i < 80 && frames.length; i++) frames.shift()!(i * 16);
    for (const pupil of pupils) expect(Number.parseFloat(pupil.style.translate)).toBeLessThan(0);
    expect(Number.parseFloat(head.style.getPropertyValue('--lean-y'))).toBeLessThan(0);
    stop();
    expect(head.style.getPropertyValue('--lean-y')).toBe('');
  });

  it('follows the caret along a box as more is typed', () => {
    const input = document.createElement('input');
    input.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 40, right: 300, bottom: 40, x: 0, y: 0, toJSON: () => null });
    document.body.append(input);
    input.value = 'ro';
    input.setSelectionRange(2, 2);
    const short = caretPoint(input);
    input.value = 'rojda@hevalo';
    input.setSelectionRange(12, 12);
    const long = caretPoint(input);
    expect(long.x).toBeGreaterThan(short.x);
    expect(long.y).toBe(20);
    input.value = 'x'.repeat(200);
    input.setSelectionRange(200, 200);
    // never past the end of the box
    expect(caretPoint(input).x).toBeLessThanOrEqual(300);
    input.remove();
  });
});

describe('the cut-out Hevalo', () => {
  it('shows the head and neck at three sizes, with pupils and lids over its own eyes', () => {
    const { container } = renderUi(<HevaloMark art="peek" size={180} lively />, { kit: false });
    const mark = container.querySelector('.hevalo-mark')!;
    expect(mark).toHaveClass('is-peek');
    const img = mark.querySelector('img')!;
    expect(img.getAttribute('srcset')).toMatch(/hevalo-peek-180\.webp 180w.*hevalo-peek-360\.webp 360w.*hevalo-peek-540\.webp 540w/);
    // its own shape, 744 by 810
    expect(img).toHaveAttribute('height', String(Math.round((180 * 810) / 744)));
    expect(mark.querySelectorAll('.hevalo-eye .hevalo-pupil')).toHaveLength(2);
    expect(mark.querySelectorAll('.hevalo-lids')).toHaveLength(2);
  });

  it('moves its pupils by its own eyes’ measures', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
    // each white shown 149 wide, as the picture has it: a pupil moves at most its reach, 36
    const eyes = [placed({ left: 100, top: 100, width: 149, height: 172 }), placed({ left: 300, top: 100, width: 149, height: 172 })];
    const pupils = eyes.map((eye) => eye.appendChild(document.createElement('span')));
    const stop = followPointer(pupils[0]!, pupils[1]!, { eyes: PEEK_EYES, gaze: () => ({ x: 5000, y: 186 }) });
    for (let i = 0; i < 120 && frames.length; i++) frames.shift()!(i * 16);
    // the left pupil is drawn turned in already (97 of 149), so it has less far to go right than the right one (53)
    const [left, right] = pupils.map((p) => Number.parseFloat(p.style.translate));
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(left!);
    expect(right).toBeLessThanOrEqual(74.5 + 36 - 53 + 0.5);
    stop();
  });
});
