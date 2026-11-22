// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { navigation } from '../play/testing/navigation';
import { ProfileHighlights } from './ProfileHighlights';

/*
 * The round tiles under a profile's actions: the tree, the league, the chosen badges and the favourites, each opening
 * its page or a sheet that says what it is.
 */

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => navigation.navigate.mockReset());
afterEach(cleanup);

const tree = { species: 'hinar', stage: 4, health: 'fresh', age: 30, harvests: 2 } as const;
const badge = { key: 'ders', family: 'learning', tier: 2, tierKey: 'ziv' } as const;

describe('the highlights', () => {
  it('shows nothing of somebody else’s with nothing to show off', () => {
    const { container } = renderWithProviders(<ProfileHighlights badges={[]} league={null} />);
    expect(container.textContent).toBe('');
  });

  it('starts your own row with the way to choose badges, and opens your tree and league on their pages', () => {
    renderWithProviders(<ProfileHighlights own tree={tree} league={{ tier: 'cem' }} />);
    const tiles = screen.getAllByRole('button');
    fireEvent.click(tiles[0]!);
    expect(navigation.navigate).toHaveBeenCalledWith('Badges');
    fireEvent.click(tiles[1]!);
    expect(navigation.navigate).toHaveBeenCalledWith('Tree');
    fireEvent.click(screen.getByRole('button', { name: /Çem/ }));
    expect(navigation.navigate).toHaveBeenCalledWith('League');
  });

  it('gathers somebody else’s badges in one case with how many they have, and opens it to their names and meanings', async () => {
    renderWithProviders(<ProfileHighlights badges={[badge]} earned={12} />);
    // One tile for the badges, not one per badge.
    expect(screen.queryByRole('button', { name: 'Wane' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Badges: 12' }));
    expect(await screen.findByText('Wane')).toBeTruthy();
    expect(screen.getByText('Lessons')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Choose badges for your profile' })).toBeNull();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('keeps your empty case without a nought and opens your badges, and shows no case for somebody with none', () => {
    const { unmount } = renderWithProviders(<ProfileHighlights own earned={0} />);
    expect(screen.queryByText('0')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Badges: 0' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Badges');
    unmount();
    renderWithProviders(<ProfileHighlights earned={0} />);
    expect(screen.queryByTestId('profile-highlights')).toBeNull();
  });

  it('opens somebody else’s league in a sheet rather than your own league', async () => {
    renderWithProviders(<ProfileHighlights league={{ tier: 'cem' }} />);
    fireEvent.click(screen.getByRole('button', { name: /Çem/ }));
    expect(await screen.findAllByText(/Çem/)).not.toHaveLength(0);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('offers your own empty tree a place to be planted', () => {
    renderWithProviders(<ProfileHighlights own tree={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tree' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Tree');
  });

  it('opens a favourite poem as the post itself', () => {
    renderWithProviders(<ProfileHighlights favPoem={{ id: 'p1', title: 'Şev' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Şev' }));
    expect(navigation.navigate).toHaveBeenCalledWith('LibraryPost', { postId: 'p1' });
  });

  it('marks a badge earned since the app opened as new, and the others not', () => {
    renderWithProviders(
      <ProfileHighlights
        own
        badges={[
          { key: 'agir', family: 'habit', tier: 2, tierKey: 'ziv' },
          { key: 'peyvok', family: 'learning', tier: 1, tierKey: 'sifir' },
        ]}
        fresh={new Set(['agir'])}
      />,
    );
    expect(screen.getAllByTestId('badge-new')).toHaveLength(1);
  });
});
