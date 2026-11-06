// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Alert, Linking } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { clipboardStub } from '../reports/testing/stubs';
import * as Clipboard from 'expo-clipboard';
import { SettingsScreen } from './SettingsScreen';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

describe('Settings → help and support', () => {
  beforeEach(() => {
    testAuth.client = fakeClient();
    clipboardStub.text = null;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens the website’s questions and answers, and its page about Hevalo', () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByText('Help & FAQ'));
    fireEvent.click(screen.getByText('About us'));
    expect(open.mock.calls.map((c) => c[0])).toEqual(['https://hevalo.app/faq', 'https://hevalo.app/about']);
  });

  it('finds the help rows by their names', () => {
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Search settings'), { target: { value: 'faq' } });
    expect(screen.getByText('Help & FAQ')).toBeTruthy();
    expect(screen.queryByText('About us')).toBeNull();
  });

  it('copies the support address and says so when there is no mail app to open', async () => {
    vi.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No Activity found to handle Intent'));
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByText('Contact support'));
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(clipboardStub.text).toBe('support@hevalo.app');
    expect(alert).toHaveBeenCalledWith('No email app opened', 'We copied support@hevalo.app for you. Paste it into the app you use for email.');
  });

  it('still gives the address when even copying it fails', async () => {
    vi.spyOn(Linking, 'openURL').mockRejectedValue(new Error('Unable to open URL'));
    vi.spyOn(Clipboard, 'setStringAsync').mockRejectedValue(new Error('no clipboard'));
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByText('Contact support'));
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(alert).toHaveBeenCalledWith('No email app opened', 'Write to us at support@hevalo.app from the app you use for email.');
  });

  it('says nothing when the mail app opens', async () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByText('Contact support'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('mailto:support@hevalo.app'));
    expect(alert).not.toHaveBeenCalled();
    expect(clipboardStub.text).toBeNull();
  });
});
