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
  it('puts the character beside the letter’s play button, and has them say the word too', async () => {
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
    await waitFor(() => expect(card.querySelector('.ab-card-tools .speaking-character')).not.toBeNull());
    const face = card.querySelector('.ab-card-tools .speaking-character')!;
    expect(face).toHaveAttribute('data-speaker', 'xezo');
    expect(face).toHaveAttribute('aria-hidden', 'true');

    // the word's recording is Hamo's: playing it hands the card to him
    await userEvent.click(within(card).getByRole('button', { name: 'Listen to the word' }));
    await waitFor(() => expect(card.querySelector('.ab-card-tools .speaking-character')).toHaveAttribute('data-speaker', 'hamo'));

    // a recording with no character shows nobody
    await userEvent.click(within(card).getByRole('button', { name: 'Next letter' }));
    await waitFor(() => expect(card.querySelector('.speaking-character')).toBeNull());
  });
});
