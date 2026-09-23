import { NavigationContainer, DefaultTheme, DarkTheme, useNavigation, type LinkingOptions, type Theme } from '@react-navigation/native';
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
import { TABS, linkingScreens } from './src/navigation/tabs';
import { GlassTabBar } from './src/navigation/GlassTabBar';
import { MenuProvider, SideMenu, type MenuGroup } from './src/navigation/SideMenu';
import { Entrance, LaunchScreen } from './src/navigation/LaunchScreen';
import type { RootNavigation, RootStackParamList } from './src/navigation/rootStack';
import { ForgotPasswordScreen } from './src/screens/auth/ForgotPasswordScreen';
import { WelcomeScreen } from './src/screens/auth/WelcomeScreen';
import { VerifyEmailScreen } from './src/screens/auth/VerifyEmailScreen';
import { CivakScreen } from './src/feed/CivakScreen';
import { SavedScreen } from './src/feed/SavedScreen';
import { EditProfileScreen } from './src/profile/EditProfileScreen';
import { LoginScreen } from './src/screens/auth/LoginScreen';
import { RegisterScreen } from './src/screens/auth/RegisterScreen';
import { LearnScreen } from './src/screens/LearnScreen';
import { DictionaryScreen } from './src/screens/DictionaryScreen';
import { PlayScreen } from './src/screens/PlayScreen';
import { GameScreen } from './src/screens/GameScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TabScreen } from './src/screens/TabScreen';
import { LessonPlayerScreen } from './src/lesson/LessonPlayerScreen';
import { PracticeScreen } from './src/practice/PracticeScreen';
import { ShopScreen } from './src/shop/ShopScreen';
import { LeagueScreen } from './src/leagues/LeagueScreen';
import { SocialScreen } from './src/social/SocialScreen';
import { PublicProfileScreen } from './src/social/PublicProfileScreen';
import { ChatScreen } from './src/chat/ChatScreen';
import { ChatListScreen } from './src/chat/ChatListScreen';
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
import { WordleScreen } from './src/wordle/WordleScreen';
import { WordleBattleScreen } from './src/wordle/WordleBattleScreen';
import { RhymeTrainingScreen } from './src/rhyme/RhymeTrainingScreen';
import { RhymeMatchScreen } from './src/rhyme/RhymeMatchScreen';
import { RaceScreen } from './src/race/RaceScreen';
import { MemeFeedScreen } from './src/memes/MemeFeedScreen';
import { MemeDetailScreen } from './src/memes/MemeDetailScreen';
import { PostPictureScreen } from './src/memes/PostPictureScreen';
import { TagsScreen } from './src/tags/TagsScreen';
import { ChangeUsernameScreen } from './src/username/ChangeUsernameScreen';
import { LibraryScreen } from './src/library/LibraryScreen';
import { LibraryPostScreen } from './src/library/LibraryPostScreen';
import { LibraryComposeScreen } from './src/library/LibraryComposeScreen';
import { NotificationsScreen } from './src/notifications/NotificationsScreen';
import { NotificationCenterScreen } from './src/notifications/NotificationCenterScreen';
import { ChallengeListener } from './src/challenge/ChallengeListener';

const Tab = createBottomTabNavigator();
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
 * mykurda.com is listed so the web invite URL matches, but a browser will not
 * hand it over until the two association files exist — apple-app-site-association
 * (needs the Apple team id) and assetlinks.json (needs the signing certificate's
 * SHA-256), both served from the site's /.well-known/. Until then a tapped link
 * opens the website and `kurda://` still works.
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'kurda://', 'https://mykurda.com'],
  config: {
    screens: {
      Tabs: { screens: linkingScreens() },
      Lesson: 'lesson/:lessonId',
      Practice: 'practice',
      WordleBattle: inviteRoutePath('wordle-battle'),
      RhymeMatch: inviteRoutePath('rhyme-match'),
    },
  },
};

/**
 * Everywhere the tab bar has no room for.
 *
 * Six tabs is already one more than iOS suggests, and the app has thirty-three
 * screens. Most of the rest were reachable only by going Profile → a row, or
 * Settings → a row — and two of them, the library and the memes, had no link
 * pointing at them from anywhere at all. They were built, they work, and there
 * was no way in.
 */
function useMenuGroups(navigation: RootNavigation): MenuGroup[] {
  return [
    {
      titleKey: null,
      links: [
        { key: 'chats', labelKey: 'nav.messages', icon: 'chat', onPress: () => navigation.navigate('Chats') },
        { key: 'clubs', labelKey: 'groups.discover', icon: 'people', onPress: () => navigation.navigate('Clubs') },
      ],
    },
    {
      titleKey: 'nav.menu.discover',
      links: [
        { key: 'library', labelKey: 'library.title', icon: 'book', onPress: () => navigation.navigate('Library') },
        { key: 'memes', labelKey: 'memes.title', icon: 'image', onPress: () => navigation.navigate('Memes') },
        { key: 'events', labelKey: 'events.title', icon: 'star', onPress: () => navigation.navigate('EventQuests') },
        { key: 'league', labelKey: 'rankings.title', icon: 'trophy', onPress: () => navigation.navigate('League') },
      ],
    },
    {
      titleKey: 'nav.menu.yours',
      links: [
        { key: 'saved', labelKey: 'saved.title', icon: 'bookmark', onPress: () => navigation.navigate('Saved') },
        { key: 'tags', labelKey: 'tags.title', icon: 'star', onPress: () => navigation.navigate('Tags') },
        { key: 'shop', labelKey: 'profile.shop', icon: 'cart', onPress: () => navigation.navigate('Shop') },
        { key: 'settings', labelKey: 'settings.title', icon: 'gear', onPress: () => navigation.navigate('Settings') },
      ],
    },
  ];
}

function SignedInTabs() {
  const navigation = useNavigation<RootNavigation>();
  const groups = useMenuGroups(navigation);
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  return (
    <MenuProvider value={openMenu}>
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        /*
         * Tabs cross-fade; they do not cut.
         *
         * The default is no animation at all — one screen is replaced by
         * another between two frames, which reads as a flicker rather than as
         * a move. The app this was measured against dissolves one into the
         * other, and both are on screen together in the middle of it.
         *
         * 200ms, measured off a screen recording at 50ms granularity: the old
         * tab is whole at one sample, both are half there at the next, and the
         * new one is whole at the one after.
         */
        animation: 'fade',
        transitionSpec: { animation: 'timing', config: { duration: 200 } },
      }}
      // custom frosted-glass island with labels + a sliding active highlight
      tabBar={(props) => <GlassTabBar {...props} />}
    >
      {TABS.map((tab) => (
        <Tab.Screen key={tab.name} name={tab.name}>
          {() =>
            tab.name === 'Civak' ? (
              <CivakScreen />
            ) : tab.name === 'Profile' ? (
              <ProfileScreen />
            ) : tab.name === 'Learn' ? (
              <LearnScreen />
            ) : tab.name === 'Dictionary' ? (
              <DictionaryScreen />
            ) : tab.name === 'Play' ? (
              <PlayScreen />
            ) : tab.name === 'Social' ? (
              <SocialScreen />
            ) : (
              <TabScreen tab={tab} />
            )
          }
        </Tab.Screen>
        ))}
      </Tab.Navigator>
      <SideMenu open={menuOpen} onClose={closeMenu} groups={groups} />
    </MenuProvider>
  );
}

function GameRoute({
  roomId,
  onExit,
  onRematch,
  onPractice,
}: {
  roomId: string;
  onExit: () => void;
  onRematch: (roomId: string) => void;
  onPractice: () => void;
}) {
  const { user } = useAuth();
  return (
    <GameScreen
      roomId={roomId}
      selfId={user?.id ?? ''}
      onExit={onExit}
      onRematch={onRematch}
      onPractice={onPractice}
    />
  );
}

function SignedInRoot() {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  return (
    <>
      <PushRegistration />
      <ChallengeListener />
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
      <RootStack.Screen name="Game" options={{ presentation: 'fullScreenModal', gestureEnabled: false }}>
        {({ route, navigation }) => (
          <GameRoute
            roomId={route.params.roomId}
            onExit={() => navigation.goBack()}
            onRematch={(roomId) => navigation.replace('Game', { roomId })}
            onPractice={() => navigation.replace('Practice')}
          />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Shop" options={{ presentation: 'fullScreenModal' }}>
        {({ navigation }) => (
          <ShopScreen onExit={() => navigation.goBack()} onEarnMore={() => navigation.navigate('Tabs')} />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="League" options={{ presentation: 'fullScreenModal' }}>
        {({ navigation }) => <LeagueScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="UserProfile" options={{ presentation: 'card' }}>
        {({ route, navigation }) => (
          <PublicProfileScreen userId={route.params.userId} onExit={() => navigation.goBack()} />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Chat" options={{ presentation: 'card' }}>
        {({ route, navigation }) => (
          <ChatScreen userId={route.params.userId} username={route.params.username} onExit={() => navigation.goBack()} />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="BlockedUsers" options={{ presentation: 'card' }}>
        {({ navigation }) => <BlockedUsersScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      {/* leaving unwinds past the thread: the club is gone from under it */}
      <RootStack.Screen name="GroupMembers" options={{ presentation: 'card' }}>
        {({ route, navigation }) => (
          <GroupMembersScreen
            groupId={route.params.groupId}
            onExit={() => navigation.goBack()}
            onLeft={() => navigation.navigate('Chats')}
          />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Clubs" options={{ presentation: 'card' }}>
        {({ navigation }) => <ClubsScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="GroupThread" options={{ presentation: 'card' }}>
        {({ route, navigation }) => (
          <GroupThreadScreen
            groupId={route.params.groupId}
            name={route.params.name}
            onExit={() => navigation.goBack()}
            onOpenMembers={() => navigation.navigate('GroupMembers', { groupId: route.params.groupId })}
          />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Chats" options={{ presentation: 'card' }}>
        {({ navigation }) => <ChatListScreen onExit={() => navigation.goBack()} />}
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
      <RootStack.Screen name="Memes" options={{ presentation: 'card' }}>
        {({ navigation }) => <MemeFeedScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      {/* a modal, because it is a thing you finish and dismiss, not a place */}
      <RootStack.Screen name="PostPicture" options={{ presentation: 'modal' }}>
        {({ navigation }) => <PostPictureScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="MemeDetail" options={{ presentation: 'card' }}>
        {({ route, navigation }) => <MemeDetailScreen postId={route.params.postId} onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      <RootStack.Screen name="EditProfile" options={{ presentation: 'card' }}>
        {({ navigation }) => <EditProfileScreen onExit={() => navigation.goBack()} />}
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
      <RootStack.Screen name="LibraryCompose" options={{ presentation: 'fullScreenModal' }}>
        {({ navigation }) => <LibraryComposeScreen onExit={() => navigation.goBack()} />}
      </RootStack.Screen>
      </RootStack.Navigator>
    </>
  );
}

function Root() {
  const { status, user } = useAuth();
  const onboarding = useOnboarding();

  if (status === 'restoring' || !onboarding.ready) {
    return <LaunchScreen />;
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

  return (
    <Entrance>
      <SignedInRoot />
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
