// @vitest-environment jsdom
/** A child's own phone signing in with the eight digits their parent's phone shows (ChildCodeScreen). */
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('expo-audio', () => import('../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('../auth/guide/testing/navigation'));
const auth: { childSignIn: (code: string) => Promise<{ message: string; code?: string } | null> } = { childSignIn: async () => null };
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { TRANSLATIONS } from '../i18n/translations';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { ChildCodeScreen } from './ChildCodeScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

describe('a child’s own phone', () => {
  it('signs in with the eight digits and nothing else', async () => {
    const childSignIn = vi.fn(async () => null);
    auth.childSignIn = childSignIn;
    renderWithProviders(<ChildCodeScreen onBack={() => undefined} />);
    const go = screen.getByTestId('child-code-go');
    const input = screen.getByTestId('child-code-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12a3 456' } });
    fireEvent.click(go);
    expect(childSignIn).not.toHaveBeenCalled();
    // typed, it shows in two groups of four
    fireEvent.change(input, { target: { value: '123456' } });
    expect(input.value).toBe('1234 56');
    fireEvent.change(input, { target: { value: '12345678' } });
    expect(input.value).toBe('1234 5678');
    fireEvent.click(go);
    await waitFor(() => expect(childSignIn).toHaveBeenCalledWith('12345678'));
  });

  it('takes a code pasted with its space, or with a hyphen', async () => {
    const childSignIn = vi.fn(async () => null);
    auth.childSignIn = childSignIn;
    renderWithProviders(<ChildCodeScreen onBack={() => undefined} />);
    const input = screen.getByTestId('child-code-input') as HTMLInputElement;
    expect(Number(input.maxLength)).toBeGreaterThanOrEqual('1234 5678'.length);
    fireEvent.change(input, { target: { value: '8765-4321' } });
    expect(input.value).toBe('8765 4321');
    fireEvent.click(screen.getByTestId('child-code-go'));
    await waitFor(() => expect(childSignIn).toHaveBeenCalledWith('87654321'));
  });

  it('asks for a new code when one does not work', async () => {
    auth.childSignIn = vi.fn(async () => ({ message: 'no', code: 'PAIRING_CODE_INVALID' }));
    renderWithProviders(<ChildCodeScreen onBack={() => undefined} />);
    fireEvent.change(screen.getByTestId('child-code-input'), { target: { value: '12345678' } });
    fireEvent.click(screen.getByTestId('child-code-go'));
    expect((await screen.findByTestId('child-code-error')).textContent).toContain(TRANSLATIONS.en['child.code.invalid']);
  });
});
