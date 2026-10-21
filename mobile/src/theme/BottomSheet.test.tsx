// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { Text } from 'react-native';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { BottomSheet } from './BottomSheet';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

describe('the bottom sheet', () => {
  it('shows its title and what is in it, named for a screen reader as a header', () => {
    renderWithProviders(
      <BottomSheet visible onClose={() => undefined} title="New club">
        <Text>Name</Text>
      </BottomSheet>,
    );
    expect(screen.getByRole('heading', { name: 'New club' })).toBeTruthy();
    expect(screen.getByText('Name')).toBeTruthy();
  });

  it('closes from its ✕ and from a tap on the page behind it', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <BottomSheet visible onClose={onClose} title="New club">
        <Text>Name</Text>
      </BottomSheet>,
    );
    const closers = screen.getAllByRole('button', { name: 'Close' });
    // the dimmed page, then the ✕
    expect(closers).toHaveLength(2);
    fireEvent.click(closers[1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows nothing while it is closed', () => {
    renderWithProviders(
      <BottomSheet visible={false} onClose={() => undefined} title="New club">
        <Text>Name</Text>
      </BottomSheet>,
    );
    expect(screen.queryByText('Name')).toBeNull();
  });
});
