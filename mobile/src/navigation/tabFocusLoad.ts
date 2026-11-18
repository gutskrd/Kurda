import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

/** How long a tab keeps what it loaded when it comes back by a tab switch. */
export const TAB_REUSE_MS = 30_000;

/**
 * Loads a tab's data each time the tab comes into view, except that a tab switch within TAB_REUSE_MS of the last
 * complete load keeps what is shown. Coming back from any page pushed over the tabs (a lesson, practice, a story, the
 * shop) always loads again, since those pages are where progress and balances change; so does a new `load`, which is
 * how a pull to refresh or a retry asks.
 *
 * `load` gets `live()`, false once the tab is out of view, and resolves true when its answers are complete enough to
 * keep; a failed or abandoned load is asked again at the next focus.
 */
export function useTabFocusLoad(load: (live: () => boolean) => Promise<boolean>): void {
  const navigation = useNavigation();
  const kept = useRef<{ load: typeof load; at: number } | null>(null);

  // The tabs' own screen loses focus whenever a page is pushed over them, whichever tab is showing.
  useEffect(
    () =>
      navigation.getParent()?.addListener('blur', () => {
        kept.current = null;
      }),
    [navigation],
  );

  useFocusEffect(
    useCallback(() => {
      const was = kept.current;
      if (was && was.load === load && Date.now() - was.at < TAB_REUSE_MS) return undefined;
      kept.current = null;
      const at = Date.now();
      let live = true;
      void load(() => live).then((keep) => {
        if (live && keep) kept.current = { load, at };
      });
      return () => {
        live = false;
      };
    }, [load]),
  );
}
