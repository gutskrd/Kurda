import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

/**
 * Root stack sitting above the tab navigator so a lesson can be pushed as a
 * full-screen route over the tabs (KUR-029).
 */
export type RootStackParamList = {
  Tabs: undefined;
  Lesson: { lessonId: string };
  Practice: undefined;
  Game: { roomId: string };
  Shop: undefined;
  League: undefined;
  Profile: { userId: string };
  Chat: { userId: string; username: string };
  Chats: undefined;
  EventQuests: undefined;
  Notifications: undefined;
  NotificationCenter: undefined;
  Appearance: undefined;
};

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;
