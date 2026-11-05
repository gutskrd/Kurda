// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { ApiResult } from '../api/types';
import type { EventQuestsView } from './quests';
import { EventQuestsScreen } from './EventQuestsScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const ENDS = new Date(Date.now() + 3 * 86_400_000).toISOString();
const view = (eventKey: string, name: string, claimable = false): EventQuestsView => ({
  eventKey,
  name,
  endsAt: ENDS,
  claimDeadline: ENDS,
  quests: [{ id: `${eventKey}-q1`, type: 'earn_xp', target: 100, current: claimable ? 100 : 40, complete: claimable, claimed: false, claimable, reward: { zer: 50 } }],
});
const active = ok({ events: [{ key: 'newroz', name: 'Newroz' }, { key: 'autumn', name: 'Autumn' }] });
const serverDown: ApiResult<never> = { ok: false, error: { kind: 'server', message: 'internal server error', status: 500 } };

describe('event quests', () => {
  /*
   * An event whose quests did not load is still running: the ones that did
   * show, with a line about the rest and a way to ask again — never "No events".
   */
  it('shows the events that loaded and says some did not, with a way to ask again', async () => {
    let autumn: ApiResult<unknown> = serverDown;
    testAuth.client = fakeClient({
      'GET /events/active': active,
      'GET /events/newroz/quests': ok(view('newroz', 'Newroz')),
      'GET /events/autumn/quests': () => autumn,
    });
    renderWithProviders(<EventQuestsScreen onExit={() => undefined} />);
    expect(await screen.findByText('Newroz')).toBeTruthy();
    expect(screen.queryByText('No events are running right now. Check back soon!')).toBeNull();
    expect(screen.getByText('Some events didn’t load.')).toBeTruthy();
    autumn = ok(view('autumn', 'Autumn'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(screen.getByText('Autumn')).toBeTruthy();
    expect(screen.queryByText('Some events didn’t load.')).toBeNull();
  });

  it('is a screen that did not load, not one with no events, when no event’s quests came', async () => {
    testAuth.client = fakeClient({ 'GET /events/active': active, 'GET /events/newroz/quests': serverDown, 'GET /events/autumn/quests': serverDown });
    renderWithProviders(<EventQuestsScreen onExit={() => undefined} />);
    expect(await screen.findByText('Couldn’t load')).toBeTruthy();
    expect(screen.queryByText('No events are running right now. Check back soon!')).toBeNull();
  });

  it('says why a claim did not go through, in the reader’s words', async () => {
    testAuth.client = fakeClient({
      'GET /events/active': ok({ events: [{ key: 'newroz', name: 'Newroz' }] }),
      'GET /events/newroz/quests': ok(view('newroz', 'Newroz', true)),
      // the claim route answers without a code the phone reads: never shown as "request failed (410)"
      'POST /events/newroz/quests/newroz-q1/claim': { ok: false, error: { kind: 'client', message: 'request failed (410)', status: 410 } },
    });
    renderWithProviders(<EventQuestsScreen onExit={() => undefined} />);
    const claim = await screen.findByRole('button', { name: 'Claim' });
    await act(async () => {
      fireEvent.click(claim);
    });
    expect(screen.getByRole('alert').textContent).toContain('This reward can’t be claimed right now.');
    expect(screen.queryByText(/request failed/)).toBeNull();
  });

  it('says a claim did not reach Hevalo when the phone is offline', async () => {
    testAuth.client = fakeClient({
      'GET /events/active': ok({ events: [{ key: 'newroz', name: 'Newroz' }] }),
      'GET /events/newroz/quests': ok(view('newroz', 'Newroz', true)),
      'POST /events/newroz/quests/newroz-q1/claim': { ok: false, error: { kind: 'network', message: 'Network request failed' } },
    });
    renderWithProviders(<EventQuestsScreen onExit={() => undefined} />);
    const claim = await screen.findByRole('button', { name: 'Claim' });
    await act(async () => {
      fireEvent.click(claim);
    });
    expect(screen.getByRole('alert').textContent).toContain('Can’t reach Hevalo right now. Check your connection and try again.');
  });
});
