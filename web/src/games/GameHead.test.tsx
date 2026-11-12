import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { gameEmblemTone } from '@kurda/shared';
import { GameHead, stageTone } from './GameHead';
import { renderApp } from '../test/utils';

describe('the top of a game’s page', () => {
  it('names the game, shows its emblem, and leads back to the games', () => {
    const { container } = renderApp(<GameHead game="rhyme" title="Rhyming Words" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Rhyming Words' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to games' })).toHaveAttribute('href', '/app/games');
    // the emblem is decoration beside the name
    expect(container.querySelector('.gs-head .gp-art')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('puts what a page adds at the end of the row', () => {
    renderApp(
      <GameHead game="race" title="Typing Race">
        <button type="button">Keyboard</button>
      </GameHead>,
    );
    const head = screen.getByRole('banner');
    expect(head.lastElementChild).toBe(screen.getByRole('button', { name: 'Keyboard' }));
  });

  it('gives the stage the game’s own colour', () => {
    expect(stageTone('peyvok')).toEqual({ '--gs-tone': gameEmblemTone('peyvok') });
    expect(stageTone('race')).not.toEqual(stageTone('peyvok'));
  });
});
