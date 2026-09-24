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
  /**
   * Somebody else's profile.
   *
   * Not 'Profile': the tab bar already has a route by that name, and
   * react-navigation resolves a name against the nearest navigator first, so
   * navigate('Profile', { userId }) from inside the tabs opened your own
   * profile tab and dropped the id. Which meant nobody could open anybody.
   */
  UserProfile: { userId: string };
  Chat: { userId: string; username: string };
  Chats: undefined;
  GroupThread: { groupId: string; name: string };
  Clubs: undefined;
  GroupMembers: { groupId: string };
  EventQuests: undefined;
  Notifications: undefined;
  NotificationCenter: undefined;
  Appearance: undefined;
  Settings: undefined;
  BlockedUsers: undefined;
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
  Search: undefined;
  Saved: undefined;
  EditProfile: undefined;
  LibraryPost: { postId: string };
  LibraryCompose: undefined;
};

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;
