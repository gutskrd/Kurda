import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alphabet } from './Alphabet';
import { jsonResponse, renderApp } from '../test/utils';

/*
 * The alphabet with recordings an editor gave a character. In a file of its
 * own: the page asks for its recordings once, and keeps them.
 */

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Alphabet: who says a letter', () => {
  it('stands the character whole on a stage beside the letter, and has them say the word too', async () => {
    // a play that starts at once, as a browser's does once the clip has loaded
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).endsWith('/alphabet/audio')
          ? jsonResponse(200, {
              clips: { 'kmr:sound:c': 'https://cdn.test/c.wav', 'kmr:word:c': 'https://cdn.test/cinar.wav', 'kmr:sound:d': 'https://cdn.test/d.wav' },
              voices: { 'kmr:sound:c': { speaker: 'xezo' }, 'kmr:word:c': { speaker: 'hamo' } },
            })
          : jsonResponse(401, {}),
      ),
    );
    renderApp(<Alphabet />, ['/app/alphabet']);
    await userEvent.click(await screen.findByRole('button', { name: 'C, like j' }));
    const card = await screen.findByRole('dialog');
    await waitFor(() => expect(card.querySelector('.ab-card-stage .speaking-character')).not.toBeNull());
    const stage = card.querySelector<HTMLElement>('.ab-card-stage')!;
    const face = stage.querySelector('.speaking-character')!;
    expect(face).toHaveAttribute('data-speaker', 'xezo');
    expect(face).toHaveAttribute('aria-hidden', 'true');
    // the whole figure, not a head in a tile, with the letter and its button beside it
    expect(face.querySelector('svg')).toHaveAttribute('viewBox', '26 98 236 678');
    expect(within(stage).getByText('C')).toBeInTheDocument();
    expect(within(stage).getByRole('button', { name: 'Listen' })).toBeInTheDocument();
    // one character on the card: nobody squeezed in beside the word's button
    expect(card.querySelectorAll('.speaking-character')).toHaveLength(1);

    // the word's recording is Hamo's: playing it hands the stage to him
    await userEvent.click(within(card).getByRole('button', { name: 'Listen to the word' }));
    await waitFor(() => expect(card.querySelector('.ab-card-stage .speaking-character')).toHaveAttribute('data-speaker', 'hamo'));

    // a recording with no character shows nobody, and no stage: the letter and its button as they always were
    await userEvent.click(within(card).getByRole('button', { name: 'Next letter' }));
    await waitFor(() => expect(card.querySelector('.speaking-character')).toBeNull());
    expect(card.querySelector('.character-stage')).toBeNull();
    expect(card.querySelector('.ab-card-head')).not.toBeNull();
  });
});
