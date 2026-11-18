import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { PressableScale, heldDim } from '../theme/MotionParts';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { useIntents } from '../api/optimistic';
import { listPosts } from '../library/api';
import { postName, type LibraryPost } from '../library/types';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { FAVORITE_KINDS, clearFavorite, favoriteCopy, setFavorite, type FavoriteKind } from './favorites';
import type { FavoriteRef } from './types';
import { Loading } from '../theme/Loading';
import { useDirection } from '../reports/direction';

/** How many published posts to offer: the same fifty the browser offers. */
const BROWSE = 50;

/**
 * Remove and Change are a line of words about 22pt tall: they answer over 48pt above and below, and only their own
 * width sideways, where they stand a gap apart.
 */
const WORD = { height: 22 };

/**
 * Choosing the poem and the story on your profile, which `ProfileScreen` draws. A favourite is a published library
 * post, so the list to choose from is the one `library/api.ts` already fetches.
 */
export function FavoritesPicker({
  favoritePoem,
  favoriteStory,
  onChanged,
}: {
  favoritePoem: FavoriteRef | null;
  favoriteStory: FavoriteRef | null;
  /** Told after anything lands, so the screen above can re-read /me. */
  onChanged: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('favorites.title')}
      </Text>
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
  // Right to left, the chosen post is read first on the right and the way to change it closes the row on the left.
  const dir = useDirection();
  const copy = favoriteCopy(kind);

  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<LibraryPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The favourite as /me has it, or a fresher answer to a choice here, so it does not flicker back while /me is re-read.
  const [told, setTold] = useState(current);
  useEffect(() => setTold(current), [current]);

  // Chosen or removed at once; the server is told after, and a refusal puts it back with the reason.
  const pinning = useIntents<'favorite', FavoriteRef | null>(
    async (_key, next) => {
      const res = next ? await setFavorite(client, kind, next.id) : await clearFavorite(client, kind);
      if (res.ok) {
        setTold(next);
        onChanged();
      }
      return res;
    },
    { failed: (failure) => setError(describeError(failure, t)), same: (a, b) => a?.id === b?.id },
  );
  const shown = pinning.shown('favorite', told);

  /*
   * The list is fetched the first time it is opened and kept, since published posts change far more slowly than this is
   * opened and closed.
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

  const choose = (post: LibraryPost): void => {
    setError(null);
    setOpen(false);
    pinning.want('favorite', { id: post.id, title: postName(post) }, told);
  };

  const remove = (): void => {
    setError(null);
    pinning.want('favorite', null, told);
  };

  return (
    <View style={styles.slot}>
      <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{t(copy.label)}</Text>

      <View style={[styles.row, { flexDirection: dir.row }]}>
        <Text
          style={[styles.value, dir.free, { color: shown ? colors.textPrimary : colors.textSecondary }]}
          numberOfLines={1}
        >
          {shown ? shown.title : t('favorites.none')}
        </Text>
        {shown ? (
          <Pressable
            onPress={remove}
            reachSize={WORD}
            accessibilityRole="button"
            accessibilityLabel={t('common.remove')}
            style={({ pressed }) => pressed && heldDim}
          >
            <Text style={[styles.action, { color: colors.textSecondary }]}>{t('common.remove')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={toggle}
          reachSize={WORD}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={open ? t('common.cancel') : t('favorites.change')}
          style={({ pressed }) => pressed && heldDim}
        >
          <Text style={[styles.action, { color: colors.primary }]}>
            {open ? t('common.cancel') : t('favorites.change')}
          </Text>
        </Pressable>
      </View>

      {open ? (
        posts === null ? (
          <Loading style={styles.spinner} />
        ) : posts.length === 0 ? (
          <Text style={[styles.empty, dir.text, { color: colors.textSecondary }]}>{t(copy.empty)}</Text>
        ) : (
          /* A plain map, not a list: this sits inside the edit screen's ScrollView. */
          <View style={styles.options}>
            {posts.map((p) => {
              const on = shown?.id === p.id;
              return (
                <PressableScale
                  key={p.id}
                  onPress={() => choose(p)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={postName(p)}
                  // The one already chosen in the solid violet every chosen option wears.
                  style={[
                    styles.option,
                    {
                      backgroundColor: on ? colors.primary : colors.controlTrack,
                      borderWidth: 1,
                      borderColor: on ? colors.primary : colors.glassBorder,
                    },
                  ]}
                >
                  <Text style={[styles.optionText, dir.free, { color: on ? colors.textOnPrimary : colors.textPrimary }]} numberOfLines={1}>
                    {postName(p)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        )
      ) : null}

      {error ? (
        <Text style={[styles.error, dir.text, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },
  heading: { ...sectionLabel },
  slot: { gap: spacing.xs },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  row: { alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH_TARGET },
  value: { flex: 1, fontSize: typography.ios.row },
  action: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  spinner: { marginVertical: spacing.sm },
  options: { gap: spacing.xs },
  option: { borderRadius: radii.md, paddingHorizontal: spacing.md, justifyContent: 'center', minHeight: MIN_TOUCH_TARGET },
  optionText: { fontSize: typography.sizes.md },
  empty: { fontSize: typography.sizes.sm },
  error: { fontSize: typography.sizes.sm },
});
