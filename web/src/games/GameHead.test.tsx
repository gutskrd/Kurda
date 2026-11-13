import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { gameEmblemTone } from '@kurda/shared';
import { GameHead, stageTone } from './GameHead';
import { renderApp } from '../test/utils';

describe('the top of a game’s page', () => {
  it('names the game, shows its emblem, and leads back to the games', () => {
    const { container } = renderApp(<GameHead game="rhyme" title="Peyvên Hevserwa" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Peyvên Hevserwa' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to games' })).toHaveAttribute('href', '/app/games');
    // the emblem is decoration beside the name
    expect(container.querySelector('.gs-head .gp-art')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('says what the game’s Kurmancî name means, small above it, and “Games” where the name means only itself', () => {
    const { unmount } = renderApp(<GameHead game="race" title="Pêşbaziya Nivîsandinê" meaning="Typing race" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pêşbaziya Nivîsandinê' })).toBeInTheDocument();
    expect(screen.getByText('Typing race')).toBeInTheDocument();
    expect(screen.queryByText('Games')).toBeNull();
    unmount();
    // Peyvok is a made-up word, and a Kurdish interface would only say the name twice
    renderApp(<GameHead game="peyvok" title="Peyvok" meaning="Peyvok" />);
    expect(screen.getByText('Games')).toBeInTheDocument();
    expect(screen.getByRole('banner').querySelector('.gs-head-eyebrow')?.textContent).toBe('Games');
  });

  it('puts what a page adds at the end of the row', () => {
    renderApp(
      <GameHead game="race" title="Pêşbaziya Nivîsandinê">
        <button type="button">Keyboard</button>
      </GameHead>,
    );
    const head = screen.getByRole('banner');
    expect(head.lastElementChild).toBe(screen.getByRole('button', { name: 'Keyboard' }));
  });

  it('asks the page before leaving, where the page has something to lose', async () => {
    const onBack = vi.fn();
    renderApp(<GameHead game="who-am-i" title="Ez kî me?" onBack={onBack} />);
    // the way back is in the same corner under the same name, and goes nowhere by itself
    expect(screen.queryByRole('link', { name: 'Back to games' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back to games' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('gives the stage the game’s own colour', () => {
    expect(stageTone('peyvok')).toEqual({ '--gs-tone': gameEmblemTone('peyvok') });
    expect(stageTone('race')).not.toEqual(stageTone('peyvok'));
  });
});
