import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { SYNTHESISED_WORD_CLIPS } from '@kurda/shared';
import { WordSet } from './WordSet';
import { jsonResponse, renderApp } from '../test/utils';

/*
 * A word set once the owner has recorded a word and chosen who says it. In a
 * file of its own: the page asks for its recordings once, and keeps them.
 */

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('WordSet: who says a word', () => {
  it('plays the recording in place of the synthesised clip, said by its character on a stage', async () => {
    const heard: string[] = [];
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      heard.push(this.src);
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).endsWith('/alphabet/audio')
          ? jsonResponse(200, {
              clips: { 'words:colours:kmr:red': 'https://media.test/sor.wav', 'kmr:sound:b': 'https://media.test/b.wav' },
              voices: { 'words:colours:kmr:red': { speaker: 'hevalo' } },
            })
          : jsonResponse(401, {}),
      ),
    );
    renderApp(
      <Routes>
        <Route path="/app/learn/words/:set" element={<WordSet />} />
      </Routes>,
      ['/app/learn/words/colours'],
    );

    const listen = await screen.findByRole('button', { name: 'Listen to sor' });
    // the recordings arrive after the first paint; the tile's button plays whatever has arrived by then
    await waitFor(async () => {
      await userEvent.click(listen);
      expect(heard.at(-1)).toBe('https://media.test/sor.wav');
    });

    await userEvent.click(screen.getByRole('button', { name: 'sor, red' }));
    const sheet = await screen.findByRole('dialog');
    await waitFor(() => expect(sheet.querySelector('.ab-card-stage .speaking-character')).toHaveAttribute('data-speaker', 'hevalo'));
    expect(within(sheet).getByRole('button', { name: 'Listen' })).toBeInTheDocument();
    expect(within(sheet).queryByText('Computer voice — a guide, not a native speaker.')).toBeNull();

    // blue has no recording: its synthesised clip still plays, and nobody stands on the card
    await userEvent.click(within(sheet).getByRole('button', { name: 'Next word' }));
    expect(heard.at(-1)).toMatch(new RegExp(`/audio/words/${SYNTHESISED_WORD_CLIPS['words:colours:kmr:blue']}$`));
    await waitFor(() => expect(sheet.querySelector('.speaking-character')).toBeNull());
    expect(within(sheet).getByText('Computer voice — a guide, not a native speaker.')).toBeInTheDocument();
  });
});
