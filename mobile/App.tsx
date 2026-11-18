import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  getStateFromPath,
  useLinkTo,
  useNavigation,
  useNavigationContainerRef,
  type InitialState,
  type LinkingOptions,
  type Theme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { inviteRoutePath, isWordSetId } from '@kurda/shared';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { AccountGateProvider, GuestWall, useAccountGate } from './src/auth/AccountGate';
import { AUTH_INITIAL_ROUTE, type AuthStackParamList } from './src/navigation/authStack';
import { TABS, legacyTabPath, linkingScreens } from './src/navigation/tabs';
import { holdLink, launchLinkKeeper, linkHolding, takeHeldLink } from './src/navigation/heldLink';
import { authRouter, rootRouter } from './src/navigation/returnTo';
import { cardOptions, stackOptions } from './src/navigation/stackOptions';
import { TabBar } from './src/navigation/TabBar';
import { prepareAudioSession } from './src/recording/useMicRecorder';
import { MenuProvider, SideMenu, type MenuGroup } from './src/navigation/SideMenu';
import { useCloseOnBlur } from './src/navigation/edgePanel';
import { SlideProvider, SocialSlide } from './src/social/SocialSlide';
import { Entrance, LaunchScreen } from './src/navigation/LaunchScreen';
import {
  chatRouteId,
  groupThreadRouteId,
  userProfileRouteId,
  type RootNavigation,
  type RootStackParamList,
  type TabParamList,
} from './src/navigation/rootStack';
import { ForgotPasswordForm, ForgotPasswordScreen } from './src/screens/auth/ForgotPasswordScreen';
import { WelcomeScreen } from './src/screens/auth/WelcomeScreen';
import { VerifyEmailScreen } from './src/screens/auth/VerifyEmailScreen';
import { BirthDatePromptScreen } from './src/screens/auth/BirthDatePromptScreen';
import { AgeStopScreen } from './src/screens/auth/AgeStopScreen';
import { CivakScreen } from './src/feed/CivakScreen';
import { SavedScreen } from './src/feed/SavedScreen';
import { EditProfileScreen } from './src/profile/EditProfileScreen';
import { LoginScreen } from './src/screens/auth/LoginScreen';
import { RegisterScreen } from './src/screens/auth/RegisterScreen';
import { ClaimAccountScreen } from './src/screens/auth/ClaimAccountScreen';
import { SignInModal } from './src/screens/auth/SignInModal';
import { LearnScreen } from './src/learn/LearnScreen';
import { DictionaryScreen } from './src/screens/DictionaryScreen';
import { AlphabetScreen } from './src/alphabet/AlphabetScreen';
import { WordSetScreen } from './src/words/WordSetScreen';
import { WordsScreen } from './src/words/WordsScreen';
import { QuestsScreen } from './src/quests/QuestsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { LessonPlayerScreen } from './src/lesson/LessonPlayerScreen';
import { PracticeScreen } from './src/practice/PracticeScreen';
import { PracticeHubScreen } from './src/practice/PracticeHubScreen';
import { JumpTestScreen } from './src/coursemap/JumpTestScreen';
import { ShopScreen } from './src/shop/ShopScreen';
import { GameFeedbackHost } from './src/feedback/GameFeedbackHost';
import { ActionSheetHost } from './src/theme/ActionSheetHost';
import { RefreshedNotice } from './src/shop/RefreshedItems';
import { LeagueScreen } from './src/leagues/LeagueScreen';
import { RanksScreen } from './src/ranks/RanksScreen';
import { SeasonScreen } from './src/ranks/SeasonScreen';
import { BadgesScreen } from './src/badges/BadgesScreen';
import { TreeScreen } from './src/tree/TreeScreen';
import { BadgeCelebrationHost } from './src/badges/BadgeCelebrationHost';
import { SocialScreen } from './src/social/SocialScreen';
import { SearchScreen } from './src/search/SearchScreen';
import { MessagesScreen } from './src/messages/MessagesScreen';
import { FriendRequestsScreen } from './src/messages/FriendRequestsScreen';
import { LettersScreen } from './src/letters/LettersScreen';
import { LetterThreadScreen } from './src/letters/LetterThreadScreen';
import { LETTER_LINKS } from './src/letters/links';
import { LetterWidgetScreen } from './src/widget/LetterWidgetScreen';
import { LetterWidgetSync } from './src/widget/LetterWidgetSync';
import { UnreadProvider, useUnread } from './src/messages/unread';
import { unreadBadge } from './src/notifications/inbox';
import { PublicProfileScreen } from './src/social/PublicProfileScreen';
import { ChatScreen } from './src/chat/ChatScreen';
import { GroupThreadScreen } from './src/groups/GroupThreadScreen';
import { GroupMembersScreen } from './src/groups/GroupMembersScreen';
import { GroupEditScreen } from './src/groups/GroupEditScreen';
import { GroupRequestsScreen } from './src/groups/GroupRequestsScreen';
import { GroupBansScreen } from './src/groups/GroupBansScreen';
import { PushRegistration } from './src/push/PushRegistration';
import { PushHost } from './src/push/PushHost';
import { EventQuestsScreen } from './src/events/EventQuestsScreen';
import { EventThemeProvider, useEventTheme } from './src/theme/EventThemeContext';
import { I18nProvider } from './src/i18n/I18nContext';
import { OnboardingScreen, useOnboarding } from './src/onboarding/OnboardingScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { Arrive, originOf } from './src/theme/origin';
import { useReducedMotion } from './src/a11y/useReducedMotion';
import { duration } from './src/theme/motion';
import { OfflineBanner } from './src/net/OfflineBanner';
import { NoticeToasts } from './src/theme/NoticeToasts';
import { AppErrorBoundary } from './src/errors/AppErrorBoundary';
import { noteScreen } from './src/errors/crashReporting';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SettingsPageScreen } from './src/settings/SettingsPageScreen';
import { BlockedUsersScreen } from './src/social/BlockedUsersScreen';
import { MyReportsScreen } from './src/reports/MyReportsScreen';
import { AccountStandingScreen } from './src/reports/AccountStandingScreen';
import { SuspensionScreen } from './src/reports/SuspensionScreen';
import { SocialOverlays } from './src/reports/SocialOverlays';
import { WordleScreen } from './src/wordle/WordleScreen';
import { WordleBattleScreen } from './src/wordle/WordleBattleScreen';
import { RhymeTrainingScreen } from './src/rhyme/RhymeTrainingScreen';
import { RhymeMatchScreen } from './src/rhyme/RhymeMatchScreen';
import { LastLetterScreen } from './src/lastletter/LastLetterScreen';
import { ImpostorScreen } from './src/impostor/ImpostorScreen';
import { RaceScreen } from './src/race/RaceScreen';
import { BuildSentenceScreen } from './src/games/BuildSentenceScreen';
import { WhoAmIScreen } from './src/whoami/WhoAmIScreen';
import { MemoryThiefScreen } from './src/games/MemoryThiefScreen';
import { HearItScreen } from './src/games/HearItScreen';
import { DetectiveScreen } from './src/games/DetectiveScreen';
import { MemeFeedScreen } from './src/memes/MemeFeedScreen';
import { MemeDetailScreen } from './src/memes/MemeDetailScreen';
import { TagsScreen } from './src/tags/TagsScreen';
import { ChangeUsernameScreen } from './src/username/ChangeUsernameScreen';
import { ChangePasswordScreen } from './src/security/ChangePasswordScreen';
import { DevicesScreen } from './src/security/DevicesScreen';
import { LibraryScreen } from './src/library/LibraryScreen';
import { LibraryPostScreen } from './src/library/LibraryPostScreen';
import { ComposeScreen } from './src/composer/ComposeScreen';
import { StoriesScreen } from './src/stories/StoriesScreen';
import { StoryReaderScreen } from './src/stories/StoryReaderScreen';
import { StoryGameScreen } from './src/stories/StoryGameScreen';
import { RiddlesScreen } from './src/lore/RiddlesScreen';
import { RiddleScreen } from './src/lore/RiddleScreen';
import { RiddleAnswerScreen } from './src/lore/RiddleAnswerScreen';
import { ProverbsScreen } from './src/lore/ProverbsScreen';
import { ProverbScreen } from './src/lore/ProverbScreen';
import { ProverbRoundScreen } from './src/lore/ProverbRoundScreen';
import { leaveLinked } from './src/navigation/leaveLinked';
import { NotificationsScreen } from './src/notifications/NotificationsScreen';
import { NotificationCenterScreen } from './src/notifications/NotificationCenterScreen';
import { RealtimeProvider } from './src/realtime/RealtimeProvider';
import { InviteBanner } from './src/play/InviteBanner';
import { GazeArea } from './src/characters/gaze';
import { ArtOverridesLoader } from './src/art/ArtOverridesLoader';
import { MaintenanceScreen } from './src/maintenance/MaintenanceScreen';
import { onMaintenanceOver, useMaintenance } from './src/maintenance/maintenance';

const Tab = createBottomTabNavigator<TabParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

/**
 * Where a link opened from outside the app lands. Game route paths come from `inviteRoutePath`, so they always match
 * the invite links the apps share; a mismatch would only show on the recipient's phone. `?id=…` needs no
 * `:param`, since React Navigation passes query parameters through as route params.
 *
 * hevalo.app is listed so web invite URLs match, but phones only hand those links over once the association files
 * exist (apple-app-site-association, needing the Apple team id, and assetlinks.json, needing the signing
 * certificate's SHA-256, both under /.well-known/). Until then a tapped link opens the website and `hevalo://` still
 * works.
 */
const linking: LinkingOptions<RootStackParamList> = {
  // `hevalo://` is the scheme app.json registers. Do not use `kurda://`: phones never hand it to the app.
  prefixes: [Linking.createURL('/'), 'hevalo://', 'https://hevalo.app'],
  // Old addresses (`hevalo://play`, `hevalo://inbox`, the website's `/app/games`) are rewritten to their current places
  // first (navigation/tabs.ts, `legacyTabPath`).
  getStateFromPath: (path, options) => getStateFromPath(legacyTabPath(path), options),
  config: {
    // A link that starts the app (a tap on the letter widget) opens its screen over the tabs, so back has somewhere to go.
    initialRouteName: 'Tabs',
    screens: {
      // `?view=games` on Learn arrives as the tab's own param.
      Tabs: { screens: linkingScreens() },
      // `hevalo://search` was the Search tab's address and is now the search page's.
      Search: 'search',
      // A shared profile (Profile → Share) opens in the app for anyone who has it.
      UserProfile: 'app/users/:userId',
      Lesson: 'lesson/:lessonId',
      // Practice opens on its hub, where every kind is one tap away.
      PracticeHub: 'practice',
      // The two former games, at the lessons' own addresses (the website's too); their old `app/games/…` addresses are
      // rewritten to these (navigation/tabs.ts).
      BuildSentence: 'app/learn/practice/build-sentence',
      HearIt: 'app/learn/practice/hear-it',
      // The website's alphabet, `?script=ckb` included, opens the phone's.
      Alphabet: 'app/alphabet',
      // The colours, numbers, days and months, and one set by name: `app/words/colours?script=ckb`.
      Words: 'app/words',
      WordSet: 'app/words/:set',
      WordleBattle: inviteRoutePath('wordle-battle'),
      RhymeMatch: inviteRoutePath('rhyme-match'),
      LastLetter: inviteRoutePath('last-letter'),
      Impostor: inviteRoutePath('impostor'),
      WhoAmI: inviteRoutePath('who-am-i'),
      // `/app/games/stories?id=…` is a game to join; without an id it is the library.
      Stories: inviteRoutePath('stories'),
      // A story's address; the website's `/app/learn/stories/:slug` is rewritten to it (navigation/tabs.ts).
      StoryReader: 'app/games/stories/:slug',
      // Riddles and proverbs at the website's addresses, so a shared riddle opens here; a riddle's answer has no address,
      // so no link can open it.
      Riddles: 'app/learn/riddles',
      Riddle: 'app/learn/riddles/:slug',
      Proverbs: 'app/learn/proverbs',
      Proverb: 'app/learn/proverbs/:slug',
      // A shared post, at the address the website gives written and picture posts.
      LibraryPost: 'app/library/:postId',
      MemeDetail: 'app/dimen/:postId',
      // The letters and a correspondence at the website's addresses, which the letter widget opens; a notification names
      // its bird on the window's (`app/letters?bird=…`, letters/links.ts).
      ...LETTER_LINKS,
    },
  },
};

/**
 * Back from a screen, only while it is the one in front. A second tap during the transition, or an exit that
 * arrives after a page was pushed over it, would otherwise close whichever screen is on top.
 */
const backFrom = (navigation: { isFocused(): boolean; goBack(): void }) => (): void => {
  if (navigation.isFocused()) navigation.goBack();
};

/**
 * Opens a link that arrived before sign-in (navigation/heldLink.ts) once the signed-in screens exist. An unplaceable
 * path is dropped, landing on Home as it would anyway.
 */
function OpenHeldLink(): null {
  const linkTo = useLinkTo();
  useEffect(() => {
    const path = takeHeldLink();
    if (!path) return;
    try {
      linkTo(legacyTabPath(path));
    } catch {
      // Not a screen this version of the app has.
    }
  }, [linkTo]);
  return null;
}

/**
 * The profile menu: everywhere the five tabs have no room for, such as the shop, settings, saved items, the library,
 * memes and the league, one tap from the profile where people look for their own things. `giftBadge` counts unopened
 * gifts on the Shop row, as the dot on the Profile tab and the menu button does. Rows needing an account go through
 * the gate (auth/AccountGate), so a guest gets the offer to make one rather than a screen that cannot load.
 */
function useMenuGroups(navigation: RootNavigation, require: ReturnType<typeof useAccountGate>['require']): MenuGroup[] {
  const giftBadge = unreadBadge(useUnread().counts.gifts) ?? undefined;
  // The events page only while one runs; between events it could only say "check back soon".
  const { live: eventLive } = useEventTheme();
  return [
    {
      titleKey: null,
      links: [
        { key: 'friends', labelKey: 'nav.friends', icon: 'people', onPress: () => require('friends') && navigation.navigate('Friends') },
      ],
    },
    {
      titleKey: 'nav.menu.discover',
      links: [
        { key: 'library', labelKey: 'library.title', icon: 'book', onPress: () => navigation.navigate('Library') },
        { key: 'memes', labelKey: 'memes.title', icon: 'image', onPress: () => navigation.navigate('Memes') },
        ...(eventLive ? [{ key: 'events', labelKey: 'events.title', icon: 'star', onPress: () => navigation.navigate('EventQuests') } as const] : []),
        { key: 'league', labelKey: 'leagues.screenTitle', icon: 'trophy', onPress: () => require('league') && navigation.navigate('League') },
        { key: 'ranks', labelKey: 'ranks.title', icon: 'mountains', onPress: () => require('league') && navigation.navigate('Ranks') },
      ],
    },
    {
      titleKey: 'nav.menu.yours',
      links: [
        { key: 'saved', labelKey: 'saved.title', icon: 'bookmark', onPress: () => require('save') && navigation.navigate('Saved') },
        { key: 'badges', labelKey: 'badges.title', icon: 'medal', onPress: () => navigation.navigate('Badges') },
        // Its own glyph, since the star belongs to the events row.
        { key: 'tags', labelKey: 'tags.title', icon: 'tag', onPress: () => require('profile') && navigation.navigate('Tags') },
        { key: 'shop', labelKey: 'profile.shop', icon: 'cart', badge: giftBadge, onPress: () => require('shop') && navigation.navigate('Shop') },
        { key: 'settings', labelKey: 'settings.title', icon: 'gear', onPress: () => navigation.navigate('Settings') },
      ],
    },
  ];
}


function SignedInTabs() {
  const navigation = useNavigation<RootNavigation>();
  const { require } = useAccountGate();
  const groups = useMenuGroups(navigation, require);
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const [slideOpen, setSlideOpen] = useState(false);
  const openSlide = useCallback(() => setSlideOpen(true), []);
  const closeSlide = useCallback(() => setSlideOpen(false), []);
  const closePanels = useCallback(() => {
    setMenuOpen(false);
    setSlideOpen(false);
  }, []);
  useCloseOnBlur(navigation, closePanels);
  return (
    <MenuProvider value={openMenu}>
    <SlideProvider value={openSlide}>
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        // Tabs cross-fade for `duration.base` rather than cutting, which reads as a flicker; no animation under Reduce Motion.
        animation: reduceMotion ? 'none' : 'fade',
        transitionSpec: { animation: 'timing', config: { duration: duration.base } },
      }}
      // The tabs in a bar floating over the page's bottom, with the badges.
      tabBar={(props) => <TabBar {...props} />}
    >
      {/* In the order TABS gives, which the tests hold it to. */}
      {TABS.map((tab) =>
        tab.name === 'Learn' ? (
          <Tab.Screen key={tab.name} name="Learn">
            {({ route, navigation: tabs }) => (
              <LearnScreen view={route.params?.view} onViewShown={() => tabs.setParams({ view: undefined })} />
            )}
          </Tab.Screen>
        ) : (
          <Tab.Screen key={tab.name} name={tab.name}>
            {() =>
              tab.name === 'Home' ? (
                <CivakScreen />
              ) : tab.name === 'Messages' ? (
                <MessagesScreen />
              ) : (
                <ProfileScreen />
              )
            }
          </Tab.Screen>
        ),
      )}
    </Tab.Navigator>
      {/* The profile menu comes in from the end, the side its button is on. */}
      <SideMenu open={menuOpen} onClose={closeMenu} groups={groups} side="end" />
      {/* Your people, opened by Messages' new-message button: tap a friend to write to them. */}
      <SocialSlide open={slideOpen} onClose={closeSlide} />
    </SlideProvider>
    </MenuProvider>
  );
}

function SignedInRoot() {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  /*
   * A pushed page. One opened by a press on a card, tile or header button fades in while growing out of what was
   * pressed (theme/origin); any other slides in. Decided once per page when first drawn, so a page that faded in fades
   * back out over its card.
   */
  const card = useCallback(
    ({ route }: { route: { key: string } }): NativeStackNavigationOptions => cardOptions(!reduceMotion && originOf(route.key) !== null),
    [reduceMotion],
  );
  // A card whose swipe would leave a game or round under way, still growing out of what opened it.
  const heldCard = useCallback((args: { route: { key: string } }): NativeStackNavigationOptions => ({ ...card(args), gestureEnabled: false }), [card]);
  return (
    <RealtimeProvider>
      {/* Unread counts for the tab bar, the bell and the profile menu. */}
      <UnreadProvider>
      <PushRegistration />
      {/* A just-earned badge gets its moment over whatever is on screen, after a game's own result. */}
      <BadgeCelebrationHost>
      {/* One account offer for every screen that finds a guest at something only an account can do. */}
      <AccountGateProvider>
      <RootStack.Navigator
        // The options every stack shares (navigation/stackOptions).
        screenOptions={stackOptions(reduceMotion, colors.background)}
        // A place already open is returned to, not stacked again (navigation/returnTo).
        UNSTABLE_router={rootRouter}
        // Every page is wrapped in `Arrive`, which grows a press-opened page out of what was pressed.
        screenLayout={({ children, route, options }) => (
          <Arrive routeKey={route.key} grows={options.animation === 'fade'}>
            {children}
          </Arrive>
        )}
      >
        <RootStack.Screen name="Tabs" component={SignedInTabs} />
      {/* Search opens out of the tapped magnifier, as any page opens out of what opened it. */}
      <RootStack.Screen name="Search" options={card}>
        {({ navigation }) => <SearchScreen onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="Lesson" options={{ presentation: 'fullScreenModal' }}>
        {({ route, navigation }) => (
          // The results' ways on replace the lesson, so Back from them goes to the path, not a finished lesson.
          <LessonPlayerScreen
            lessonId={route.params.lessonId}
            courseId={route.params.courseId}
            onExit={backFrom(navigation)}
            onNext={(lessonId) => navigation.replace('Lesson', { lessonId, courseId: route.params.courseId })}
            onPractise={(exerciseIds) => navigation.replace('Practice', { exerciseIds })}
            onPath={() => navigation.popTo('Tabs', { screen: 'Learn', params: { view: 'lessons' } })}
          />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Practice" options={{ presentation: 'fullScreenModal' }}>
        {({ route, navigation }) => (
          <PracticeScreen
            navigation={navigation}
            exerciseIds={route.params?.exerciseIds}
            mode={route.params?.mode}
            unitId={route.params?.unitId}
            sessionId={route.params?.sessionId}
            onExit={backFrom(navigation)}
          />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="PracticeHub" options={card}>
        {({ navigation }) => <PracticeHubScreen onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="JumpTest" options={{ presentation: 'fullScreenModal' }}>
        {({ route, navigation }) => (
          <JumpTestScreen
            courseId={route.params.courseId}
            unitId={route.params.unitId}
            onExit={backFrom(navigation)}
            onPath={() => navigation.popTo('Tabs', { screen: 'Learn', params: { view: 'lessons' } })}
            onAgain={() => navigation.replace('JumpTest', route.params)}
          />
        )}
      </RootStack.Screen>
      {/*
        Guest-restricted routes sit behind the account offer (auth/AccountGate `GuestWall`), so a tap or link lands on the
        offer with a way back. Lessons, practice, the dictionary, solo games, badges, the library and profiles stay open.
      */}
      <RootStack.Screen name="Shop" options={{ presentation: 'fullScreenModal' }}>
        {({ navigation }) => (
          <GuestWall reason="shop" onBack={backFrom(navigation)}>
            {/* Zêr is earned by learning, so "earn more" opens the lessons. */}
            <ShopScreen
              onExit={backFrom(navigation)}
              onEarnMore={() => navigation.popTo('Tabs', { screen: 'Learn', params: { view: 'lessons' } })}
            />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="League" options={{ presentation: 'fullScreenModal' }}>
        {({ navigation }) => (
          <GuestWall reason="league" onBack={backFrom(navigation)}>
            <LeagueScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Ranks" options={card}>
        {({ route, navigation }) => (
          <GuestWall reason="league" onBack={backFrom(navigation)}>
            <RanksScreen game={route.params?.game} onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Season" options={card}>
        {({ navigation }) => (
          <GuestWall reason="league" onBack={backFrom(navigation)}>
            <SeasonScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Badges" options={card}>
        {({ navigation }) => <BadgesScreen onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="Tree" options={card}>
        {({ navigation }) => <TreeScreen onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      {/* One page per person, as per conversation (rootStack.userProfileRouteId). */}
      <RootStack.Screen name="UserProfile" options={card} getId={userProfileRouteId}>
        {({ route, navigation }) => (
          <PublicProfileScreen userId={route.params.userId} onExit={backFrom(navigation)} />
        )}
      </RootStack.Screen>
      {/* One route per person and per group (rootStack.chatRouteId). */}
      <RootStack.Screen name="Chat" options={card} getId={chatRouteId}>
        {({ route, navigation }) => (
          <GuestWall reason="message" onBack={backFrom(navigation)}>
            <ChatScreen
              userId={route.params.userId}
              username={route.params.username}
              openGift={route.params.openGift}
              onExit={backFrom(navigation)}
            />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="BlockedUsers" options={card}>
        {({ navigation }) => (
          <GuestWall onBack={backFrom(navigation)}>
            <BlockedUsersScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="MyReports" options={card}>
        {({ navigation }) => (
          <GuestWall onBack={backFrom(navigation)}>
            <MyReportsScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="AccountStanding" options={card}>
        {({ navigation }) => (
          <GuestWall onBack={backFrom(navigation)}>
            <AccountStandingScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      {/* Leaving unwinds past the thread, since the club is gone from under it. */}
      <RootStack.Screen name="GroupMembers" options={card} getId={({ params }) => params.groupId}>
        {({ route, navigation }) => (
          <GuestWall reason="groups" onBack={backFrom(navigation)}>
            <GroupMembersScreen
              groupId={route.params.groupId}
              onExit={backFrom(navigation)}
              onLeft={() => navigation.popTo('Tabs', { screen: 'Messages' })}
              onEdit={() => navigation.navigate('GroupEdit', { groupId: route.params.groupId })}
            />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="GroupEdit" options={card} getId={({ params }) => params.groupId}>
        {({ route, navigation }) => (
          <GuestWall reason="groups" onBack={backFrom(navigation)}>
            <GroupEditScreen groupId={route.params.groupId} onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="GroupRequests" options={card} getId={({ params }) => params.groupId}>
        {({ route, navigation }) => (
          <GuestWall reason="groups" onBack={backFrom(navigation)}>
            <GroupRequestsScreen groupId={route.params.groupId} onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="GroupBans" options={card} getId={({ params }) => params.groupId}>
        {({ route, navigation }) => (
          <GuestWall reason="groups" onBack={backFrom(navigation)}>
            <GroupBansScreen groupId={route.params.groupId} onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="GroupThread" options={card} getId={groupThreadRouteId}>
        {({ route, navigation }) => (
          <GuestWall reason="groups" onBack={backFrom(navigation)}>
            <GroupThreadScreen
              groupId={route.params.groupId}
              name={route.params.name}
              openGift={route.params.openGift}
              addFriends={route.params.addFriends}
              onFindPeople={() => navigation.navigate('Search')}
              onLeft={() => navigation.popTo('Tabs', { screen: 'Messages' })}
              onExit={backFrom(navigation)}
              onOpenMembers={() => navigation.navigate('GroupMembers', { groupId: route.params.groupId })}
            />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="FriendRequests" options={card}>
        {({ navigation }) => (
          <GuestWall reason="friends" onBack={backFrom(navigation)}>
            <FriendRequestsScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      {/* Letters by bird: a guest has no bird and sees the way to an account instead. */}
      <RootStack.Screen name="Letters" options={card}>
        {({ route, navigation }) => (
          <GuestWall reason="message" onBack={backFrom(navigation)}>
            {/* A notification's bird is cleared once the window has acted on it, so returning does not act on it again. */}
            <LettersScreen bird={route.params?.bird} onBirdUsed={() => navigation.setParams({ bird: undefined })} onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="LetterThread" options={card} getId={({ params }) => params.threadId}>
        {({ route, navigation }) => (
          <GuestWall reason="message" onBack={backFrom(navigation)}>
            <LetterThreadScreen threadId={route.params.threadId} onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="LetterWidget" options={card}>
        {({ navigation }) => (
          <GuestWall reason="message" onBack={backFrom(navigation)}>
            <LetterWidgetScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="EventQuests" options={card}>
        {({ navigation }) => <EventQuestsScreen onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="Notifications" options={card}>
        {({ navigation }) => (
          <GuestWall onBack={backFrom(navigation)}>
            <NotificationsScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="NotificationCenter" options={card}>
        {({ navigation }) => (
          <GuestWall onBack={backFrom(navigation)}>
            <NotificationCenterScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Settings" options={card}>
        {({ navigation }) => <SettingsScreen onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="SettingsPage" options={card}>
        {({ route, navigation }) => <SettingsPageScreen page={route.params.page} onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="Wordle" options={card}>
        {({ navigation }) => <WordleScreen onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="WordleBattle" options={card}>
        {({ route, navigation }) => (
          <GuestWall reason="play" onBack={backFrom(navigation)}>
            <WordleBattleScreen id={route.params?.id} onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Rhyme" options={card}>
        {({ navigation }) => <RhymeTrainingScreen onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="RhymeMatch" options={card}>
        {({ route, navigation }) => (
          <GuestWall reason="play" onBack={backFrom(navigation)}>
            <RhymeMatchScreen id={route.params?.id} onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="LastLetter" options={card}>
        {({ route, navigation }) => (
          <GuestWall reason="play" onBack={backFrom(navigation)}>
            <LastLetterScreen id={route.params?.id} onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Impostor" options={card}>
        {({ route, navigation }) => (
          <GuestWall reason="play" onBack={backFrom(navigation)}>
            <ImpostorScreen id={route.params?.id} onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      {/* Who Am I? on one phone reaches nobody else, so guests may play; its room with friends keeps the guest wall inside (whoami/WhoAmIScreen). */}
      <RootStack.Screen name="WhoAmI" options={card}>
        {({ route, navigation }) => <WhoAmIScreen id={route.params?.id} way={route.params?.way} onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="Race" options={card}>
        {({ navigation }) => (
          <GuestWall reason="play" onBack={backFrom(navigation)}>
            <RaceScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      {/*
        The lessons' two exercises (practice/exercises.ts), opened from the practice hub or Lessons. Leaving goes back
        there, or to the hub when a link opened it (`leaveLinked`). Guests do them too.
      */}
      <RootStack.Screen name="BuildSentence" options={card}>
        {({ navigation }) => <BuildSentenceScreen onExit={() => leaveLinked(navigation, 'PracticeHub', ['Learn'])} />}
      </RootStack.Screen>
      <RootStack.Screen name="HearIt" options={card}>
        {({ navigation }) => <HearItScreen onExit={() => leaveLinked(navigation, 'PracticeHub', ['Learn'])} />}
      </RootStack.Screen>
      {/* A learning game is learning, like a lesson, so guests play it too (api/src/games). */}
      <RootStack.Screen name="MemoryThief" options={card}>
        {({ navigation }) => <MemoryThiefScreen onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="Detective" options={card}>
        {({ navigation }) => <DetectiveScreen onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      {/* The library is reading, which guests may do; the games behind it keep their own wall. */}
      <RootStack.Screen name="Stories" options={card}>
        {({ route, navigation }) => <StoriesScreen id={route.params?.id} onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="StoryReader" options={card}>
        {({ route, navigation }) => <StoryReaderScreen slug={route.params.slug} onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      {/* A game must not be left by a swipe meant to scroll the story. */}
      <RootStack.Screen name="StoryGame" options={heldCard}>
        {({ route, navigation }) => (
          <GuestWall reason="play" onBack={backFrom(navigation)}>
            <StoryGameScreen key={route.params.id} id={route.params.id} onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      {/* Riddles and proverbs are open to guests; the proverbs' round counts a guest's day too. */}
      <RootStack.Screen name="Riddles" options={card}>
        {({ route, navigation }) => <RiddlesScreen dialect={route.params?.dialect} onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="Riddle" options={card} getId={({ params }) => params.slug}>
        {({ route, navigation }) => <RiddleScreen key={route.params.slug} slug={route.params.slug} onExit={() => leaveLinked(navigation, 'Riddles')} />}
      </RootStack.Screen>
      <RootStack.Screen name="RiddleAnswer" options={card}>
        {({ route, navigation }) => <RiddleAnswerScreen key={route.params.slug} slug={route.params.slug} onExit={() => leaveLinked(navigation, 'Riddles')} />}
      </RootStack.Screen>
      <RootStack.Screen name="Proverbs" options={card}>
        {({ route, navigation }) => <ProverbsScreen dialect={route.params?.dialect} theme={route.params?.theme} onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="Proverb" options={card} getId={({ params }) => params.slug}>
        {({ route, navigation }) => <ProverbScreen key={route.params.slug} slug={route.params.slug} onExit={() => leaveLinked(navigation, 'Proverbs')} />}
      </RootStack.Screen>
      {/* A round must not be left by a swipe meant to scroll its choices. */}
      <RootStack.Screen name="ProverbRound" options={heldCard}>
        {({ route, navigation }) => <ProverbRoundScreen dialect={route.params.dialect} mode={route.params.mode} onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="Memes" options={card}>
        {({ navigation }) => <MemeFeedScreen onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      {/* Writing or editing a post: full screen without swipe-down, since the composer asks before discarding text. */}
      <RootStack.Screen name="Compose" options={{ presentation: 'fullScreenModal', gestureEnabled: false }}>
        {({ route, navigation }) => (
          <GuestWall reason="post" onBack={backFrom(navigation)}>
            <ComposeScreen
              postId={route.params?.postId}
              startWithPictures={route.params?.pickPictures}
              asMeme={route.params?.meme}
              onExit={backFrom(navigation)}
            />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="MemeDetail" options={card}>
        {({ route, navigation }) => <MemeDetailScreen postId={route.params.postId} onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="EditProfile" options={card}>
        {({ navigation }) => (
          <GuestWall reason="profile" onBack={backFrom(navigation)}>
            <EditProfileScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Friends" options={card}>
        {({ navigation }) => (
          <GuestWall reason="friends" onBack={backFrom(navigation)}>
            <SocialScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Dictionary" options={card}>
        {({ navigation }) => <DictionaryScreen onBack={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="Alphabet" options={card}>
        {({ route, navigation }) => <AlphabetScreen script={route.params?.script} onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="Words" options={card}>
        {({ navigation }) => <WordsScreen onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      {/* Over Learn, as something viewed and closed; a chest opened in it takes the whole screen. */}
      <RootStack.Screen name="Quests" options={{ presentation: 'fullScreenModal' }}>
        {({ navigation }) => <QuestsScreen place="learn" onDone={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="WordSet" options={card}>
        {/* A link to a set this version lacks opens the list of sets instead. */}
        {({ route, navigation }) =>
          isWordSetId(route.params.set) ? (
            <WordSetScreen set={route.params.set} script={route.params.script} onExit={backFrom(navigation)} />
          ) : (
            <WordsScreen onExit={backFrom(navigation)} />
          )
        }
      </RootStack.Screen>
      <RootStack.Screen name="Saved" options={card}>
        {({ navigation }) => (
          <GuestWall reason="save" onBack={backFrom(navigation)}>
            <SavedScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Tags" options={card}>
        {({ navigation }) => (
          <GuestWall reason="profile" onBack={backFrom(navigation)}>
            <TagsScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="ChangeUsername" options={card}>
        {({ navigation }) => (
          <GuestWall reason="profile" onBack={backFrom(navigation)}>
            <ChangeUsernameScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="ChangePassword" options={card}>
        {({ navigation }) => (
          <GuestWall onBack={backFrom(navigation)}>
            <ChangePasswordScreen onExit={backFrom(navigation)} onSetPassword={(email) => navigation.navigate('ForgotPassword', { email })} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Devices" options={card}>
        {({ navigation }) => (
          <GuestWall onBack={backFrom(navigation)}>
            <DevicesScreen onExit={backFrom(navigation)} />
          </GuestWall>
        )}
      </RootStack.Screen>
      <RootStack.Screen name="ForgotPassword" options={card}>
        {({ route, navigation }) => <ForgotPasswordForm email={route.params?.email} onBack={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="Library" options={card}>
        {({ navigation }) => <LibraryScreen onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      <RootStack.Screen name="LibraryPost" options={card}>
        {({ route, navigation }) => <LibraryPostScreen postId={route.params.postId} onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      {/* A guest's two ways to an account, over the app: claiming this one, or signing in to another. Both close once the session belongs to an account. */}
      <RootStack.Screen name="ClaimAccount" options={{ presentation: 'fullScreenModal' }}>
        {({ navigation }) => (
          <ClaimAccountScreen
            presented
            onExit={backFrom(navigation)}
            onSignIn={(email) => navigation.navigate('SignIn', email ? { email } : undefined)}
            onForgotPassword={(email) => navigation.navigate('ForgotPassword', { email })}
          />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="SignIn" options={{ presentation: 'fullScreenModal' }}>
        {({ route, navigation }) => <SignInModal email={route.params?.email} onExit={backFrom(navigation)} />}
      </RootStack.Screen>
      </RootStack.Navigator>
      {/* Push notifications shown while the app is open, and tapped ones routed where they belong. */}
      <PushHost />
      {/* Over every screen: an invite to play waits here until answered. */}
      <InviteBanner />
      {/* Over every screen: an arriving gift, a warning to read once. */}
      <SocialOverlays />
      </AccountGateProvider>
      </BadgeCelebrationHost>
      </UnreadProvider>
    </RealtimeProvider>
  );
}

function Root() {
  const { status, user, ageStop, suspension, clearSuspension, baseUrl } = useAuth();
  const onboarding = useOnboarding();
  const reduceMotion = useReducedMotion();
  const { colors } = useTheme();

  // A link opened before the signed-in screens exist waits for them; the launch link only for the first screens
  // (navigation/heldLink).
  const [keepLaunchLink] = useState(launchLinkKeeper);
  const holding = linkHolding(status, user);
  useEffect(() => {
    if (status === 'restoring') return;
    if (keepLaunchLink(holding)) void Linking.getInitialURL().then((url) => holdLink(url, linking.prefixes));
    if (holding === 'none') return;
    const sub = Linking.addEventListener('url', ({ url }) => holdLink(url, linking.prefixes));
    return () => sub.remove();
  }, [status, holding, keepLaunchLink]);

  if (status === 'restoring' || !onboarding.ready) {
    return <LaunchScreen />;
  }

  // Refused at sign-in or refresh because the account is suspended: show the reasons and how to request a review.
  if (status === 'signedOut' && suspension) {
    return (
      <Entrance>
        <SuspensionScreen details={suspension} baseUrl={baseUrl} onBack={clearSuspension} />
      </Entrance>
    );
  }

  // Stopped at age (no account made, or one just closed): only the explanation, for as long as the app is open, with
  // no sign-up form to try a different year on.
  if (status === 'signedOut' && ageStop) {
    return (
      <Entrance>
        <AgeStopScreen kind={ageStop} />
      </Entrance>
    );
  }

  if (status === 'signedOut') {
    // First launch shows the intro before the auth screens.
    if (onboarding.needsOnboarding) {
      return (
        <Entrance>
          <OnboardingScreen onComplete={onboarding.complete} initialStep={onboarding.reopenStep} />
        </Entrance>
      );
    }
    return (
      <Entrance>
      <AuthStack.Navigator
        initialRouteName={AUTH_INITIAL_ROUTE}
        // Sign-in screens slide like the rest of the app, except under Reduce Motion.
        screenOptions={stackOptions(reduceMotion, colors.background)}
        // Each form once: "Create account" and "Sign in" go back to the other form rather than stacking it again.
        UNSTABLE_router={authRouter}
      >
        {/* Welcome's back walks into the intro: choice → notifications → welcome → language. */}
        <AuthStack.Screen name="Welcome">
          {(props) => <WelcomeScreen {...props} onBack={() => onboarding.reopen('notifications')} />}
        </AuthStack.Screen>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
        <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      </AuthStack.Navigator>
      </Entrance>
    );
  }

  // A signed-in but unverified account cannot reach the app until it enters the emailed code.
  if (user && !user.emailVerified) {
    return (
      <Entrance>
        <VerifyEmailScreen />
      </Entrance>
    );
  }

  // Then the birth month, asked once of an account without one (a Google or Apple sign-up, or an older account),
  // since what the account may do depends on it.
  if (user?.birthDateRequired === true) {
    return (
      <Entrance>
        <BirthDatePromptScreen />
      </Entrance>
    );
  }

  return (
    <Entrance>
      <SignedInRoot />
      <OpenHeldLink />
      {/* The one-time rating box (and rarely the store's prompt) after a finished game. */}
      <GameFeedbackHost />
      {/* Shown once: owned shop items have new art and can be returned. */}
      <RefreshedNotice />
    </Entrance>
  );
}

/** NavigationContainer and StatusBar wired to the active palette. */
function ThemedNavigation() {
  const { colors, scheme } = useTheme();
  const navigation = useNavigationContainerRef<RootStackParamList>();
  const offline = useMaintenance() !== null;
  /*
   * Back from maintenance (src/maintenance): screens fetch what they show as they open, and those under the notice
   * kept the refusal, so they are remounted from their navigation state; the person stays where they were with
   * everything fetched again.
   */
  const [opened, setOpened] = useState<{ round: number; state?: InitialState }>({ round: 0 });
  useEffect(
    () =>
      onMaintenanceOver(() =>
        setOpened((o) => ({ round: o.round + 1, state: navigation.isReady() ? navigation.getRootState() : undefined })),
      ),
    [navigation],
  );
  // The open screen, for crash reports: the route name only, never its params.
  const onScreen = () => noteScreen(navigation.getCurrentRoute()?.name);
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme: Theme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.background,
      primary: colors.primary,
      text: colors.textPrimary,
      border: colors.glassBorder,
    },
  };
  return (
    <NavigationContainer key={opened.round} ref={navigation} initialState={opened.state} linking={linking} theme={navTheme} onReady={onScreen} onStateChange={onScreen}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        {/*
          Inside the container and around the screens only: the fallback needs the palette and translator, and recovery
          should re-enter the navigator at its initial route, not the screen that threw. The offline banner stays outside to
          survive the crash screen. During maintenance the notice is all there is, for screen readers too.
        */}
        <View style={{ flex: 1 }} importantForAccessibility={offline ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={offline}>
          <AppErrorBoundary>
            <Root />
          </AppErrorBoundary>
        </View>
        {/* Over every screen, the crash screen included: maintenance. */}
        <MaintenanceScreen />
        <OfflineBanner />
        {/* Short notices, such as a change that did not save. */}
        <NoticeToasts />
        {/* What every "⋯" opens on Android and the web (theme/actionSheet.ts). */}
        <ActionSheetHost />
      </View>
    </NavigationContainer>
  );
}

/** The whole window, for the gaze area round everything. */
const rootStyle = { flex: 1 } as const;

export default function App() {
  // Lesson audio plays with the ring switch on, from the first word, not only after a first recording.
  useEffect(() => {
    void prepareAudioSession();
  }, []);
  return (
    <SafeAreaProvider>
      {/* The characters' eyes follow a finger anywhere in the app; it only listens, taking no touches. */}
      <GazeArea style={rootStyle}>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              {/* Admin-replaced art, loaded from the first screen on. */}
              <ArtOverridesLoader />
              {/* The letter widget's token, made at sign-in and removed at any sign-out, outside the screens so none is missed. */}
              <LetterWidgetSync />
              <EventThemeProvider>
                <ThemedNavigation />
              </EventThemeProvider>
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </GazeArea>
    </SafeAreaProvider>
  );
}
