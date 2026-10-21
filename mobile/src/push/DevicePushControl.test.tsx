// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
/*
 * The phone's own platform, so the control has push to talk about (on the web
 * build it draws nothing), a spy where the phone's settings would open, and an
 * app state a test can bring back to the front.
 */
const phone = vi.hoisted(() => {
  const listeners = new Set<(state: string) => void>();
  return {
    os: 'ios',
    openSettings: vi.fn(async () => undefined),
    listeners,
    toFront: () => listeners.forEach((listener) => listener('active')),
  };
});
vi.mock('react-native', async () => {
  // react-native-web ships no types; these three are what this file replaces
  const rn = (await import('../play/testing/native')) as unknown as Record<string, object> & { Platform: object; Linking: object; AppState: object };
  return {
    ...rn,
    Platform: {
      ...rn.Platform,
      get OS() {
        return phone.os;
      },
    },
    Linking: { ...rn.Linking, openSettings: phone.openSettings },
    AppState: {
      ...rn.AppState,
      addEventListener: (_type: string, listener: (state: string) => void) => {
        phone.listeners.add(listener);
        return { remove: () => phone.listeners.delete(listener) };
      },
    },
  };
});
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', async () => {
  const { useEffect } = await import('react');
  return {
    useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn() }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { notificationsStub } from '../reports/testing/stubs';
import { NotificationsScreen } from '../notifications/NotificationsScreen';
import { DevicePushControl } from './DevicePushControl';

patchReactNativeWeb();

const NEVER_ASKED = { status: 'undetermined', granted: false, canAskAgain: true } as const;
const ALLOWED = { status: 'granted', granted: true, canAskAgain: true } as const;
const REFUSED_FOR_GOOD = { status: 'denied', granted: false, canAskAgain: false } as const;

beforeEach(() => {
  phone.os = 'ios';
  phone.openSettings.mockClear();
  notificationsStub.permission = { ...NEVER_ASKED };
  notificationsStub.afterRequest = { ...ALLOWED };
  notificationsStub.requests = 0;
});
afterEach(() => cleanup());

/** react-native-web wires a press in an effect after the draw: let it run first. */
const settle = () => act(async () => undefined);

describe('Allow notifications, in Settings → Notification settings', () => {
  it('says it has not been turned on, and shows the system prompt when asked to', async () => {
    renderWithProviders(<DevicePushControl />);
    expect(await screen.findByText('This phone')).toBeTruthy();
    expect(screen.getByText('Notifications aren’t on yet')).toBeTruthy();
    expect(notificationsStub.requests).toBe(0); // nothing is asked just by looking

    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Allow notifications' }));
    expect(await screen.findByText('Notifications are on')).toBeTruthy();
    expect(notificationsStub.requests).toBe(1);
    expect(screen.queryByRole('button', { name: 'Allow notifications' })).toBeNull();
    expect(phone.openSettings).not.toHaveBeenCalled();
  });

  it('says so when the prompt is answered no', async () => {
    notificationsStub.afterRequest = { ...REFUSED_FOR_GOOD };
    renderWithProviders(<DevicePushControl />);
    await settle();
    fireEvent.click(await screen.findByRole('button', { name: 'Allow notifications' }));
    expect(await screen.findByText('Notifications are off')).toBeTruthy();
    // from now on only the phone's settings can change it, and the button says where it goes
    expect(screen.getByRole('button', { name: 'Open phone settings' })).toBeTruthy();
  });

  it('opens the phone’s settings once the phone will not ask again, rather than a prompt that would not show', async () => {
    notificationsStub.permission = { ...REFUSED_FOR_GOOD };
    renderWithProviders(<DevicePushControl />);
    expect(await screen.findByText('Notifications are off')).toBeTruthy();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Open phone settings' }));
    expect(phone.openSettings).toHaveBeenCalledTimes(1);
    expect(notificationsStub.requests).toBe(0);
  });

  it('reads the answer again on coming back from the phone’s settings', async () => {
    notificationsStub.permission = { ...REFUSED_FOR_GOOD };
    renderWithProviders(<DevicePushControl />);
    expect(await screen.findByText('Notifications are off')).toBeTruthy();
    // switched on in the phone's settings, then back to Hevalo
    notificationsStub.permission = { ...ALLOWED };
    await act(async () => phone.toFront());
    expect(await screen.findByText('Notifications are on')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open phone settings' })).toBeNull();
  });

  it('asks again on Android, which shows its prompt a second time after one refusal', async () => {
    phone.os = 'android';
    notificationsStub.permission = { status: 'denied', granted: false, canAskAgain: true };
    renderWithProviders(<DevicePushControl />);
    expect(await screen.findByText('Notifications are off')).toBeTruthy();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Allow notifications' }));
    expect(await screen.findByText('Notifications are on')).toBeTruthy();
    expect(notificationsStub.requests).toBe(1);
  });

  it('just says they are on when they are', async () => {
    notificationsStub.permission = { ...ALLOWED };
    renderWithProviders(<DevicePushControl />);
    expect(await screen.findByText('Notifications are on')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('draws nothing on the web build, which has no push', async () => {
    phone.os = 'web';
    const { container } = renderWithProviders(<DevicePushControl />);
    await settle();
    expect(container.textContent).toBe('');
  });

  it('sits at the top of the notification settings, above the categories', async () => {
    testAuth.client = fakeClient({
      'GET /me/notification-prefs': ok({
        streak: true,
        friends: true,
        games: true,
        events: true,
        progress: true,
        marketing: false,
        quietStartMin: null,
        quietEndMin: null,
      }),
    });
    renderWithProviders(<NotificationsScreen onExit={() => undefined} />);
    const control = await screen.findByText('This phone');
    const categories = await screen.findByText('Categories');
    expect(control.compareDocumentPosition(categories) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Allow notifications' })).toBeTruthy();
  });
});
