// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
/*
 * A navigator that holds a screen back the way the real one does: while the
 * screen asks to keep itself (`usePreventRemove`), going back hands the screen
 * the action instead of leaving, and the screen lets it through with
 * `dispatch`. Without a prevention, going back leaves at once (`left`).
 */
const nav = vi.hoisted(() => {
  const held: { prevent: boolean; ask: ((e: { data: { action: { type: string } } }) => void) | null } = { prevent: false, ask: null };
  const left = vi.fn();
  const navigation = {
    navigate: vi.fn(),
    dispatch: vi.fn(),
    goBack: vi.fn(() => {
      if (held.prevent && held.ask) held.ask({ data: { action: { type: 'GO_BACK' } } });
      else left();
    }),
  };
  return { held, left, navigation };
});
vi.mock('@react-navigation/native', async () => {
  const { useEffect } = await import('react');
  return {
    useNavigation: () => nav.navigation,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(() => effect(), [effect]),
    useIsFocused: () => true,
    usePreventRemove: (prevent: boolean, ask: (e: { data: { action: { type: string } } }) => void) => {
      useEffect(() => {
        nav.held.prevent = prevent;
        nav.held.ask = ask;
      });
    },
  };
});
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-image-picker', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { EditProfileScreen } from './EditProfileScreen';

patchReactNativeWeb({ reduceMotion: true });

const ME = { username: 'rojda', displayName: 'Rojda', bio: null, country: 'DE' };

beforeEach(() => {
  nav.held.prevent = false;
  nav.held.ask = null;
  nav.left.mockClear();
  nav.navigation.dispatch.mockClear();
  testAuth.client = fakeClient({ 'GET /me': ok({ user: ME }), 'GET /cosmetics/avatars': ok({ avatars: [] }) });
});
afterEach(cleanup);

async function openEdit(): Promise<void> {
  renderWithProviders(<EditProfileScreen onExit={() => nav.navigation.goBack()} />);
  await screen.findByDisplayValue('Rojda');
}

describe('leaving Edit profile', () => {
  it('leaves at once when nothing was changed', async () => {
    await openEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(nav.left).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('edit-profile-leave')).toBeNull();
  });

  /*
   * A name typed and not saved used to vanish on back without a word: now
   * leaving asks, keeping on editing is the first answer, and discarding
   * lets the very same back through.
   */
  it('asks before throwing away an edit, and keeps it when asked to', async () => {
    await openEdit();
    fireEvent.change(screen.getByDisplayValue('Rojda'), { target: { value: 'Rojda Amed' } });
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    const sheet = await screen.findByTestId('edit-profile-leave');
    expect(within(sheet).getByText('Discard your changes?')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Keep editing' }));
    expect(nav.left).not.toHaveBeenCalled();
    expect(nav.navigation.dispatch).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Rojda Amed')).toBeTruthy();
  });

  it('goes the way it was going once the edit is discarded', async () => {
    await openEdit();
    fireEvent.change(screen.getByDisplayValue('Rojda'), { target: { value: 'Rojda Amed' } });
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    const sheet = await screen.findByTestId('edit-profile-leave');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Discard changes' }));
    expect(nav.navigation.dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });
});

describe('the country', () => {
  // the one chosen is what it is set to, not a button that does nothing; "none" next to it takes it off
  it('shows the chosen country as its value, with one tap to take it off', async () => {
    await openEdit();
    expect(screen.getByText('Germany')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Germany' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '— None —' }));
    expect(screen.queryByText('Germany')).toBeNull();
    expect(screen.queryByRole('button', { name: '— None —' })).toBeNull();
    expect(screen.getByText('— None —')).toBeTruthy();
  });
});

/**
 * Hevalo+ cannot be had in the app, so an avatar kept for members is not
 * offered to anybody else: a locked tile with no way to unlock it here would
 * be an offer of something the app does not sell.
 */
describe('choosing an avatar', () => {
  const avatars = [
    { key: 'deer', requiresPremium: false },
    { key: 'lion', requiresPremium: true },
  ];

  it('shows somebody without Hevalo+ only the avatars they can wear', async () => {
    testAuth.client = fakeClient({ 'GET /me': ok({ user: ME }), 'GET /cosmetics/avatars': ok({ avatars }) });
    await openEdit();
    expect(await screen.findByRole('button', { name: 'deer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'lion' })).toBeNull();
  });

  it('shows a member every avatar', async () => {
    testAuth.client = fakeClient({ 'GET /me': ok({ user: { ...ME, premium: true } }), 'GET /cosmetics/avatars': ok({ avatars }) });
    await openEdit();
    expect(await screen.findByRole('button', { name: 'deer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'lion' })).toBeTruthy();
  });
});
