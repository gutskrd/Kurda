import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { EntryDetail } from '../dictionary/EntryDetail';
import { SourceLine } from '../dictionary/SourceLine';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { pushRecent } from '../dictionary/recents';
import { useDebouncedValue } from '../dictionary/useDebouncedValue';
import type { SavedWord, SearchHit, SearchResult } from '../dictionary/types';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { useI18n } from '../i18n/I18nContext';
import { EmptyState } from '../theme/EmptyState';
import { SearchField } from '../theme/SearchField';

/**
 * Dictionary tab (KUR-045): search-as-you-type with debounce, recent
 * searches, an entry detail page (senses/examples/audio), and a
 * closest-matches state when nothing matches exactly.
 */
/** `onBack` is how you leave: this is a pushed screen, not a tab, since #809. */
export function DictionaryScreen({ onBack }: { onBack: () => void }) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const tabBarInset = useTabBarInset();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedWord[]>([]);
  // the saved words' place is held until the first answer, so the list does not drop in under the field
  const [savedSettled, setSavedSettled] = useState(false);
  const debounced = useDebouncedValue(query, 250);

  const loadSaved = useCallback(() => {
    void client.get<{ words: SavedWord[] }>('/me/saved-words').then((res) => {
      if (res.ok) setSaved(res.data.words);
      setSavedSettled(true);
    });
  }, [client]);

  useEffect(loadSaved, [loadSaved]);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length === 0) {
      setResult(null);
      setFailed(false);
      return;
    }
    let active = true;
    setLoading(true);
    setFailed(false);
    void client.get<SearchResult>(`/dictionary/search?q=${encodeURIComponent(q)}`).then((res) => {
      if (!active) return;
      setLoading(false);
      if (res.ok) setResult(res.data);
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [debounced, client, retryKey]);

  const openHit = useCallback((hit: SearchHit) => {
    setRecents((r) => pushRecent(r, hit.headword));
    setOpenEntry(hit.entryId);
  }, []);

  if (openEntry) {
    return (
      <EntryDetail
        entryId={openEntry}
        onBack={() => {
          setOpenEntry(null);
          loadSaved(); // bookmark may have changed
        }}
      />
    );
  }

  const removeSaved = (entryId: string) => {
    setSaved((s) => s.filter((w) => w.entryId !== entryId));
    void client.delete(`/dictionary/entries/${entryId}/save`);
  };

  const results = result?.results ?? [];
  const isEmpty = query.trim().length === 0;
  const showRecents = isEmpty && recents.length > 0;

  return (
    <GradientBackground>
      <ScreenHeader title={t('nav.dictionary')} onBack={onBack} />
      <View style={styles.screen}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          label={t('dictionary.searchLabel')}
          placeholder={t('dictionary.searchPlaceholder')}
        />

        {result?.fuzzy ? <Text style={[styles.banner, { color: colors.textSecondary }]}>{t('dictionary.noExactMatch')}</Text> : null}

        {showRecents ? (
          <View style={styles.recents}>
            <Text style={[styles.recentsTitle, { color: colors.textSecondary }]}>{t('dictionary.recent')}</Text>
            {recents.map((r) => (
              <Pressable key={r} onPress={() => setQuery(r)} style={styles.recentRow} accessibilityRole="button">
                <Text style={[styles.recentText, { color: colors.primary }]}>{r}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {isEmpty && !savedSettled ? <SavedSkeleton /> : null}

        {isEmpty && saved.length > 0 ? (
          <View style={styles.recents}>
            <View style={styles.savedHeading}>
              <Icon name="bookmark" size={13} color={colors.gold} />
              <Text style={[styles.recentsTitle, { color: colors.textSecondary }]}>{t('saved.title')}</Text>
            </View>
            {saved.map((w) => (
              <View key={w.entryId} style={styles.savedRow}>
                <Pressable style={styles.savedMain} onPress={() => setOpenEntry(w.entryId)} accessibilityRole="button">
                  <Text style={[styles.recentText, { color: colors.primary }]}>{w.headword}</Text>
                  <Text style={[styles.hitDef, { color: colors.textSecondary }]} numberOfLines={1}>
                    {w.definitionEn ?? w.definitionKu ?? ''}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => removeSaved(w.entryId)}
                  accessibilityRole="button"
                  accessibilityLabel={t('dictionary.removeSaved', { word: w.headword })}
                  style={styles.removeButton}
                >
                  <Icon name="close" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {loading && results.length === 0 ? <HitsSkeleton /> : null}

        {failed && !loading ? (
          <ErrorRetry
            message={t('dictionary.searchFailed')}
            onRetry={() => setRetryKey((k) => k + 1)}
          />
        ) : query.trim().length > 0 && !loading && results.length === 0 ? (
          <EmptyState title={t('dictionary.noResults', { query: query.trim() })} />
        ) : null}

        <FlatList
          data={results}
          keyExtractor={(h) => h.entryId}
          contentContainerStyle={{ paddingBottom: tabBarInset }}
          renderItem={({ item }) => (
            <Pressable onPress={() => openHit(item)} style={styles.hit} accessibilityRole="button">
              <Text style={[styles.hitWord, { color: colors.textPrimary }]}>{item.headword}</Text>
              <Text style={[styles.hitDef, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.pos ? `${item.pos} · ` : ''}
                {item.definitionEn ?? item.definitionKu ?? ''}
              </Text>
            </Pressable>
          )}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={<SourceLine />}
        />
      </View>
    </GradientBackground>
  );
}

/** The saved words in grey: the heading, then each word, its meaning and its ✕. */
function SavedSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <View style={styles.recents} accessibilityLabel={t('common.loading')}>
      <SkeletonText size={typography.sizes.xs} width={72} />
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.savedRow}>
          <View style={styles.savedMain}>
            <SkeletonText size={typography.sizes.md} width={i % 2 ? 56 : 80} />
            <SkeletonText size={typography.sizes.sm} width={i % 2 ? '44%' : '60%'} />
          </View>
          <View style={styles.removeButton}>
            <Skeleton width={18} height={18} radius={radii.pill} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Results in grey while a search is out: the word and its first meaning, at the rows' own spacing. */
function HitsSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <View accessibilityLabel={t('common.loading')}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.hit}>
          <SkeletonText size={typography.sizes.lg} width={i % 2 ? 72 : 104} />
          <SkeletonText size={typography.sizes.sm} width={i % 2 ? '52%' : '68%'} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  banner: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
  recents: { gap: spacing.xs },
  savedHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  recentsTitle: { ...sectionLabel },
  recentRow: { paddingVertical: spacing.sm },
  recentText: { fontSize: typography.sizes.md },
  savedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  savedMain: { flex: 1 },
  // a fingertip's worth around the small cross, so it is not missed for the row beside it
  removeButton: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  hit: { paddingVertical: spacing.md },
  hitWord: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  hitDef: { fontSize: typography.sizes.sm },
});
