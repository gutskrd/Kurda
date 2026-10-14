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
  /**
   * `openGift`: a gift to unwrap as soon as the thread is open (the gift
   * banner and its notification). `username` may be '' when the way in only
   * knew the id — the thread then names them from the messages.
   */
  Chat: { userId: string; username: string; openGift?: string };
  Chats: undefined;
  /** As Chat: `openGift` to unwrap at once; `name` may be '' and is then looked up. */
  GroupThread: { groupId: string; name: string; openGift?: string };
  Clubs: undefined;
  GroupMembers: { groupId: string };
  EventQuests: undefined;
  Notifications: undefined;
  NotificationCenter: undefined;
  Appearance: undefined;
  Settings: undefined;
  BlockedUsers: undefined;
  /** Your reports and what became of them (reports/MyReportsScreen). */
  MyReports: undefined;
  /** What is limited on your account and why, with "Ask for a review" (reports/AccountStandingScreen). */
  AccountStanding: undefined;
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
  Inbox: undefined;
  /*
   * Learn, Dictionary and Play.
   *
   * Tabs until the bar came down to four. They are pushed screens now,
   * opened by the action button above the bar — things you set out to do,
   * rather than places you keep an eye on.
   */
  Friends: undefined;
  Learn: undefined;
  Dictionary: undefined;
  Play: undefined;
  Saved: undefined;
  EditProfile: undefined;
  LibraryPost: { postId: string };
  LibraryCompose: undefined;
};

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * Each conversation is its own route.
 *
 * Without an id, navigating to Chat while a chat is on top only swaps that
 * screen's params: the gift banner's Open, pressed in Rojda's chat for a gift
 * from Azad, turned the same screen into Azad's — with the half-typed message
 * meant for Rojda still in the composer, ready to go to the wrong person. With
 * one, another person's chat (or another group's) is pushed as a screen of its
 * own, and the same person's is brought forward rather than stacked twice.
 */
export const chatRouteId = ({ params }: { params: RootStackParamList['Chat'] }): string => params.userId;
export const groupThreadRouteId = ({ params }: { params: RootStackParamList['GroupThread'] }): string => params.groupId;
