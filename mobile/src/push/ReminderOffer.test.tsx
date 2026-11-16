// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// a phone, so there is push to ask about; a test can make it the web build, which has none
const phone = vi.hoisted(() => ({ os: 'ios' }));
vi.mock('react-native', async () => {
  // react-native-web ships no types
  const rn = (await import('../play/testing/native')) as unknown as Record<string, object> & { Platform: object };
  return {
    ...rn,
    Platform: {
      ...rn.Platform,
      get OS() {
        return phone.os;
      },
    },
  };
});
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
// Android's back, pressed by the test (navigation/testing/hardwareBack)
vi.mock('../navigation/hardwareBack', () => import('../navigation/testing/hardwareBack'));
// a badge earned meanwhile waits on the screen (badges/BadgeCelebrationHost.tsx)
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { notificationsStub } from '../reports/testing/stubs';
import { memoryStore, type DeviceStore } from '../keyboard/deviceStore';
import { pressBack, resetHardwareBack } from '../navigation/testing/hardwareBack';
import { OFFER_KEY, REOFFER_AFTER_MS } from './permission';
import { ANSWER_WAIT_MS, ReminderOffer, useReminderOffer } from './ReminderOffer';

patchReactNativeWeb({ reduceMotion: true });

const TITLE = 'Notifications from Hevalo';
const NEVER_ASKED = { status: 'undetermined', granted: false, canAskAgain: true } as const;
const ALLOWED = { status: 'granted', granted: true, canAskAgain: true } as const;
const REFUSED_FOR_GOOD = { status: 'denied', granted: false, canAskAgain: false } as const;

/** What `/me` says of the account: the session from a fresh sign-in does not carry `minor`. */
function serveMe(user: { minor?: boolean; guest?: boolean; birthDateRequired?: boolean }) {
  testAuth.client = fakeClient({ 'GET /me': ok({ user }) });
}

beforeEach(() => {
  phone.os = 'ios';
  notificationsStub.permission = { ...NEVER_ASKED };
  notificationsStub.afterRequest = { ...ALLOWED };
  notificationsStub.requests = 0;
  notificationsStub.failRequest = false;
  notificationsStub.prompt = null;
  serveMe({ minor: false });
});
afterEach(() => {
  cleanup();
  resetHardwareBack();
  vi.restoreAllMocks();
});

/** Let what was asked for come back: the phone's answer, the record, the account's age. */
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

/** The screen, and how often the lesson's way on was taken from it. */
function shown(store: DeviceStore = memoryStore()) {
  const onDone = vi.fn();
  renderWithProviders(<ReminderOffer onDone={onDone} store={store} />);
  return onDone;
}

describe('the screen before the phone’s question about notifications', () => {
  it('says what Hevalo sends, and has one button, Continue, and nothing else to press', async () => {
    const store = memoryStore();
    const onDone = shown(store);
    expect(screen.getByRole('heading', { name: TITLE })).toBeTruthy();
    // what the server sends an adult: a reminder on a day the streak waits, word of a letter, word of a badge
    expect(screen.getByText(/short reminder on a day your streak is still waiting/)).toBeTruthy();
    expect(screen.getByText(/when a letter arrives or you earn a badge/)).toBeTruthy();
    expect(screen.getByText(/You can change this any time in Settings/)).toBeTruthy();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.textContent).toBe('Continue');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    // the yes and the no are the phone's: none of its words, and no way round it
    for (const word of [/allow/i, /not now/i, /later/i, /skip/i, /close/i, /cancel/i]) expect(screen.queryByText(word), String(word)).toBeNull();

    // nothing is asked just by looking, and nothing goes on by itself
    await settle();
    expect(notificationsStub.requests).toBe(0);
    expect(onDone).not.toHaveBeenCalled();
    // seen, so counted
    expect(JSON.parse(store.data.get(OFFER_KEY)!).shown).toBe(1);
  });

  it('brings up the phone’s question on Continue, and goes on when it is answered yes', async () => {
    const onDone = shown();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await settle();
    expect(notificationsStub.requests).toBe(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('goes on just the same when the phone’s question is answered no', async () => {
    notificationsStub.afterRequest = { ...REFUSED_FOR_GOOD };
    const onDone = shown();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await settle();
    expect(notificationsStub.requests).toBe(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    // and says nothing about it: no second question, no word about Settings, nothing left busy
    expect(screen.queryByText(/phone settings/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('aria-busy')).not.toBe('true');
  });

  it('goes on when the asking itself fails', async () => {
    notificationsStub.failRequest = true;
    const onDone = shown();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await settle();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('goes on quietly when the phone turns out not to ask: answered meanwhile, or no push here at all', async () => {
    notificationsStub.permission = { ...REFUSED_FOR_GOOD };
    notificationsStub.afterRequest = { ...REFUSED_FOR_GOOD };
    const refused = shown();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await settle();
    expect(refused).toHaveBeenCalledTimes(1);
    cleanup();

    phone.os = 'web';
    notificationsStub.requests = 0;
    const noPush = shown();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await settle();
    expect(noPush).toHaveBeenCalledTimes(1);
    expect(notificationsStub.requests).toBe(0);
  });

  it('takes a press made twice as one, and never shows a spinner while the phone asks', async () => {
    // the phone's question stays up
    notificationsStub.prompt = new Promise(() => undefined);
    const onDone = shown();
    const button = screen.getByRole('button', { name: 'Continue' });
    fireEvent.click(button);
    fireEvent.click(button);
    await settle();
    expect(notificationsStub.requests).toBe(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('aria-busy')).not.toBe('true');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('cannot hold anybody: with no answer from the phone, Continue goes on once it has had time to ask', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    let answer: () => void = () => undefined;
    notificationsStub.prompt = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const onDone = shown();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await settle();
    expect(notificationsStub.requests).toBe(1);
    now += ANSWER_WAIT_MS - 1;
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onDone).not.toHaveBeenCalled();
    now += 1;
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    // an answer that comes after all is not a second way on, and the phone was asked once
    answer();
    await settle();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(notificationsStub.requests).toBe(1);
  });

  it('keeps Android’s back on the screen: there is no leaving it but by way of the phone’s question', async () => {
    const onDone = shown();
    expect(pressBack()).toBe(true);
    await settle();
    expect(screen.getByRole('heading', { name: TITLE })).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    expect(notificationsStub.requests).toBe(0);
  });

  it('is written in the reader’s language', async () => {
    // the language chosen is kept in the browser's storage on the web build, which is where a test can set it
    phone.os = 'web';
    localStorage.setItem('kurda_locale_v1', 'ku');
    try {
      shown();
      expect(await screen.findByRole('heading', { name: 'Agahdariyên Hevalo' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Berdewam bike' })).toBeTruthy();
    } finally {
      localStorage.removeItem('kurda_locale_v1');
    }
  });
});

/** Whether the screen is due, as a lesson's results ask: 'null' while that is being found out. */
function Due({ enabled = true, store }: { enabled?: boolean; store: DeviceStore }): React.JSX.Element {
  return <Text testID="due">{String(useReminderOffer(enabled, store))}</Text>;
}

async function due(store: DeviceStore = memoryStore(), enabled = true): Promise<string | null> {
  renderWithProviders(<Due enabled={enabled} store={store} />);
  await settle();
  const answer = screen.getByTestId('due').textContent;
  cleanup();
  return answer;
}

describe('whether the screen follows a lesson', () => {
  it('follows for an adult who has never been asked, and finding that out asks nothing and counts nothing', async () => {
    const store = memoryStore();
    renderWithProviders(<Due store={store} />);
    // not known until the phone, the record and the account have answered
    expect(screen.getByTestId('due').textContent).toBe('null');
    await settle();
    expect(screen.getByTestId('due').textContent).toBe('true');
    expect(notificationsStub.requests).toBe(0);
    expect(store.data.has(OFFER_KEY)).toBe(false);
  });

  it('never follows practice, and asks the server nothing about it', async () => {
    const client = fakeClient({ 'GET /me': ok({ user: { minor: false } }) });
    testAuth.client = client;
    renderWithProviders(<Due enabled={false} store={memoryStore()} />);
    expect(screen.getByTestId('due').textContent).toBe('false');
    await settle();
    expect(screen.getByTestId('due').textContent).toBe('false');
    expect(client.calls).toEqual([]);
  });

  it('is counted when the screen is seen, and does not follow again the same week', async () => {
    const store = memoryStore();
    expect(await due(store)).toBe('true');
    shown(store);
    await settle();
    cleanup();
    expect(await due(store)).toBe('false');
  });

  it('follows once more a week later, and not a third time', async () => {
    const weekAgo = new Date(Date.now() - REOFFER_AFTER_MS).toISOString();
    expect(await due(memoryStore({ [OFFER_KEY]: JSON.stringify({ shown: 1, lastShownAt: weekAgo }) }))).toBe('true');
    expect(await due(memoryStore({ [OFFER_KEY]: JSON.stringify({ shown: 2, lastShownAt: weekAgo }) }))).toBe('false');
  });

  it('never follows for a minor, nor for an account whose age is not known or cannot be read', async () => {
    serveMe({ minor: true });
    expect(await due()).toBe('false');
    serveMe({});
    expect(await due()).toBe('false');
    testAuth.client = fakeClient();
    expect(await due()).toBe('false');
    // not yet asked its birth month: the server's "not a minor" is not "an adult"
    serveMe({ minor: false, birthDateRequired: true });
    expect(await due()).toBe('false');
  });

  it('never follows for a guest, to whom nothing is sent', async () => {
    // as the server answers for one: no birth month, so not "a minor"
    serveMe({ minor: false, guest: true });
    expect(await due()).toBe('false');

    // and known from the session itself, without asking the server
    const client = fakeClient({ 'GET /me': ok({ user: { minor: false } }) });
    testAuth.client = client;
    const account = testAuth.user;
    testAuth.user = { ...account, guest: true };
    try {
      expect(await due()).toBe('false');
      expect(client.calls).toEqual([]);
    } finally {
      testAuth.user = account;
    }
  });

  it('does not follow once the phone has answered, either way, nor where its one button could not lead to the question', async () => {
    notificationsStub.permission = { ...ALLOWED };
    expect(await due()).toBe('false');
    notificationsStub.permission = { ...REFUSED_FOR_GOOD };
    expect(await due()).toBe('false');
    // Android after one refusal: it could ask again, but they already said no to the phone itself
    notificationsStub.permission = { status: 'denied', granted: false, canAskAgain: true };
    expect(await due()).toBe('false');
    notificationsStub.permission = { status: 'undetermined', granted: false, canAskAgain: false };
    expect(await due()).toBe('false');
    // the web build has no push to ask about
    notificationsStub.permission = { ...NEVER_ASKED };
    phone.os = 'web';
    expect(await due()).toBe('false');
  });
});
