// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
// The pull to refresh as a button: the web's control has nothing to pull.
vi.mock('../net/usePullRefresh', () => import('../net/testing/pullRefresh'));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { ApiResult } from '../api/types';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { onSound, resetSounds } from '../feedback/sounds';
import type { EventQuestsView } from './quests';
import { navigation } from '../play/testing/navigation';
import { EventQuestsScreen } from './EventQuestsScreen';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => {
  resetHaptics();
  resetSounds();
});
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
  /* An event whose quests partly failed to load still shows the ones that did, a note about the rest and a retry. */
  it('shows the events that loaded and says some did not, with a way to ask again', async () => {
    let autumn: ApiResult<unknown> = serverDown;
    testAuth.client = fakeClient({
      'GET /events/active': active,
      'GET /events/newroz/quests': ok(view('newroz', 'Newroz')),
      'GET /events/autumn/quests': () => autumn,
    });
    renderWithProviders(<EventQuestsScreen onExit={() => undefined} />);
    expect(await screen.findByText('Newroz')).toBeTruthy();
    expect(screen.queryByText('No events are running right now.')).toBeNull();
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
    expect(screen.queryByText('No events are running right now.')).toBeNull();
  });

  it('says why a claim did not go through, in the reader’s words', async () => {
    testAuth.client = fakeClient({
      'GET /events/active': ok({ events: [{ key: 'newroz', name: 'Newroz' }] }),
      'GET /events/newroz/quests': ok(view('newroz', 'Newroz', true)),
      // The claim route answers without a code the phone reads: never shown as "request failed (410)".
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

  /* Rewards use the app's coin art and are read out in words; a claim gets the reward feedback on a full-height button. */
  it('shows the reward with the app’s coin, and celebrates a claim that goes through', async () => {
    let claimed = false;
    const quests = (): EventQuestsView => {
      const v = view('newroz', 'Newroz', !claimed);
      return { ...v, quests: v.quests.map((q) => ({ ...q, reward: { zer: 250 }, claimed, claimable: !claimed })) };
    };
    testAuth.client = fakeClient({
      'GET /events/active': ok({ events: [{ key: 'newroz', name: 'Newroz' }] }),
      'GET /events/newroz/quests': () => ok(quests()),
      'POST /events/newroz/quests/newroz-q1/claim': () => {
        claimed = true;
        return ok({ ok: true });
      },
    });
    const felt: HapticEvent[] = [];
    const heard: string[] = [];
    const stopFeel = onHaptic((e) => felt.push(e));
    const stopHear = onSound((file) => heard.push(String(file)));
    try {
      renderWithProviders(<EventQuestsScreen onExit={() => undefined} />);
      expect(await screen.findByLabelText('+250 Zêr')).toBeTruthy();
      expect(document.body.textContent).not.toMatch(/🪙|💎/u);
      const claim = screen.getByRole('button', { name: 'Claim' });
      await act(async () => {
        fireEvent.click(claim);
      });
      expect(await screen.findByText('Claimed')).toBeTruthy();
      expect(felt).toContain('celebrate');
      expect(heard).toHaveLength(1);
    } finally {
      stopFeel();
      stopHear();
    }
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

  it('reads the events and their quests again when pulled down', async () => {
    const client = fakeClient({
      'GET /events/active': ok({ events: [{ key: 'newroz', name: 'Newroz' }] }),
      'GET /events/newroz/quests': ok(view('newroz', 'Newroz')),
    });
    testAuth.client = client;
    renderWithProviders(<EventQuestsScreen onExit={() => undefined} />);
    await screen.findByText('Newroz');
    const count = () => client.calls.filter((c) => c.path === '/events/newroz/quests').length;
    const before = count();
    fireEvent.click(screen.getByTestId('pull-to-refresh'));
    await waitFor(() => expect(count()).toBe(before + 1));
  });
});

describe('between events', () => {
  it('says once that the Zêr is a members’ perk, with no Zêr on the quests, to someone who does not earn it', async () => {
    const v = view('newroz', 'Newroz', true);
    testAuth.client = fakeClient({
      'GET /events/active': ok({ events: [{ key: 'newroz', name: 'Newroz' }] }),
      'GET /events/newroz/quests': ok({ ...v, quests: v.quests.map((q) => ({ ...q, reward: {} })), zerForMembers: true }),
    });
    renderWithProviders(<EventQuestsScreen onExit={() => undefined} />);
    expect(await screen.findByText('Zêr from events comes with Hevalo+.')).toBeTruthy();
    expect(screen.queryByLabelText(/Zêr$/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Claim' })).toBeTruthy();
  });

  it('says what an event is and where it will show, and offers today’s quests meanwhile', async () => {
    testAuth.client = fakeClient({ 'GET /events/active': ok({ events: [] }) });
    renderWithProviders(<EventQuestsScreen onExit={() => undefined} />);
    expect(await screen.findByText('No events are running right now.')).toBeTruthy();
    expect(screen.getByText(/Events run for a few days at a time/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Daily quests' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Quests');
  });
});
