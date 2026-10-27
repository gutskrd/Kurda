// @vitest-environment jsdom
/**
 * Offline mode, against a fake API: the preview shows what people will see as
 * it is written, going offline needs the word typed, a start set for later is
 * sent as such, and bringing Hevalo back keeps what was written.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { setToken } from '../api';
import { fakeApi, json, on, type Call } from '../test/fetch';
import { renderUi } from '../test/render';
import { APP_MESSAGE, APP_TITLE, Offline } from './Offline';

vi.mock('../shop/measure', () => ({
  measureImage: vi.fn(async () => ({ width: 1600, height: 900 })),
  fileBytes: vi.fn(async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
}));

const KEY = `cosmetic/background/${'ab'.repeat(32)}.png`;
const stored = { key: KEY, url: `https://media.test/${KEY}`, width: 1600, height: 900, bytes: 90_000, contentType: 'image/png', trimmed: false };

function state(over: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) {
  return {
    phase: 'off',
    pictureUrl: null,
    updatedAt: new Date().toISOString(),
    updatedBy: 'rojda',
    ...over,
    settings: { enabled: false, title: null, message: null, assetKey: null, startsAt: null, endsAt: null, reopenAtEnd: true, ...settings },
  };
}

const puts = (calls: Call[]) => calls.filter((c) => c.method === 'PUT' && c.path === '/admin/maintenance');

function show(current = state(), answer = state({ phase: 'on' }, { enabled: true })): ReturnType<typeof fakeApi> {
  setToken('tok');
  const api = fakeApi(
    on('GET', '/admin/maintenance', json(current)),
    on('PUT', '/admin/maintenance', json(answer)),
    on('POST', '/admin/shop/art/background', json(stored, 201)),
  );
  renderUi(<Offline />);
  return api;
}

afterEach(() => {
  setToken(null);
  vi.unstubAllGlobals();
});

describe('offline mode', () => {
  it('previews the app’s own words until some are written, then those', async () => {
    const user = userEvent.setup();
    show();
    const preview = await screen.findByRole('figure', { name: 'What people see' });
    expect(within(preview).getByText(APP_TITLE)).toBeInTheDocument();
    expect(within(preview).getByText(APP_MESSAGE)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Title'), 'Back after the update');
    expect(within(preview).getByText('Back after the update')).toBeInTheDocument();
    // a time back shows as a pill
    expect(within(preview).queryByText(/^Back by/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Back by/), { target: { value: '2099-01-02T10:30' } });
    expect(within(preview).getByText(/^Back by/)).toBeInTheDocument();
  });

  it('takes Hevalo offline only once the word is typed, with what was written and the picture', async () => {
    const user = userEvent.setup();
    const api = show();
    await user.type(await screen.findByLabelText('Title'), 'New lessons coming');
    await user.upload(screen.getByLabelText('Picture file'), new File([new Uint8Array(2048)], 'wide.png', { type: 'image/png' }));
    await screen.findByRole('button', { name: /Use the app’s own picture/ });
    await user.click(screen.getByRole('button', { name: 'Take Hevalo offline' }));
    const dialog = await screen.findByRole('alertdialog');
    const go = within(dialog).getByRole('button', { name: 'Take it offline' });
    expect(go).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Type offline/), 'offline');
    await user.click(go);
    await waitFor(() => expect(puts(api.calls)).toHaveLength(1));
    expect(puts(api.calls)[0]!.body).toMatchObject({ enabled: true, title: 'New lessons coming', message: null, assetKey: KEY, startsAt: null, endsAt: null });
    expect(await screen.findByText('Hevalo is offline', { selector: '.banner-title' })).toBeInTheDocument();
  });

  it('sends a start set for later, and will not send one already past', async () => {
    const user = userEvent.setup();
    const api = show(state(), state({ phase: 'scheduled' }, { enabled: true, startsAt: '2099-01-01T09:00:00.000Z' }));
    await user.click(await screen.findByLabelText('At a set time'));
    fireEvent.change(screen.getByLabelText(/^From/), { target: { value: '2000-01-01T09:00' } });
    await user.click(screen.getByRole('button', { name: 'Set Hevalo to go offline' }));
    expect(await screen.findByText(/has passed/)).toBeInTheDocument();
    expect(puts(api.calls)).toHaveLength(0);

    fireEvent.change(screen.getByLabelText(/^From/), { target: { value: toLocal(Date.now() + 86_400_000) } });
    await user.click(screen.getByRole('button', { name: 'Set Hevalo to go offline' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByLabelText(/Type offline/), 'offline');
    await user.click(within(dialog).getByRole('button', { name: 'Set it' }));
    await waitFor(() => expect(puts(api.calls)).toHaveLength(1));
    expect((puts(api.calls)[0]!.body as { startsAt: string }).startsAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it('brings Hevalo back with one confirmed tap, keeping what was written', async () => {
    const user = userEvent.setup();
    const api = show(state({ phase: 'on' }, { enabled: true, title: 'Back soon', startsAt: new Date().toISOString() }), state({}, { title: 'Back soon' }));
    await user.click(await screen.findByRole('button', { name: 'Bring Hevalo back online' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Bring it back' }));
    await waitFor(() => expect(puts(api.calls)).toHaveLength(1));
    expect(puts(api.calls)[0]!.body).toMatchObject({ enabled: false, title: 'Back soon' });
  });
});

function toLocal(ms: number): string {
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
