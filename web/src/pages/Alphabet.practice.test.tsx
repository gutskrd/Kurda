import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ALPHABET_CLIPS } from '@kurda/shared';
import { Alphabet } from './Alphabet';
import { jsonResponse, renderApp } from '../test/utils';

/* Practice once every sound is recorded with a speaker; its own file, since the page fetches its recordings once and keeps them. */
const keys = ALPHABET_CLIPS.map((clip) => clip.key);
const RECORDED = {
  clips: Object.fromEntries(keys.map((key, i) => [key, `https://media.test/alphabet/${i}.wav`])),
  voices: Object.fromEntries(keys.map((key) => [key, { speaker: 'hevalo' }])),
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const show = () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (String(url).endsWith('/alphabet/audio') ? jsonResponse(200, RECORDED) : jsonResponse(401, {}))),
  );
  return renderApp(<Alphabet />, ['/app/alphabet']);
};

describe('Alphabet practice: who asks', () => {
  it('asks a question out loud from a stage, and is pleased with a right answer', async () => {
    const heard: string[] = [];
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      heard.push(this.src);
      return Promise.resolve();
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    // An English reader starts by listening, and the sound plays by itself.
    expect(screen.getByText('Listen. Which letter is it?')).toBeInTheDocument();
    const stage = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>('.ab-q-stage');
      expect(found).not.toBeNull();
      return found!;
    });
    expect(within(stage).getByRole('button', { name: 'Play again' })).toBeInTheDocument();
    expect(stage.querySelectorAll('.speaking-character')).toHaveLength(1);

    // The letter whose recording played is the answer.
    const key = keys[Number(/(\d+)\.wav$/.exec(heard.at(-1)!)![1])]!;
    const letter = key.split(':')[2];
    const options = screen.getAllByRole('button').filter((b) => b.classList.contains('ab-option'));
    await userEvent.click(options.find((b) => b.querySelector('.ab-tile-glyph')?.textContent === letter)!);
    expect(screen.getByRole('status')).toHaveTextContent('Right.');
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(stage.querySelector('[data-eyes="happy"]')).not.toHaveAttribute('visibility');
  });
});
