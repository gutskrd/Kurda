// @vitest-environment jsdom
/**
 * Where a slot has an uploaded picture it is drawn from that picture, in the
 * same box and under the same name; where it has none, the art drawn by code
 * is drawn exactly as before. A secret badge not yet found keeps its own art
 * whatever was uploaded, and what is not reached yet is greyed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
// the event look, as the provider would work it out: the test says which pack is live and whether it was turned off
const eventTheme = vi.hoisted(() => ({ value: { pack: null as unknown, optedOut: false } }));
vi.mock('../theme/EventThemeContext', () => ({ useEventTheme: () => eventTheme.value }));
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { Text } from 'react-native';
import { EventBanner } from '../events/EventBanner';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { BadgeMedal, LeagueEmblem, PlacementEmblem, RankEmblem, SeasonFramed } from '../ranks/art';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { EVENT_THEME_PACKS } from '../theme/eventThemes';
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

describe('rank and league emblems', () => {
  it('draws a rank by code without a picture, and the picture once the list arrives', async () => {
    const { container } = renderWithProviders(<RankEmblem tier="gir" division={2} size={44} label="Gir II" />);
    expect(drawings(container)).toBe(1);
    await act(async () => {
      await overrides({ 'rank:gir': `${CDN}/gir.png` });
    });
    expect(await picture(container)).toBe(`${CDN}/gir.png`);
    expect(drawings(container)).toBe(0);
    expect(screen.getByRole('img', { name: 'Gir II' })).toBeTruthy();
  });

  it('keeps the placement emblem drawn by code', async () => {
    await overrides({ 'rank:gir': `${CDN}/gir.png`, 'rank:dest': `${CDN}/dest.png` });
    const { container } = renderWithProviders(<PlacementEmblem done={3} size={44} label="Placing 3/5" />);
    expect(drawings(container)).toBe(1);
    expect(container.querySelector('img')).toBeNull();
  });

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
    // the ring, and the glint that travels round it
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
    // the avatar is still there, in the middle
    expect(screen.getByText('RJ')).toBeTruthy();
  });
});

describe('a default profile picture', () => {
  it('is the uploaded picture where an admin replaced it, and the one that ships otherwise', async () => {
    const { container } = renderWithProviders(<InitialsAvatar name="Rojda" id="u1" photoUrl="/cosmetics/avatars/default-03.png" />);
    expect(await picture(container)).toBe('https://hevalo.app/cosmetics/avatars/default-03.png');
    await act(async () => {
      await overrides({ 'avatar:default-03': `${CDN}/avatar-03.png` });
    });
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe(`${CDN}/avatar-03.png`));
  });

  it('leaves a photo of somebody’s own alone', async () => {
    await overrides({ 'avatar:default-03': `${CDN}/avatar-03.png` });
    const { container } = renderWithProviders(<InitialsAvatar name="Rojda" id="u1" photoUrl="https://media.hevalo.app/profile/rojda.webp" />);
    expect(await picture(container)).toBe('https://media.hevalo.app/profile/rojda.webp');
  });
});

describe('an event banner', () => {
  const live = () => {
    testAuth.client = fakeClient({ 'GET /events/active': ok({ events: [{ key: 'newroz-2026', name: 'Newroz', theme: 'newroz' }] }) });
  };

  it('keeps the theme’s colour and emoji when the theme has no picture', async () => {
    live();
    eventTheme.value = { pack: EVENT_THEME_PACKS.newroz, optedOut: false };
    const { container } = renderWithProviders(<EventBanner />);
    expect(await screen.findByRole('button', { name: 'Newroz — event quests' })).toBeTruthy();
    expect(screen.getByText('🔥')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows the theme’s picture behind the event’s name, with the words in white over a dimming', async () => {
    live();
    eventTheme.value = { pack: EVENT_THEME_PACKS.newroz, optedOut: false };
    await overrides({ 'event:newroz': `${CDN}/newroz.webp` });
    const { container } = renderWithProviders(<EventBanner />);
    expect(await screen.findByRole('button', { name: 'Newroz — event quests' })).toBeTruthy();
    expect(await picture(container)).toBe(`${CDN}/newroz.webp`);
    expect(screen.queryByText('🔥')).toBeNull();
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
