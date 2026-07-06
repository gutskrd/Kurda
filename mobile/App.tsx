import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { Text } from 'react-native';
import { TABS, linkingScreens } from './src/navigation/tabs';
import { TabScreen } from './src/screens/TabScreen';
import { colors } from './src/theme/tokens';

const Tab = createBottomTabNavigator();

const linking = {
  prefixes: [Linking.createURL('/'), 'kurda://'],
  config: { screens: linkingScreens() },
};

export default function App() {
  return (
    <NavigationContainer linking={linking}>
      <StatusBar style="auto" />
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
              title: tab.titleKu,
              tabBarIcon: ({ focused }) => (
                <Text style={{ opacity: focused ? 1 : 0.5 }}>{tab.emoji}</Text>
              ),
            }}
          >
            {() => <TabScreen tab={tab} />}
          </Tab.Screen>
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}
