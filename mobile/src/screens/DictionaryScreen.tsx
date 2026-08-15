import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { EntryDetail } from '../dictionary/EntryDetail';
import { pushRecent } from '../dictionary/recents';
import { useDebouncedValue } from '../dictionary/useDebouncedValue';
import type { SavedWord, SearchHit, SearchResult } from '../dictionary/types';
import { radii, spacing, typography } from '../theme/tokens';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';

/**
 * Dictionary tab (KUR-045): search-as-you-type with debounce, recent
 * searches, an entry detail page (senses/examples/audio), and a
 * closest-matches state when nothing matches exactly.
 */
export function DictionaryScreen() {
  const { client } = useAuth();
  const { colors } = useTheme();
  const tabBarInset = useTabBarInset();
  const topInset = useScreenTopInset();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedWord[]>([]);
  const debounced = useDebouncedValue(query, 250);

  const loadSaved = useCallback(() => {
    void client.get<{ words: SavedWord[] }>('/me/saved-words').then((res) => {
      if (res.ok) setSaved(res.data.words);
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
      <View style={[styles.screen, { paddingTop: topInset }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search Kurdish or English…"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder, color: colors.textPrimary }]}
          accessibilityLabel="Dictionary search"
        />

        {result?.fuzzy ? <Text style={[styles.banner, { color: colors.textSecondary }]}>No exact match — showing closest words</Text> : null}

        {showRecents ? (
          <View style={styles.recents}>
            <Text style={[styles.recentsTitle, { color: colors.textSecondary }]}>Recent</Text>
            {recents.map((r) => (
              <Pressable key={r} onPress={() => setQuery(r)} style={styles.recentRow}>
                <Text style={[styles.recentText, { color: colors.primary }]}>{r}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {isEmpty && saved.length > 0 ? (
          <View style={styles.recents}>
            <View style={styles.savedHeading}>
              <Icon name="star" size={13} color={colors.gold} />
              <Text style={[styles.recentsTitle, { color: colors.textSecondary }]}>Saved</Text>
            </View>
            {saved.map((w) => (
              <View key={w.entryId} style={styles.savedRow}>
                <Pressable style={styles.savedMain} onPress={() => setOpenEntry(w.entryId)}>
                  <Text style={[styles.recentText, { color: colors.primary }]}>{w.headword}</Text>
                  <Text style={[styles.hitDef, { color: colors.textSecondary }]} numberOfLines={1}>
                    {w.definitionEn ?? ''}
                  </Text>
                </Pressable>
                <Pressable onPress={() => removeSaved(w.entryId)} accessibilityLabel={`Remove ${w.headword}`} hitSlop={8}>
                  <Text style={[styles.remove, { color: colors.textSecondary }]}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {loading && results.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
        ) : null}

        {failed && !loading ? (
          <ErrorRetry
            message="Couldn’t search right now. Check your connection and try again."
            onRetry={() => setRetryKey((k) => k + 1)}
          />
        ) : query.trim().length > 0 && !loading && results.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No results for “{query.trim()}”.</Text>
        ) : null}

        <FlatList
          data={results}
          keyExtractor={(h) => h.entryId}
          contentContainerStyle={{ paddingBottom: tabBarInset }}
          renderItem={({ item }) => (
            <Pressable onPress={() => openHit(item)} style={[styles.hit, { borderBottomColor: colors.glassBorder }]}>
              <Text style={[styles.hitWord, { color: colors.textPrimary }]}>{item.headword}</Text>
              <Text style={[styles.hitDef, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.pos ? `${item.pos} · ` : ''}
                {item.definitionEn ?? ''}
              </Text>
            </Pressable>
          )}
          keyboardShouldPersistTaps="handled"
        />
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: typography.sizes.lg,
  },
  banner: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
  recents: { gap: spacing.xs },
  savedHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  recentsTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textTransform: 'uppercase' },
  recentRow: { paddingVertical: spacing.sm },
  recentText: { fontSize: typography.sizes.md },
  savedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  savedMain: { flex: 1 },
  remove: { fontSize: typography.sizes.md },
  empty: { marginTop: spacing.lg },
  hit: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  hitWord: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  hitDef: { fontSize: typography.sizes.sm },
});
