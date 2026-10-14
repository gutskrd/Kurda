// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { failure, fakeApi, json, on, type Call } from '../test/fetch';
import { renderUi } from '../test/render';
import { Games } from './Games';
import { RaceTexts, untypeableList, type RaceText } from './RaceTexts';

const word = (id: string, headword: string, over: Record<string, unknown> = {}) => ({
  id,
  headword,
  normalized: headword,
  dialect: 'kurmanji',
  length: headword.length,
  isRhymePrompt: false,
  inGames: true,
  ...over,
});

const STATS = { total: 2, dictionary: 400, rhymePrompts: 1, byLength: [], difficulties: [] };

const searches = (calls: Call[]): string[] => calls.filter((c) => c.method === 'GET' && c.path.startsWith('/admin/dictionary?')).map((c) => c.path);

describe('Words & dictionary', () => {
  it('searches once typing stops, not on every key', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      on('GET', '/admin/dictionary/stats', json(STATS)),
      on('GET', /^\/admin\/dictionary\?/, (call) => json({ total: 1, words: [word('w1', new URL(call.path, 'http://x').searchParams.get('q') ?? 'heval')] })),
    );
    renderUi(<Games section="words" />);
    await screen.findByText('heval');
    expect(searches(calls)).toEqual(['/admin/dictionary?limit=50&offset=0&inGames=true']);

    await user.type(screen.getByRole('searchbox', { name: 'Search words' }), 'berf');
    await waitFor(() => expect(searches(calls)).toHaveLength(2));
    expect(searches(calls)[1]).toBe('/admin/dictionary?limit=50&offset=0&inGames=true&q=berf');
    expect(await screen.findByText('berf')).toBeInTheDocument();
  });

  it('asks before deleting a word, and says what deleting does to the games', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      on('GET', '/admin/dictionary/stats', json(STATS)),
      on('GET', /^\/admin\/dictionary\?/, json({ total: 1, words: [word('w1', 'heval')] })),
      on('DELETE', '/admin/dictionary/w1', json({ ok: true })),
    );
    renderUi(<Games section="words" />);
    await user.click(await screen.findByRole('button', { name: 'Delete “heval”' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete “heval”?' });
    expect(dialog).toHaveTextContent('guesses of it are no longer accepted');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/admin/dictionary/w1')).toBe(true));
  });

  it('will not make a word outside the games a rhyme base word', async () => {
    fakeApi(on('GET', '/admin/dictionary/stats', json(STATS)), on('GET', /^\/admin\/dictionary\?/, json({ total: 1, words: [word('w1', 'heval', { inGames: false })] })));
    renderUi(<Games section="words" />);
    await screen.findByText('heval');
    const [inGames, opens] = screen.getAllByRole('checkbox').filter((c) => c.closest('td, [role="cell"]'));
    expect(inGames).not.toBeChecked();
    expect(opens).toBeDisabled();
  });
});

describe('Rhyme', () => {
  const list = {
    total: 1,
    poolSize: 10,
    usingFallback: false,
    words: [{ id: 'p1', headword: 'dil', dialect: 'kurmanji', isRhymePrompt: true, perfect: 3, near: 1, ruledOut: 0, decided: 0 }],
  };

  it('renames a base word through the admin’s own dialog', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(on('GET', /^\/admin\/rhyme\/prompts\?/, json(list)), on('PATCH', '/admin/dictionary/p1', json({ ok: true })));
    renderUi(<Games section="rhyme" />);
    await user.click(await screen.findByRole('button', { name: 'More for “dil”' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const field = screen.getByLabelText('The word, spelled right');
    await user.clear(field);
    await user.type(field, 'dil{Enter}');
    // the same word: nothing to send
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'More for “dil”' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const again = screen.getByLabelText('The word, spelled right');
    await user.clear(again);
    await user.type(again, 'dila{Enter}');
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ headword: 'dila' }));
  });

  it('asks before deleting a base word from the games, pointing at Stop using', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(on('GET', /^\/admin\/rhyme\/prompts\?/, json(list)));
    renderUi(<Games section="rhyme" />);
    await user.click(await screen.findByRole('button', { name: 'More for “dil”' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete from the games' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete “dil” from the games?' });
    expect(dialog).toHaveTextContent('use “Stop using” instead');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
  });

  it('shows the real outcome of “use every word” before doing it', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      on('GET', /^\/admin\/rhyme\/prompts\?/, json({ ...list, usingFallback: true, total: 10 })),
      on('POST', '/admin/rhyme/prompts/rebuild', (call) =>
        json({ dryRun: !!(call.body as { dryRun?: boolean }).dryRun, poolSize: 10, baseWords: 8, newlyMarked: 8, alreadyMarked: 0, withoutRhymes: ['xwîn', 'av'] }),
      ),
    );
    renderUi(<Games section="rhyme" />);
    await user.click(await screen.findByRole('button', { name: 'Use every word that has a rhyme' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Open rounds with every word that has a rhyme?' });
    expect(dialog).toHaveTextContent('Base words: 0 → 8 of the 10 in the games.');
    expect(dialog).toHaveTextContent('2 words are left out because nothing rhymes with them: xwîn, av');
    const rebuilds = (): Call[] => calls.filter((c) => c.path === '/admin/rhyme/prompts/rebuild');
    expect(rebuilds().map((c) => c.body)).toEqual([{ dialect: 'kurmanci', dryRun: true }]);
    await user.click(within(dialog).getByRole('button', { name: 'Use them all' }));
    await waitFor(() => expect(rebuilds()).toHaveLength(2));
    expect(rebuilds()[1]!.body).toEqual({ dialect: 'kurmanci' });
  });
});

describe('Race texts', () => {
  const text: RaceText = { id: 'x1', title: 'Welat', body: 'Ez ji welatê xwe hez dikim û ez li vir im.', language: 'kmr', difficulty: 1, active: true, untypeable: [] };

  it('says which characters nobody can type after a save, and marks the text', async () => {
    const user = userEvent.setup();
    const saved: RaceText = { ...text, id: 'x2', title: 'Café', body: 'Ez li café rûniştim û çay vexwar.', untypeable: [{ char: 'é', codePoint: 'U+00E9', count: 1 }] };
    let list = [text];
    fakeApi(
      on('GET', '/admin/race/texts', () => json({ texts: list })),
      on('POST', '/admin/race/texts', () => {
        list = [text, saved];
        return json(saved, 201);
      }),
    );
    renderUi(<RaceTexts />);
    await user.click(await screen.findByRole('button', { name: 'New text' }));
    await user.type(screen.getByLabelText(/^title/i), 'Café');
    fireEvent.change(screen.getByLabelText(/^text/i), { target: { value: saved.body } });
    await user.click(screen.getByRole('button', { name: 'Save text' }));
    expect(await screen.findByText(/nobody can type one character in it on a Kurmancî keyboard: é \(U\+00E9\)/)).toBeInTheDocument();
    expect(await screen.findByText('1 character can’t be typed')).toBeInTheDocument();
  });

  it('offers the variety the text is written in when the server refuses the one chosen', async () => {
    const user = userEvent.setup();
    fakeApi(
      on('GET', '/admin/race/texts', json({ texts: [] })),
      on('POST', '/admin/race/texts', failure(400, 'TEXT_LANGUAGE_MISMATCH', 'this text is written in Arabic script: save it as Soranî (ckb)', { language: 'ckb' })),
    );
    renderUi(<RaceTexts />);
    await user.click(await screen.findByRole('button', { name: 'New text' }));
    await user.type(screen.getByLabelText(/^title/i), 'Ziman');
    fireEvent.change(screen.getByLabelText(/^text/i), { target: { value: 'من کوردم و بە کوردی دەنووسم، زمانی من جوانە' } });
    await user.click(screen.getByRole('button', { name: 'Save text' }));
    await user.click(await screen.findByRole('button', { name: 'Make it Soranî' }));
    expect(screen.getByLabelText(/^variety/i)).toHaveValue('ckb');
    expect(screen.getByLabelText(/^text/i)).toHaveAttribute('dir', 'rtl');
  });

  it('asks before deleting, and points at retiring instead', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(on('GET', '/admin/race/texts', json({ texts: [text] })));
    renderUi(<RaceTexts />);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete “Welat”?' });
    expect(dialog).toHaveTextContent(/Turning Active off instead/);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(calls.filter((c) => c.method !== 'GET' && /race\/texts/.test(c.path))).toHaveLength(0);
  });

  it('lists look-alike characters by code point', () => {
    expect(untypeableList([{ char: 'é', codePoint: 'U+00E9', count: 2 }, { char: 'ſ', codePoint: 'U+017F', count: 1 }])).toBe('é (U+00E9) ×2, ſ (U+017F)');
  });
});
