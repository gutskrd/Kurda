import type { CompositeNavigationProp, NavigatorScreenParams } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AlphabetScript, PracticeMode, RankedGame } from '@kurda/shared';
import type { LearnView } from './tabs';
import type { SettingsPageKey } from '../settings/SettingsPageScreen';

/**
 * The five tabs and what each can be opened with.
 *
 * Learn takes the view to open on, which is how `hevalo://play` (and anything
 * else that means "the games") lands on Games rather than on the lessons.
 */
export type TabParamList = {
  Home: undefined;
  Learn: { view?: LearnView } | undefined;
  Messages: undefined;
  Search: undefined;
  Profile: undefined;
};

/**
 * Root stack sitting above the tab navigator so a lesson can be pushed as a
 * full-screen route over the tabs (KUR-029).
 */
export type RootStackParamList = {
  /**
   * The tab shell. A screen above it reaches a tab with
   * `navigate('Tabs', { screen: 'Messages' })` — naming the tab alone only
   * works from inside the tabs, since a navigator looks for a name among its
   * own screens and its parents', never its children's.
   */
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /**
   * `courseId`: the course the lesson was opened from, so its results can
   * offer the course's next lesson. A link to a lesson knows no course, and
   * its results simply offer none.
   */
  Lesson: { lessonId: string; courseId?: string };
  /**
   * A practice session, started at once. `exerciseIds`: practise these (a
   * lesson's mistakes, "Practise these now") rather than what is due; `mode`:
   * another kind of practice from the hub, with `unitId` for a unit's review.
   */
  Practice: { exerciseIds?: string[]; mode?: PracticeMode; unitId?: string } | undefined;
  /** Practice's hub: the one thing most worth doing now, and every other kind of practice (practice/PracticeHubScreen). */
  PracticeHub: undefined;
  /** The short test that jumps ahead on the path to `unitId` (coursemap/JumpTestScreen) */
  JumpTest: { courseId: string; unitId: string };
  Shop: undefined;
  League: undefined;
  /** Game Ranks up close: a game's rank, the climb, its boards (the rank cards on Learn → Games open it) */
  Ranks: { game?: RankedGame } | undefined;
  /** The season: days left, its rewards, last season, the frames you own */
  Season: undefined;
  /** Every badge by family, and the three for the profile */
  Badges: undefined;
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
  /** The friend requests waiting on you, opened from the row at the top of Messages. */
  FriendRequests: undefined;
  /** As Chat: `openGift` to unwrap at once; `name` may be '' and is then looked up. */
  GroupThread: { groupId: string; name: string; openGift?: string };
  Clubs: undefined;
  GroupMembers: { groupId: string };
  GroupEdit: { groupId: string };
  EventQuests: undefined;
  Notifications: undefined;
  NotificationCenter: undefined;
  Appearance: undefined;
  Settings: undefined;
  /** One page of Settings behind a row: language, theme, sounds, keyboard, leagues, profile visibility, credits (settings/SettingsPageScreen). */
  SettingsPage: { page: SettingsPageKey };
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
  /** An id when an invite link opened it (`/app/games/stories?id=…`): it hands over to that game. */
  Stories: { id?: string } | undefined;
  StoryReader: { slug: string };
  /** A story game; opening one you are not in joins it when you may. */
  StoryGame: { id: string };
  Memes: undefined;
  MemeDetail: { postId: string };
  PostPicture: undefined;
  Tags: undefined;
  ChangeUsername: undefined;
  /** Settings → Security: the current password, then the new one twice (security/ChangePasswordScreen) */
  ChangePassword: undefined;
  /** Settings → Security: the devices signed in to your account (security/DevicesScreen) */
  Devices: undefined;
  /**
   * The reset link, asked for while signed in: Change password's way in for
   * an account that signs in with Google or Apple and has no password yet.
   */
  ForgotPassword: { email?: string } | undefined;
  Library: undefined;
  /** The people you are friends with, and the requests in both directions (social/SocialScreen). */
  Friends: undefined;
  /** The dictionary, opened from Learn's tools (and a word found in Search opens its entry in place). */
  Dictionary: undefined;
  /** Both alphabets, opened from Learn's tools: `script` to open on one, else the reader's own dialect. */
  Alphabet: { script?: AlphabetScript } | undefined;
  Saved: undefined;
  EditProfile: undefined;
  LibraryPost: { postId: string };
  LibraryCompose: undefined;
  /**
   * The post composer (composer/ComposeScreen): a new post, or `postId` to edit
   * one of yours. `pickPictures` opens the photo library at once, `meme` makes
   * the pictures a meme (both from the Memes page).
   */
  Compose: { postId?: string; pickPictures?: boolean; meme?: boolean } | undefined;
};

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * Navigation as a tab's own screen has it: the other tabs by name, and every
 * screen of the root stack above them.
 */
export type TabNavigation = CompositeNavigationProp<BottomTabNavigationProp<TabParamList>, RootNavigation>;

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
