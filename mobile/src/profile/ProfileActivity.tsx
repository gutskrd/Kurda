import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { FeedCard } from '../feed/FeedCard';
import type { FeedItem } from '../feed/types';
import { radii, spacing, typography } from '../theme/tokens';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';

/** The sections the server will answer for, in the order the browser shows them. */
const SECTIONS = ['posts', 'games', 'likes', 'reposts'] as const;
type Section = (typeof SECTIONS)[number];

const LABEL: Record<Section, TranslationKey> = {
  posts: 'profile.tab.posts',
  games: 'nav.games',
  likes: 'profile.tab.likes',
  reposts: 'repost.tab',
};

const GLYPH: Record<Section, IconName> = {
  posts: 'wall',
  games: 'play',
  likes: 'heart',
  reposts: 'repost',
};

/** A game, which stays a row: a line in a history rather than a post. */
interface ActivityEntry {
  id: string;
  title: string;
  detail: string | null;
  at: string;
}

interface ActivityPage {
  entries: ActivityEntry[];
  items: FeedItem[];
}

/**
 * What somebody has been doing, under their profile (KUR-086).
 *
 * The browser has had this since profiles were built and the phone never
 * called the endpoint, so a profile on the phone ended at the bio — you could
 * read who somebody was and not one thing they had written.
 *
 * The server answers in two shapes from the one route, and the reason is worth
 * keeping: posts, likes and reposts come back as whole feed items and are drawn
 * with the same card the wall uses, because a profile that shrank a picture to
 * a thumbnail and a poem to an icon was showing a list *about* posts rather
 * than the posts. Only games stay a row.
 */
export function ProfileActivity({ userId }: { userId: string }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [section, setSection] = useState<Section>('posts');
  const [page, setPage] = useState<ActivityPage | null>(null);

  const load = useCallback(
    (kind: Section) => {
      setPage(null);
      void client.get<ActivityPage>(`/users/${userId}/activity?kind=${kind}&limit=12`).then((res) => {
        // a section that will not load shows as empty rather than as an error:
        // the profile above it is still worth reading
        setPage(res.ok ? res.data : { entries: [], items: [] });
      });
    },
    [client, userId],
  );

  useEffect(() => load(section), [load, section]);

  const items = page?.items ?? [];
  const entries = page?.entries ?? [];
  const empty = page !== null && items.length === 0 && entries.length === 0;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>{t('profile.activity')}</Text>

      {/*
        Scrollable would hide a tab off the edge; four fit across a phone, so
        they share the width and keep their labels.
      */}
      <View style={[styles.tabs, { backgroundColor: colors.glassFill, borderColor: colors.glassBorder }]}>
        {SECTIONS.map((s) => {
          const on = s === section;
          return (
            <Pressable
              key={s}
              onPress={() => setSection(s)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tab, on ? { backgroundColor: colors.controlTrack } : null]}
            >
              <Icon name={GLYPH[s]} size={15} color={on ? colors.textPrimary : colors.textSecondary} />
              <Text
                numberOfLines={1}
                style={[styles.tabText, { color: on ? colors.textPrimary : colors.textSecondary }]}
              >
                {t(LABEL[s])}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {page === null ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
      ) : empty ? (
        <Text style={[styles.nothing, { color: colors.textSecondary }]}>{t('profile.nothingHere')}</Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <FeedCard key={item.key} item={item} />
          ))}
          {entries.map((e) => (
            <View
              key={e.id}
              style={[styles.row, { backgroundColor: colors.glassFill, borderColor: colors.glassBorder }]}
            >
              <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {e.title}
              </Text>
              {e.detail ? (
                <Text style={[styles.rowDetail, { color: colors.textSecondary }]} numberOfLines={1}>
                  {e.detail}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },
  heading: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: typography.weights.bold },
  tabs: {
    flexDirection: 'row',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  tabText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.medium },
  list: { gap: spacing.md },
  nothing: { fontSize: typography.sizes.sm, textAlign: 'center', paddingVertical: spacing.lg },
  row: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: 2,
  },
  rowTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  rowDetail: { fontSize: typography.sizes.sm },
});
