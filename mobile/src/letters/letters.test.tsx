// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { LetterThread, LettersHome } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { LettersScreen } from './LettersScreen';
import { LetterThreadScreen } from './LetterThreadScreen';

// the birds' flights end at once, so what follows them follows at once
patchReactNativeWeb({ reduceMotion: true });

const LETTER = 'Silav! Navê min Rojda ye. Tu çawa yî? Ez kurdî hîn dibim.';
const THREAD = '6f9b1c2e-1d2a-4b3c-8d4e-5f6a7b8c9d0e';
const baran = { id: 'u-baran', name: 'Baran', bird: 3 };

const home = (over: Partial<LettersHome> = {}): LettersHome => ({ refusal: null, bird: 1, out: null, penPals: [], roomForMore: true, ...over });
const thread = (over: Partial<LetterThread> = {}): LetterThread => ({
  threadId: THREAD,
  person: baran,
  letters: [
    { id: 'l1', mine: true, body: LETTER, removed: false, sentAt: '2026-11-13T10:00:00.000Z', readAt: null },
    { id: 'l2', mine: false, body: 'Silav Rojda! Ez Baran im, ji Hewlêrê.', removed: false, sentAt: '2026-11-13T10:00:00.000Z', readAt: null },
  ],
  yourTurn: true,
  closed: false,
  ...over,
});

beforeEach(() => {
  navigation.navigate.mockClear();
});
afterEach(cleanup);

/** Open the paper and write a letter on it. */
async function write(body: string): Promise<void> {
  fireEvent.click(await screen.findByTestId('letters-write'));
  fireEvent.change(screen.getByTestId('letters-paper-input'), { target: { value: body } });
}

describe('the letters screen', () => {
  it('offers one thing to do with your bird at home: write a letter', async () => {
    testAuth.client = fakeClient({ 'GET /letters': ok(home()) });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
    expect(screen.getByText('No pen pals yet. Send your bird out, and someone will write back.')).toBeTruthy();
  });

  it('says plainly that nobody else has a bird out when yours goes out alone, and how to call it back', async () => {
    let out: LettersHome['out'] = null;
    const client = fakeClient({
      'GET /letters': () => Promise.resolve(ok(home({ out }))),
      'POST /letters/out': () => {
        out = { since: '2026-11-13T10:00:00.000Z' };
        return Promise.resolve(ok({ kind: 'waiting', since: out.since }));
      },
    } as never);
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    await write(LETTER);
    fireEvent.click(screen.getByTestId('letters-paper-send'));
    expect(await screen.findByTestId('letters-out')).toBeTruthy();
    expect(screen.getByText(/Nobody else has sent their bird out yet/)).toBeTruthy();
    expect(screen.getByTestId('letters-recall')).toBeTruthy();
    expect(client.calls.find((c) => c.path === '/letters/out')?.body).toEqual({ body: LETTER });
  });

  it('shows the letter their bird brought when the two birds meet, and the way to write back', async () => {
    testAuth.client = fakeClient({
      'GET /letters': ok(home()),
      'POST /letters/out': ok({
        kind: 'met',
        threadId: THREAD,
        person: baran,
        letter: { id: 'l2', mine: false, body: 'Silav! Ez Baran im, ji Hewlêrê.', removed: false, sentAt: '2026-11-13T10:00:00.000Z', readAt: '2026-11-13T10:00:00.000Z' },
      }),
    });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    await write(LETTER);
    fireEvent.click(screen.getByTestId('letters-paper-send'));
    expect(await screen.findByTestId('letters-arrived')).toBeTruthy();
    expect(screen.getByText('Silav! Ez Baran im, ji Hewlêrê.')).toBeTruthy();
    expect(screen.getByText('Baran’s bird came to your window')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Write back to Baran' }));
    expect(navigation.navigate).toHaveBeenCalledWith('LetterThread', { threadId: THREAD });
  });

  it('refuses a letter with a link before the bird leaves, and sends nothing', async () => {
    const client = fakeClient({ 'GET /letters': ok(home()) });
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    await write(`${LETTER} www.example.org`);
    expect(screen.getByText('Take out the link: letters can’t carry links.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('letters-paper-send'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.calls.some((c) => c.path === '/letters/out')).toBe(false);
  });
});

describe('a correspondence', () => {
  it('gives the paper to write back on when it is your turn, and sends the letter', async () => {
    const client = fakeClient({
      [`GET /letters/threads/${THREAD}`]: ok(thread()),
      [`POST /letters/threads/${THREAD}`]: ok({ letter: { id: 'l3', mine: true, body: 'Spas Baran! Çi xweş e.', removed: false, sentAt: '2026-11-13T11:00:00.000Z', readAt: null } }),
    });
    testAuth.client = client;
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByText('Silav Rojda! Ez Baran im, ji Hewlêrê.')).toBeTruthy();
    fireEvent.change(screen.getByTestId('letters-reply-input'), { target: { value: 'Spas Baran! Çi xweş e.' } });
    fireEvent.click(screen.getByTestId('letters-reply-send'));
    // the letter is on the table, and the paper is gone until their answer
    expect(await screen.findByText('Spas Baran! Çi xweş e.')).toBeTruthy();
    expect(await screen.findByTestId('letters-waiting')).toBeTruthy();
    expect(screen.queryByTestId('letters-reply-input')).toBeNull();
  });

  it('says your bird is with them, and offers no paper, when it is their turn', async () => {
    testAuth.client = fakeClient({ [`GET /letters/threads/${THREAD}`]: ok(thread({ yourTurn: false })) });
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByTestId('letters-waiting')).toBeTruthy();
    expect(screen.getByText('Your bird is with Baran. Their letter will come to your window.')).toBeTruthy();
    expect(screen.queryByTestId('letters-reply-input')).toBeNull();
  });

  it('lets a letter written to you be reported, and not your own', async () => {
    testAuth.client = fakeClient({ [`GET /letters/threads/${THREAD}`]: ok(thread()) });
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByTestId('letter-report-l2')).toBeTruthy();
    expect(screen.queryByTestId('letter-report-l1')).toBeNull();
  });

  it('is read only once it has ended', async () => {
    testAuth.client = fakeClient({ [`GET /letters/threads/${THREAD}`]: ok(thread({ closed: true, yourTurn: false })) });
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByTestId('letters-closed')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('letters-reply-input')).toBeNull());
  });
});
