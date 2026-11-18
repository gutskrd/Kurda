import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BadgeMedal, FrameOverlay, LeagueEmblem, PictureFrame, SeasonFrame, frameTier } from './art';

describe('the art, inlined', () => {
  it('labels every drawing with the title it is given', () => {
    render(
      <>
        <LeagueEmblem tier="kani" title="Kanî (Spring)" />
        <BadgeMedal badgeKey="agir" tier={3} title="Agir (Fire), Zêr" />
      </>,
    );
    for (const name of ['Kanî (Spring)', 'Agir (Fire), Zêr']) {
      expect(screen.getByRole('img', { name })).toBeInTheDocument();
    }
  });

  /** An unchanged drawing keeps its DOM node across re-renders, so its shine does not restart. */
  it('leaves a drawing in place when the page around it is drawn again', () => {
    const page = (note: string): React.JSX.Element => (
      <>
        <p>{note}</p>
        <LeagueEmblem tier="cem" size={84} title="Çem (River)" />
        <SeasonFrame tier="sterk" size={64} title="Stêrk season frame">
          <span />
        </SeasonFrame>
      </>
    );
    const { rerender, container } = render(page('first'));
    const emblem = screen.getByRole('img', { name: 'Çem (River)' });
    const layers = [...container.querySelectorAll('svg')];
    rerender(page('second'));
    expect(screen.getByText('second')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Çem (River)' })).toBe(emblem);
    expect([...container.querySelectorAll('svg')]).toEqual(layers);
    for (const layer of layers) expect(layer.isConnected).toBe(true);
    // One that did change is redrawn.
    rerender(
      <>
        <LeagueEmblem tier="gol" size={84} title="Gol (Lake)" />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Gol (Lake)' })).toBeInTheDocument();
    expect(emblem.isConnected).toBe(false);
  });

  /** The drawing goes into the page as markup, so a title must only ever become text. */
  it('keeps a title as text, whatever it holds', () => {
    const title = '</title><img src="x" onerror="alert(1)"><script>alert(2)</script> & Çiya';
    const { container } = render(
      <>
        <LeagueEmblem tier="gol" title={title} />
        <BadgeMedal badgeKey="agir" tier={3} title={title} />
        <SeasonFrame tier="sterk" size={64} title={title}>
          <span />
        </SeasonFrame>
      </>,
    );
    expect(container.querySelector('img, script, [onerror]')).toBeNull();
    // The frame's shine is a hidden layer of its own; the three drawings carry the title.
    const titles = [...container.querySelectorAll('title')].filter((t) => !t.closest('[aria-hidden="true"]'));
    expect(titles).toHaveLength(3);
    for (const t of titles) {
      expect(t.textContent).toBe(title);
      expect(t.children).toHaveLength(0);
    }
    expect(screen.getAllByRole('img', { name: title })).toHaveLength(3);
  });

  /** Two copies of one drawing must not share gradient ids, or a hidden first copy blanks the second. */
  it('gives each copy of a drawing its own ids', () => {
    const { container } = render(
      <>
        <LeagueEmblem tier="gol" title="a" />
        <LeagueEmblem tier="gol" title="b" />
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

/*
 * A shop frame is a picture with an empty middle (its address comes with the SKU), while a season frame is drawn from
 * its SKU; both sit round a face the same way.
 */
describe('a frame from the shop', () => {
  const ART = '/cosmetics/frames/made-01-lale.png';

  it('is laid round a face from its picture, the face in the middle two thirds of it', () => {
    const { container } = render(
      <PictureFrame src={ART} size={90}>
        <img src="/face.png" alt="" />
      </PictureFrame>,
    );
    const frame = container.querySelector('.art-frame.is-made') as HTMLElement;
    expect(frame.style.width).toBe('90px');
    expect((frame.querySelector('.art-frame-face') as HTMLElement).style.width).toBe('60px');
    const ring = frame.querySelector('img.art-frame-ring')!;
    expect(ring).toHaveAttribute('src', ART);
    // Decorative; the surrounding element names it.
    expect(ring).toHaveAttribute('alt', '');
  });

  it('is the overlay on a profile when the profile sends its picture, and nothing when it does not', () => {
    const title = (): string => 'season frame';
    const worn = render(<FrameOverlay sku="frame-made-lale" url={ART} face={84} title={title} />);
    const ring = worn.container.querySelector('.art-frame-overlay.is-made img.art-frame-ring')!;
    expect(ring).toHaveAttribute('src', ART);
    expect(worn.container.querySelector('svg')).toBeNull();
    worn.unmount();
    // A SKU without a picture draws nothing rather than a wrong ring.
    const bare = render(<FrameOverlay sku="frame-made-lale" face={84} title={title} />);
    expect(bare.container.firstChild).toBeNull();
    bare.unmount();
    // A season frame is drawn from its SKU, whatever picture comes with it.
    const season = render(<FrameOverlay sku="frame_rank_gir" url={ART} face={84} title={title} />);
    expect(season.container.querySelector('.art-frame-overlay.is-gir svg')).not.toBeNull();
    expect(season.container.querySelector('img')).toBeNull();
  });
});
