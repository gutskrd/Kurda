import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { refreshFelt } from '../feedback/haptics';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Pull to refresh with the app's shared control, tint and haptic (`refreshFelt`), for a list's or scroller's
 * `refreshControl`. The spinner turns until `reload` settles, whether or not it succeeds; failures are the
 * screen's to show. Nothing is updated after the screen unmounts.
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
