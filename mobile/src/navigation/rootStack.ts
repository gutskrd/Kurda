import type { CompositeNavigationProp, NavigatorScreenParams } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AlphabetScript, GameDialect, PracticeMode, ProverbRoundMode } from '@kurda/shared';
import type { LearnView } from './tabs';
import type { SettingsPageKey } from '../settings/SettingsPageScreen';

/**
 * The four tabs and their params. Home takes the half and kind of the wall to open on (a link, or the menu); Learn
 * takes the view to open on, so `hevalo://play` lands on Games, and an invite link's `code` for Join with a code.
 */
export type TabParamList = {
  Home: { section?: string; kind?: string } | undefined;
  Learn: { view?: LearnView; code?: string } | undefined;
  Messages: undefined;
  Profile: undefined;
};

/** The root stack above the tab navigator, so screens like a lesson are pushed full screen over the tabs. */
export type RootStackParamList = {
  /**
   * The tab shell. From a screen above it, return to a tab with `popTo('Tabs', { screen: 'Messages' })`:
   * `navigate('Tabs', …)` would push a second tab shell, and naming the tab alone only works from inside the tabs.
   */
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /** Search, over wherever it was opened from: people, words, lessons and games. */
  Search: undefined;
  /**
   * `courseId`: the course the lesson was opened from, so its results can offer the next lesson. A link knows no
   * course, and its results offer none.
   */
  Lesson: { lessonId: string; courseId?: string };
  /** Finds the lesson Learn would start and opens it in its place (learn/NextLessonScreen): a new account's first. */
  NextLesson: undefined;
  /**
   * A practice session, started at once. `exerciseIds`: practise these rather than what is due; `mode`: another kind of
   * practice from the hub, with `unitId` for a unit's review; `sessionId`: a review left part-way through, resumed.
   */
  Practice: { exerciseIds?: string[]; mode?: PracticeMode; unitId?: string; sessionId?: string } | undefined;
  /** Practice's hub: the one thing most worth doing now, and every other kind of practice (practice/PracticeHubScreen). */
  PracticeHub: undefined;
  /** The short test that jumps ahead on the path to `unitId` (coursemap/JumpTestScreen). */
  JumpTest: { courseId: string; unitId: string };
  Shop: undefined;
  /** By XP (this week or all time) or Zêr; XP this week opens with your league (leagues/RankingsScreen). */
  Rankings: { board?: 'xp' | 'zer'; span?: 'week' | 'all' } | undefined;
  /** The whole league this week: the ladder, the goal ring and the group's table (leagues/LeagueScreen). */
  LeagueTable: undefined;
  /** Older names, opened as Rankings (navigation/returnTo.ts `RENAMED`): the league on XP this week, ranks and season as is. */
  League: undefined;
  Ranks: { game?: string } | undefined;
  Season: undefined;
  /** Every badge by family, and the three for the profile. */
  Badges: undefined;
  /**
   * Somebody else's profile. Not 'Profile': a name resolves against the nearest navigator first, so from inside the
   * tabs it would open your own profile tab and drop the id.
   */
  UserProfile: { userId: string };
  /**
   * `openGift`: a gift to unwrap as soon as the thread is open. `username` may be '' when the way in only knew the id;
   * the thread then names them from the messages.
   */
  Chat: { userId: string; username: string; openGift?: string };
  /** The friend requests waiting on you, opened from the row at the top of Messages. */
  FriendRequests: undefined;
  /**
   * Letters by bird: your window, writing to somebody new, and your pen pals (letters/LettersScreen). A letter's
   * notification names its correspondence (`bird`), whose bird lands first.
   */
  Letters: { bird?: string } | undefined;
  /** One correspondence with a pen pal (letters/LetterThreadScreen), from Letters or from a bird's arrival in the notifications. */
  LetterThread: { threadId: string };
  /** The home-screen letter widget's page (widget/LetterWidgetScreen), from the letters screen's header. */
  LetterWidget: undefined;
  /**
   * As Chat: `openGift` to unwrap at once; `name` may be '' and is then looked up. `addFriends`: the group was just
   * made, and opens with the sheet for adding friends.
   */
  GroupThread: { groupId: string; name: string; openGift?: string; addFriends?: boolean };
  GroupMembers: { groupId: string };
  GroupEdit: { groupId: string };
  /** For a group's owner and admins: the requests to come back, and who is banned. */
  GroupRequests: { groupId: string };
  GroupBans: { groupId: string };
  EventQuests: undefined;
  Notifications: undefined;
  NotificationCenter: undefined;
  Settings: undefined;
  /**
   * One page of Settings: a category from its home, a parental page, or a choice behind a row
   * (settings/SettingsPageScreen). `teenId` names the teen on a parent's pages about one.
   */
  SettingsPage: { page: SettingsPageKey; teenId?: string };
  BlockedUsers: undefined;
  /** Your reports and what became of them (reports/MyReportsScreen). */
  MyReports: undefined;
  /** What is limited on your account and why, with "Ask for a review" (reports/AccountStandingScreen). */
  AccountStanding: undefined;
  Wordle: undefined;
  /** An id when a join code, an invite or an old invite link opened it; nothing when you came to make one. */
  WordleBattle: { id?: string } | undefined;
  Rhyme: undefined;
  Race: undefined;
  /** Build a Sentence, an exercise of the lessons' practice (games/BuildSentenceScreen). */
  BuildSentence: undefined;
  /** The Memory Thief (games/MemoryThiefScreen). */
  MemoryThief: undefined;
  /** Hear It, Find It, an exercise of the lessons' practice (games/HearItScreen). */
  HearIt: undefined;
  /** Detective (games/DetectiveScreen). */
  Detective: undefined;
  /** An id when a join code, an invite or an old invite link opened it; nothing when you came to make one. */
  RhymeMatch: { id?: string } | undefined;
  /** The Last Letter: an id for a room (a code, an invite, a card); nothing for the start, with friends or against Hevalo. */
  LastLetter: { id?: string } | undefined;
  /** Impostor: an id for a room (a code, an invite, a card); nothing for the start. */
  Impostor: { id?: string } | undefined;
  /**
   * Who Am I?: an id for a room with friends; nothing for the start. `way` asks for one of the game's two ways at once:
   * on this phone, or with friends online.
   */
  WhoAmI: { id?: string; way?: 'phone' | 'friends' } | undefined;
  /** An id when an invite link opened it (`/app/games/stories?id=…`): it hands over to that game. */
  Stories: { id?: string } | undefined;
  StoryReader: { slug: string };
  /** A story game; opening one you are not in joins it when you may. */
  StoryGame: { id: string };
  /** The riddles (lore/RiddlesScreen), from the library's top or their address; `dialect` to open on one variety. */
  Riddles: { dialect?: GameDialect } | undefined;
  /** One riddle, by its slug (which starts with its variety); a link to it never carries the answer. */
  Riddle: { slug: string };
  /** A riddle's answer, once it is solved or asked for (lore/RiddleAnswerScreen): no address of its own, so no link opens it. */
  RiddleAnswer: { slug: string };
  /** The proverbs (lore/ProverbsScreen); `theme` to open on one of the shared themes. */
  Proverbs: { dialect?: GameDialect; theme?: string } | undefined;
  Proverb: { slug: string };
  /** A short round on the proverbs (lore/ProverbRoundScreen), in a variety, on one of its two kinds. */
  ProverbRound: { dialect: GameDialect; mode?: ProverbRoundMode };
  MemeDetail: { postId: string };
  Tags: undefined;
  ChangeUsername: undefined;
  /** Settings → Security: the current password, then the new one twice (security/ChangePasswordScreen). */
  ChangePassword: undefined;
  /** Settings → Security: the devices signed in to your account (security/DevicesScreen). */
  Devices: undefined;
  /**
   * The reset link, asked for while signed in: how an account that signs in with Google or Apple sets its first
   * password.
   */
  ForgotPassword: { email?: string } | undefined;
  /** The people you are friends with, and the requests in both directions (social/SocialScreen). */
  Friends: undefined;
  /** The dictionary, opened from Learn's tools (and a word found in Search opens its entry in place). */
  Dictionary: undefined;
  /** Both alphabets, opened from Learn's tools: `script` to open on one, else the reader's own dialect. */
  Alphabet: { script?: AlphabetScript } | undefined;
  /** Words to know (colours, numbers, days, months), from Learn's tools and the alphabet's last card. */
  Words: undefined;
  /** Today's quests and any chest waiting, from Learn's quests card (quests/QuestsScreen). */
  Quests: undefined;
  /** The learner's own tree: watering it, and the nursery (tree/TreeScreen), from Learn's tree card and the profile. */
  Tree: undefined;
  /** One word set; `set` is checked where the screen is drawn, since a link can carry anything. */
  WordSet: { set: string; script?: AlphabetScript };
  Saved: undefined;
  EditProfile: undefined;
  LibraryPost: { postId: string };
  /**
   * The post composer: a new post, or `postId` to edit one of yours. `pickPictures` opens the photo library at once,
   * and `meme` makes the pictures a meme.
   */
  Compose: { postId?: string; pickPictures?: boolean; meme?: boolean } | undefined;
  /** A guest making the account their own (screens/auth/ClaimAccountScreen): the sign-up form over the app. */
  ClaimAccount: undefined;
  /**
   * A guest signing in to an existing account (screens/auth/SignInModal); the sign-in replaces the guest session and
   * the modal closes itself. `email`: what was typed on the screen that sent you here, so it is not typed twice.
   */
  SignIn: { email?: string } | undefined;
};

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

/** Navigation as a tab's own screen has it: the other tabs by name, and every screen of the root stack above them. */
export type TabNavigation = CompositeNavigationProp<BottomTabNavigationProp<TabParamList>, RootNavigation>;

/**
 * Each conversation is its own route. Without an id, navigating to Chat while a chat is on top would only swap its
 * params, turning it into another person's chat with a half-typed message still in the composer.
 */
export const chatRouteId = ({ params }: { params: RootStackParamList['Chat'] }): string => params.userId;
export const groupThreadRouteId = ({ params }: { params: RootStackParamList['GroupThread'] }): string => params.groupId;

/**
 * One page per person, as with conversations: without an id, a profile opened from a profile would replace the one in
 * front.
 */
export const userProfileRouteId = ({ params }: { params: RootStackParamList['UserProfile'] }): string => params.userId;

/**
 * One route per Settings page (and per teen): a page opened from another Settings page is pushed over it rather than
 * replacing it, and opening one already in the stack brings it forward.
 */
export const settingsPageRouteId = ({ params }: { params: RootStackParamList['SettingsPage'] }): string =>
  params.teenId ? `${params.page}:${params.teenId}` : params.page;
