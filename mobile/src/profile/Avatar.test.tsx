// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// A picture that loads or fails on request, since jsdom fetches no images.
vi.mock('react-native', async () => {
  const rnw = await import('react-native-web');
  return {
    ...rnw,
    Image: ({ source, onError }: { source: { uri: string }; onError?: () => void }) => createElement('img', { src: source.uri, onError }),
  };
});
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { Avatar, ownAvatarUrl } from './Avatar';
import { GroupAvatar } from '../groups/GroupAvatar';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const DEER = 'https://hevalo.app/cosmetics/avatars/default-01.png';
const img = () => document.querySelector('img');
const src = () => img()?.getAttribute('src');

describe('a person’s avatar', () => {
  it('is their picture where they have one', () => {
    renderWithProviders(<Avatar name="Rojda" photoUrl="/cosmetics/avatars/default-05.png" />);
    expect(src()).toBe('https://hevalo.app/cosmetics/avatars/default-05.png');
  });

  it('is the default deer without one, never their initials', () => {
    renderWithProviders(<Avatar name="Rojda" photoUrl={null} />);
    expect(src()).toBe(DEER);
    expect(screen.queryByText('RO')).toBeNull();
  });

  it('falls back to the deer when their picture will not load, and to a person glyph when nothing does', () => {
    renderWithProviders(<Avatar name="Rojda" photoUrl="https://cdn.example.test/p.jpg" />);
    fireEvent.error(img()!);
    expect(src()).toBe(DEER);
    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(screen.getByRole('img', { name: 'Rojda avatar' }).querySelector('svg')).not.toBeNull();
  });

  it('is your own as others see it once the account is read, your photo until then', () => {
    expect(ownAvatarUrl({ avatarUrl: '/cosmetics/avatars/default-05.png', profilePhotoUrl: null })).toBe('/cosmetics/avatars/default-05.png');
    expect(ownAvatarUrl({ profilePhotoUrl: 'https://cdn.example.test/me.jpg' })).toBe('https://cdn.example.test/me.jpg');
    expect(ownAvatarUrl({ profilePhotoUrl: null })).toBeNull();
  });
});

describe('a group’s avatar', () => {
  it('keeps its initials without a picture, as on the website', () => {
    renderWithProviders(<GroupAvatar name="Hevalên Kurmancî" id="g1" size={40} />);
    expect(screen.getByText('HK')).toBeTruthy();
  });
});
