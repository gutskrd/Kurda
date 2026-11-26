// @vitest-environment jsdom
/**
 * A slot with an uploaded picture draws it in the same box with the same name; without one, the built-in art is
 * unchanged. An undiscovered secret badge keeps its own art, and anything not yet reached is greyed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
// The event look as the provider computes it: the test sets which pack is live and whether looks are turned off.
const eventTheme = vi.hoisted(() => ({ value: { pack: null as unknown, optedOut: false } }));
vi.mock('../theme/EventThemeContext', () => ({ useEventTheme: () => eventTheme.value }));
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { Text } from 'react-native';
import { EventBanner } from '../events/EventBanner';
import { Avatar } from '../profile/Avatar';
import { BadgeMedal, Framed, LeagueEmblem, SeasonFramed } from '../ranks/art';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { EVENT_THEME_PACKS } from '../theme/eventThemes';
import { ICON_PATHS } from '../theme/icon-paths';
import { refreshArtOverrides, resetArtOverrides } from './overrides';

patchReactNativeWeb();

const CDN = 'https://media.hevalo.app/art';
const phone = { get: async () => null, set: async () => undefined, remove: async () => undefined };
let versions = 0;

/** The server's list, as the app would have it after asking. */
async function overrides(list: Record<string, string>): Promise<void> {
  versions += 1;
  await refreshArtOverrides(fakeClient({ 'GET /art/overrides': ok({ version: `v${versions}`, overrides: list }) }), phone);
}

/** The uploaded picture on screen, once it has started loading. */
async function picture(container: HTMLElement): Promise<string | null | undefined> {
  await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
  return container.querySelector('img')?.getAttribute('src');
}

/** How many drawings by code are on screen (a medallion, a frame, each frame of a glint). */
const drawings = (container: HTMLElement): number => container.querySelectorAll('svg[data-xml="drawn"]').length;

/** The style the picture inside a named image is drawn with: where it is greyed. */
const pictureStyle = (name: string): string => screen.getByRole('img', { name }).firstElementChild?.getAttribute('style') ?? '';

beforeEach(() => {
  eventTheme.value = { pack: null, optedOut: false };
});
afterEach(() => {
  cleanup();
  resetArtOverrides();
});

describe('a badge', () => {
  it('is drawn by code when nobody uploaded a picture for it', () => {
    const { container } = renderWithProviders(<BadgeMedal badgeKey="ders" tier={2} tierCount={4} size={80} label="Ders · Ziv" />);
    expect(drawings(container)).toBe(1);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Ders · Ziv' })).toBeTruthy();
  });

  it('is the uploaded picture, under the same name and at the same size, with no glint', async () => {
    await overrides({ 'badge:ders': `${CDN}/ders.png` });
    const { container } = renderWithProviders(<BadgeMedal badgeKey="ders" tier={2} tierCount={4} size={80} label="Ders · Ziv" shine="loop" />);
    expect(await picture(container)).toBe(`${CDN}/ders.png`);
    expect(drawings(container)).toBe(0);
    const named = screen.getByRole('img', { name: 'Ders · Ziv' });
    expect(named.getAttribute('style')).toContain('width: 80px');
    expect(pictureStyle('Ders · Ziv')).not.toContain('opacity');
  });

  it('takes a level’s own picture over the one for every level', async () => {
    await overrides({ 'badge:ders': `${CDN}/ders.png`, 'badge:ders:zer': `${CDN}/ders-zer.png` });
    const zer = renderWithProviders(<BadgeMedal badgeKey="ders" tier={3} tierCount={4} size={80} label="Ders · Zêr" />);
    expect(await picture(zer.container)).toBe(`${CDN}/ders-zer.png`);
    cleanup();
    const ziv = renderWithProviders(<BadgeMedal badgeKey="ders" tier={2} tierCount={4} size={80} label="Ders · Ziv" />);
    expect(await picture(ziv.container)).toBe(`${CDN}/ders.png`);
  });

  it('greys the picture of a badge not earned yet', async () => {
    await overrides({ 'badge:ders': `${CDN}/ders.png` });
    const { container } = renderWithProviders(<BadgeMedal badgeKey="ders" tier={0} tierCount={4} size={40} label="Ders" />);
    expect(await picture(container)).toBe(`${CDN}/ders.png`);
    expect(pictureStyle('Ders')).toContain('opacity: 0.4');
    expect(pictureStyle('Ders')).toContain('grayscale');
  });

  it('never shows the picture of a secret not found yet, which would give the secret away', async () => {
    await overrides({ 'badge:tire-rast': `${CDN}/secret.png`, 'badge:ders': `${CDN}/ders.png` });
    const { container } = renderWithProviders(<BadgeMedal badgeKey="tire-rast" tier={0} tierCount={1} hidden size={80} label="A secret badge" />);
    expect(drawings(container)).toBe(1);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'A secret badge' })).toBeTruthy();
    expect(container.innerHTML).not.toContain('secret.png');
  });

  it('shows a secret’s picture once it has been found', async () => {
    await overrides({ 'badge:tire-rast': `${CDN}/secret.png` });
    const { container } = renderWithProviders(<BadgeMedal badgeKey="tire-rast" tier={1} tierCount={1} size={80} label="Tîrê rast" />);
    expect(await picture(container)).toBe(`${CDN}/secret.png`);
  });
});

describe('league emblems', () => {
  it('draws a league from its picture, greyed while not reached', async () => {
    await overrides({ 'league:kani': `${CDN}/kani.png` });
    const reached = renderWithProviders(<LeagueEmblem tier="kani" size={44} label="Kanî" />);
    expect(await picture(reached.container)).toBe(`${CDN}/kani.png`);
    expect(pictureStyle('Kanî')).not.toContain('opacity');
    cleanup();
    const locked = renderWithProviders(<LeagueEmblem tier="kani" size={44} label="Kanî" locked />);
    expect(await picture(locked.container)).toBe(`${CDN}/kani.png`);
    expect(pictureStyle('Kanî')).toContain('opacity: 0.4');
  });

  it('draws a league with no picture by code, locked as before', async () => {
    await overrides({ 'league:kani': `${CDN}/kani.png` });
    const { container } = renderWithProviders(<LeagueEmblem tier="cem" size={44} label="Cem" locked />);
    expect(drawings(container)).toBe(1);
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('a season frame', () => {
  const avatar = <Text>RJ</Text>;

  it('is the ring drawn by code, with its glint, when nobody uploaded one', () => {
    const { container } = renderWithProviders(
      <SeasonFramed tier="lutke" size={96} label="Lûtke season frame">
        {avatar}
      </SeasonFramed>,
    );
    // The ring, and the glint that travels round it.
    expect(drawings(container)).toBe(2);
    expect(screen.getByText('RJ')).toBeTruthy();
  });

  it('is the uploaded ring over the avatar, at the frame’s size, with no glint', async () => {
    await overrides({ 'frame:lutke': `${CDN}/lutke-ring.png` });
    const { container } = renderWithProviders(
      <SeasonFramed tier="lutke" size={96} label="Lûtke season frame">
        {avatar}
      </SeasonFramed>,
    );
    expect(await picture(container)).toBe(`${CDN}/lutke-ring.png`);
    expect(drawings(container)).toBe(0);
    expect(screen.getByRole('img', { name: 'Lûtke season frame' }).getAttribute('style')).toContain('width: 96px');
    // The avatar is still there, in the middle.
    expect(screen.getByText('RJ')).toBeTruthy();
  });
});

/* A profile names its worn frame by SKU, and for a shop frame sends the picture too; one component draws either. */
describe('whatever frame is worn', () => {
  const avatar = <Text>RJ</Text>;
  const label = (tier: string): string => `${tier} season frame`;
  const ART = '/cosmetics/frames/made-01-lale.png';

  it('is the shop’s picture over the avatar, loaded from the website, and says nothing of its own to a screen reader', async () => {
    const { container } = renderWithProviders(
      <Framed sku="frame-made-lale" url={ART} size={96} label={label}>
        {avatar}
      </Framed>,
    );
    expect(await picture(container)).toBe(`https://hevalo.app${ART}`);
    expect(drawings(container)).toBe(0);
    // Decoration: the profile around it already names the person.
    expect(screen.queryByRole('img', { name: /frame/ })).toBeNull();
    expect(screen.getByText('RJ')).toBeTruthy();
  });

  it('is the season’s ring, drawn from the SKU, whatever picture comes with it', () => {
    const { container } = renderWithProviders(
      <Framed sku="frame_rank_lutke" url={ART} size={96} label={label}>
        {avatar}
      </Framed>,
    );
    expect(screen.getByRole('img', { name: 'lutke season frame' })).toBeTruthy();
    expect(drawings(container)).toBe(2);
    expect(container.querySelector('img')).toBeNull();
  });

  it('is the avatar alone with no frame, or with a shop frame whose picture did not come', () => {
    const bare = renderWithProviders(
      <Framed sku={null} size={96} label={label}>
        {avatar}
      </Framed>,
    );
    expect(screen.getByText('RJ')).toBeTruthy();
    expect(bare.container.querySelector('img')).toBeNull();
    expect(drawings(bare.container)).toBe(0);
    cleanup();
    const older = renderWithProviders(
      <Framed sku="frame-made-lale" size={96} label={label}>
        {avatar}
      </Framed>,
    );
    expect(screen.getByText('RJ')).toBeTruthy();
    expect(older.container.querySelector('img')).toBeNull();
  });
});

describe('a default profile picture', () => {
  it('is the uploaded picture where an admin replaced it, and the one that ships otherwise', async () => {
    const { container } = renderWithProviders(<Avatar name="Rojda" photoUrl="/cosmetics/avatars/default-03.png" />);
    expect(await picture(container)).toBe('https://hevalo.app/cosmetics/avatars/default-03.png');
    await act(async () => {
      await overrides({ 'avatar:default-03': `${CDN}/avatar-03.png` });
    });
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe(`${CDN}/avatar-03.png`));
  });

  it('is the default deer, not letters, for somebody with no picture', async () => {
    const { container } = renderWithProviders(<Avatar name="Rojda" photoUrl={null} />);
    expect(await picture(container)).toBe('https://hevalo.app/cosmetics/avatars/default-01.png');
    expect(container.textContent).toBe('');
  });

  it('leaves a photo of somebody’s own alone', async () => {
    await overrides({ 'avatar:default-03': `${CDN}/avatar-03.png` });
    const { container } = renderWithProviders(<Avatar name="Rojda" photoUrl="https://media.hevalo.app/profile/rojda.webp" />);
    expect(await picture(container)).toBe('https://media.hevalo.app/profile/rojda.webp');
  });
});

describe('an event banner', () => {
  const live = () => {
    testAuth.client = fakeClient({ 'GET /events/active': ok({ events: [{ key: 'newroz-2026', name: 'Newroz', theme: 'newroz' }] }) });
  };

  it('keeps the theme’s colour and glyph when the theme has no picture, with the words in the theme’s own ink', async () => {
    live();
    eventTheme.value = { pack: EVENT_THEME_PACKS.newroz, optedOut: false };
    const { container } = renderWithProviders(<EventBanner />);
    expect(await screen.findByRole('button', { name: 'Newroz — event quests' })).toBeTruthy();
    // The flame, drawn from the app's icons in the ink that reads on Newroz's gold.
    const glyph = container.querySelector('svg path');
    expect(glyph?.getAttribute('d')).toBe(ICON_PATHS.flame[0]);
    expect(glyph?.getAttribute('fill')).toBe('#3A2A00');
    expect(screen.getByText('Newroz').getAttribute('style')).toContain('color: rgb(58, 42, 0)');
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows the theme’s picture behind the event’s name, with the words in white over a dimming', async () => {
    live();
    eventTheme.value = { pack: EVENT_THEME_PACKS.newroz, optedOut: false };
    await overrides({ 'event:newroz': `${CDN}/newroz.webp` });
    const { container } = renderWithProviders(<EventBanner />);
    expect(await screen.findByRole('button', { name: 'Newroz — event quests' })).toBeTruthy();
    expect(await picture(container)).toBe(`${CDN}/newroz.webp`);
    // The picture stands where the glyph did; the chevron is the one glyph left, in white.
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('svg path')?.getAttribute('fill')).toBe('#FFFFFF');
    expect(screen.getByText('Newroz').getAttribute('style')).toContain('color: rgb(255, 255, 255)');
    expect(screen.getByText('Quests & rewards — tap to play')).toBeTruthy();
  });

  it('shows a picture for an event whose theme has no pack of its own', async () => {
    testAuth.client = fakeClient({ 'GET /events/active': ok({ events: [{ key: 'sersal', name: 'Sersal', theme: 'sersal' }] }) });
    await overrides({ 'event:sersal': `${CDN}/sersal.webp` });
    const { container } = renderWithProviders(<EventBanner />);
    expect(await picture(container)).toBe(`${CDN}/sersal.webp`);
  });

  it('shows no picture to someone who turned the event looks off', async () => {
    live();
    eventTheme.value = { pack: null, optedOut: true };
    await overrides({ 'event:newroz': `${CDN}/newroz.webp` });
    const { container } = renderWithProviders(<EventBanner />);
    expect(await screen.findByRole('button', { name: 'Newroz — event quests' })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });
});
