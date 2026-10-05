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

  /** Low stakes: a miss answers with the right letter at once. */
  it('checks six letters and names the right one on a miss', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(screen.getByText('Question 1 of 6')).toBeInTheDocument();
    const options = screen.getAllByRole('button').filter((b) => b.classList.contains('ab-option'));
    expect(options).toHaveLength(3);
    await userEvent.click(options[0]!);
    expect(await screen.findByRole('status')).toHaveTextContent(/Right\.|Not quite: it’s/);
  });
});
