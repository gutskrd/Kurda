import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alphabet } from './Alphabet';
import { jsonResponse, renderApp } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const show = (path = '/app/alphabet') => {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, {})));
  return renderApp(<Alphabet />, [path]);
};

describe('Alphabet', () => {
  /** The false friends come first, because that is where a beginner's mistakes are. */
  it('sorts Kurmancî against the reader’s language, false friends first', async () => {
    show();
    const groups = (await screen.findAllByRole('heading', { level: 2 })).filter((h) => h.closest('.ab-group'));
    expect(groups[0]).toHaveTextContent('Look familiar, sound different');
    const watch = groups[0]!.closest('section')!;
    expect(within(watch).getByRole('button', { name: 'C, like j' })).toBeInTheDocument();
    expect(screen.getByText(/You can already read 16 of these 31 letters/)).toBeInTheDocument();
  });

  it('sorts for a German reader by what German does', async () => {
    localStorage.setItem('hevalo_locale', 'de');
    show();
    const watch = (await screen.findByRole('heading', { name: /Bekannt, aber anders gesprochen/ })).closest('section')!;
    // Kurmancî v is German w, and z is a voiced s
    expect(within(watch).getByRole('button', { name: 'V, wie W' })).toBeInTheDocument();
    expect(within(watch).getByRole('button', { name: 'Z, wie S' })).toBeInTheDocument();
  });

  it('opens a letter with its sound, a word to remember it by, and its Soranî partner', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'C, like j' }));
    const card = await screen.findByRole('dialog');
    expect(within(card).getByText('Sounds like')).toBeInTheDocument();
    expect(within(card).getByText('j').tagName).toBe('MARK');
    expect(within(card).getByText('neighbour')).toBeInTheDocument();
    expect(within(card).getByText('ج')).toBeInTheDocument();
  });

  it('shows Soranî with each letter’s Kurmancî partner and how it joins', async () => {
    show('/app/alphabet?script=ckb');
    await userEvent.click(await screen.findByRole('button', { name: 'ب, like b' }));
    const card = await screen.findByRole('dialog');
    expect(within(card).getByText('How it joins')).toBeInTheDocument();
    expect(within(card).getByText('In Kurmancî')).toBeInTheDocument();
  });

  it('starts a Soranî reader on Soranî', async () => {
    localStorage.setItem('hevalo_locale', 'ckb');
    show();
    expect(await screen.findByRole('tab', { name: /سۆرانی/, selected: true })).toBeInTheDocument();
  });

  /** Low stakes: a miss answers with the right letter at once, and comes back later in the round. */
  it('runs a round of eight, explains each answer and brings a miss back', async () => {
    const played = vi.spyOn(HTMLMediaElement.prototype, 'play');
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const dots = screen.getByRole('list', { name: /Question 1 of 8/ });
    expect(within(dots).getAllByRole('listitem')).toHaveLength(8);
    // an English reader starts by listening, and the sound plays by itself
    expect(screen.getByText('Listen. Which letter is it?')).toBeInTheDocument();
    expect(played).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument();

    const options = screen.getAllByRole('button').filter((b) => b.classList.contains('ab-option'));
    expect(options).toHaveLength(3);
    // answer with the keyboard, the way a desktop reader can
    await userEvent.keyboard('1');
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/Right\.|Not quite: it’s/);
    const missed = /Not quite/.test(status.textContent ?? '');
    if (missed) expect(status).toHaveTextContent('It comes back later in this round.');
    expect(status.querySelector('.ab-explain')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('list', { name: /Question 2 of 8/ })).toBeInTheDocument();
  });

  it('ends with a score and a round of just the misses', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    // answer every question with the first option until the round ends
    for (let i = 0; i < 20 && !screen.queryByText(/right first time/); i++) {
      await userEvent.keyboard('1');
      await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    }
    expect(screen.getByText(/of 8 right first time/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New round' })).toBeInTheDocument();
  });
});
