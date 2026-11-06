import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { refreshFelt } from '../feedback/haptics';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Pull down to read a screen again, as Home, Messages, Learn and the rest
 * already do: the same control in the same quiet grey, felt the same way
 * (`refreshFelt`), handed to a list's or a scroller's `refreshControl`.
 *
 * `reload` reads what the screen shows; the spinner turns until what it
 * returns has settled, whether the reading worked or not — a failure is the
 * screen's own to say, as it says one on opening. A screen that has gone
 * meanwhile is left alone.
 */
export function usePullRefresh(reload: () => unknown): React.JSX.Element {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(reload);
  latest.current = reload;
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const onRefresh = useMemo(
    () =>
      refreshFelt(() => {
        setRefreshing(true);
        void Promise.resolve()
          .then(() => latest.current())
          .catch(() => undefined)
          .finally(() => {
            if (live.current) setRefreshing(false);
          });
      }),
    [],
  );
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />;
}
