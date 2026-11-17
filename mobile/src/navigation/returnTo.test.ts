import { describe, expect, it } from 'vitest';
// the router itself, as the app's native stacks run it (pure: no React Native in it)
import { CommonActions, StackActions, StackRouter, type NavigationAction, type ParamListBase, type StackNavigationState } from '@react-navigation/routers';
import { chatRouteId } from './rootStack';
import { authRouter, rootRouter, returningTo, ROOT_PLACES } from './returnTo';

type State = StackNavigationState<ParamListBase>;

/** A stack with the app's router and these routes, starting on the first; `go` dispatches and keeps the result. */
function stack(routeNames: string[], router: (original: never) => object = rootRouter) {
  const original = StackRouter({});
  const r = { ...original, ...(router(original as never) as Partial<typeof original>) };
  const options = {
    routeNames,
    routeParamList: {},
    routeGetIdList: { Chat: chatRouteId as (o: { params?: object }) => string },
  };
  let state = r.getInitialState(options) as State;
  const go = (action: NavigationAction): State => {
    state = (r.getStateForAction(state, action as Parameters<typeof r.getStateForAction>[1], options) as State | null) ?? state;
    return state;
  };
  const names = (): string[] => state.routes.map((route) => route.name);
  return { go, names, top: () => state.routes[state.index] };
}

const ROOT = [
  'Tabs', 'Lesson', 'Search', 'UserProfile', 'Chat', 'GroupThread', 'GroupMembers', 'Alphabet', 'Words', 'Letters', 'LetterThread', 'Stories', 'StoryReader', 'StoryGame',
];

describe('a place already open', () => {
  it('is gone back to from a finished lesson, with the view to open, rather than stacked again', () => {
    const { go, names, top } = stack(ROOT);
    const tabs = top();
    go(CommonActions.navigate('Lesson', { lessonId: 'l1' }));
    go(CommonActions.navigate('Tabs', { screen: 'Learn', params: { view: 'lessons' } }));
    expect(names()).toEqual(['Tabs']);
    expect(top()).toMatchObject({ key: tabs?.key, params: { screen: 'Learn', params: { view: 'lessons' } } });
  });

  it('unwinds past a group that was left, to Messages', () => {
    const { go, names } = stack(ROOT);
    go(CommonActions.navigate('GroupThread', { groupId: 'g1', name: 'Hevalên Kurdî' }));
    go(CommonActions.navigate('GroupMembers', { groupId: 'g1' }));
    go(CommonActions.navigate('Tabs', { screen: 'Messages' }));
    expect(names()).toEqual(['Tabs']);
  });

  it('is gone back to from a profile a search found, with what was searched still there', () => {
    const { go, names, top } = stack(ROOT);
    go(CommonActions.navigate('Search'));
    const search = top();
    go(CommonActions.navigate('UserProfile', { userId: 'u1' }));
    go(CommonActions.navigate('Search'));
    expect(names()).toEqual(['Tabs', 'Search']);
    expect(top()?.key).toBe(search?.key);
  });

  it('keeps the alphabet and the words to one page each, however often each links to the other', () => {
    const { go, names } = stack(ROOT);
    go(CommonActions.navigate('Alphabet'));
    go(CommonActions.navigate('Words'));
    go(CommonActions.navigate('Alphabet'));
    go(CommonActions.navigate('Words'));
    expect(names()).toEqual(['Tabs', 'Alphabet', 'Words']);
  });

  it('is gone back to from a correspondence when a letter’s notification names a bird', () => {
    const { go, names, top } = stack(ROOT);
    go(CommonActions.navigate('Letters'));
    go(CommonActions.navigate('LetterThread', { threadId: 't1' }));
    go(CommonActions.navigate('Letters', { bird: 't2' }));
    expect(names()).toEqual(['Tabs', 'Letters']);
    expect(top()?.params).toEqual({ bird: 't2' });
  });
});

describe('a story game that is over', () => {
  it('leaves for the library in its own place, so Back from the library is the story and not the game', () => {
    const { go, names } = stack(ROOT);
    go(CommonActions.navigate('StoryReader', { slug: 'bajar' }));
    go(CommonActions.navigate('StoryGame', { id: 'g1' }));
    go(StackActions.popTo('Stories'));
    expect(names()).toEqual(['Tabs', 'StoryReader', 'Stories']);
  });
});

describe('opening a screen that is not open yet', () => {
  it('pushes a place as it always has', () => {
    const { go, names } = stack(ROOT);
    go(CommonActions.navigate('UserProfile', { userId: 'u1' }));
    go(CommonActions.navigate('Search'));
    expect(names()).toEqual(['Tabs', 'UserProfile', 'Search']);
  });

  it('pushes another page about one thing over the first, as browsing people does', () => {
    const { go, names } = stack(ROOT);
    go(CommonActions.navigate('UserProfile', { userId: 'u1' }));
    go(CommonActions.navigate('Search'));
    go(CommonActions.navigate('UserProfile', { userId: 'u2' }));
    expect(names()).toEqual(['Tabs', 'UserProfile', 'Search', 'UserProfile']);
  });

  it('leaves the conversations to their own ids', () => {
    const { go, names } = stack(ROOT);
    go(CommonActions.navigate('Chat', { userId: 'u1', username: 'Rojda' }));
    go(CommonActions.navigate('UserProfile', { userId: 'u1' }));
    go(CommonActions.navigate('Chat', { userId: 'u1', username: 'Rojda' }));
    // brought forward, as the thread routes do (chat/threadRoutes.test.tsx), and never a second one
    expect(names()).toEqual(['Tabs', 'UserProfile', 'Chat']);
  });

  it('does not go anywhere twice when a press lands twice', () => {
    const { go, names } = stack(ROOT);
    go(CommonActions.navigate('UserProfile', { userId: 'u1' }));
    go(CommonActions.navigate('UserProfile', { userId: 'u1' }));
    go(CommonActions.navigate('Search'));
    go(CommonActions.navigate('Search'));
    expect(names()).toEqual(['Tabs', 'UserProfile', 'Search']);
  });
});

describe('the forms before signing in', () => {
  const AUTH = ['Welcome', 'Login', 'Register', 'ForgotPassword'];

  it('go back to the sign-in form from the sign-up under it, with the address the sign-up had', () => {
    const { go, names, top } = stack(AUTH, authRouter);
    go(CommonActions.navigate('Login'));
    const login = top();
    go(CommonActions.navigate('Register'));
    go(CommonActions.navigate('Login', { email: 'rojda@example.com' }));
    expect(names()).toEqual(['Welcome', 'Login']);
    expect(top()).toMatchObject({ key: login?.key, params: { email: 'rojda@example.com' } });
  });

  it('go back to the sign-in form from the reset', () => {
    const { go, names } = stack(AUTH, authRouter);
    go(CommonActions.navigate('Login'));
    go(CommonActions.navigate('ForgotPassword', { email: 'rojda@example.com' }));
    go(CommonActions.navigate('Login', { email: 'rojda@example.com' }));
    expect(names()).toEqual(['Welcome', 'Login']);
  });
});

describe('returningTo', () => {
  it('lets an action that says whether to go back say so', () => {
    const push = CommonActions.navigate('Search', undefined, { pop: false });
    expect(returningTo(push, ROOT_PLACES)).toBe(push);
  });

  it('leaves every other kind of action alone', () => {
    const back = CommonActions.goBack();
    const replace = StackActions.replace('Search');
    expect(returningTo(back, ROOT_PLACES)).toBe(back);
    expect(returningTo(replace, ROOT_PLACES)).toBe(replace);
  });
});
