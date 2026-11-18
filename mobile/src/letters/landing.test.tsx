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
vi.mock('../widget/reload', () => ({ reloadLetterWidget: vi.fn() }));
// A stand-in window that reports touchdown and settling at once, as the real one does when its flights end.
vi.mock('./LetterWindow', async () => {
  const { useEffect } = await import('react');
  type Spot = 'own' | 'sill';
  type Props = {
    scene: { own: { kind: string }; visitor: { kind: string } };
    onTouchdown?: (spot: Spot) => void;
    onOwnLanded?: () => void;
    onVisitorLanded?: () => void;
  };
  return {
    LetterWindow: ({ scene, onTouchdown, onOwnLanded, onVisitorLanded }: Props) => {
      useEffect(() => {
        if (scene.own.kind !== 'arriving') return;
        onTouchdown?.('own');
        onOwnLanded?.();
      }, [scene.own.kind]);
      useEffect(() => {
        if (scene.visitor.kind !== 'arriving') return;
        onTouchdown?.('sill');
        onVisitorLanded?.();
      }, [scene.visitor.kind]);
      return null;
    },
  };
});
import { cleanup, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PAPER, type LetterLanding, type LettersHome } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { onHaptic, resetHaptics, type HapticEvent } from '../feedback/haptics';
import { memoryStore } from '../keyboard/deviceStore';
import { setDraftStoreForTests } from './drafts';
import { LettersScreen } from './LettersScreen';

// Motion on: the birds fly, and a landing letter gets a haptic.
patchReactNativeWeb({ reduceMotion: false });

const THREAD = '6f9b1c2e-1d2a-4b3c-8d4e-5f6a7b8c9d0e';
const L1 = 'a1b2c3d4-0000-4000-8000-000000000001';
const baran = { id: 'u-baran', name: 'Baran', bird: 3 };

const home = (over: Partial<LettersHome> = {}): LettersHome => ({
  refusal: null,
  bird: 1,
  birdChosen: true,
  zer: 0,
  out: null,
  visitor: null,
  birdsOut: 0,
  sky: [],
  callsLeft: 5,
  homecoming: null,
  arrival: null,
  penPals: [],
  roomForMore: true,
  paper: DEFAULT_PAPER,
  ...over,
});
const landing = (over: Partial<LetterLanding> = {}): LetterLanding => ({
  letterId: L1,
  threadId: THREAD,
  person: baran,
  how: 'window',
  landed: false,
  read: false,
  deliveredAt: '2026-11-14T10:00:00.000Z',
  ...over,
});

let felt: HapticEvent[] = [];
let stopFeeling: () => void = () => undefined;
let dropDrafts: () => void = () => undefined;
beforeEach(() => {
  resetHaptics();
  felt = [];
  stopFeeling = onHaptic((event) => felt.push(event));
  dropDrafts = setDraftStoreForTests(memoryStore());
  // A phone 390 wide, so the window is drawn.
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 390 });
  window.dispatchEvent(new Event('resize'));
});
afterEach(() => {
  stopFeeling();
  dropDrafts();
  cleanup();
  Reflect.deleteProperty(document.documentElement, 'clientWidth');
  window.dispatchEvent(new Event('resize'));
});

describe('a bird landing, felt', () => {
  it('knocks once, lightly, as a pen pal’s bird touches down with a letter, and says it landed as it does', async () => {
    const client = fakeClient({ 'GET /letters?landings=1': ok(home({ landings: [landing()] })), 'POST /letters/landed': ok(null) });
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('Baran’s bird brought you a letter')).toBeTruthy();
    await waitFor(() => expect(client.calls.filter((c) => c.path === '/letters/landed')).toHaveLength(1));
    expect(felt).toEqual(['tap']);
  });

  it('knocks as your own bird comes home with an answer, and as it comes home by itself with your letter', async () => {
    testAuth.client = fakeClient({ 'GET /letters?landings=1': ok(home({ landings: [landing({ how: 'home' })] })), 'POST /letters/landed': ok(null) });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('Your bird came home with a letter from Baran')).toBeTruthy();
    await waitFor(() => expect(felt).toEqual(['tap']));
    cleanup();
    felt = [];
    resetHaptics();
    testAuth.client = fakeClient({
      'GET /letters?landings=1': ok(home({ returned: { letterId: L1, since: '2026-11-13T10:00:00.000Z', why: 'unanswered' } })),
      'POST /letters/landed': ok(null),
    });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('Your bird came back with your letter')).toBeTruthy();
    await waitFor(() => expect(felt).toEqual(['tap']));
  });

  it('does not knock for a letter that landed before, which is simply there', async () => {
    const client = fakeClient({ 'GET /letters?landings=1': ok(home({ landings: [landing({ landed: true })] })), 'POST /letters/landed': ok(null) });
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('Baran’s bird brought you a letter')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(felt).toEqual([]);
    expect(client.calls.some((c) => c.path === '/letters/landed')).toBe(false);
  });
});
