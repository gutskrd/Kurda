// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
const auth = vi.hoisted(() => ({ oauthSignIn: vi.fn(), baseUrl: 'https://api.test' }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../auth/google', () => ({ signInWithGoogle: vi.fn(), isGoogleConfigured: false }));
const apple = vi.hoisted(() => ({ signInAsync: vi.fn() }));
// Apple's sheet is native: its button is a plain one here, and the sheet answers what each test says
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
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { WelcomeScreen } from './WelcomeScreen';

patchReactNativeWeb();

const g = globalThis as typeof globalThis & { __DEV__?: boolean };

beforeEach(() => {
  // a release build: no connection readout, so no health check to stand in for
  g.__DEV__ = false;
  auth.oauthSignIn.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  auth.oauthSignIn.mockReset();
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
});
