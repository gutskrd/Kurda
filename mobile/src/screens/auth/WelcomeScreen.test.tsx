// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('../../auth/guide/testing/navigation'));
const auth = vi.hoisted(() => ({ oauthSignIn: vi.fn(), continueAsGuest: vi.fn(), client: { put: vi.fn() }, baseUrl: 'https://api.test' }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../auth/google', () => ({ signInWithGoogle: vi.fn(), isGoogleConfigured: false }));
const apple = vi.hoisted(() => ({ signInAsync: vi.fn() }));
// Apple's sheet is native: the button is a plain one here, and the sheet answers as each test says.
vi.mock('expo-apple-authentication', async () => {
  const { createElement } = await import('react');
  return {
    isAvailableAsync: async () => true,
    signInAsync: apple.signInAsync,
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) =>
      createElement('button', { type: 'button', onClick: onPress }, 'Continue with Apple'),
  };
});
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Alert } from 'react-native';
import { TRANSLATIONS } from '../../i18n/translations';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { WelcomeScreen } from './WelcomeScreen';

patchReactNativeWeb({ reduceMotion: true });
const en = TRANSLATIONS.en;

const g = globalThis as typeof globalThis & { __DEV__?: boolean };

beforeEach(() => {
  // A release build has no connection readout, so no health check to stub.
  g.__DEV__ = false;
  auth.oauthSignIn.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  auth.oauthSignIn.mockReset();
  auth.continueAsGuest.mockReset();
  apple.signInAsync.mockReset();
  delete g.__DEV__;
});

function credential(fullName: { givenName: string | null; familyName: string | null } | null) {
  return {
    user: '001234.abcdef',
    state: null,
    fullName: fullName && { namePrefix: null, middleName: null, nameSuffix: null, nickname: null, ...fullName },
    email: null,
    realUserStatus: 1,
    identityToken: 'identity-token-from-apple',
    authorizationCode: 'c1a2b3.0.authorization-code',
  };
}

async function continueWithApple() {
  const navigation = { navigate: vi.fn(), goBack: vi.fn(), canGoBack: () => false };
  const props = { navigation, route: { key: 'w', name: 'Welcome' } } as unknown as Parameters<typeof WelcomeScreen>[0];
  renderWithProviders(<WelcomeScreen {...props} />);
  const button = await screen.findByRole('button', { name: 'Continue with Apple' });
  await act(async () => {
    fireEvent.click(button);
  });
}

describe('continuing with Apple', () => {
  it('sends the authorization code and the shared name with the identity token', async () => {
    apple.signInAsync.mockResolvedValue(credential({ givenName: ' Rojda ', familyName: 'Amed ' }));
    await continueWithApple();
    expect(auth.oauthSignIn).toHaveBeenCalledTimes(1);
    expect(auth.oauthSignIn).toHaveBeenCalledWith('apple', 'identity-token-from-apple', {
      authorizationCode: 'c1a2b3.0.authorization-code',
      fullName: 'Rojda Amed',
    });
  });

  it('still sends the code on a later sign-in, when Apple shares no name', async () => {
    apple.signInAsync.mockResolvedValue(credential({ givenName: null, familyName: null }));
    await continueWithApple();
    expect(auth.oauthSignIn).toHaveBeenCalledWith('apple', 'identity-token-from-apple', {
      authorizationCode: 'c1a2b3.0.authorization-code',
      fullName: null,
    });
  });

  // The SDK's own message is English and technical, with a code.
  it('says a failed Apple sheet in the reader’s words, without the SDK’s message or code', async () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    apple.signInAsync.mockRejectedValue(Object.assign(new Error('The authorization attempt failed for an unknown reason'), { code: 'ERR_REQUEST_UNKNOWN' }));
    await continueWithApple();
    expect(alert).toHaveBeenCalledWith(en['welcome.appleFailed'], en['common.tryAgain']);
    expect(JSON.stringify(alert.mock.calls)).not.toMatch(/ERR_REQUEST_UNKNOWN|unknown reason/);
    alert.mockRestore();
  });

  it('says nothing when the person cancels the Apple sheet', async () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    apple.signInAsync.mockRejectedValue(Object.assign(new Error('The user canceled the authorization attempt'), { code: 'ERR_REQUEST_CANCELED' }));
    await continueWithApple();
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});

function renderWelcome() {
  const navigation = { navigate: vi.fn(), goBack: vi.fn(), canGoBack: () => false };
  const props = { navigation, route: { key: 'w', name: 'Welcome' } } as unknown as Parameters<typeof WelcomeScreen>[0];
  renderWithProviders(<WelcomeScreen {...props} />);
  return navigation;
}

describe('the sign-in choice', () => {
  it('has Hevalo greeting from the window, in a bubble under it', async () => {
    renderWelcome();
    expect(screen.getByTestId('hevalo-window')).toBeTruthy();
    expect(screen.getByTestId('speech-bubble').textContent).toBe(en['guide.welcome.says']);
  });

  it('says what Apple or Google hands over, and who sees it, under their buttons', async () => {
    renderWelcome();
    await screen.findByRole('button', { name: 'Continue with Apple' });
    expect(screen.getByText('Apple or Google shares your name and email with Hevalo. Others see the name on your profile, never the email.')).toBeTruthy();
  });
});

describe('trying Hevalo first', () => {
  it('offers a guest session under the sign-in methods, introduces Hevalo, and starts one at the end', async () => {
    auth.continueAsGuest.mockResolvedValue(null);
    const navigation = renderWelcome();
    const line = await screen.findByRole('button', { name: 'Try Hevalo first, no account needed' });
    await act(async () => {
      fireEvent.click(line);
    });
    expect(await screen.findByText(en['guide.guest.hello.question'])).toBeTruthy();
    expect(auth.continueAsGuest).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: en['common.continue'] }));
    });
    await screen.findByText(en['guide.guest.goal.question']);
    await waitFor(() => expect(document.querySelector('[data-testid^="slide-out"]')).toBeNull());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: en['guide.guest.start'] }));
    });
    await waitFor(() => expect(auth.continueAsGuest).toHaveBeenCalledTimes(1));
    // A guest session signs in; nothing is navigated to.
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('comes back to the choice from the introduction’s first step', async () => {
    renderWelcome();
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Try Hevalo first, no account needed' }));
    });
    await screen.findByText(en['guide.guest.hello.question']);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: en['common.back'] }));
    });
    expect(await screen.findByText(en['welcome.title'])).toBeTruthy();
  });
});
