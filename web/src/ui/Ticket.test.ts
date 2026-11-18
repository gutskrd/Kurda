import { describe, expect, it } from 'vitest';
import { PLAY_GAMES, playGameHue } from '@kurda/shared';
import { ticketClass, ticketToneClass } from './Ticket';

/*
 * A game ticket takes the hue of the game's stamp on the games page. The stylesheet is read from disk, since an
 * imported stylesheet arrives empty in tests.
 */
interface FileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
}
const fileSystem = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
const here = import.meta.url;
const tickets = readFileSync(new URL('../styles/ticket.css', here), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('a ticket’s colour', () => {
  it('wears a game’s stamp hue, from one class the stylesheet reads', () => {
    expect(ticketToneClass('rhyme-match')).toBe('ticket--rhyme-match ticket-hued hue-pink');
    expect(ticketClass('wordle-battle', 'column')).toBe('ticket ticket--column ticket--wordle-battle ticket-hued hue-green');
    for (const game of PLAY_GAMES) expect(ticketToneClass(game).includes('ticket-hued'), game).toBe(playGameHue(game) !== null);
    expect(tickets).toMatch(/\.ticket-hued\s*\{[^}]*--t-accent:\s*var\(--hue-base\);[^}]*--t-ink:\s*var\(--hue-deep\);/);
  });

  it('leaves a story game, a friendship and a spent ticket to their own tone', () => {
    expect(ticketToneClass('stories')).toBe('ticket--stories');
    expect(ticketToneClass('friend')).toBe('ticket--friend');
    expect(ticketToneClass('muted')).toBe('ticket--muted');
  });

  it('never colours a ticket in the green of a right answer or the gold of something earned', () => {
    // Only the tone rules; a "Joined" stamp may use the done green.
    const tones = [...tickets.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /\.ticket(--|-hued)/.test(m[1]!));
    expect(tones.length).toBeGreaterThan(0);
    for (const [, selector, body] of tones) expect(body, selector!.trim()).not.toMatch(/var\(--(success|gold|gold-ink)\)/);
  });
});
