// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('./Pressable', () => import('../testing/reach'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { forgetReach } from '../testing/reach';
import { PlusButton } from './PlusButton';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  forgetReach();
});

function offer() {
  const onJoin = vi.fn();
  const onDecline = vi.fn();
  renderWithProviders(<PlusButton label="Join Hevalo+" value="Double Zêr and a box each month." decline={{ label: 'Not now', onPress: onDecline }} onJoin={onJoin} />);
  return { onJoin, onDecline };
}

describe('Hevalo+’s button', () => {
  it('joins, with what membership gives written under it', () => {
    const { onJoin } = offer();
    fireEvent.click(screen.getByRole('button', { name: 'Join Hevalo+' }));
    expect(onJoin).toHaveBeenCalledOnce();
    expect(screen.getByText('Double Zêr and a box each month.')).toBeTruthy();
  });

  it('always shows a plain way to say no beside it', () => {
    const { onJoin, onDecline } = offer();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDecline).toHaveBeenCalledOnce();
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('stands taller than the main button’s 50 points', () => {
    offer();
    const face = screen.getByTestId('plus-join').firstElementChild as HTMLElement;
    expect(parseFloat(getComputedStyle(face).minHeight)).toBeGreaterThan(50);
  });
});
