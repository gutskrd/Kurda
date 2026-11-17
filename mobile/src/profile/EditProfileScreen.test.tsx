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
vi.mock('../theme/Pressable', () => import('../testing/reach'));
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { forgetReach, reachOf } from '../testing/reach';
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
afterEach(() => {
  cleanup();
  forgetReach();
});

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
  // the one chosen is what it is set to, not a button that does nothing; Remove next to it takes it off
  it('shows the chosen country as its value, with one tap to take it off', async () => {
    await openEdit();
    expect(screen.getByText('Germany')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Germany' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove, Germany' }));
    expect(screen.queryByText('Germany')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    expect(screen.getByText('— None —')).toBeTruthy();
  });

  // drawn 36 tall, each chip answers over 48; the found ones wrap onto rows a gap apart and share it
  it('lets its chips answer a finger a little above and below, the found ones only to the middle of the gap', async () => {
    await openEdit();
    expect(reachOf('Remove, Germany')).toEqual({ top: 6, bottom: 6, left: 0, right: 0 });
    fireEvent.change(screen.getByLabelText('Find a country'), { target: { value: 'Ira' } });
    expect(reachOf('Iraq')).toEqual({ top: 4, bottom: 4, left: 0, right: 0 });
  });
});

describe('saving', () => {
  /*
   * Save sits under the fields and goes once there is nothing left to save:
   * what it did is said where it was, and read out, not at the top of a page
   * scrolled away from it.
   */
  it('says the profile was updated where Save was, and stops saying it once a field is typed in again', async () => {
    testAuth.client = fakeClient({
      'GET /me': ok({ user: ME }),
      'GET /cosmetics/avatars': ok({ avatars: [] }),
      'PATCH /me': ok({ user: { ...ME, displayName: 'Rojda Amed' } }),
    });
    await openEdit();
    fireEvent.change(screen.getByDisplayValue('Rojda'), { target: { value: 'Rojda Amed' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }));
    const said = await screen.findByText('Profile updated.');
    expect(said.getAttribute('aria-live')).toBe('polite');
    // under the details, ahead of the avatars
    const avatarHeading = screen.getByRole('heading', { name: 'Avatar' });
    expect(said.compareDocumentPosition(avatarHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByDisplayValue('Rojda Amed').compareDocumentPosition(said) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();

    fireEvent.change(screen.getByDisplayValue('Rojda Amed'), { target: { value: 'Rojda A.' } });
    expect(screen.queryByText('Profile updated.')).toBeNull();
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

  // each is named by its place, never by its key ("default-03")
  it('shows somebody without Hevalo+ only the avatars they can wear', async () => {
    testAuth.client = fakeClient({ 'GET /me': ok({ user: ME }), 'GET /cosmetics/avatars': ok({ avatars }) });
    await openEdit();
    expect(await screen.findByRole('button', { name: 'Avatar 1' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Avatar 2' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'deer' })).toBeNull();
  });

  it('shows a member every avatar', async () => {
    testAuth.client = fakeClient({ 'GET /me': ok({ user: { ...ME, premium: true } }), 'GET /cosmetics/avatars': ok({ avatars }) });
    await openEdit();
    expect(await screen.findByRole('button', { name: 'Avatar 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Avatar 2' })).toBeTruthy();
  });
});
