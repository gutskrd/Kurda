/**
 * Leaving a screen a link can open (a riddle, a proverb, an exercise): back to the screen that opened it, or else to
 * `home`, its collection. A link lays the tabs under the screen, so tabs that are not showing one of `openers` count
 * as nothing behind it; the screen then replaces itself with `home`, and Back from there goes to the tabs.
 */

type Below = { name: string; state?: { index?: number; routes: ReadonlyArray<{ name: string }> } };

export type LeavingNavigation<S extends string> = {
  canGoBack(): boolean;
  goBack(): void;
  replace(screen: S): void;
  getState(): { index: number; routes: ReadonlyArray<Below> };
};

export function leaveLinked<S extends string>(navigation: LeavingNavigation<S>, home: S, openers: readonly string[] = []): void {
  const { index, routes } = navigation.getState();
  const below = routes[index - 1];
  const tab = below?.state ? below.state.routes[below.state.index ?? 0]?.name : undefined;
  const cameFromTabs = below?.name === 'Tabs' && !(tab && openers.includes(tab));
  if (navigation.canGoBack() && !cameFromTabs) navigation.goBack();
  else navigation.replace(home);
}
