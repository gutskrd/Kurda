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

  it('keeps its ✕ when the content carries its own heading', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <BottomSheet visible onClose={onClose}>
        <Text>Îstîkan</Text>
      </BottomSheet>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    const closers = screen.getAllByRole('button', { name: 'Close' });
    expect(closers).toHaveLength(2);
    fireEvent.click(closers[1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('steps back from its ‹ in a sheet with steps, without closing', () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <BottomSheet visible onClose={onClose} onBack={onBack} title="A gift">
        <Text>What</Text>
      </BottomSheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open while something it started is on its way', () => {
    const onClose = vi.fn();
    const { rerender } = renderWithProviders(
      <BottomSheet visible onClose={onClose} dismissible={false}>
        <Text>Deleting</Text>
      </BottomSheet>,
    );
    const [scrim, x] = screen.getAllByRole('button', { name: 'Close' });
    expect(x!.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(scrim!);
    fireEvent.click(x!);
    expect(onClose).not.toHaveBeenCalled();

    // answered: it closes again as any sheet does
    rerender(
      <BottomSheet visible onClose={onClose} dismissible>
        <Text>Deleting</Text>
      </BottomSheet>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reads a title in a language of its own in that language', () => {
    renderWithProviders(
      <BottomSheet visible onClose={() => undefined} title="Nanê germ" titleLanguage={{ accessibilityLanguage: 'ku' }}>
        <Text>Story</Text>
      </BottomSheet>,
    );
    expect(screen.getByRole('heading', { name: 'Nanê germ' }).getAttribute('lang')).toBe('ku');
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
