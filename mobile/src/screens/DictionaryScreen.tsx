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
 * The dictionary: search as you type, recent searches, saved words, entry details, and closest matches when nothing
 * matches exactly. A pushed screen, so `onBack` leaves it.
 */
export function DictionaryScreen({ onBack }: { onBack: () => void }) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  // Rows mirror right to left, while headwords and meanings keep their own direction.
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
  // Saved words hold their place until the first answer, so the list does not drop in under the field.
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
          loadSaved(); // A bookmark may have changed.
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
      // The removal failed: put the word back in its place and say why, as the entry's own bookmark does.
      setSaved((s) => (s.some((w) => w.entryId === entryId) ? s : [...s.slice(0, at), word, ...s.slice(at)]));
      if (!isMaintenance(res.error)) Alert.alert(describeError(res.error, t));
    });
  };

  const results = result?.results ?? [];
  const isEmpty = query.trim().length === 0;
  // A saved word's ✕ is at the row's end, which is on the left when the row is mirrored.
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
            {/* The heading's icon in grey: gold is for what is earned, and saving a word is not. */}
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
          // The gutter sits inside the list so a pressed row's highlight can reach past it.
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

/** The saved-words placeholder: heading, then rows of word, meaning and ✕. */
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

/** The results placeholder while searching: word and first meaning, at the rows' spacing. */
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
 * A saved word and its ✕ each reach through the row's padding and half the gap to the next row, so a tap along the
 * row never lands on a neighbour. The ✕ reaches nothing toward the word, so a tap between them opens the word rather
 * than removing it.
 */
const SAVED_ROW_REACH = spacing.sm + spacing.xs / 2;
const SAVED_WORD_REACH = reachSlop(null, null, { edge: SAVED_ROW_REACH });

const styles = StyleSheet.create({
  // The app's gutter, so the field lines up with the back button above.
  screen: { flex: 1, paddingHorizontal: layout.gutter, paddingVertical: spacing.lg, gap: spacing.sm },
  banner: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
  recents: { gap: spacing.xs },
  savedHeading: { alignItems: 'center', gap: spacing.xs },
  recentsTitle: { ...sectionLabel },
  // A fingertip tall, the word centred.
  recentRow: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingVertical: spacing.sm },
  recentText: { fontSize: typography.sizes.md },
  savedRow: { alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  savedMain: { flex: 1 },
  // A full touch target round the small cross.
  removeButton: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  hits: { marginHorizontal: -spacing.sm },
  hitsBody: { paddingHorizontal: spacing.sm },
  hit: { paddingVertical: spacing.md },
  hitWord: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  hitDef: { fontSize: typography.sizes.sm },
});
