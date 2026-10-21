import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, renderApp } from '../test/utils';
import { EntryView } from './EntryView';

/*
 * A dictionary entry's pronunciations: one an editor gave a character has the
 * character beside its button; the rest are the plain button they always were.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function entry(audio: unknown[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      new URL(url).pathname === '/dictionary/entries/d1'
        ? jsonResponse(200, { id: 'd1', headword: 'roj', dialect: 'kurmanji', senses: [], audio, xrefs: [] })
        : jsonResponse(401, {}),
    ),
  );
  renderApp(<EntryView entryId="d1" onOpenEntry={vi.fn()} />);
}

describe('a dictionary entry’s pronunciations', () => {
  it('puts the character beside a pronunciation that has one, and plays it through the app’s player', async () => {
    const played = vi.spyOn(HTMLMediaElement.prototype, 'play');
    entry([
      { id: 'a1', url: 'https://cdn.test/roj-kmr.m4a', dialect: 'kurmanji', speaker: 'hamo' },
      { id: 'a2', url: 'https://cdn.test/roj-2.m4a', dialect: 'kurmanji' },
    ]);
    const buttons = await screen.findAllByRole('button', { name: 'Play pronunciation' });
    expect(buttons).toHaveLength(2);
    const faces = document.querySelectorAll('.dict-voice .speaking-character');
    expect(faces).toHaveLength(1);
    expect(faces[0]).toHaveAttribute('data-speaker', 'hamo');
    expect(buttons[0]!.closest('.dict-voice')).not.toBeNull();
    expect(buttons[1]!.closest('.dict-voice')).toBeNull();

    await userEvent.click(buttons[0]!);
    expect(played).toHaveBeenCalledTimes(1);
    expect((played.mock.contexts[0] as HTMLMediaElement).src).toBe('https://cdn.test/roj-kmr.m4a');
  });

  it('shows nobody for pronunciations without one', async () => {
    entry([{ id: 'a1', url: 'https://cdn.test/roj.m4a', dialect: 'kurmanji' }]);
    expect(await screen.findByRole('button', { name: 'Play pronunciation' })).toBeInTheDocument();
    expect(document.querySelector('.speaking-character')).toBeNull();
  });
});
