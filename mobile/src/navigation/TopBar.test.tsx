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
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { UnreadProvider } from '../messages/unread';
import { ActionPill, HeaderButton } from './HeaderButton';
import { ScreenHeader } from './ScreenHeader';
import { TabHeader } from './TopBar';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => navigation.navigate.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function show(ui: React.JSX.Element, { unread = 0 } = {}) {
  testAuth.client = fakeClient({
    'GET /chat/conversations': ok({ conversations: [] }),
    'GET /me/groups/unread': ok({ unread: [] }),
    'GET /friends/requests': ok({ requests: [] }),
    'GET /me/notifications/unread-count': ok({ count: unread }),
    'GET /me/social': ok({ unread: {} }),
  });
  renderWithProviders(<UnreadProvider>{ui}</UnreadProvider>);
}

describe('the top of a tab', () => {
  it('names the tab once, as the page’s heading', () => {
    show(<TabHeader title="Messages" />);
    expect(screen.getAllByRole('heading', { name: 'Messages' })).toHaveLength(1);
  });

  /*
   * Search and the bell are in the same corner of every tab: search opens
   * over wherever you are, and the bell opens what is new.
   */
  it('has search and the bell at its far end, and each opens its page', () => {
    show(<TabHeader title="Messages" />);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Search');
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(navigation.navigate).toHaveBeenCalledWith('NotificationCenter');
  });

  it('marks the bell while something is unread, and says how much in words', async () => {
    show(<TabHeader title="Messages" />, { unread: 3 });
    expect(await screen.findByRole('button', { name: 'Notifications, 3 unread' })).toBeTruthy();
    expect(screen.getByTestId('top-bell-dot')).toBeTruthy();
  });

  it('keeps the tab’s own action beside them', () => {
    const compose = vi.fn();
    show(<TabHeader title="Messages" action={<HeaderButton icon="compose" label="New message" onPress={compose} />} />);
    fireEvent.click(screen.getByRole('button', { name: 'New message' }));
    expect(compose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
  });

  /*
   * Learn shows the streak, the goal and the purse where a name would be.
   * What stands there is drawn as given, and search and the bell stay.
   */
  it('draws what a tab puts at the reading edge instead of a name', () => {
    show(<TabHeader lead={<HeaderButton icon="coin" label="3 day streak" onPress={() => undefined} />} />);
    expect(screen.getByRole('button', { name: '3 day streak' })).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
  });
});

describe('the bar over a pushed page', () => {
  it('has the way back first, and goes back when it is pressed', () => {
    const back = vi.fn();
    show(<ScreenHeader title="Badges" onBack={back} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Badges' })).toBeTruthy();
  });

  it('calls the way back by a closer name where the page gives one', () => {
    show(<ScreenHeader onBack={() => undefined} backLabel="Back to search" />);
    expect(screen.getByRole('button', { name: 'Back to search' })).toBeTruthy();
  });

  it('closes, in words, a page that was presented over what you were doing', () => {
    show(<ScreenHeader title="Shop" onBack={() => undefined} leading="close" />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  /*
   * A page where something is being done keeps its far corner empty: the
   * page is the task. A page to browse keeps search and the bell there.
   */
  it('keeps the far corner empty on a page that is a task', () => {
    show(<ScreenHeader title="Change password" onBack={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Notifications' })).toBeNull();
  });

  it('keeps search and the bell on a page to browse', () => {
    show(<ScreenHeader title="Badges" onBack={() => undefined} browse />);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Search');
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
  });

  it('shows a page’s own actions in place of search and the bell', () => {
    const share = vi.fn();
    show(<ScreenHeader title="Proverbs" onBack={() => undefined} browse right={<HeaderButton icon="share" label="Share" onPress={share} />} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  });

  it('offers no search on a page that was presented over what you were doing', () => {
    show(<ScreenHeader title="Quests" onBack={() => undefined} leading="close" browse />);
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  });

  it('groups actions that belong together, each still its own button', () => {
    const people = vi.fn();
    const more = vi.fn();
    show(
      <ScreenHeader
        title="Club"
        onBack={() => undefined}
        right={
          <ActionPill>
            <HeaderButton icon="people" label="People" onPress={people} />
            <HeaderButton icon="more" label="More" onPress={more} />
          </ActionPill>
        }
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'People' }));
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(people).toHaveBeenCalledTimes(1);
    expect(more).toHaveBeenCalledTimes(1);
  });
});
