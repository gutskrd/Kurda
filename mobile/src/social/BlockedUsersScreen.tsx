import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import type { ApiError } from '../api/types';
import { useDirection } from '../reports/direction';
import { Avatar } from '../profile/Avatar';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useI18n } from '../i18n/I18nContext';
import { blockedUsers, hideBlocked, unblockUser, unhideBlocked, type BlockedUser } from './blocks';
import { EmptyState } from '../theme/EmptyState';
import { usePullRefresh } from '../net/usePullRefresh';
import { Loading } from '../theme/Loading';
import { heldDim } from '../theme/MotionParts';

/** "3 Sep" or "3 Sep 2024" (the year only when it is not this one), in the app's language, not the phone's. */
function when(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) };
  try {
    return d.toLocaleDateString(locale, options);
  } catch {
    return d.toLocaleDateString(undefined, options);
  }
}

/**
 * The people you have blocked, and the only way back. A block is total (the other person leaves search, your friends
 * list and every board, and their profile answers "no such user" to you), so no other screen could offer to undo it. It
 * lives in Settings because it is account state. Names are not tappable, since a blocked person's profile is a 404 to
 * you.
 */
export function BlockedUsersScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();

  const [list, setList] = useState<BlockedUser[] | null>(null);
  // The list could not be read at all: said, with the way to ask again, rather than "you haven't blocked anyone".
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (offset = 0) =>
      blockedUsers(client, offset).then((res) => {
        if (!res.ok) {
          // A first page that did not come is not an empty list; a later page that did not come is said over the rows
          // already there.
          if (offset === 0) setLoadError(res.error);
          else setError(describeError(res.error, t));
          return;
        }
        const page = res.data.blocked ?? [];
        setError(null);
        setLoadError(null);
        setTotal(res.data.total ?? page.length);
        setList((prev) => (offset === 0 || prev === null ? page : [...prev, ...page]));
      }),
    [client, t],
  );

  useFocusEffect(
    useCallback(() => {
      void load(0);
    }, [load]),
  );
  // Pulled down, the list is read again from its first page.
  const pull = usePullRefresh(() => load(0));

  /**
   * Unblock, once confirmed, as the website does: the row goes at once, without a reload that would shuffle the rows
   * below, and the person is back in the lists that left them out. A refusal puts the row back in its place, still
   * blocked, and says why.
   */
  const unblock = (user: BlockedUser): void => {
    const name = user.displayName || user.username;
    Alert.alert(t('settings.blocked.unblockWho', { name }), t('settings.blocked.unblockHint'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.blocked.unblock'),
        onPress: () => {
          const at = (list ?? []).findIndex((b) => b.userId === user.userId);
          setError(null);
          unhideBlocked(user.userId);
          setList((prev) => (prev ?? []).filter((b) => b.userId !== user.userId));
          setTotal((n) => Math.max(0, n - 1));
          void unblockUser(client, user.userId).then((res) => {
            if (res.ok) return;
            hideBlocked(user.userId);
            setList((prev) => (prev ?? []).some((b) => b.userId === user.userId) ? prev : [...(prev ?? []).slice(0, at), user, ...(prev ?? []).slice(at)]);
            setTotal((n) => n + 1);
            setError(describeError(res.error, t));
          });
        },
      },
    ]);
  };

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t('settings.blocked.title')} onBack={onExit} />

        {list === null && loadError ? (
          <ErrorRetry message={describeError(loadError, t)} onRetry={() => void load(0)} />
        ) : list === null ? (
          <Loading style={{ marginTop: spacing.xl }} />
        ) : (
          <ScrollView contentContainerStyle={styles.list} refreshControl={pull}>
            <Text style={[styles.help, dir.text, { color: colors.textSecondary }]}>{t('settings.blocked.help')}</Text>

            {error ? <Text style={[styles.error, dir.text, { color: colors.danger }]}>{error}</Text> : null}

            {list.length === 0 ? (
              <EmptyState title={t('settings.blocked.none')} body={t('settings.blocked.noneBody')} />
            ) : (
              <>
                {list.map((u) => (
                  <View
                    key={u.userId}
                    style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}
                  >
                    <Avatar name={u.displayName || u.username} size={40} photoUrl={u.avatarUrl} />
                    <View style={styles.main}>
                      <Text style={[styles.name, dir.free, { color: colors.textPrimary }]}>{u.displayName || u.username}</Text>
                      <Text style={[styles.meta, dir.text, { color: colors.textSecondary }]}>
                        @{u.username} · {t('settings.blocked.since', { date: when(u.blockedAt, locale) })}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => unblock(u)}
                      accessibilityRole="button"
                      // One 18pt line of words, reaching a fingertip, alone at the end of its row.
                      reach="open"
                      reachSize={{ height: 18 }}
                      style={({ pressed }) => pressed && heldDim}
                    >
                      <Text style={[styles.action, { color: colors.primary }]}>{t('settings.blocked.unblock')}</Text>
                    </Pressable>
                  </View>
                ))}

                {list.length < total ? (
                  <Pressable onPress={() => void load(list.length)} accessibilityRole="button" style={({ pressed }) => [styles.more, pressed && heldDim]}>
                    <Text style={[styles.action, { color: colors.primary }]}>
                      {t('common.showMoreCount', { count: total - list.length })}
                    </Text>
                  </Pressable>
                ) : null}

                {/* Said here, not only in the confirm, because it is what people get wrong: unblocking does not
                   restore a friendship, and it puts you back within reach of someone you chose to avoid. */}
                <Text style={[styles.help, dir.text, { color: colors.textSecondary, marginTop: spacing.lg }]}>
                  {t('settings.blocked.unblockHint')}
                </Text>
              </>
            )}
          </ScrollView>
        )}
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: layout.gutter, paddingVertical: spacing.lg, gap: spacing.xs },
  help: { fontSize: typography.sizes.text, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  main: { flex: 1 },
  name: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  meta: { fontSize: typography.sizes.text },
  action: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  more: { alignItems: 'center', paddingVertical: spacing.md },
  error: { fontSize: typography.sizes.text, marginBottom: spacing.sm },
});
