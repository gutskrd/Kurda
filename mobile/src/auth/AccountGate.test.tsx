// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('./AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { Pressable, Text } from 'react-native';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { onHaptic, setHapticDriver } from '../feedback/haptics';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { AccountGateProvider, GuestWall, useAccountGate } from './AccountGate';
import { notifyGuestRefused } from './guestRefused';

patchReactNativeWeb({ reduceMotion: true });

// a phone's screen: jsdom's window has no height, and a sheet's heights are shares of it
Object.defineProperty(window, 'visualViewport', { value: { height: 800, width: 390, scale: 1 }, configurable: true });
window.dispatchEvent(new Event('resize'));

const FULL = { ...testAuth.user };
const GUEST = { ...testAuth.user, username: 'mevan_4821', email: '', guest: true };

beforeEach(() => navigation.navigate.mockReset());
afterEach(() => {
  cleanup();
  testAuth.user = FULL;
});

/** A screen with one thing on it that only an account may do. */
function Door({ onPassed }: { onPassed: () => void }) {
  const { require } = useAccountGate();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (require('post')) onPassed();
      }}
    >
      <Text>Post</Text>
    </Pressable>
  );
}

function openDoor() {
  const onPassed = vi.fn();
  renderWithProviders(
    <AccountGateProvider>
      <Door onPassed={onPassed} />
    </AccountGateProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Post' }));
  return onPassed;
}

describe('the account gate', () => {
  it('lets a full account through and shows nothing', () => {
    const onPassed = openDoor();
    expect(onPassed).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Create an account to post')).toBeNull();
  });

  it('stops a guest with the offer, named for what was tapped, and felt as it opens', () => {
    testAuth.user = GUEST;
    const felt: string[] = [];
    const restore = setHapticDriver(() => undefined);
    const stop = onHaptic((e) => felt.push(e));
    const onPassed = openDoor();
    expect(onPassed).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Create an account to post' })).toBeTruthy();
    expect(screen.getByText('Keep your progress on every device')).toBeTruthy();
    expect(screen.getByText('Play and chat with friends')).toBeTruthy();
    expect(felt).toEqual(['select']);
    stop();
    restore();
    // not now: the offer goes and nothing else happens
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('heading', { name: 'Create an account to post' })).toBeNull();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('opens the sign-up form from the offer, and the sign-in form for an account you already have', () => {
    testAuth.user = GUEST;
    openDoor();
    fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ClaimAccount');
    expect(screen.queryByRole('heading', { name: 'Create an account to post' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    fireEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('SignIn');
  });

  it('answers a refusal the server made with the general offer', () => {
    testAuth.user = GUEST;
    renderWithProviders(
      <AccountGateProvider>
        <Text>Learning</Text>
      </AccountGateProvider>,
    );
    act(() => notifyGuestRefused());
    expect(screen.getByRole('heading', { name: 'This needs an account' })).toBeTruthy();
  });

  it('ignores a refusal from the server for a full account', () => {
    renderWithProviders(
      <AccountGateProvider>
        <Text>Learning</Text>
      </AccountGateProvider>,
    );
    act(() => notifyGuestRefused());
    expect(screen.queryByRole('heading', { name: 'This needs an account' })).toBeNull();
  });
});

describe('the guest wall', () => {
  it('keeps the screen for a full account', () => {
    renderWithProviders(
      <GuestWall reason="message" onBack={() => undefined}>
        <Text>A conversation</Text>
      </GuestWall>,
    );
    expect(screen.getByText('A conversation')).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('shows a guest the offer instead, with a way back, and the two ways to an account', () => {
    testAuth.user = GUEST;
    const onBack = vi.fn();
    renderWithProviders(
      <GuestWall reason="message" onBack={onBack}>
        <Text>A conversation</Text>
      </GuestWall>,
    );
    expect(screen.queryByText('A conversation')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Create an account to send messages' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ClaimAccount');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
