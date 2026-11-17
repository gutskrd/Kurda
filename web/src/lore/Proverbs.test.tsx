import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { ProverbRoundItemView, SoloSessionView } from '@kurda/shared';
import { renderApp } from '../test/utils';
import { proverb } from '../test/loreFixtures';
import { fakeApi, type Call } from '../stories/testing';
import { resetSessionVariety } from '../stories/prefs';
import { ProverbsList } from './ProverbsList';
import { ProverbPage } from './ProverbPage';
import { ProverbRound } from './ProverbRound';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetSessionVariety();
});

const pages = (entry: string) =>
  renderApp(
    <Routes>
      <Route path="/app/learn/proverbs" element={<ProverbsList />} />
      <Route path="/app/learn/proverbs/play" element={<ProverbRound />} />
      <Route path="/app/learn/proverbs/:slug" element={<ProverbPage />} />
    </Routes>,
    [entry],
  );

const others = [
  proverb({ slug: 'kmr-dost', text: 'Dost di roja teng de diyar dibe.', themes: ['friendship'], tradition: 'regional', region: 'Behdînan', translations: { en: { translation: 'A friend shows in a hard day.', meaning: 'True friends stay.', explanation: 'x', example: 'y' } } }),
  proverb({ slug: 'kmr-ziman', text: 'Ziman bê hestî ye.', themes: ['wisdom'], tradition: 'new', translations: { en: { translation: 'The tongue has no bone.', meaning: 'Words come easily.', explanation: 'x', example: 'y' } } }),
];
const list = { proverbs: [proverb(), ...others], themes: ['patience', 'friendship', 'wisdom', 'hard-work'], today: 'kmr-dost' };

describe('the proverbs’ list', () => {
  it('puts the proverb of the day first, then every proverb in Kurdish with its translation and where it comes from', async () => {
    fakeApi({ 'GET /proverbs': list });
    pages('/app/learn/proverbs');
    const today = await screen.findByRole('region', { name: 'Proverb of the day' });
    expect(within(today).getByText('Dost di roja teng de diyar dibe.')).toHaveAttribute('lang', 'ku');
    expect(within(today).getByText('A friend shows in a hard day.')).toHaveAttribute('lang', 'en');
    expect(within(today).getByRole('link', { name: 'Read about it' })).toHaveAttribute('href', '/app/learn/proverbs/kmr-dost');

    const all = screen.getByRole('region', { name: 'All proverbs' });
    const rows = within(all).getAllByRole('link');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('Drop by drop, water becomes a lake.')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Traditional')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Regional')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Behdînan')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Newly written')).toBeInTheDocument();
  });

  it('narrows to a theme, and keeps the proverb of the day whatever the theme', async () => {
    fakeApi({ 'GET /proverbs': list });
    pages('/app/learn/proverbs');
    const all = await screen.findByRole('region', { name: 'All proverbs' });
    await userEvent.click(within(all).getByRole('radio', { name: 'Wisdom' }));
    expect(within(all).getAllByRole('link')).toHaveLength(1);
    expect(within(all).getByText('Ziman bê hestî ye.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Proverb of the day' })).toBeInTheDocument();
  });

  it('a Soranî reader reads the Soranî rendering, and English where a proverb has none in their language', async () => {
    localStorage.setItem('hevalo_locale', 'ckb');
    fakeApi({ 'GET /proverbs': { ...list, proverbs: [proverb({ translations: { ...proverb().translations, ckb: { translation: 'ئاو دڵۆپ دڵۆپ دەبێتە گۆم.', meaning: 'م', explanation: 'ڕ', example: 'ن' } } }), ...others] } });
    pages('/app/learn/proverbs');
    expect(await screen.findByText('ئاو دڵۆپ دڵۆپ دەبێتە گۆم.')).toHaveAttribute('lang', 'ckb');
    expect(screen.getAllByText('The tongue has no bone.')[0]).toHaveAttribute('lang', 'en');
  });

  it('offers the round once there are proverbs enough for one', async () => {
    fakeApi({ 'GET /proverbs': { ...list, proverbs: [...list.proverbs, proverb({ slug: 'a1' }), proverb({ slug: 'a2' })] } });
    pages('/app/learn/proverbs');
    expect(await screen.findByRole('link', { name: 'Play a round' })).toHaveAttribute('href', '/app/learn/proverbs/play?dialect=kmr');
  });
});

describe('a proverb', () => {
  it('is set as a line, then its translation, literal sense, meaning, scene, background, equivalent, variants and sources', async () => {
    fakeApi({ 'GET /proverbs/kmr-av-dilop-dilop': { proverb: proverb() } });
    pages('/app/learn/proverbs/kmr-av-dilop-dilop');
    expect(await screen.findByRole('heading', { level: 1, name: 'Av dilop dilop dibe gol.' })).toHaveAttribute('lang', 'ku');
    expect(screen.getByText('Drop by drop, water becomes a lake.')).toBeInTheDocument();
    expect(screen.getByText('Water becomes a pond drop by drop.')).toBeInTheDocument();
    const order = ['What it means', 'When you might hear it', 'Background', 'A saying with the same sense', 'Other ways it is said', 'Where it comes from'];
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(order);
    expect(screen.getByText('Rêzan her êvar pênc peyvên nû hîn dibe.')).toHaveAttribute('lang', 'ku');
    expect(screen.getByText('Rêzan learns five new words every evening.')).toBeInTheDocument();
    expect(screen.getByText('Many a little makes a mickle.')).toBeInTheDocument();
    expect(screen.getByText('ئاو دڵۆپ دڵۆپ دەبێتە گۆم.')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText('A traditional proverb.')).toBeInTheDocument();
    expect(screen.getByText('Gotinên Pêşiyan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Patience' })).toHaveAttribute('href', '/app/learn/proverbs?dialect=kmr&theme=patience');
  });

  it('leaves out what a proverb does not have', async () => {
    const bare = proverb({ variants: [], translations: { en: { translation: 'T', meaning: 'M', explanation: 'E', example: 'X' } } });
    fakeApi({ 'GET /proverbs/kmr-av-dilop-dilop': { proverb: bare } });
    pages('/app/learn/proverbs/kmr-av-dilop-dilop');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Word for word:')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Background' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'A saying with the same sense' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Other ways it is said' })).toBeNull();
  });
});

function round(): SoloSessionView<ProverbRoundItemView> {
  const items: ProverbRoundItemView[] = [0, 1].map((index) => ({
    index,
    mode: 'meaning',
    dialect: 'kmr',
    proverb: index === 0 ? 'Av dilop dilop dibe gol.' : 'Ziman bê hestî ye.',
    locale: 'en',
    options: ['Words come easily.', 'Small efforts add up.', 'True friends stay.'],
  }));
  return {
    id: 'r1',
    game: 'proverb-meaning',
    dialect: 'kmr',
    difficulty: 'intermediate',
    items,
    states: items.map((i) => ({ index: i.index, attempts: 0, correct: false, firstTry: false, done: false })),
    maxAttempts: 2,
    finished: false,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

describe('the round on the proverbs', () => {
  it('plays in the solo games’ way: a struck choice after a wrong try, the proverb explained once done, and honest results', async () => {
    const correction = (index: number) => ({ choice: 1, slug: index === 0 ? 'kmr-av-dilop-dilop' : 'kmr-ziman', text: index === 0 ? 'Av dilop dilop dibe gol.' : 'Ziman bê hestî ye.', locale: 'en', translation: 'Drop by drop.', meaning: 'Small efforts add up.' });
    const { calls } = fakeApi({
      'GET /proverbs/rounds/open': { id: null },
      'POST /proverbs/rounds': round(),
      'POST /proverbs/rounds/r1/answers': (c: Call) => {
        const b = c.body as { index: number; answer: { choice: number }; attempt: number };
        const right = b.answer.choice === 1;
        const done = right || b.attempt >= 2;
        return { index: b.index, attempt: b.attempt, correct: right, firstTry: right && b.attempt === 1, done, hint: right ? null : { struck: b.answer.choice }, correction: done ? correction(b.index) : null, why: 'meaning', xp: 0, repeat: false };
      },
      'POST /proverbs/rounds/r1/finish': { correct: 2, total: 2, firstTry: 1, xp: 0, learningCounted: true, needed: 1, items: [{ index: 0, correct: true, firstTry: false, xp: 0, repeat: false }, { index: 1, correct: true, firstTry: true, xp: 0, repeat: false }], streak: 3 },
    });
    pages('/app/learn/proverbs/play?dialect=kmr');
    await userEvent.click(await screen.findByRole('radio', { name: /Which one fits\?/ }));
    await waitFor(() => expect(calls.some((c) => c.path === '/proverbs/rounds/open?dialect=kmr&mode=situation')).toBe(true));
    await userEvent.click(screen.getByRole('radio', { name: /What does it mean\?/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(calls.find((c) => c.method === 'POST' && c.path === '/proverbs/rounds')?.body).toEqual({ dialect: 'kmr', mode: 'meaning' });

    expect(await screen.findByText('Av dilop dilop dibe gol.')).toHaveAttribute('lang', 'ku');
    await userEvent.click(screen.getByRole('button', { name: 'Words come easily.' }));
    expect(await screen.findByText('Not quite — you have one more try.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Words come easily.' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Small efforts add up.' }));
    expect(await screen.findByText('Right!', { selector: '.solo-verdict' })).toBeInTheDocument();
    expect(screen.getByText('Drop by drop.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Small efforts add up.' }));
    await userEvent.click(await screen.findByRole('button', { name: 'See how it went' }));
    expect(await screen.findByRole('heading', { name: 'Round finished' })).toBeInTheDocument();
    expect(screen.getByText('Today counts for your streak.')).toBeInTheDocument();
    // played alone it pays nothing, and says so once; no figure of XP anywhere
    expect(screen.getByText(/earns no XP/)).toBeInTheDocument();
    expect(screen.queryByText(/\+\d+ XP/)).toBeNull();
    expect(within(screen.getByRole('region', { name: 'The proverbs in this round' })).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([
      '/app/learn/proverbs/kmr-av-dilop-dilop',
      '/app/learn/proverbs/kmr-ziman',
    ]);
  });

  it('plays “How does it end?” in Kurdish, the missing word a gap among Kurdish words', async () => {
    const complete: SoloSessionView<ProverbRoundItemView> = {
      ...round(),
      game: 'proverb-complete',
      items: [{ index: 0, mode: 'complete', dialect: 'kmr', proverb: 'Av dilop dilop dibe ….', before: 'Av dilop dilop dibe', after: '.', locale: 'en', options: ['gol', 'dil', 'gul'] }],
      states: [{ index: 0, attempts: 0, correct: false, firstTry: false, done: false }],
    };
    const { calls } = fakeApi({ 'GET /proverbs/rounds/open': { id: null }, 'POST /proverbs/rounds': complete });
    pages('/app/learn/proverbs/play?dialect=kmr');
    await userEvent.click(await screen.findByRole('radio', { name: /How does it end\?/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(calls.find((c) => c.method === 'POST' && c.path === '/proverbs/rounds')?.body).toEqual({ dialect: 'kmr', mode: 'complete' });
    expect(await screen.findByText('Which word finishes this proverb?', { selector: '.lore-eyebrow' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Which word finishes this proverb?' })).toHaveTextContent('…');
    expect(screen.getByRole('button', { name: 'gol' })).toHaveAttribute('lang', 'ku');
  });

  it('says plainly when there are not proverbs enough for a round', async () => {
    fakeApi({ 'GET /proverbs/rounds/open': { id: null }, 'POST /proverbs/rounds': new Response(JSON.stringify({ code: 'NOT_ENOUGH_CONTENT', message: 'x' }), { status: 409, headers: { 'content-type': 'application/json' } }) });
    pages('/app/learn/proverbs/play?dialect=ckb');
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByText('There aren’t enough proverbs in this variety for a round yet.')).toBeInTheDocument();
  });
});
