import { NavigationContainer, DefaultTheme, DarkTheme, type LinkingOptions, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import * as Linking from 'expo-linking';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { AUTH_INITIAL_ROUTE, type AuthStackParamList } from './src/navigation/authStack';
import { TABS, linkingScreens } from './src/navigation/tabs';
import { TAB_BAR_HEIGHT, TAB_BAR_MARGIN } from './src/navigation/tabBarLayout';
import type { RootStackParamList } from './src/navigation/rootStack';
import { ForgotPasswordScreen } from './src/screens/auth/ForgotPasswordScreen';
import { WelcomeScreen } from './src/screens/auth/WelcomeScreen';
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
import { PushRegistration } from './src/push/PushRegistration';
import { EventQuestsScreen } from './src/events/EventQuestsScreen';
import { EventThemeProvider } from './src/theme/EventThemeContext';
import { I18nProvider } from './src/i18n/I18nContext';
import { OnboardingScreen, useOnboarding } from './src/onboarding/OnboardingScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { Icon } from './src/theme/Icon';
import { OfflineBanner } from './src/net/OfflineBanner';
import { AppearanceScreen } from './src/screens/AppearanceScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { WordleScreen } from './src/wordle/WordleScreen';
import { NotificationsScreen } from './src/notifications/NotificationsScreen';
import { NotificationCenterScreen } from './src/notifications/NotificationCenterScreen';
import { ChallengeListener } from './src/challenge/ChallengeListener';

const Tab = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'kurda://'],
  config: {
    screens: {
      Tabs: { screens: linkingScreens() },
      Lesson: 'lesson/:lessonId',
      Practice: 'practice',
    },
  },
};

function SignedInTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        // floating glass island: a rounded, translucent bar detached from the
        // edges, icons only. Scrollable tab screens reserve useTabBarInset()
        // bottom space so nothing hides behind it.
        tabBarStyle: {
          position: 'absolute',
          left: TAB_BAR_MARGIN + 8,
          right: TAB_BAR_MARGIN + 8,
          bottom: insets.bottom + TAB_BAR_MARGIN,
          height: TAB_BAR_HEIGHT,
          borderRadius: TAB_BAR_HEIGHT / 2,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.glassBorder,
          // the island is already offset by the safe area (bottom, above); zero
          // the tab bar's own safe-area padding so the icons stay centred and
          // don't leave a gap where the labels used to be.
          paddingBottom: 0,
          paddingTop: 0,
          elevation: 12,
          shadowColor: colors.softShadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.22,
          shadowRadius: 16,
        },
        tabBarItemStyle: { height: TAB_BAR_HEIGHT, paddingVertical: 0 },
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, { borderRadius: TAB_BAR_HEIGHT / 2, overflow: 'hidden' }]}>
            <BlurView intensity={colors.blurIntensity} tint={colors.blurTint} style={StyleSheet.absoluteFill}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
            </BlurView>
          </View>
        ),
      }}
    >
      {TABS.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            // icons only (labels hidden), so name the tab explicitly for
            // screen readers (KUR-266)
            tabBarAccessibilityLabel: tab.title,
            tabBarIcon: ({ focused, color }) => (
              <Icon name={tab.icon} size={26} color={color} style={{ opacity: focused ? 1 : 0.55 }} />
            ),
          }}
        >
          {() =>
            tab.name === 'Profile' ? (
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
  return (
    <>
      <PushRegistration />
      <ChallengeListener />
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
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
      <RootStack.Screen name="Profile" options={{ presentation: 'card' }}>
        {({ route, navigation }) => (
          <PublicProfileScreen userId={route.params.userId} onExit={() => navigation.goBack()} />
        )}
      </RootStack.Screen>
      <RootStack.Screen name="Chat" options={{ presentation: 'card' }}>
        {({ route, navigation }) => (
          <ChatScreen userId={route.params.userId} username={route.params.username} onExit={() => navigation.goBack()} />
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
      </RootStack.Navigator>
    </>
  );
}

function Root() {
  const { status } = useAuth();
  const onboarding = useOnboarding();
  const { colors } = useTheme();

  if (status === 'restoring' || !onboarding.ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (status === 'signedOut') {
    // first launch: show the intro before the auth screens (KUR-271/272/273)
    if (onboarding.needsOnboarding) {
      return <OnboardingScreen onComplete={onboarding.complete} initialStep={onboarding.reopenStep} />;
    }
    return (
      <AuthStack.Navigator initialRouteName={AUTH_INITIAL_ROUTE} screenOptions={{ headerShown: false }}>
        {/* Welcome's back walks into the intro (KUR-271): choice → notifications → welcome → language */}
        <AuthStack.Screen name="Welcome">
          {(props) => <WelcomeScreen {...props} onBack={() => onboarding.reopen('notifications')} />}
        </AuthStack.Screen>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
        <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      </AuthStack.Navigator>
    );
  }

  return <SignedInRoot />;
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
        <Root />
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
