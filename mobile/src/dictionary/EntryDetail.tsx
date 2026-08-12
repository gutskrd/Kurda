import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useAudio } from '../lesson/useAudio';
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { SenseSection } from './SenseSection';
import type { Entry } from './types';

/** Senses beyond this start collapsed so long entries stay scannable (KUR-045). */
const COLLAPSE_AFTER = 8;

export function EntryDetail({ entryId, onBack }: { entryId: string; onBack: () => void }) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const tabBarInset = useTabBarInset();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [saved, setSaved] = useState(false);
  const audio = useAudio(entry?.audio[0]?.url);

  useEffect(() => {
    let active = true;
    void client.get<Entry>(`/dictionary/entries/${entryId}`).then((res) => {
      if (active && res.ok) {
        setEntry(res.data);
        setSaved(!!res.data.saved);
      }
    });
    return () => {
      active = false;
    };
  }, [client, entryId]);

  const toggleSave = () => {
    const next = !saved;
    setSaved(next); // optimistic
    if (next) void client.put(`/dictionary/entries/${entryId}/save`);
    else void client.delete(`/dictionary/entries/${entryId}/save`);
  };

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Pressable onPress={onBack} accessibilityLabel="Back to search" hitSlop={12}>
            <Text style={[styles.back, { color: colors.primary }]}>‹ Back</Text>
          </Pressable>
        </View>

        {!entry ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <ScrollView contentContainerStyle={[styles.body, { paddingBottom: tabBarInset }]}>
            <View style={styles.headwordRow}>
              <Text style={[styles.headword, { color: colors.textPrimary }]}>{entry.headword}</Text>
              {entry.audio.length > 0 && audio.supported ? (
                <Pressable
                  onPress={() => audio.play(1)}
                  accessibilityLabel="Play pronunciation"
                  style={[styles.audioBtn, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}
                >
                  <Icon name="speaker" size={22} tone="primary" />
                </Pressable>
              ) : null}
              <Pressable
                onPress={toggleSave}
                accessibilityLabel={saved ? 'Remove bookmark' : 'Bookmark word'}
                accessibilityState={{ selected: saved }}
                style={[styles.audioBtn, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}
              >
                <Icon name={saved ? 'star' : 'star-outline'} size={22} color={saved ? colors.gold : colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={[styles.dialect, { color: colors.textSecondary }]}>{entry.dialect}</Text>

            <View style={styles.senses}>
              {entry.senses.map((sense, i) => (
                <SenseSection key={sense.id} sense={sense} startCollapsed={entry.senses.length > COLLAPSE_AFTER && i >= 3} />
              ))}
            </View>

            {entry.xrefs.length > 0 ? (
              <View style={styles.xrefs}>
                <Text style={[styles.xrefsTitle, { color: colors.textSecondary }]}>Related</Text>
                <Text style={[styles.xrefsList, { color: colors.primary }]}>
                  {entry.xrefs.map((x) => `${x.headword} (${x.relation})`).join(' · ')}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  back: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  body: { padding: spacing.lg, gap: spacing.sm },
  headwordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headword: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold },
  audioBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialect: { fontSize: typography.sizes.sm, textTransform: 'capitalize' },
  senses: { marginTop: spacing.md },
  xrefs: { marginTop: spacing.lg, gap: spacing.xs },
  xrefsTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textTransform: 'uppercase' },
  xrefsList: { fontSize: typography.sizes.md },
});
