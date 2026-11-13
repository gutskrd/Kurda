// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { SocialSlide } from './SocialSlide';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

// a phone's screen: jsdom's window has no size, and the panel is a share of its width
Object.defineProperty(window, 'visualViewport', { value: { height: 800, width: 400, scale: 1 }, configurable: true });
window.dispatchEvent(new Event('resize'));

/** A finger on `from`, sideways `dx` points in steps of 20, `msPerStep` apart (without, let go of slowly), and off. */
function swipe(from: Element, dx: number, msPerStep?: number): void {
  let time = 1_000_000;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => time);
  const at = (x: number) => ({ clientX: x, clientY: 300, pageX: x, pageY: 300, buttons: 1 });
  fireEvent.mouseDown(from, { ...at(200), button: 0 });
  for (let x = 200; Math.abs(x - 200) < Math.abs(dx); x += Math.sign(dx) * 20) {
    fireEvent.mouseMove(from, at(x));
    time += msPerStep ?? 1;
  }
  fireEvent.mouseMove(from, at(200 + dx));
  // let go slowly: held still a moment first, so it lifts with no speed
  if (msPerStep === undefined) time += 200;
  fireEvent.mouseUp(from, at(200 + dx));
  clock.mockRestore();
}

function open(onClose: () => void): void {
  testAuth.client = fakeClient({ 'GET /me/social': ok({ friends: [], challenges: [], requests: [], groups: [] }) });
  renderWithProviders(<SocialSlide open onClose={onClose} />);
}

describe('the new-message panel under a finger, as the menu is', () => {
  it('closes when pushed most of the way back to the right edge', () => {
    const onClose = vi.fn();
    open(onClose);
    swipe(screen.getByText('New message'), 260);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a quick flick towards its edge from barely moved', () => {
    const onClose = vi.fn();
    open(onClose);
    swipe(screen.getByText('New message'), 60, 10);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when let go a little way along, and when pulled the other way', () => {
    const onClose = vi.fn();
    open(onClose);
    swipe(screen.getByText('New message'), 60);
    swipe(screen.getByText('New message'), -120);
    expect(onClose).not.toHaveBeenCalled();
  });
});
