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
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TabScreen } from './src/screens/TabScreen';
import { LessonPlayerScreen } from './src/lesson/LessonPlayerScreen';
import { PracticeScreen } from './src/practice/PracticeScreen';
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
            ) : (
              <TabScreen tab={tab} />
            )
          }
        </Tab.Screen>
      ))}
    </Tab.Navigator>
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
    <AuthProvider>
      <NavigationContainer linking={linking}>
        <StatusBar style="auto" />
        <Root />
      </NavigationContainer>
    </AuthProvider>
  );
}
