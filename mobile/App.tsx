import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  getStateFromPath,
  useNavigation,
  type LinkingOptions,
  type Theme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { inviteRoutePath } from '@kurda/shared';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { AUTH_INITIAL_ROUTE, type AuthStackParamList } from './src/navigation/authStack';
import { TABS, legacyTabPath, linkingScreens } from './src/navigation/tabs';
import { GlassTabBar } from './src/navigation/GlassTabBar';
import { MenuProvider, SideMenu, type MenuGroup } from './src/navigation/SideMenu';
import { SlideProvider, SocialSlide } from './src/social/SocialSlide';
import { Entrance, LaunchScreen } from './src/navigation/LaunchScreen';
import {
  chatRouteId,
  groupThreadRouteId,
  type RootNavigation,
  type RootStackParamList,
  type TabParamList,
} from './src/navigation/rootStack';
import { ForgotPasswordScreen } from './src/screens/auth/ForgotPasswordScreen';
import { WelcomeScreen } from './src/screens/auth/WelcomeScreen';
import { VerifyEmailScreen } from './src/screens/auth/VerifyEmailScreen';
import { BirthDatePromptScreen } from './src/screens/auth/BirthDatePromptScreen';
import { AgeStopScreen } from './src/screens/auth/AgeStopScreen';
import { CivakScreen } from './src/feed/CivakScreen';
import { SavedScreen } from './src/feed/SavedScreen';
import { EditProfileScreen } from './src/profile/EditProfileScreen';
import { LoginScreen } from './src/screens/auth/LoginScreen';
import { RegisterScreen } from './src/screens/auth/RegisterScreen';
import { LearnScreen } from './src/learn/LearnScreen';
import { DictionaryScreen } from './src/screens/DictionaryScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { LessonPlayerScreen } from './src/lesson/LessonPlayerScreen';
import { PracticeScreen } from './src/practice/PracticeScreen';
import { ShopScreen } from './src/shop/ShopScreen';
import { GameFeedbackHost } from './src/feedback/GameFeedbackHost';
import { RefreshedNotice } from './src/shop/RefreshedItems';
import { LeagueScreen } from './src/leagues/LeagueScreen';
import { RanksScreen } from './src/ranks/RanksScreen';
import { SeasonScreen } from './src/ranks/SeasonScreen';
import { BadgesScreen } from './src/badges/BadgesScreen';
import { BadgeCelebrationHost } from './src/badges/BadgeCelebrationHost';
import { SocialScreen } from './src/social/SocialScreen';
import { SearchScreen } from './src/search/SearchScreen';
import { MessagesScreen } from './src/messages/MessagesScreen';
import { FriendRequestsScreen } from './src/messages/FriendRequestsScreen';
import { UnreadProvider, useUnread } from './src/messages/unread';
import { unreadBadge } from './src/notifications/inbox';
import { PublicProfileScreen } from './src/social/PublicProfileScreen';
import { ChatScreen } from './src/chat/ChatScreen';
import { GroupThreadScreen } from './src/groups/GroupThreadScreen';
import { ClubsScreen } from './src/groups/ClubsScreen';
import { GroupMembersScreen } from './src/groups/GroupMembersScreen';
import { PushRegistration } from './src/push/PushRegistration';
import { EventQuestsScreen } from './src/events/EventQuestsScreen';
import { EventThemeProvider } from './src/theme/EventThemeContext';
import { I18nProvider } from './src/i18n/I18nContext';
import { OnboardingScreen, useOnboarding } from './src/onboarding/OnboardingScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { useReducedMotion } from './src/a11y/useReducedMotion';
import { OfflineBanner } from './src/net/OfflineBanner';
import { AppErrorBoundary } from './src/errors/AppErrorBoundary';
import { AppearanceScreen } from './src/screens/AppearanceScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { BlockedUsersScreen } from './src/social/BlockedUsersScreen';
import { MyReportsScreen } from './src/reports/MyReportsScreen';
import { AccountStandingScreen } from './src/reports/AccountStandingScreen';
import { SuspensionScreen } from './src/reports/SuspensionScreen';
import { SocialOverlays } from './src/reports/SocialOverlays';
import { WordleScreen } from './src/wordle/WordleScreen';
import { WordleBattleScreen } from './src/wordle/WordleBattleScreen';
import { RhymeTrainingScreen } from './src/rhyme/RhymeTrainingScreen';
import { RhymeMatchScreen } from './src/rhyme/RhymeMatchScreen';
import { RaceScreen } from './src/race/RaceScreen';
import { MemeFeedScreen } from './src/memes/MemeFeedScreen';
import { MemeDetailScreen } from './src/memes/MemeDetailScreen';
import { TagsScreen } from './src/tags/TagsScreen';
import { ChangeUsernameScreen } from './src/username/ChangeUsernameScreen';
import { LibraryScreen } from './src/library/LibraryScreen';
import { LibraryPostScreen } from './src/library/LibraryPostScreen';
import { ComposeScreen } from './src/composer/ComposeScreen';
import { StoriesHubScreen } from './src/stories/StoriesHubScreen';
import { StoryReaderScreen } from './src/stories/StoryReaderScreen';
import { StoryGameScreen } from './src/stories/StoryGameScreen';
import { NotificationsScreen } from './src/notifications/NotificationsScreen';
import { NotificationCenterScreen } from './src/notifications/NotificationCenterScreen';
import { RealtimeProvider } from './src/realtime/RealtimeProvider';
import { InviteBanner } from './src/play/InviteBanner';

const Tab = createBottomTabNavigator<TabParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

/**
 * Where a link opened from outside the app lands.
 *
 * The game routes are the ones somebody else sends you. Their paths come from
 * `inviteRoutePath` rather than being written here, because the string has to
 * be the same one `buildInviteUrl` puts in the message — a link the app sent
 * and then failed to recognise is the failure nobody tests, since it only
 * happens on the *other* person's phone.
 *
 * `?id=…` needs no `:param`: React Navigation passes query parameters through
 * as route params, which is why both screens take an optional `id`.
 *
 * hevalo.app is listed so the web invite URL matches, but a browser will not
 * hand it over until the two association files exist — apple-app-site-association
 * (needs the Apple team id) and assetlinks.json (needs the signing certificate's
 * SHA-256), both served from the site's /.well-known/. Until then a tapped link
 * opens the website and `hevalo://` still works.
 */
const linking: LinkingOptions<RootStackParamList> = {
  // `hevalo://` is the scheme app.json registers; this said `kurda://`, which
  // no phone hands to the app
  prefixes: [Linking.createURL('/'), 'hevalo://', 'https://hevalo.app'],
  /*
   * Addresses from before the tabs changed — `hevalo://play`, `hevalo://inbox`,
   * the website's `/app/games` — are rewritten to where those things are now
   * before they are read (navigation/tabs.ts, `legacyTabPath`).
   */
  getStateFromPath: (path, options) => getStateFromPath(legacyTabPath(path), options),
  config: {
    screens: {
      // `?view=games` on Learn arrives as the tab's own param
      Tabs: { screens: linkingScreens() },
      // a shared profile (Profile → Share) opens in the app for anyone who has it
      UserProfile: 'app/users/:userId',
      Lesson: 'lesson/:lessonId',
      Practice: 'practice',
      WordleBattle: inviteRoutePath('wordle-battle'),
      RhymeMatch: inviteRoutePath('rhyme-match'),
      // `/app/games/stories?id=…` is a game to join; without an id it is the hub
      Stories: inviteRoutePath('stories'),
      StoryReader: 'app/games/stories/:slug',
    },
  },
};

/**
 * The profile's menu: everywhere the tab bar has no room for.
 *
 * Five tabs, and the app has more than thirty screens. The ones that are
 * places of your own or ways to look around — the shop, settings, what you
 * saved, the library, the memes, the league — are here, one tap from the
 * profile, which is where somebody looks for "my stuff".
 *
 * `giftBadge` is the count of gifts you have not opened, on the Shop row
 * where the gifts are: a gift that arrives silently may as well not have
 * arrived. The same count puts a dot on the Profile tab and on this menu's
 * button.
 */
function useMenuGroups(navigation: RootNavigation): MenuGroup[] {
  const giftBadge = unreadBadge(useUnread().counts.gifts) ?? undefined;
  return [
    {
      titleKey: null,
      links: [
        { key: 'friends', labelKey: 'nav.friends', icon: 'people', onPress: () => navigation.navigate('Friends') },
        { key: 'clubs', labelKey: 'groups.discover', icon: 'people', onPress: () => navigation.navigate('Clubs') },
      ],
    },
    {
      titleKey: 'nav.menu.discover',
      links: [
        { key: 'library', labelKey: 'library.title', icon: 'book', onPress: () => navigation.navigate('Library') },
        { key: 'memes', labelKey: 'memes.title', icon: 'image', onPress: () => navigation.navigate('Memes') },
        { key: 'events', labelKey: 'events.title', icon: 'star', onPress: () => navigation.navigate('EventQuests') },
        { key: 'league', labelKey: 'leagues.screenTitle', icon: 'trophy', onPress: () => navigation.navigate('League') },
        { key: 'ranks', labelKey: 'ranks.title', icon: 'mountains', onPress: () => navigation.navigate('Ranks') },
      ],
    },
    {
      titleKey: 'nav.menu.yours',
      links: [
        { key: 'saved', labelKey: 'saved.title', icon: 'bookmark', onPress: () => navigation.navigate('Saved') },
        { key: 'badges', labelKey: 'badges.title', icon: 'medal', onPress: () => navigation.navigate('Badges') },
        { key: 'tags', labelKey: 'tags.title', icon: 'star', onPress: () => navigation.navigate('Tags') },
        { key: 'shop', labelKey: 'profile.shop', icon: 'cart', badge: giftBadge, onPress: () => navigation.navigate('Shop') },
        { key: 'settings', labelKey: 'settings.title', icon: 'gear', onPress: () => navigation.navigate('Settings') },
      ],
    },
  ];
}


function SignedInTabs() {
  const navigation = useNavigation<RootNavigation>();
  const groups = useMenuGroups(navigation);
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const [slideOpen, setSlideOpen] = useState(false);
  const openSlide = useCallback(() => setSlideOpen(true), []);
  const closeSlide = useCallback(() => setSlideOpen(false), []);
  return (
    <MenuProvider value={openMenu}>
    <SlideProvider value={openSlide}>
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        /*
         * Tabs cross-fade; they do not cut. With no animation one screen is
         * replaced by another between two frames, which reads as a flicker
         * rather than as a move. 200ms, and nothing at all for somebody who
         * has asked for less motion.
         */
        animation: reduceMotion ? 'none' : 'fade',
        transitionSpec: { animation: 'timing', config: { duration: 200 } },
      }}
      // the floating island: icons, labels, the badges and a sliding pill
      tabBar={(props) => <GlassTabBar {...props} />}
    >
      {/* in the order TABS gives, which is the order the tests hold it to */}
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
              ) : tab.name === 'Search' ? (
                <SearchScreen />
              ) : (
                <ProfileScreen />
              )
            }
          </Tab.Screen>
        ),
      )}
    </Tab.Navigator>
      {/* the profile's menu comes in from the end, the side its button is on */}
      <SideMenu open={menuOpen} onClose={closeMenu} groups={groups} side="end" />
      {/* your people, opened by Messages' new-message button: tap a friend to write to them */}
      <SocialSlide open={slideOpen} onClose={closeSlide} />
    </SlideProvider>
    </MenuProvider>
  );
}

function SignedInRoot() {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  return (
    <RealtimeProvider>
      {/* the badges' counts, for the tab bar, Home's bell and the profile's menu */}
      <UnreadProvider>
      <PushRegistration />
      {/* a badge just earned has its moment over whatever screen is up, once a game's own result has had its turn */}
      <BadgeCelebrationHost>
      <RootStack.Navigator
        screenOptions={{
          headerShown: false,
          // scene paints the theme background during the push/pop so a transition
          // never flashes a white frame; reduced-motion disables the slide entirely.
          contentStyle: { backgroundColor: colors.background },
          animation: reduceMotion ? 'none' : 'default',
        }}
      >
        <RootStack.Screen name="Tabs" component={SignedInTabs} />
      <RootStack.Screen name="Lesson" options={{ presentation: 'fullScreenModal' }}>
        {({ route, navigation }) => (
          <LessonPlayerScreen lessonId={route.params.lessonId} onExit={() => navigation.goBack()} />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Practice" options={{ presentation: 'fullScreenModal' }}>
        {({ navigation }) => <PracticeScreen navigation={navigation} onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Shop" options={{ presentation: 'fullScreenModal' }}>
        {({ navigation }) => (
          // Zêr is earned by learning, so "earn more" opens the lessons
          <ShopScreen
            onExit={() => navigation.goBack()}
            onEarnMore={() => navigation.navigate('Tabs', { screen: 'Learn', params: { view: 'lessons' } })}
          />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="League" options={{ presentation: 'fullScreenModal' }}>
        {({ navigation }) => <LeagueScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Ranks" options={{ presentation: 'card' }}>
        {({ route, navigation }) => <RanksScreen game={route.params?.game} onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Season" options={{ presentation: 'card' }}>
        {({ navigation }) => <SeasonScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Badges" options={{ presentation: 'card' }}>
        {({ navigation }) => <BadgesScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="UserProfile" options={{ presentation: 'card' }}>
        {({ route, navigation }) => (
          <PublicProfileScreen userId={route.params.userId} onExit={() => navigation.goBack()} />
        )}
      </RootStack.Screen>
      {/* one route per person and per group (rootStack.chatRouteId) */}
      <RootStack.Screen name="Chat" options={{ presentation: 'card' }} getId={chatRouteId}>
        {({ route, navigation }) => (
          <ChatScreen
            userId={route.params.userId}
            username={route.params.username}
            openGift={route.params.openGift}
            onExit={() => navigation.goBack()}
          />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="BlockedUsers" options={{ presentation: 'card' }}>
        {({ navigation }) => <BlockedUsersScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="MyReports" options={{ presentation: 'card' }}>
        {({ navigation }) => <MyReportsScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="AccountStanding" options={{ presentation: 'card' }}>
        {({ navigation }) => <AccountStandingScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      {/* leaving unwinds past the thread: the club is gone from under it */}
      <RootStack.Screen name="GroupMembers" options={{ presentation: 'card' }}>
        {({ route, navigation }) => (
          <GroupMembersScreen
            groupId={route.params.groupId}
            onExit={() => navigation.goBack()}
            onLeft={() => navigation.navigate('Tabs', { screen: 'Messages' })}
          />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Clubs" options={{ presentation: 'card' }}>
        {({ navigation }) => <ClubsScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="GroupThread" options={{ presentation: 'card' }} getId={groupThreadRouteId}>
        {({ route, navigation }) => (
          <GroupThreadScreen
            groupId={route.params.groupId}
            name={route.params.name}
            openGift={route.params.openGift}
            onLeft={() => navigation.navigate('Tabs', { screen: 'Messages' })}
            onExit={() => navigation.goBack()}
            onOpenMembers={() => navigation.navigate('GroupMembers', { groupId: route.params.groupId })}
          />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="FriendRequests" options={{ presentation: 'card' }}>
        {({ navigation }) => <FriendRequestsScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="EventQuests" options={{ presentation: 'card' }}>
        {({ navigation }) => <EventQuestsScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Notifications" options={{ presentation: 'card' }}>
        {({ navigation }) => <NotificationsScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="NotificationCenter" options={{ presentation: 'card' }}>
        {({ navigation }) => <NotificationCenterScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Appearance" options={{ presentation: 'card' }}>
        {({ navigation }) => <AppearanceScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Settings" options={{ presentation: 'card' }}>
        {({ navigation }) => <SettingsScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Wordle" options={{ presentation: 'card' }}>
        {({ navigation }) => <WordleScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="WordleBattle" options={{ presentation: 'card' }}>
        {({ route, navigation }) => (
          <WordleBattleScreen id={route.params?.id} onExit={() => navigation.goBack()} />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Rhyme" options={{ presentation: 'card' }}>
        {({ navigation }) => <RhymeTrainingScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="RhymeMatch" options={{ presentation: 'card' }}>
        {({ route, navigation }) => (
          <RhymeMatchScreen id={route.params?.id} onExit={() => navigation.goBack()} />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Race" options={{ presentation: 'card' }}>
        {({ navigation }) => <RaceScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Stories" options={{ presentation: 'card' }}>
        {({ route, navigation }) => <StoriesHubScreen id={route.params?.id} onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="StoryReader" options={{ presentation: 'card' }}>
        {({ route, navigation }) => <StoryReaderScreen slug={route.params.slug} onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      {/* a game is not left by a swipe that was meant to scroll the story */}
      <RootStack.Screen name="StoryGame" options={{ presentation: 'card', gestureEnabled: false }}>
        {({ route, navigation }) => <StoryGameScreen key={route.params.id} id={route.params.id} onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Memes" options={{ presentation: 'card' }}>
        {({ navigation }) => <MemeFeedScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      {/*
        Writing a post — words, pictures or both — and editing one. Full screen
        and without the swipe-down: the composer asks before it lets go of
        something written. PostPicture and LibraryCompose are the two old ways
        in, kept as names so anything still pointing at them lands here.
      */}
      <RootStack.Screen name="Compose" options={{ presentation: 'fullScreenModal', gestureEnabled: false }}>
        {({ route, navigation }) => (
          <ComposeScreen
            postId={route.params?.postId}
            startWithPictures={route.params?.pickPictures}
            asMeme={route.params?.meme}
            onExit={() => navigation.goBack()}
          />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="PostPicture" options={{ presentation: 'fullScreenModal', gestureEnabled: false }}>
        {({ navigation }) => <ComposeScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="MemeDetail" options={{ presentation: 'card' }}>
        {({ route, navigation }) => <MemeDetailScreen postId={route.params.postId} onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="EditProfile" options={{ presentation: 'card' }}>
        {({ navigation }) => <EditProfileScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Friends" options={{ presentation: 'card' }}>
        {({ navigation }) => <SocialScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Dictionary" options={{ presentation: 'card' }}>
        {({ navigation }) => <DictionaryScreen onBack={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Saved" options={{ presentation: 'card' }}>
        {({ navigation }) => <SavedScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Tags" options={{ presentation: 'card' }}>
        {({ navigation }) => <TagsScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="ChangeUsername" options={{ presentation: 'card' }}>
        {({ navigation }) => <ChangeUsernameScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="Library" options={{ presentation: 'card' }}>
        {({ navigation }) => <LibraryScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="LibraryPost" options={{ presentation: 'card' }}>
        {({ route, navigation }) => <LibraryPostScreen postId={route.params.postId} onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="LibraryCompose" options={{ presentation: 'fullScreenModal', gestureEnabled: false }}>
        {({ navigation }) => <ComposeScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      </RootStack.Navigator>
      {/* over every screen: an invite to play waits here until it is answered */}
      <InviteBanner />
      {/* over every screen: a gift that arrives, a warning to read once */}
      <SocialOverlays />
      </BadgeCelebrationHost>
      </UnreadProvider>
    </RealtimeProvider>
  );
}

function Root() {
  const { status, user, ageStop, suspension, clearSuspension, baseUrl } = useAuth();
  const onboarding = useOnboarding();

  if (status === 'restoring' || !onboarding.ready) {
    return <LaunchScreen />;
  }

  // Refused at sign-in or refresh because the account is suspended: the reasons
  // and a way to ask for a review, instead of a sign-in form that cannot work.
  if (status === 'signedOut' && suspension) {
    return (
      <Entrance>
        <SuspensionScreen details={suspension} baseUrl={baseUrl} onBack={clearSuspension} />
      </Entrance>
    );
  }

  // An answer that stopped at age — no account made, or one just closed —
  // leaves only the explanation for as long as the app is open: no sign-up
  // form to try a different year on.
  if (status === 'signedOut' && ageStop) {
    return (
      <Entrance>
        <AgeStopScreen kind={ageStop} />
      </Entrance>
    );
  }

  if (status === 'signedOut') {
    // first launch: show the intro before the auth screens (KUR-271/272/273)
    if (onboarding.needsOnboarding) {
      return (
        <Entrance>
          <OnboardingScreen onComplete={onboarding.complete} initialStep={onboarding.reopenStep} />
        </Entrance>
      );
    }
    return (
      <Entrance>
      <AuthStack.Navigator initialRouteName={AUTH_INITIAL_ROUTE} screenOptions={{ headerShown: false }}>
        {/* Welcome's back walks into the intro (KUR-271): choice → notifications → welcome → language */}
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

  // Email-ownership gate (KUR-014): a signed-in but unverified account can't
  // reach the app until it enters the emailed code.
  if (user && !user.emailVerified) {
    return (
      <Entrance>
        <VerifyEmailScreen />
      </Entrance>
    );
  }

  // Then the birth month, asked once of an account that has none (a Google or
  // Apple sign-up, or one from before it was asked): what the app lets the
  // account do depends on the answer.
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
      {/* the one-time rating box (and, rarely, the store's own prompt) after a finished game */}
      <GameFeedbackHost />
      {/* once: the shop's items you own have new art, and can be returned */}
      <RefreshedNotice />
    </Entrance>
  );
}

/** NavigationContainer + StatusBar wired to the active palette (KUR-268). */
function ThemedNavigation() {
  const { colors, scheme } = useTheme();
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
    <NavigationContainer linking={linking} theme={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        {/*
          Inside the container, and around the screens only: the fallback needs
          the palette and the translator, and recovering should re-enter the
          navigator at its initial route rather than at the screen that threw.
          The offline banner stays outside so it survives the crash screen.
        */}
        <AppErrorBoundary>
          <Root />
        </AppErrorBoundary>
        <OfflineBanner />
      </View>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <EventThemeProvider>
              <ThemedNavigation />
            </EventThemeProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
