import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installPressFeedback, TAP_FLASH_MS, TOUCH_HOLD_MS } from './press';

/** A pointer event as a browser sends it, which the test page has no constructor for. */
function pointer(type: string, init: { pointerType: string; x?: number; y?: number; button?: number }): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  return Object.assign(e, { pointerType: init.pointerType, clientX: init.x ?? 10, clientY: init.y ?? 10, pointerId: 1, button: init.button ?? 0 });
}

describe('a press, shown only when it is one', () => {
  let stop: () => void;
  let button: HTMLButtonElement;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<ul><li><button type="button"><span>Join</span></button></li></ul>';
    button = document.querySelector('button')!;
    stop = installPressFeedback(document);
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('shows a mouse’s press at once, and lets it go with the button', () => {
    button.querySelector('span')!.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse' }));
    expect(button).toHaveClass('is-pressed');
    button.dispatchEvent(pointer('pointerup', { pointerType: 'mouse' }));
    expect(button).not.toHaveClass('is-pressed');
  });

  it('never lights up for a finger that lands on a button to scroll', () => {
    button.dispatchEvent(pointer('pointerdown', { pointerType: 'touch', y: 10 }));
    expect(button).not.toHaveClass('is-pressed');
    button.dispatchEvent(pointer('pointermove', { pointerType: 'touch', y: 40 }));
    vi.advanceTimersByTime(TOUCH_HOLD_MS * 3);
    expect(button).not.toHaveClass('is-pressed');
  });

  it('shows a finger held still as pressed, after a beat', () => {
    button.dispatchEvent(pointer('pointerdown', { pointerType: 'touch' }));
    vi.advanceTimersByTime(TOUCH_HOLD_MS - 1);
    expect(button).not.toHaveClass('is-pressed');
    vi.advanceTimersByTime(2);
    expect(button).toHaveClass('is-pressed');
    button.dispatchEvent(pointer('pointerup', { pointerType: 'touch' }));
    expect(button).not.toHaveClass('is-pressed');
  });

  it('flashes a quick tap pressed as it lands, so a tap always answers', () => {
    button.dispatchEvent(pointer('pointerdown', { pointerType: 'touch' }));
    button.dispatchEvent(pointer('pointerup', { pointerType: 'touch' }));
    expect(button).toHaveClass('is-pressed');
    vi.advanceTimersByTime(TAP_FLASH_MS + 1);
    expect(button).not.toHaveClass('is-pressed');
  });

  it('lets a press go when the page scrolls under it, and never presses a disabled button', () => {
    button.dispatchEvent(pointer('pointerdown', { pointerType: 'pen' }));
    expect(button).toHaveClass('is-pressed');
    document.dispatchEvent(new Event('scroll'));
    expect(button).not.toHaveClass('is-pressed');
    button.disabled = true;
    button.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse' }));
    expect(button).not.toHaveClass('is-pressed');
  });
});
