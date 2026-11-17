import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { heldRow, heldDim } from '../theme/MotionParts';
import { useAuth } from '../auth/AuthContext';
import { describeError, isMaintenance } from '../api/errors';
import { EntryDetail } from '../dictionary/EntryDetail';
import { SourceLine } from '../dictionary/SourceLine';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { pushRecent } from '../dictionary/recents';
import { useDebouncedValue } from '../dictionary/useDebouncedValue';
import type { SavedWord, SearchHit, SearchResult } from '../dictionary/types';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET, reachSlop } from '../a11y/a11y';
import { useDirection } from '../reports/direction';
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
  /*
   * Right to left, the rows start on the right; a headword and its meaning
   * are read in their own direction (Latin Kurmancî and English stay left to
   * right on a Soranî page), lined up with the page.
   */
  const dir = useDirection();
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
    const at = saved.findIndex((w) => w.entryId === entryId);
    const word = saved[at];
    if (!word) return;
    setSaved((s) => s.filter((w) => w.entryId !== entryId));
    void client.delete(`/dictionary/entries/${entryId}/save`).then((res) => {
      if (res.ok) return;
      // it did not take: the word goes back in its place and why is said, as the entry's own bookmark does
      setSaved((s) => (s.some((w) => w.entryId === entryId) ? s : [...s.slice(0, at), word, ...s.slice(at)]));
      if (!isMaintenance(res.error)) Alert.alert(describeError(res.error, t));
    });
  };

  const results = result?.results ?? [];
  const isEmpty = query.trim().length === 0;
  // a saved word's ✕ is at the row's end: on the right, or on the left where the row is mirrored
  const towardWord = dir.row === 'row-reverse' ? 'right' : 'left';
  const removeReach = reachSlop(MIN_TOUCH_TARGET, MIN_TOUCH_TARGET, { edge: SAVED_ROW_REACH, limit: { [towardWord]: 0 } });
  const showRecents = isEmpty && recents.length > 0;

  return (
    <GradientBackground>
      <ScreenHeader title={t('nav.dictionary')} onBack={onBack} browse />
      <View style={styles.screen}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          label={t('dictionary.searchLabel')}
          placeholder={t('dictionary.searchPlaceholder')}
        />

        {result?.fuzzy ? <Text style={[styles.banner, dir.text, { color: colors.textSecondary }]}>{t('dictionary.noExactMatch')}</Text> : null}

        {showRecents ? (
          <View style={styles.recents}>
            <Text style={[styles.recentsTitle, dir.text, { color: colors.textSecondary }]}>{t('dictionary.recent')}</Text>
            {recents.map((r) => (
              <Pressable
                key={r}
                onPress={() => setQuery(r)}
                style={({ pressed }) => [styles.recentRow, pressed && heldRow(colors.controlTrack)]}
                accessibilityRole="button"
              >
                <Text style={[styles.recentText, dir.free, { color: colors.primary }]}>{r}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {isEmpty && !savedSettled ? <SavedSkeleton /> : null}

        {isEmpty && saved.length > 0 ? (
          <View style={styles.recents}>
            {/* the heading's mark in the heading's own grey: saving a word is not earning it, which is what gold is for */}
            <View style={[styles.savedHeading, { flexDirection: dir.row }]}>
              <Icon name="bookmark" size={13} color={colors.textSecondary} />
              <Text style={[styles.recentsTitle, dir.text, { color: colors.textSecondary }]}>{t('saved.title')}</Text>
            </View>
            {saved.map((w) => (
              <View key={w.entryId} style={[styles.savedRow, { flexDirection: dir.row }]}>
                <Pressable
                  style={({ pressed }) => [styles.savedMain, pressed && heldRow(colors.controlTrack)]}
                  onPress={() => setOpenEntry(w.entryId)}
                  accessibilityRole="button"
                  hitSlop={SAVED_WORD_REACH}
                >
                  <Text style={[styles.recentText, dir.free, { color: colors.primary }]}>{w.headword}</Text>
                  <Text style={[styles.hitDef, dir.free, { color: colors.textSecondary }]} numberOfLines={1}>
                    {w.definitionEn ?? w.definitionKu ?? ''}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => removeSaved(w.entryId)}
                  accessibilityRole="button"
                  accessibilityLabel={t('dictionary.removeSaved', { word: w.headword })}
                  hitSlop={removeReach}
                  style={({ pressed }) => [styles.removeButton, pressed && heldDim]}
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
          // the gutter inside the list, so a held row's highlight can reach past its edges
          style={styles.hits}
          contentContainerStyle={[styles.hitsBody, { paddingBottom: tabBarInset }]}
          renderItem={({ item }) => (
            <Pressable onPress={() => openHit(item)} style={({ pressed }) => [styles.hit, pressed && heldRow(colors.controlTrack)]} accessibilityRole="button">
              <Text style={[styles.hitWord, dir.free, { color: colors.textPrimary }]}>{item.headword}</Text>
              <Text style={[styles.hitDef, dir.free, { color: colors.textSecondary }]} numberOfLines={1}>
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
  const dir = useDirection();
  return (
    <View style={styles.recents} accessibilityLabel={t('common.loading')}>
      <SkeletonText size={typography.sizes.xs} width={72} />
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.savedRow, { flexDirection: dir.row }]}>
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

/*
 * A saved word and its ✕ share their row's height: both reach up and down
 * through the row's padding and half the gap to the next row, so a tap
 * along the row lands on one of the two and never on the row beside it. The
 * word reaches as far to either side, and stops short of the ✕; the ✕
 * reaches nothing toward the word, because a tap that falls between them
 * must not remove a word somebody meant to open.
 */
const SAVED_ROW_REACH = spacing.sm + spacing.xs / 2;
const SAVED_WORD_REACH = reachSlop(null, null, { edge: SAVED_ROW_REACH });

const styles = StyleSheet.create({
  // the app's own gutter at the sides, so the field and the words line up with the way back above them
  screen: { flex: 1, paddingHorizontal: layout.gutter, paddingVertical: spacing.lg, gap: spacing.sm },
  banner: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
  recents: { gap: spacing.xs },
  savedHeading: { alignItems: 'center', gap: spacing.xs },
  recentsTitle: { ...sectionLabel },
  // a row to tap: a fingertip tall, the word in the middle of it
  recentRow: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingVertical: spacing.sm },
  recentText: { fontSize: typography.sizes.md },
  savedRow: { alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  savedMain: { flex: 1 },
  // a fingertip's worth around the small cross, so it is not missed for the row beside it
  removeButton: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  hits: { marginHorizontal: -spacing.sm },
  hitsBody: { paddingHorizontal: spacing.sm },
  hit: { paddingVertical: spacing.md },
  hitWord: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  hitDef: { fontSize: typography.sizes.sm },
});
