// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { SideMenu, type MenuGroup } from './SideMenu';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

// a phone's screen: jsdom's window has no size, and the panel is a share of its width
Object.defineProperty(window, 'visualViewport', { value: { height: 800, width: 400, scale: 1 }, configurable: true });
window.dispatchEvent(new Event('resize'));

const groups: MenuGroup[] = [{ titleKey: null, links: [{ key: 'friends', labelKey: 'nav.friends', icon: 'people', onPress: () => undefined }] }];

/** A finger on `from`, sideways `dx` points in steps, and off. */
function swipe(from: Element, dx: number): void {
  const at = (x: number) => ({ clientX: x, clientY: 300, pageX: x, pageY: 300, buttons: 1 });
  fireEvent.mouseDown(from, { ...at(200), button: 0 });
  for (let x = 200; Math.abs(x - 200) < Math.abs(dx); x += Math.sign(dx) * 20) fireEvent.mouseMove(from, at(x));
  fireEvent.mouseMove(from, at(200 + dx));
  fireEvent.mouseUp(from, at(200 + dx));
}

describe('the side menu under a finger', () => {
  it('closes when pushed most of the way back to the edge it came from', () => {
    const onClose = vi.fn();
    renderWithProviders(<SideMenu open onClose={onClose} groups={groups} side="end" />);
    // from the end edge: the right, in English
    swipe(screen.getByText('Friends'), 260);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when let go a little way along', () => {
    const onClose = vi.fn();
    renderWithProviders(<SideMenu open onClose={onClose} groups={groups} side="end" />);
    swipe(screen.getByText('Friends'), 60);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open when pulled the other way, further open than it goes', () => {
    const onClose = vi.fn();
    renderWithProviders(<SideMenu open onClose={onClose} groups={groups} side="end" />);
    swipe(screen.getByText('Friends'), -200);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes from a tap on the page beside it', () => {
    const onClose = vi.fn();
    renderWithProviders(<SideMenu open onClose={onClose} groups={groups} side="end" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
