import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SEASON_FRAME_INNER } from '@kurda/shared';
import { BadgeMedal, FrameOverlay, LeagueEmblem, PlacementEmblem, RankEmblem, SeasonFrame } from './art';
import { ART_OVERRIDES_KEY, resetArtOverridesForTests } from '../art/overrides';

/**
 * Pictures an admin uploaded in place of the art (art/overrides.ts): drawn in
 * the drawing's wrapper, at its size and under its name, wherever the slot is
 * replaced — and the art itself, exactly as before, wherever it is not.
 */

const AGIR = 'https://cdn.test/art/badge-agir.png';
const AGIR_ZER = 'https://cdn.test/art/badge-agir-zer.png';
const SECRET = 'https://cdn.test/art/badge-pisika-wane.png';
const GIR = 'https://cdn.test/art/rank-gir.png';
const KANI = 'https://cdn.test/art/league-kani.png';
const LUTKE_RING = 'https://cdn.test/art/frame-lutke.png';

/** The list as this browser kept it from an earlier visit, read afresh as on a reload. */
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

/** The uploaded picture inside a wrapper, if there is one. */
const pictureIn = (el: Element | null): HTMLImageElement | null => el?.querySelector<HTMLImageElement>('img.art-picture') ?? null;

describe('a badge with an uploaded picture', () => {
  it('draws the level’s own picture, named, at the medal’s size, with no glint', () => {
    replaced({ 'badge:agir': AGIR, 'badge:agir:zer': AGIR_ZER });
    const { container } = render(<BadgeMedal badgeKey="agir" tier={3} size={80} title="Agir (Fire), Zêr" shine />);
    const medal = container.querySelector('.art-badge.is-earned');
    const img = pictureIn(medal);
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', AGIR_ZER);
    expect(img).toHaveAttribute('width', '80');
    expect(img).toHaveAttribute('height', '80');
    expect(img).toHaveAttribute('decoding', 'async');
    expect(screen.getByRole('img', { name: 'Agir (Fire), Zêr' })).toBe(img);
    expect(medal).toHaveStyle({ width: '80px', height: '80px' });
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.art-badge-shine')).toBeNull();
  });

  it('falls back to the picture for every level when a level has none of its own', () => {
    replaced({ 'badge:agir': AGIR, 'badge:agir:zer': AGIR_ZER });
    const { container } = render(<BadgeMedal badgeKey="agir" tier={2} title="Agir, Zîv" />);
    expect(pictureIn(container)).toHaveAttribute('src', AGIR);
  });

  it('draws the art when nothing replaces it, glint and all', () => {
    replaced({ 'badge:ders': 'https://cdn.test/art/badge-ders.png' });
    const { container } = render(<BadgeMedal badgeKey="agir" tier={4} title="Agir, Firûze" shine />);
    expect(pictureIn(container)).toBeNull();
    expect(screen.getByRole('img', { name: 'Agir, Firûze' }).tagName.toLowerCase()).toBe('svg');
    expect(container.querySelector('.art-badge-shine')).not.toBeNull();
  });

  it('never shows a secret not found yet, whatever was uploaded for it', () => {
    replaced({ 'badge:pisika-wane': SECRET, 'badge:pisika-wane:sifir': SECRET });
    const { container } = render(<BadgeMedal badgeKey="pisika-wane" tier={0} state="secret" title="Secret badge" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain(SECRET);
    expect(container.querySelector('.art-badge.is-secret svg')).not.toBeNull();
  });

  it('shows a found secret’s picture like any other badge', () => {
    replaced({ 'badge:pisika-wane': SECRET });
    const { container } = render(<BadgeMedal badgeKey="pisika-wane" tier={1} title="Pisîka Wanê" />);
    expect(pictureIn(container.querySelector('.art-badge.is-earned'))).toHaveAttribute('src', SECRET);
  });

  it('shows a badge not earned yet as its picture greyed, in the locked wrapper', () => {
    replaced({ 'badge:agir': AGIR });
    const { container } = render(<BadgeMedal badgeKey="agir" tier={0} title="Agir · not earned yet" />);
    const locked = container.querySelector('.art.art-badge.is-locked');
    expect(pictureIn(locked)).toHaveAttribute('src', AGIR);
    expect(pictureIn(locked)).toHaveAttribute('alt', 'Agir · not earned yet');
  });
});

describe('a rank emblem with an uploaded picture', () => {
  it('draws one picture for the tier, whatever its division or season', () => {
    replaced({ 'rank:gir': GIR });
    const { container } = render(
      <>
        <RankEmblem tier="gir" division={3} size={56} title="Gir III" />
        <RankEmblem tier="gir" season={{ name: 'payiz', year: 2026 }} size={44} title="Gir, autumn" className="extra" />
        <RankEmblem tier="ciya" division={1} title="Çiya I" />
      </>,
    );
    const [divided, seasonal] = screen.getAllByRole('img', { name: /^Gir/ }) as HTMLImageElement[];
    expect(divided).toHaveAttribute('src', GIR);
    expect(divided).toHaveAttribute('width', '56');
    expect(divided!.closest('.art.art-rank.is-gir')).not.toBeNull();
    expect(seasonal).toHaveAttribute('src', GIR);
    expect(seasonal!.closest('.art-rank.extra')).not.toBeNull();
    // a tier nobody replaced is still drawn
    expect(screen.getByRole('img', { name: 'Çiya I' }).tagName.toLowerCase()).toBe('svg');
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });

  it('leaves the placement emblem drawn', () => {
    replaced({ 'rank:gir': GIR, 'rank:dest': 'https://cdn.test/art/rank-dest.png' });
    const { container } = render(<PlacementEmblem done={2} title="Placing 2/5" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Placing 2/5' }).tagName.toLowerCase()).toBe('svg');
  });

  it('draws the art when nothing replaces it', () => {
    const { container } = render(<RankEmblem tier="gir" division={2} title="Gir II" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.art-rank.is-gir svg')).not.toBeNull();
  });
});

describe('a league emblem with an uploaded picture', () => {
  it('draws it named and sized, and greyed while the league is not reached', () => {
    replaced({ 'league:kani': KANI });
    const { container } = render(
      <>
        <LeagueEmblem tier="kani" size={88} title="Kanî (Spring)" />
        <LeagueEmblem tier="kani" size={56} locked title="Not reached yet: Kanî" />
        <LeagueEmblem tier="gol" size={56} title="Gol (Lake)" />
      </>,
    );
    const here = screen.getByRole('img', { name: 'Kanî (Spring)' });
    expect(here).toHaveAttribute('src', KANI);
    expect(here).toHaveAttribute('width', '88');
    expect(here.closest('.art-league')).not.toHaveClass('is-locked');
    const ahead = screen.getByRole('img', { name: 'Not reached yet: Kanî' });
    expect(ahead).toHaveClass('art-picture');
    expect(ahead.closest('.art.art-league.is-kani')).toHaveClass('is-locked');
    expect(screen.getByRole('img', { name: 'Gol (Lake)' }).tagName.toLowerCase()).toBe('svg');
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });

  it('draws the art, locked keyhole and all, when nothing replaces it', () => {
    const { container } = render(<LeagueEmblem tier="kani" locked title="Not reached yet" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.art-league.is-locked svg')).not.toBeNull();
  });
});

describe('a season frame with an uploaded ring', () => {
  it('lays the ring over the avatar at the drawn ring’s size, the avatar in the middle two-thirds, with no glint', () => {
    replaced({ 'frame:lutke': LUTKE_RING });
    const { container } = render(
      <SeasonFrame tier="lutke" size={90} title="Lûtke season frame">
        <img alt="" data-testid="face" />
      </SeasonFrame>,
    );
    const frame = container.querySelector('.art-frame.is-lutke')!;
    expect(frame).toHaveStyle({ width: '90px', height: '90px' });
    const ring = screen.getByRole('img', { name: 'Lûtke season frame' });
    expect(ring).toHaveAttribute('src', LUTKE_RING);
    expect(ring).toHaveClass('art-frame-ring', 'art-picture');
    expect(ring).toHaveAttribute('width', '90');
    expect(ring).toHaveAttribute('height', '90');
    const inner = `${Math.round(90 * SEASON_FRAME_INNER)}px`;
    expect(screen.getByTestId('face').closest('.art-frame-face')).toHaveStyle({ width: inner, height: inner });
    expect(container.querySelector('.art-frame-shine')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('draws the ring and its glint when nothing replaces it', () => {
    replaced({ 'frame:gir': 'https://cdn.test/art/frame-gir.png' });
    const { container } = render(
      <SeasonFrame tier="lutke" size={64} title="Lûtke season frame">
        <img alt="" />
      </SeasonFrame>,
    );
    expect(container.querySelector('.art-frame-ring svg')).not.toBeNull();
    expect(container.querySelector('.art-frame-shine')).not.toBeNull();
    expect(container.querySelector('img.art-picture')).toBeNull();
  });

  it('lays the uploaded ring round a face already drawn, and nothing for a SKU that is not a frame', () => {
    replaced({ 'frame:lutke': LUTKE_RING });
    const { container } = render(
      <>
        <FrameOverlay sku="frame_rank_lutke_animated" face={84} title={(t) => `${t} frame`} />
        <FrameOverlay sku="bg-sunset" face={84} title={(t) => `${t} frame`} />
        <FrameOverlay sku="frame_rank_zozan" face={84} title={(t) => `${t} frame`} />
      </>,
    );
    const ring = screen.getByRole('img', { name: 'lutke frame' });
    expect(ring).toHaveAttribute('src', LUTKE_RING);
    expect(ring.closest('.art-frame-overlay.is-lutke')).not.toBeNull();
    expect(container.querySelectorAll('.art-frame-overlay')).toHaveLength(2);
    expect(container.querySelector('.art-frame-shine')).toBeNull();
    expect(screen.getByRole('img', { name: 'zozan frame' }).tagName.toLowerCase()).toBe('svg');
  });
});
