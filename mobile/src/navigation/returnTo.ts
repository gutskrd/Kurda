import type { NavigationAction, ParamListBase, Router, StackNavigationState } from '@react-navigation/native';
import type { AuthStackParamList } from './authStack';
import type { RootStackParamList } from './rootStack';

/**
 * A place is open once: opening it again from a screen above goes back to it instead of stacking a second copy. Places
 * are the tabs and the pages about no one thing; a page about a person, post, lesson or game is pushed again for
 * another. Done in the router, so a press, a notification and a link behave the same.
 */
export const ROOT_PLACES: ReadonlySet<keyof RootStackParamList> = new Set<keyof RootStackParamList>([
  'Tabs',
  'Search',
  'PracticeHub',
  'Shop',
  'League',
  'Season',
  'Badges',
  'Tree',
  'FriendRequests',
  'Letters',
  'LetterWidget',
  'EventQuests',
  'Notifications',
  'NotificationCenter',
  'Settings',
  'BlockedUsers',
  'MyReports',
  'AccountStanding',
  'Stories',
  'Tags',
  'ChangeUsername',
  'ChangePassword',
  'Devices',
  'Friends',
  'Dictionary',
  'Alphabet',
  'Words',
  'Quests',
  'Saved',
  'EditProfile',
]);

/** Before signing in every form is wanted once, so "Create account" and "Sign in" go back to each other. */
export const AUTH_PLACES: ReadonlySet<keyof AuthStackParamList> = new Set<keyof AuthStackParamList>(['Welcome', 'Login', 'Register', 'ForgotPassword']);

type Navigate = NavigationAction & { type: 'NAVIGATE'; payload: { name: string; pop?: boolean } };

const isNavigate = (action: NavigationAction): action is Navigate =>
  action.type === 'NAVIGATE' && typeof (action.payload as { name?: unknown } | undefined)?.name === 'string';

/** A way to a place goes back to it when it is open, with the new params; an action that sets `pop` itself is left as it is. */
export function returningTo<Action extends NavigationAction>(action: Action, places: ReadonlySet<string>): Action {
  if (!isNavigate(action) || !places.has(action.payload.name) || action.payload.pop !== undefined) return action;
  return { ...action, payload: { ...action.payload, pop: true } };
}

/** The stack's own router with `returningTo` in front of it, for a navigator's `UNSTABLE_router`. */
function placesRouter<ParamList extends ParamListBase>(places: ReadonlySet<string>) {
  return <Action extends NavigationAction>(
    original: Router<StackNavigationState<ParamList>, Action>,
  ): Partial<Router<StackNavigationState<ParamList>, Action>> => ({
    getStateForAction: (state, action, options) => original.getStateForAction(state, returningTo(action, places), options),
  });
}

/** For the signed-in root stack. */
export const rootRouter = placesRouter<RootStackParamList>(ROOT_PLACES);

/** For the screens before signing in, and the sign-in form a guest opens over the app. */
export const authRouter = placesRouter<AuthStackParamList>(AUTH_PLACES);
