// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Linking } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../reports/testing/harness';
import { AgreeLine } from './links';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the line under every way of making an account', () => {
  it('reads as one sentence, with the terms and the privacy policy as links to their pages', () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderWithProviders(<AgreeLine />);
    const terms = screen.getByText('Terms of Use');
    const privacy = screen.getByText('Privacy Policy');
    expect(terms.parentElement?.textContent).toBe('By continuing you agree to Hevalo’s Terms of Use and Privacy Policy.');
    fireEvent.click(terms);
    fireEvent.click(privacy);
    expect(open.mock.calls.map((c) => c[0])).toEqual(['https://hevalo.app/terms', 'https://hevalo.app/privacy']);
  });
});
