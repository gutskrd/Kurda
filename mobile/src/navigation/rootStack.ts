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
  Settings: undefined;
  Wordle: undefined;
  /** An id when an invite link opened it; nothing when you came to make one. */
  WordleBattle: { id?: string } | undefined;
  Rhyme: undefined;
  Race: undefined;
  /** An id when an invite link opened it; nothing when you came to make one. */
  RhymeMatch: { id?: string } | undefined;
  Memes: undefined;
  MemeDetail: { postId: string };
  PostPicture: undefined;
  Tags: undefined;
  ChangeUsername: undefined;
  Library: undefined;
  Saved: undefined;
  EditProfile: undefined;
  LibraryPost: { postId: string };
  LibraryCompose: undefined;
};

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;
