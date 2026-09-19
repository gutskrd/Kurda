import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import type { RootNavigation } from '../navigation/rootStack';
import { useTabBarInset } from '../navigation/tabBarLayout';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { getFeed } from './api';
import { FeedCard } from './FeedCard';
import { SECTIONS, kindWithin, type FeedItem, type FeedSection } from './types';

const PAGE = 20;

/**
 * Civak — everything the community has written and posted, on one wall.
 *
 * The same wall the web app opens on, reading the same `/feed`. Before this the
 * phone had Library and Memes as two separate screens behind two links in the
 * Social tab, which meant a poem posted this morning was invisible to anyone
 * looking at pictures — the exact split the web app removed. One wall, one
 * card, and a filter for when you do want just one kind.
 */
export function CivakScreen(): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();

  const navigation = useNavigation<RootNavigation>();
  const tabBarInset = useTabBarInset();
  const [choosing, setChoosing] = useState(false);
  const [section, setSection] = useState<FeedSection>('all');
  const [kind, setKind] = useState<string | null>(null);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [end, setEnd] = useState(false);

  const kinds = SECTIONS.find((s) => s.key === section)?.kinds ?? [];

  /** Changing half drops a kind that belonged to the other one. */
  const chooseSection = useCallback((next: FeedSection) => {
    setSection(next);
    setKind((prev) => kindWithin(next, prev));
  }, []);

  const fetchPage = useCallback(
    (offset: number) => getFeed(client, { section, kind, limit: PAGE, offset }),
    [client, section, kind],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setItems(null);
      void (async () => {
        const res = await fetchPage(0);
        if (!active) return;
        if (res.ok) {
          setItems(res.data.items ?? []);
          setEnd((res.data.items ?? []).length < PAGE);
          setError(null);
        } else {
          setError(res.error);
        }
      })();
      return () => {
        active = false;
      };
    }, [fetchPage]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const res = await fetchPage(0);
    if (res.ok) {
      setItems(res.data.items ?? []);
      setEnd((res.data.items ?? []).length < PAGE);
      setError(null);
    }
    setRefreshing(false);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || end || !items) return;
    setLoadingMore(true);
    const res = await fetchPage(items.length);
    if (res.ok) {
      const batch = res.data.items ?? [];
      setItems((prev) => (prev ? [...prev, ...batch] : batch));
      setEnd(batch.length < PAGE);
    }
    setLoadingMore(false);
  }, [fetchPage, loadingMore, end, items]);

  /** Replace one card in place, so a like does not reload the wall. */
  const replace = useCallback((next: FeedItem) => {
    setItems((prev) => (prev ?? []).map((i) => (i.key === next.key ? next : i)));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => <FeedCard item={item} onChanged={replace} />,
    [replace],
  );

  return (
    <GradientBackground>
      <View style={[styles.screen, { paddingTop: topInset }]}>
        <Text style={[styles.title, { color: colors.primary }]}>{t('civak.title')}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('civak.subtitle')}</Text>

        <View style={styles.filters}>
          <View style={styles.filterRow}>
            <View style={styles.filterGrow}>
              <Segmented
                options={SECTIONS.map((s) => s.key)}
                value={section}
                onChange={chooseSection}
                labelOf={(key) => t(SECTIONS.find((s) => s.key === key)!.labelKey)}
              />
            </View>
            {/*
             * Posting lives here, next to the wall it adds to, exactly where
             * the browser keeps it — and it is a plus, which says "add" and
             * nothing about what. It used to be a sparkle in a pill floating
             * over the bottom-right corner: an Android habit, and on iOS the
             * one corner a tab bar has already claimed.
             */}
            <Pressable
              onPress={() => setChoosing(true)}
              accessibilityRole="button"
              accessibilityLabel={t('post.open')}
              style={({ pressed }) => [styles.plus, { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}
            >
              <Icon name="plus" size={20} color={colors.textOnPrimary} />
            </Pressable>
          </View>
          {/* the second level appears only once there is a half to narrow */}
          {kinds.length > 0 && (
            <Segmented
              options={['all', ...kinds.map((k) => k.key)]}
              value={kind ?? 'all'}
              onChange={(next) => setKind(next === 'all' ? null : next)}
              labelOf={(key) =>
                key === 'all' ? t('civak.filter.allKinds') : t(kinds.find((k) => k.key === key)!.labelKey)
              }
            />
          )}
        </View>

        <AsyncBoundary loading={items === null} error={items === null ? error : null} onRetry={() => void refresh()}>
          <FlatList
            data={items}
            keyExtractor={(i) => i.key}
            renderItem={renderItem}
            contentContainerStyle={[styles.list, { paddingBottom: tabBarInset }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>{t('civak.empty')}</Text>}
            ListFooterComponent={
              loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} /> : null
            }
          />
        </AsyncBoundary>

        <PostChooser
          open={choosing}
          onClose={() => setChoosing(false)}
          onPick={(what) => {
            setChoosing(false);
            navigation.navigate(what === 'words' ? 'LibraryCompose' : 'PostPicture');
          }}
        />

      </View>
    </GradientBackground>
  );
}

/**
 * Asks once, and only once you have decided to post something — the same
 * question the browser asks, in the same words.
 */
function PostChooser({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (what: 'words' | 'picture') => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
        {/* the card swallows the tap so choosing does not also dismiss */}
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.glassBorder }]}
          onPress={() => undefined}
        >
        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{t('post.what')}</Text>
        {([
          ['words', 'book', 'civak.section.writing', 'post.words.sub'],
          ['picture', 'image', 'civak.section.pictures', 'post.picture.sub'],
        ] as const).map(([what, icon, name, sub]) => (
          <Pressable
            key={what}
            onPress={() => onPick(what)}
            accessibilityRole="button"
            style={[styles.choice, { borderColor: colors.glassBorder, backgroundColor: colors.controlTrack }]}
          >
            <Icon name={icon} size={26} tone="primary" />
            <View style={styles.choiceText}>
              <Text style={[styles.choiceName, { color: colors.textPrimary }]}>{t(name)}</Text>
              <Text style={[styles.choiceSub, { color: colors.textSecondary }]}>{t(sub)}</Text>
            </View>
          </Pressable>
        ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  title: { ...display(typography.sizes.xl) },
  sub: { fontSize: typography.sizes.sm, marginBottom: spacing.md },
  filters: { gap: spacing.sm, marginBottom: spacing.md },
  list: { gap: spacing.md },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterGrow: { flex: 1 },
  /*
   * The browser shrinks its post button to a 38px circle at this width. iOS
   * asks for 44 before it will call something tappable, so it is 44 here —
   * same shape, same place, a thumb-sized version of it.
   */
  plus: { width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { margin: spacing.lg, padding: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.lg, gap: spacing.sm },
  sheetTitle: { ...display(typography.sizes.lg), marginBottom: spacing.xs },
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.md },
  choiceText: { flex: 1 },
  choiceName: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  choiceSub: { fontSize: typography.sizes.sm },
});
