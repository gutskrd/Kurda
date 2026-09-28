import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { listPosts } from '../library/api';
import type { LibraryPost } from '../library/types';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET, hitSlopFor } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { FAVORITE_KINDS, clearFavorite, favoriteCopy, setFavorite, type FavoriteKind } from './favorites';
import type { FavoriteRef } from './types';

/** How many published posts to offer — the browser offers the same fifty. */
const BROWSE = 50;

/**
 * Choosing the poem and the story on your profile (KUR profile cosmetics).
 *
 * `ProfileScreen` already draws both, so this is the missing half rather than a
 * second design: until now the two slots could only ever be empty, because
 * nothing on the phone could fill them.
 *
 * Browsing reuses `library/api.ts`: a favourite is a published library post, so
 * the list to choose from is the list the Library tab already fetches.
 */
export function FavoritesPicker({
  favoritePoem,
  favoriteStory,
  onChanged,
}: {
  favoritePoem: FavoriteRef | null;
  favoriteStory: FavoriteRef | null;
  /** told after anything lands, so the screen above can re-read /me */
  onChanged: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>{t('favorites.title')}</Text>
      {FAVORITE_KINDS.map((kind) => (
        <Slot
          key={kind}
          kind={kind}
          current={kind === 'poem' ? favoritePoem : favoriteStory}
          onChanged={onChanged}
        />
      ))}
    </View>
  );
}

function Slot({
  kind,
  current,
  onChanged,
}: {
  kind: FavoriteKind;
  current: FavoriteRef | null;
  onChanged: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const copy = favoriteCopy(kind);

  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<LibraryPost[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * The list is fetched the first time it is opened and kept after that. What is
   * published changes far more slowly than somebody opens and closes this, and
   * re-reading fifty posts each time a slot is folded shut and open again buys
   * nothing.
   */
  const toggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    setError(null);
    if (!next || posts !== null) return;
    void listPosts(client, { type: kind, limit: BROWSE }).then((res) => {
      if (res.ok) setPosts(res.data.posts ?? []);
      else {
        setPosts([]);
        setError(describeError(res.error, t));
      }
    });
  }, [client, kind, open, posts, t]);

  const choose = useCallback(
    (post: LibraryPost) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      void setFavorite(client, kind, post.id).then((res) => {
        setBusy(false);
        if (res.ok) {
          setOpen(false);
          onChanged();
        } else setError(describeError(res.error, t));
      });
    },
    [busy, client, kind, onChanged, t],
  );

  const remove = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void clearFavorite(client, kind).then((res) => {
      setBusy(false);
      if (res.ok) onChanged();
      else setError(describeError(res.error, t));
    });
  }, [busy, client, kind, onChanged, t]);

  return (
    <View style={styles.slot}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t(copy.label)}</Text>

      <View style={styles.row}>
        <Text
          style={[styles.value, { color: current ? colors.textPrimary : colors.textSecondary }]}
          numberOfLines={1}
        >
          {current ? current.title : t('favorites.none')}
        </Text>
        {busy ? <ActivityIndicator color={colors.primary} /> : null}
        {current && !busy ? (
          <Pressable
            onPress={remove}
            hitSlop={hitSlopFor(MIN_TOUCH_TARGET, 22)}
            accessibilityRole="button"
            accessibilityLabel={t('common.remove')}
          >
            <Text style={[styles.action, { color: colors.textSecondary }]}>{t('common.remove')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={toggle}
          hitSlop={hitSlopFor(MIN_TOUCH_TARGET, 22)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={open ? t('common.cancel') : t('favorites.change')}
        >
          <Text style={[styles.action, { color: colors.primary }]}>
            {open ? t('common.cancel') : t('favorites.change')}
          </Text>
        </Pressable>
      </View>

      {open ? (
        posts === null ? (
          <ActivityIndicator color={colors.primary} style={styles.spinner} />
        ) : posts.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>{t(copy.empty)}</Text>
        ) : (
          /* a plain map, not a list: this sits inside the edit screen's ScrollView */
          <View style={styles.options}>
            {posts.map((p) => {
              const on = current?.id === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => choose(p)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={p.title}
                  style={[
                    styles.option,
                    {
                      backgroundColor: colors.controlTrack,
                      borderWidth: 1,
                      borderColor: on ? colors.textPrimary : colors.glassBorder,
                    },
                  ]}
                >
                  <Text style={[styles.optionText, { color: colors.textPrimary }]} numberOfLines={1}>
                    {p.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )
      ) : null}

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },
  heading: { ...sectionLabel },
  slot: { gap: spacing.xs },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH_TARGET },
  value: { flex: 1, fontSize: typography.ios.row },
  action: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  spinner: { marginVertical: spacing.sm },
  options: { gap: spacing.xs },
  option: { borderRadius: radii.md, paddingHorizontal: spacing.md, justifyContent: 'center', minHeight: MIN_TOUCH_TARGET },
  optionText: { fontSize: typography.sizes.md },
  empty: { fontSize: typography.sizes.sm },
  error: { fontSize: typography.sizes.sm },
});
