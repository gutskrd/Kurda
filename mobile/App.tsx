import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { ActivityIndicator, Text, View } from 'react-native';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { AUTH_INITIAL_ROUTE, type AuthStackParamList } from './src/navigation/authStack';
import { TABS, linkingScreens } from './src/navigation/tabs';
import type { RootStackParamList } from './src/navigation/rootStack';
import { ForgotPasswordScreen } from './src/screens/auth/ForgotPasswordScreen';
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
import { EventQuestsScreen } from './src/events/EventQuestsScreen';
import { EventThemeProvider } from './src/theme/EventThemeContext';
import { I18nProvider } from './src/i18n/I18nContext';
import { colors } from './src/theme/tokens';

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
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
      }}
    >
      {TABS.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused }) => (
              <Text style={{ opacity: focused ? 1 : 0.5 }}>{tab.emoji}</Text>
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
    </RootStack.Navigator>
  );
}

function Root() {
  const { status } = useAuth();

  if (status === 'restoring') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (status === 'signedOut') {
    return (
      <AuthStack.Navigator initialRouteName={AUTH_INITIAL_ROUTE} screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
        <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      </AuthStack.Navigator>
    );
  }

  return <SignedInRoot />;
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <EventThemeProvider>
          <NavigationContainer linking={linking}>
            <StatusBar style="auto" />
            <Root />
          </NavigationContainer>
        </EventThemeProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
