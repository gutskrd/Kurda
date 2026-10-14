import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BadgeMedal, FrameOverlay, LeagueEmblem, PlacementEmblem, RankEmblem, SeasonFrame, frameTier } from './art';

describe('the art, inlined', () => {
  it('labels every drawing with the title it is given', () => {
    render(
      <>
        <RankEmblem tier="ciya" division={2} title="Çiya II (Mountain)" />
        <PlacementEmblem done={3} title="Placing 3/5" />
        <LeagueEmblem tier="kani" title="Kanî (Spring)" />
        <BadgeMedal badgeKey="agir" tier={3} title="Agir (Fire), Zêr" />
      </>,
    );
    for (const name of ['Çiya II (Mountain)', 'Placing 3/5', 'Kanî (Spring)', 'Agir (Fire), Zêr']) {
      expect(screen.getByRole('img', { name })).toBeInTheDocument();
    }
  });

  /** Two copies of one drawing must not share gradient ids, or a hidden first copy blanks the second. */
  it('gives each copy of a drawing its own ids', () => {
    const { container } = render(
      <>
        <RankEmblem tier="gir" division={3} title="a" />
        <RankEmblem tier="gir" division={3} title="b" />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lays the glint over a shining badge, hidden from screen readers, and none over a plain one', () => {
    const { container } = render(
      <>
        <BadgeMedal badgeKey="agir" tier={4} title="shines" shine />
        <BadgeMedal badgeKey="ders" tier={1} title="plain" shine />
      </>,
    );
    const shines = container.querySelectorAll('.art-badge-shine');
    expect(shines).toHaveLength(1);
    expect(shines[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws a locked medal for a badge not earned yet, and nothing for a key it has no art for', () => {
    const { container } = render(
      <>
        <BadgeMedal badgeKey="agir" tier={0} title="not yet" />
        <BadgeMedal badgeKey="no-such-badge" tier={1} title="none" />
      </>,
    );
    expect(container.querySelectorAll('.art-badge')).toHaveLength(1);
    expect(container.querySelector('.art-badge.is-locked')).not.toBeNull();
  });

  it('turns a glint round the Lûtke and Stêrk frames only, hidden from screen readers', () => {
    const { container } = render(
      <>
        <SeasonFrame tier="lutke" size={64} title="Lûtke season frame">
          <img alt="" />
        </SeasonFrame>
        <SeasonFrame tier="gir" size={64} title="Gir season frame">
          <img alt="" />
        </SeasonFrame>
      </>,
    );
    expect(container.querySelectorAll('.art-frame-shine')).toHaveLength(1);
    expect(container.querySelector('.art-frame-shine')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('img', { name: 'Gir season frame' })).toBeInTheDocument();
  });

  it('reads the tier from a frame SKU, and lays nothing for one that is not a season frame', () => {
    expect(frameTier('frame_rank_ciya')).toBe('ciya');
    expect(frameTier('frame_rank_sterk_animated')).toBe('sterk');
    expect(frameTier('bg-sunset')).toBeNull();
    expect(frameTier(null)).toBeNull();
    const { container } = render(<FrameOverlay sku="bg-sunset" face={84} title={() => 'x'} />);
    expect(container).toBeEmptyDOMElement();
    render(<FrameOverlay sku="frame_rank_zozan" face={84} title={(t) => `${t} frame`} />);
    expect(screen.getByRole('img', { name: 'zozan frame' })).toBeInTheDocument();
  });
});
