import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Words } from './Words';
import { jsonResponse, renderApp } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const show = (path = '/app/learn/words') => {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, {})));
  return renderApp(<Words />, [path]);
};

describe('Words to know', () => {
  it('lists the four sets with their Kurdish names and how many of each have been opened here', async () => {
    localStorage.setItem('hevalo_words_colours_seen', JSON.stringify({ kmr: ['red', 'blue'], ckb: ['red'] }));
    show();
    expect(await screen.findByRole('heading', { level: 1, name: 'Words to know' })).toBeInTheDocument();
    const colours = screen.getByRole('link', { name: 'Colours, 2 of 11 explored' });
    expect(colours).toHaveAttribute('href', '/app/learn/words/colours?script=kmr');
    expect(colours).toHaveTextContent('Reng');
    expect(colours).toHaveAccessibleDescription('Eleven colours, and how to put one after a word.');
    expect(screen.getByRole('link', { name: 'Numbers, 0 of 30 explored' })).toHaveTextContent('Hejmar');
    expect(screen.getByRole('link', { name: 'Days of the week, 0 of 7 explored' })).toHaveTextContent('Rojên hefteyê');
    expect(screen.getByRole('link', { name: 'Months, 0 of 24 explored' })).toHaveTextContent('Meh');
    expect(screen.getByText('Thirty words, and with them every number up to 9,999.')).toBeInTheDocument();
  });

  it('names the sets in Soranî when the link asks for it, right to left', async () => {
    show('/app/learn/words?script=ckb');
    const colours = await screen.findByRole('link', { name: 'Colours, 0 of 11 explored' });
    expect(colours).toHaveAttribute('href', '/app/learn/words/colours?script=ckb');
    const name = colours.querySelector('.wd-set-name')!;
    expect(name).toHaveTextContent('ڕەنگەکان');
    expect(name).toHaveAttribute('dir', 'rtl');
    expect(name).toHaveAttribute('lang', 'ckb');
  });

  /** a Kurmancî reader's title already is the Kurmancî name, so the card names the set in Soranî instead */
  it('gives a Kurmancî reader the Soranî name beside the Kurmancî title', async () => {
    localStorage.setItem('hevalo_locale', 'ku');
    show();
    const months = await screen.findByRole('link', { name: /^Meh, / });
    expect(months.querySelector('.wd-set-name')).toHaveTextContent('مانگەکان');
  });
});
