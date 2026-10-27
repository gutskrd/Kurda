// @vitest-environment jsdom
/**
 * The pictures page, against a fake API: which pictures are replaced, putting
 * an uploaded picture in place of a rank emblem, a badge level's own picture,
 * and putting the original back.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { BADGES } from '@kurda/shared';
import { setToken } from '../api';
import { fakeApi, json, on, type Call } from '../test/fetch';
import { renderUi } from '../test/render';
import { Pictures, slotName } from './Pictures';

vi.mock('../shop/measure', () => ({
  measureImage: vi.fn(async () => ({ width: 512, height: 512 })),
  fileBytes: vi.fn(async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
}));

const KEY = `cosmetic/icon/${'cd'.repeat(32)}.png`;
const stored = { key: KEY, url: `https://media.test/${KEY}`, width: 512, height: 512, bytes: 40_000, contentType: 'image/png', trimmed: false };
const levelled = BADGES.find((b) => b.tiers.length > 1)!;

const sent = (calls: Call[], method: string): Call[] => calls.filter((c) => c.method === method && c.path.startsWith('/admin/art/'));

function show(overrides: unknown[] = []): ReturnType<typeof fakeApi> {
  setToken('tok');
  const api = fakeApi(
    on('GET', '/admin/art', json({ overrides })),
    on('POST', '/admin/shop/art/icon', json(stored, 201)),
    on('PUT', /^\/admin\/art\//, json({ override: null })),
    on('DELETE', /^\/admin\/art\//, json({ override: null })),
    on('GET', /\/history$/, json({ history: [{ assetKey: KEY, url: stored.url, note: 'first try', changedAt: new Date().toISOString(), changedBy: 'rojda' }] })),
  );
  renderUi(<Pictures />);
  return api;
}

afterEach(() => {
  setToken(null);
  vi.unstubAllGlobals();
});

// sixty badges are drawn on the first tab, which takes a while in a test browser
describe('the pictures page', { timeout: 20_000 }, () => {
  it('names each slot as an admin would say it', () => {
    expect(slotName({ family: 'rank', key: 'zozan', level: null })).toMatch(/^Zozan/);
    expect(slotName({ family: 'avatar', key: 'default-03', level: null })).toBe('Default 03');
    expect(slotName({ family: 'badge', key: levelled.key, level: 'zer' })).toContain(levelled.nameKu);
  });

  it('counts what is replaced in each kind, and marks it', async () => {
    show([{ slot: 'rank:zozan', assetKey: KEY, url: stored.url, note: null, updatedAt: new Date().toISOString(), updatedBy: 'rojda' }]);
    const ranks = await screen.findByRole('tab', { name: /Rank emblems/ });
    expect(ranks).toHaveTextContent('1');
    await userEvent.click(ranks);
    expect(await screen.findByRole('button', { name: /: replaced\. Change$/ })).toBeInTheDocument();
  });

  it('puts an uploaded picture in place of a rank emblem', async () => {
    const user = userEvent.setup();
    const api = show();
    await user.click(await screen.findByRole('tab', { name: /Rank emblems/ }));
    await user.click((await screen.findAllByRole('button', { name: /: original\. Change$/ }))[0]!);
    const drawer = await screen.findByRole('dialog');
    await user.upload(within(drawer).getByLabelText('Picture file'), new File([new Uint8Array(1024)], 'emblem.png', { type: 'image/png' }));
    await user.type(within(drawer).getByLabelText(/Note/), 'Spring look');
    await user.click(await within(drawer).findByRole('button', { name: 'Use this picture' }));
    await waitFor(() => expect(sent(api.calls, 'PUT')).toHaveLength(1));
    expect(sent(api.calls, 'PUT')[0]).toMatchObject({ path: '/admin/art/rank%3Adest', body: { assetKey: KEY, note: 'Spring look' } });
  });

  it('gives a levelled badge a picture for every level and one for each level', async () => {
    const user = userEvent.setup();
    show();
    // sixty badges are drawn: the name goes in at once rather than a letter at a time
    await user.click(await screen.findByLabelText('Find a badge'));
    await user.paste(levelled.nameKu);
    await user.click(screen.getAllByRole('button', { name: new RegExp(`^${levelled.nameKu}: original`) })[0]!);
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByRole('region', { name: 'Every level' })).toBeInTheDocument();
    expect(within(drawer).getAllByRole('region').length).toBe(levelled.tiers.length + 1);
  });

  it('puts the original back after asking, and shows what a slot held before', async () => {
    const user = userEvent.setup();
    const api = show([{ slot: 'league:kani', assetKey: KEY, url: stored.url, note: 'blue', updatedAt: new Date().toISOString(), updatedBy: 'rojda' }]);
    await user.click(await screen.findByRole('tab', { name: /League emblems/ }));
    await user.click(await screen.findByRole('button', { name: /: replaced\. Change$/ }));
    const drawer = await screen.findByRole('dialog');
    await user.click(within(drawer).getByRole('button', { name: 'Show the history' }));
    expect(await within(drawer).findByText('“first try”')).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Put the original back' }));
    const confirm = (await screen.findByText('Put the original back?')).closest<HTMLElement>('[role="alertdialog"], [role="dialog"]')!;
    await user.click(within(confirm).getByRole('button', { name: 'Put the original back' }));
    await waitFor(() => expect(sent(api.calls, 'DELETE')).toHaveLength(1));
    expect(sent(api.calls, 'DELETE')[0]!.path).toBe('/admin/art/league%3Akani');
  });
});
