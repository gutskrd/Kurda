import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Avatar } from './Avatar';
import { AvatarStack } from './AvatarStack';
import { PlayerChip } from '../ui/PlayerChip';
import { I18nProvider } from '../i18n/I18nProvider';
import { avatarAssetUrl, avatarSrc, defaultAvatarKey } from '../lib/cosmetics';
import { ART_OVERRIDES_KEY, resetArtOverridesForTests } from '../art/overrides';

/**
 * Default profile pictures an admin replaced (the `avatar:<key>` slots): every
 * default avatar the site draws goes through one function, so the new picture
 * shows wherever the old one did, and a photo somebody uploaded is never touched.
 */

const DEER_03 = 'https://cdn.test/art/avatar-03.png';
const PHOTO = 'https://cdn.test/users/u1/photo.webp';

function replaced(overrides: Record<string, string>): void {
  localStorage.setItem(ART_OVERRIDES_KEY, JSON.stringify({ version: 'v1', overrides }));
  resetArtOverridesForTests();
}

beforeEach(() => {
  resetArtOverridesForTests();
});

afterEach(() => {
  localStorage.clear();
  resetArtOverridesForTests();
});

describe('which avatar URLs are default pictures', () => {
  it('knows a default avatar by its file on this site, and nothing else', () => {
    expect(defaultAvatarKey('/cosmetics/avatars/default-03.png')).toBe('default-03');
    expect(defaultAvatarKey(`${location.origin}/cosmetics/avatars/default-17.png`)).toBe('default-17');
    expect(defaultAvatarKey('https://elsewhere.test/cosmetics/avatars/default-03.png')).toBeNull();
    expect(defaultAvatarKey('/cosmetics/avatars/default-03.webp')).toBeNull();
    expect(defaultAvatarKey('/cosmetics/icons/made-02.png')).toBeNull();
    expect(defaultAvatarKey(PHOTO)).toBeNull();
    expect(defaultAvatarKey(null)).toBeNull();
  });

  it('builds every default avatar’s address through one function, the replacement first', () => {
    const overrides = { 'avatar:default-03': DEER_03 };
    expect(avatarAssetUrl('default-03')).toBe('/cosmetics/avatars/default-03.png');
    expect(avatarAssetUrl('default-03', overrides)).toBe(DEER_03);
    expect(avatarAssetUrl('default-04', overrides)).toBe('/cosmetics/avatars/default-04.png');
    expect(avatarSrc('/cosmetics/avatars/default-03.png', overrides)).toBe(DEER_03);
    expect(avatarSrc('/cosmetics/avatars/default-04.png', overrides)).toBe('/cosmetics/avatars/default-04.png');
    expect(avatarSrc(PHOTO, overrides)).toBe(PHOTO);
    expect(avatarSrc(null, overrides)).toBeNull();
  });
});

describe('a default avatar on the page', () => {
  it('is drawn as the uploaded picture where one replaced it', () => {
    replaced({ 'avatar:default-03': DEER_03 });
    const { container } = render(
      <I18nProvider>
        <Avatar url="/cosmetics/avatars/default-03.png" />
        <Avatar url="/cosmetics/avatars/default-09.png" />
        <Avatar url={PHOTO} />
      </I18nProvider>,
    );
    expect([...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([DEER_03, '/cosmetics/avatars/default-09.png', PHOTO]);
  });

  it('is drawn as the file that ships when nothing replaced it', () => {
    const { container } = render(
      <I18nProvider>
        <Avatar url="/cosmetics/avatars/default-03.png" />
      </I18nProvider>,
    );
    expect(container.querySelector('img')).toHaveAttribute('src', '/cosmetics/avatars/default-03.png');
  });

  it('is replaced in a stack of faces and on a player’s chip, leaving icons and photos alone', () => {
    replaced({ 'avatar:default-03': DEER_03 });
    const { container } = render(
      <>
        <AvatarStack urls={['/cosmetics/avatars/default-03.png', PHOTO, '/cosmetics/icons/made-01.png']} total={3} />
        <PlayerChip name="Rojîn" status="3 / 6" avatarUrl="/cosmetics/avatars/default-03.png" />
        <PlayerChip name="Dilan" status="2 / 6" avatarUrl={null} />
      </>,
    );
    const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(srcs).toEqual([DEER_03, PHOTO, '/cosmetics/icons/made-01.png', DEER_03]);
  });
});
