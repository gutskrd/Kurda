// @vitest-environment jsdom
/**
 * Families and child mode on the phone: the family page for an adult with none and in one, making a child's profile
 * only with the consent ticked, child mode's home with nothing social and the way back behind the PIN, and the
 * header with no search or bell for a child.
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeError } from '../api/errors';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { navigation } from '../play/testing/navigation';
import { TRANSLATIONS } from '../i18n/translations';
import { interpolate } from '../i18n/format';
import { GlobalActions } from '../navigation/TopBar';
import { SettingsPageScreen } from '../settings/SettingsPageScreen';
import type { FamilyOverview } from './api';
import { ChildHome } from './ChildHome';
import { ChildProfile } from './ChildProfile';
import { forgetFamily } from './overview';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

patchReactNativeWeb({ reduceMotion: true });

const t = (key: keyof typeof TRANSLATIONS.en, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.en[key], vars);
const ME = { ...testAuth.user };
const page = (name: Parameters<typeof SettingsPageScreen>[0]['page'], teenId?: string) =>
  renderWithProviders(<SettingsPageScreen page={name} teenId={teenId} onExit={() => undefined} />);

const NO_FAMILY: FamilyOverview = { role: null, adult: true, family: null, children: [], teensToAdd: [], pinSet: false, asks: 0 };
const child = { userId: 'c1', name: 'Rojîn', avatarUrl: null, avatarKey: 'default-03', birthYear: 2018, birthMonth: 3, age: 8, inFamily: true, today: { minutes: 12, lessons: 2 }, canConvert: false };
const IN_FAMILY: FamilyOverview = {
  role: 'owner',
  adult: true,
  family: {
    id: 'f1',
    ownerId: 'me',
    size: 3,
    max: 6,
    plusUntil: null,
    members: [
      { userId: 'me', name: 'Rojda', avatarUrl: null, role: 'owner', joinedAt: '2026-11-01T00:00:00.000Z' },
      { userId: 'a2', name: 'Baran', avatarUrl: null, role: 'adult', joinedAt: '2026-11-02T00:00:00.000Z' },
      { userId: 'c1', name: 'Rojîn', avatarUrl: null, role: 'child', joinedAt: '2026-11-03T00:00:00.000Z', parentId: 'me' },
    ],
    board: [
      { userId: 'c1', name: 'Rojîn', avatarUrl: null, role: 'child', xp: 120 },
      { userId: 'me', name: 'Rojda', avatarUrl: null, role: 'owner', xp: 40 },
      { userId: 'a2', name: 'Baran', avatarUrl: null, role: 'adult', xp: 0 },
    ],
    invite: null,
  },
  children: [child],
  teensToAdd: [],
  pinSet: true,
  asks: 0,
};

beforeEach(() => {
  forgetFamily();
  navigation.navigate.mockClear();
  navigation.replace.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  testAuth.user = ME;
});

describe('the family page', () => {
  it('tells an adult with no family what one is, with the three ways in', async () => {
    testAuth.client = fakeClient({ 'GET /me/family': ok(NO_FAMILY) });
    page('family');
    expect(await screen.findByText(t('family.intro'))).toBeTruthy();
    fireEvent.click(screen.getByTestId('family-add-child'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('SettingsPage', { page: 'familyAddChild' });
    expect(screen.getByTestId('family-start')).toBeTruthy();
    expect(screen.getByTestId('family-join')).toBeTruthy();
  });

  it('tells a teen a family is an adult’s to start', async () => {
    testAuth.client = fakeClient({ 'GET /me/family': ok({ ...NO_FAMILY, adult: false, reason: 'minor' }) });
    page('family');
    expect(await screen.findByText(t('family.none.minor'))).toBeTruthy();
  });

  it('lists a parent’s children, the week’s board and everyone else in the family', async () => {
    testAuth.client = fakeClient({ 'GET /me/family': ok(IN_FAMILY) });
    page('family');
    expect(await screen.findByTestId('family-child-c1')).toBeTruthy();
    expect(screen.getByText(t('family.board.footer'))).toBeTruthy();
    expect(screen.getByTestId('family-board-0').textContent).toContain('Rojîn');
    expect(screen.getByTestId('family-member-a2')).toBeTruthy();
    // a child of the caller is listed once, with their own page, not again among the members
    expect(screen.queryByTestId('family-member-c1')).toBeNull();
    fireEvent.click(screen.getByTestId('family-child-c1'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('SettingsPage', { page: 'familyChild', teenId: 'c1' });
  });
});

describe('making a child’s profile', () => {
  it('says what is kept before anything is asked, and makes the profile only once consent is ticked', async () => {
    const client = fakeClient({
      'GET /cosmetics/avatars': ok({ avatars: [{ key: 'default-03', requiresPremium: false }, { key: 'default-99', requiresPremium: true }] }),
      'POST /me/family/children': ok({ child }),
    });
    testAuth.client = client;
    page('familyAddChild');
    expect(screen.getByText(t('family.add.notice.kept'))).toBeTruthy();
    expect(screen.getByText(t('family.add.notice.use'))).toBeTruthy();
    fireEvent.change(screen.getByTestId('child-name'), { target: { value: 'Rojîn' } });
    fireEvent.click(screen.getByText(t('age.month.3')));
    const years = screen.getByTestId('child-years');
    fireEvent.click(years.firstElementChild!);
    fireEvent.click(await screen.findByTestId('child-avatar-default-03'));
    // a members' avatar is not offered to a child
    expect(screen.queryByTestId('child-avatar-default-99')).toBeNull();
    const create = screen.getByTestId('child-create');
    fireEvent.click(create);
    expect(client.calls.some((c) => c.method === 'POST')).toBe(false);
    fireEvent.click(screen.getByTestId('child-consent'));
    fireEvent.click(create);
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST')?.body).toMatchObject({ name: 'Rojîn', birthMonth: 3, avatar: 'default-03', consent: true }));
  });

  it('turns the server’s refusals into the parent’s words', () => {
    const said = (code: string, details?: unknown) => describeError({ kind: 'client', code, message: 'no', status: 403, details }, t);
    expect(said('CHILD_PROFILE')).toBe(t('family.error.child'));
    expect(said('FAMILY_PIN_WRONG', { triesLeft: 3 })).toBe(t('family.pin.wrong', { count: 3 }));
    expect(said('FAMILY_NOT_ADULT', { reason: 'email' })).toBe(t('family.none.email'));
    expect(said('PAIRING_CODE_INVALID')).toBe(t('child.code.invalid'));
  });
});

describe('child mode', () => {
  const kid = (returnable: boolean) => ({ ...ME, displayName: 'Rojîn', kind: 'child' as const, child: { parentName: 'Rojda', returnable, remindersAllowed: false } });

  it('greets the child, offers only learning, and asks a parent instead of selling anything', async () => {
    testAuth.user = kid(false);
    const client = fakeClient({
      'GET /me': ok({ user: { xp: 230, streak: { current: 4 } } }),
      'POST /me/family/purchase-requests': ok({ request: { id: 'r1' } }),
    });
    testAuth.client = client;
    renderWithProviders(<ChildHome />);
    expect(screen.getByText(t('child.hello', { name: 'Rojîn' }))).toBeTruthy();
    for (const place of ['PracticeHub', 'Stories', 'Alphabet', 'Dictionary', 'Riddles', 'Proverbs', 'Tree', 'Badges']) expect(screen.getByTestId(`child-tile-${place}`)).toBeTruthy();
    for (const social of ['Friends', 'Letters', 'Shop', 'Rankings', 'Search']) expect(screen.queryByTestId(`child-tile-${social}`)).toBeNull();
    // on the child's own phone there is no parent to give it back to
    expect(screen.queryByTestId('child-back')).toBeNull();
    fireEvent.click(screen.getByTestId('child-ask-go'));
    expect(await screen.findByText(t('child.ask.done', { name: 'Rojda' }))).toBeTruthy();
    expect(client.calls.find((c) => c.method === 'POST')?.body).toEqual({ kind: 'plus', product: 'app.hevalo.family.monthly' });
  });

  it('gives the parent’s phone back only with the PIN', async () => {
    testAuth.user = kid(true);
    testAuth.client = fakeClient({ 'GET /me': ok({ user: { xp: 0, streak: null } }) });
    const returnToParent = vi.fn(async () => ({ message: t('family.pin.wrong', { count: 4 }), code: 'FAMILY_PIN_WRONG' }));
    testAuth.returnToParent = returnToParent;
    renderWithProviders(<ChildHome />);
    fireEvent.click(screen.getByTestId('child-back'));
    const go = await screen.findByTestId('child-pin-go');
    fireEvent.change(screen.getByTestId('child-pin'), { target: { value: '12' } });
    fireEvent.click(go);
    expect(returnToParent).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('child-pin'), { target: { value: '1234' } });
    fireEvent.click(go);
    await waitFor(() => expect(returnToParent).toHaveBeenCalledWith('1234'));
    expect(await screen.findByText(t('family.pin.wrong', { count: 4 }))).toBeTruthy();
  });

  it('tells the child, on their own page, who made the profile and that nobody else sees them', () => {
    testAuth.user = kid(false);
    renderWithProviders(<ChildProfile onExit={() => undefined} />);
    expect(screen.getByTestId('child-note').textContent).toContain(t('child.note'));
  });

  it('shows a child no search and no bell', () => {
    testAuth.user = kid(false);
    renderWithProviders(<GlobalActions />);
    expect(screen.queryByTestId('top-search')).toBeNull();
    testAuth.user = ME;
    cleanup();
    testAuth.client = fakeClient({ 'GET /me/notifications/unread-count': fail({ status: 500 }) });
    renderWithProviders(<GlobalActions />);
    expect(screen.getByTestId('top-search')).toBeTruthy();
  });
});
