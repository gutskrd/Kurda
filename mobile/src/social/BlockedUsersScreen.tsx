import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useI18n } from '../i18n/I18nContext';
import { blockedUsers, unblockUser, type BlockedUser } from './blocks';

/** "3 Sep" / "3 Sep 2024" — the year only when it is not this one. */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * The people you have blocked, and the only way back (KUR-083).
 *
 * A block is deliberately total: the other person leaves search, your friends
 * list and every board, and their profile answers "no such user" to you. Which
 * means that the moment it lands there is no longer any screen that could offer
 * to undo it — the phone could block, and then nothing. Without this list a
 * block placed by accident, or in a moment, was permanent in practice unless
 * you went and found a browser.
 *
 * It lives in Settings rather than among the social screens because it is
 * account state, like your privacy setting, not a place you visit.
 *
 * Names are deliberately not tappable. Everywhere else a name opens that
 * person's profile; a blocked person's profile is a 404 to you by design, so a
 * link would be a promise the app cannot keep.
 */
export function BlockedUsersScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [list, setList] = useState<BlockedUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    (offset = 0) => {
      void blockedUsers(client, offset).then((res) => {
        if (!res.ok) {
          setError(describeError(res.error, t));
          if (offset === 0) setList([]);
          return;
        }
        const page = res.data.blocked ?? [];
        setError(null);
        setTotal(res.data.total ?? page.length);
        setList((prev) => (offset === 0 || prev === null ? page : [...prev, ...page]));
      });
    },
    [client, t],
  );

  useFocusEffect(useCallback(() => load(0), [load]));

  /**
   * Unblock, then take the row out — rather than reloading from the server,
   * which would shuffle everything below the row you just touched. Only on
   * success: a row that vanished after a failed unblock would leave you
   * believing you had let someone back in, with no way to tell.
   */
  const unblock = (user: BlockedUser): void => {
    const name = user.displayName || user.username;
    Alert.alert(t('settings.blocked.unblockWho', { name }), t('settings.blocked.unblockHint'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.blocked.unblock'),
        onPress: () => {
          setBusy(user.userId);
          void unblockUser(client, user.userId).then((res) => {
            setBusy(null);
            if (!res.ok) {
              setError(describeError(res.error, t));
              return;
            }
            setError(null);
            setList((prev) => (prev ?? []).filter((b) => b.userId !== user.userId));
            setTotal((n) => Math.max(0, n - 1));
          });
        },
      },
    ]);
  };

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t('settings.blocked.title')} onBack={onExit} />

        {list === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            <Text style={[styles.help, { color: colors.textSecondary }]}>{t('settings.blocked.help')}</Text>

            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

            {list.length === 0 ? (
              <Text style={[styles.help, { color: colors.textSecondary }]}>{t('settings.blocked.none')}</Text>
            ) : (
              <>
                {list.map((u) => (
                  <View
                    key={u.userId}
                    style={[styles.row, { backgroundColor: colors.controlTrack }]}
                  >
                    <InitialsAvatar
                      name={u.displayName || u.username}
                      id={u.userId}
                      size={40}
                      photoUrl={u.avatarUrl}
                    />
                    <View style={styles.main}>
                      <Text style={[styles.name, { color: colors.textPrimary }]}>{u.displayName || u.username}</Text>
                      <Text style={[styles.meta, { color: colors.textSecondary }]}>
                        @{u.username} · {t('settings.blocked.since', { date: when(u.blockedAt) })}
                      </Text>
                    </View>
                    {busy === u.userId ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Pressable onPress={() => unblock(u)} accessibilityRole="button" hitSlop={8}>
                        <Text style={[styles.action, { color: colors.primary }]}>{t('settings.blocked.unblock')}</Text>
                      </Pressable>
                    )}
                  </View>
                ))}

                {list.length < total ? (
                  <Pressable onPress={() => load(list.length)} accessibilityRole="button" style={styles.more}>
                    <Text style={[styles.action, { color: colors.primary }]}>
                      {t('common.showMoreCount', { count: total - list.length })}
                    </Text>
                  </Pressable>
                ) : null}

                {/*
                  Said here rather than only inside the confirm, because it is
                  the part people get wrong: unblocking does not restore a
                  friendship, and it does put you back within reach of someone
                  you chose to get away from.
                */}
                <Text style={[styles.help, { color: colors.textSecondary, marginTop: spacing.lg }]}>
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
  list: { padding: spacing.lg, gap: spacing.xs },
  help: { fontSize: typography.sizes.sm, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  main: { flex: 1 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  meta: { fontSize: typography.sizes.sm },
  action: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  more: { alignItems: 'center', paddingVertical: spacing.md },
  error: { fontSize: typography.sizes.sm, marginBottom: spacing.sm },
});
