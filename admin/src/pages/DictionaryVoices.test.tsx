// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { DictionaryAudioAdminItem, DictionaryAudioAdminPage, LipsyncData } from '@kurda/shared';
import { failure, fakeApi, json, on, type Call } from '../test/fetch';
import { renderUi } from '../test/render';
import { AudioStudio } from './AudioStudio';
import { DictionaryVoices } from './DictionaryVoices';

const TIMELINE: LipsyncData = { v: 1, d: 700, k: [[0, 0], [80, 5], [400, 0]] };

function word(headword: string, over: Partial<DictionaryAudioAdminItem> = {}): DictionaryAudioAdminItem {
  return {
    id: `id-${headword}`,
    entryId: `entry-${headword}`,
    headword,
    dialect: 'kurmanji',
    url: `https://upload.wikimedia.org/${headword}.ogg`,
    speaker: null,
    hasLipsync: false,
    lipsync: null,
    ...over,
  };
}

const COUNTS = { total: 3, noSpeaker: 2, speakerNoTimeline: 0 };
const page = (items: DictionaryAudioAdminItem[], nextCursor: string | null = null, counts = COUNTS): DictionaryAudioAdminPage => ({ items, nextCursor, counts });
const query = (c: Call): URLSearchParams => new URLSearchParams(c.path.split('?')[1]);
const lists = (calls: Call[]): URLSearchParams[] => calls.filter((c) => c.path.startsWith('/admin/dictionary/audio?')).map(query);

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  location.hash = '';
});

describe('the dictionary’s pronunciations', () => {
  it('is a side of the studio of its own, listing the words with who says each', async () => {
    fakeApi(on('GET', /^\/admin\/dictionary\/audio\?/, json(page([word('av'), word('gul', { speaker: 'xezo', hasLipsync: true, lipsync: TIMELINE })]))));
    location.hash = '#/audio/dictionary';
    renderUi(<AudioStudio />);
    expect(screen.getByRole('heading', { level: 1, name: 'Dictionary pronunciations' })).toBeInTheDocument();
    expect(within(screen.getByRole('tablist', { name: 'What to record' })).getByRole('tab', { name: 'Dictionary' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('3 pronunciations')).toBeInTheDocument();
    expect(screen.getByText(/2 without a character, 0 with a character and no mouth timeline/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Said by Xezo' })).toBeInTheDocument();
    expect(screen.getByText('No character', { selector: '.badge' })).toBeInTheDocument();
    expect(screen.getByText('Timeline made', { selector: '.badge' })).toBeInTheDocument();
  });

  it('finds a word by its start, shows what still needs a character, and loads more a page at a time', async () => {
    const user = userEvent.setup();
    const api = fakeApi(
      on('GET', /^\/admin\/dictionary\/audio\?/, (c) => {
        const q = query(c);
        if (q.get('cursor') === 'after-bav') return json(page([word('dar')]));
        if (q.get('q')) return json(page([word('sêv')]));
        return json(page([word('av'), word('bav')], 'after-bav'));
      }),
    );
    renderUi(<DictionaryVoices />);
    expect(await screen.findByText('bav')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('dar')).toBeInTheDocument();
    expect(screen.getByText('av')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'No character' }));
    await waitFor(() => expect(lists(api.calls).at(-1)!.get('speaker')).toBe('none'));
    await user.click(screen.getByRole('tab', { name: 'No timeline' }));
    await waitFor(() => expect(lists(api.calls).at(-1)!.toString()).toBe('speaker=any&lipsync=missing&limit=50'));

    await user.type(screen.getByRole('searchbox', { name: 'Find a word' }), 'sê');
    expect(await screen.findByText('sêv')).toBeInTheDocument();
    expect(lists(api.calls).at(-1)!.get('q')).toBe('sê');
    expect(screen.queryByText('av')).toBeNull();
  });

  it('changes who says a pronunciation at once, with the counts, and puts it back if the server refuses', async () => {
    const user = userEvent.setup();
    let refuse = false;
    const api = fakeApi(
      on('GET', /^\/admin\/dictionary\/audio\?/, json(page([word('av'), word('bav')]))),
      on('PATCH', /^\/admin\/audio\/dictionary\?key=id-av/, () => (refuse ? failure(500, 'INTERNAL', 'boom') : json({ speaker: 'hamo', lipsync: null }))),
    );
    renderUi(<DictionaryVoices />);
    await user.click(await screen.findByRole('button', { name: /^av/ }));
    const picker = screen.getByRole('radiogroup', { name: 'Who says it' });
    expect(within(picker).getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'true');
    // nothing to record: no recorder here
    expect(screen.queryByRole('button', { name: 'Record' })).toBeNull();

    await user.click(within(picker).getByRole('radio', { name: 'Hamo' }));
    expect(within(picker).getByRole('radio', { name: 'Hamo' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/1 without a character, 1 with a character and no mouth timeline/)).toBeInTheDocument();
    await waitFor(() => expect(api.calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ speaker: 'hamo' }]));
    // the character says the word, its mouth timed from the words until a timeline is made
    expect(screen.getByRole('button', { name: 'Play with Hamo' })).toBeInTheDocument();
    expect(screen.getByText('No timeline yet: the mouth is timed from the words.')).toBeInTheDocument();

    refuse = true;
    await user.click(within(picker).getByRole('radio', { name: 'Xezo' }));
    await waitFor(() => expect(within(picker).getByRole('radio', { name: 'Hamo' })).toHaveAttribute('aria-checked', 'true'));
    expect(await screen.findByText(/Who says “av” was not changed\./)).toBeInTheDocument();
  });

  it('previews a word with its stored timeline, saying nothing about the words then', async () => {
    const user = userEvent.setup();
    fakeApi(on('GET', /^\/admin\/dictionary\/audio\?/, json(page([word('gul', { speaker: 'xezo', hasLipsync: true, lipsync: TIMELINE })]))));
    renderUi(<DictionaryVoices />);
    await user.click(await screen.findByRole('button', { name: /^gul/ }));
    expect(screen.getByRole('button', { name: 'Play with Xezo' })).toBeInTheDocument();
    expect(screen.queryByText(/timed from the words/)).toBeNull();
  });

  it('says so when no word matches, and when nothing is left to do', async () => {
    const user = userEvent.setup();
    fakeApi(on('GET', /^\/admin\/dictionary\/audio\?/, json(page([]))));
    renderUi(<DictionaryVoices />);
    expect(await screen.findByText('The dictionary has no pronunciations yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'No character' }));
    expect(await screen.findByText('Every pronunciation has a character.')).toBeInTheDocument();
  });
});
