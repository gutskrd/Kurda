import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { EntryDetail } from '../dictionary/EntryDetail';
import { pushRecent } from '../dictionary/recents';
import { useDebouncedValue } from '../dictionary/useDebouncedValue';
import type { SearchHit, SearchResult } from '../dictionary/types';
import { colors, radii, spacing, typography } from '../theme/tokens';

/**
 * Dictionary tab (KUR-045): search-as-you-type with debounce, recent
 * searches, an entry detail page (senses/examples/audio), and a
 * closest-matches state when nothing matches exactly.
 */
export function DictionaryScreen() {
  const { client } = useAuth();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const debounced = useDebouncedValue(query, 250);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length === 0) {
      setResult(null);
      return;
    }
    let active = true;
    setLoading(true);
    void client.get<SearchResult>(`/dictionary/search?q=${encodeURIComponent(q)}`).then((res) => {
      if (!active) return;
      setLoading(false);
      if (res.ok) setResult(res.data);
    });
    return () => {
      active = false;
    };
  }, [debounced, client]);

  const openHit = useCallback((hit: SearchHit) => {
    setRecents((r) => pushRecent(r, hit.headword));
    setOpenEntry(hit.entryId);
  }, []);

  if (openEntry) {
    return <EntryDetail entryId={openEntry} onBack={() => setOpenEntry(null)} />;
  }

  const results = result?.results ?? [];
  const showRecents = query.trim().length === 0 && recents.length > 0;

  return (
    <View style={styles.screen}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search Kurdish or English…"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        accessibilityLabel="Dictionary search"
      />

      {result?.fuzzy ? <Text style={styles.banner}>No exact match — showing closest words</Text> : null}

      {showRecents ? (
        <View style={styles.recents}>
          <Text style={styles.recentsTitle}>Recent</Text>
          {recents.map((r) => (
            <Pressable key={r} onPress={() => setQuery(r)} style={styles.recentRow}>
              <Text style={styles.recentText}>{r}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {loading && results.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
      ) : null}

      {query.trim().length > 0 && !loading && results.length === 0 ? (
        <Text style={styles.empty}>No results for “{query.trim()}”.</Text>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(h) => h.entryId}
        renderItem={({ item }) => (
          <Pressable onPress={() => openHit(item)} style={styles.hit}>
            <Text style={styles.hitWord}>{item.headword}</Text>
            <Text style={styles.hitDef} numberOfLines={1}>
              {item.pos ? `${item.pos} · ` : ''}
              {item.definitionEn ?? ''}
            </Text>
          </Pressable>
        )}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.sm },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: typography.sizes.lg,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  banner: { fontSize: typography.sizes.sm, color: colors.textSecondary, fontStyle: 'italic' },
  recents: { gap: spacing.xs },
  recentsTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: colors.textSecondary, textTransform: 'uppercase' },
  recentRow: { paddingVertical: spacing.sm },
  recentText: { fontSize: typography.sizes.md, color: colors.primary },
  empty: { color: colors.textSecondary, marginTop: spacing.lg },
  hit: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  hitWord: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary },
  hitDef: { fontSize: typography.sizes.sm, color: colors.textSecondary },
});
