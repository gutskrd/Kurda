import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { RootNavigation } from '../navigation/rootStack';
import { spacing, typography } from '../theme/tokens';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';

/**
 * Play tab (KUR-054): find a 1v1 match. Queuing returns a room once an
 * opponent is paired; the match itself runs in GameScreen. On the glass theme.
 */
export function PlayScreen() {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const topInset = useScreenTopInset();
  const tabBarInset = useTabBarInset();
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const findMatch = async () => {
    setSearching(true);
    setNote(null);
    const res = await client.post<{ roomId?: string; status?: string }>('/matchmaking/queue');
    if (res.ok && res.data.roomId) {
      setSearching(false);
      navigation.navigate('Game', { roomId: res.data.roomId });
    } else if (res.ok) {
      // queued, waiting for an opponent — the room arrives via matchmaking
      setNote('Searching for an opponent…');
    } else {
      setSearching(false);
      setNote(describeError(res.error).message);
    }
  };

  return (
    <GradientBackground>
      <ScrollView contentContainerStyle={[styles.screen, { paddingTop: topInset, paddingBottom: tabBarInset }]} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.card}>
          <Icon name="play" size={56} tone="primary" />
          <Text style={[styles.title, { color: colors.primary }]}>Play</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Head-to-head Kurdish quiz — fastest correct answers win.</Text>

          {searching ? (
            <View style={styles.searching}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.note, { color: colors.textSecondary }]}>{note ?? 'Finding a match…'}</Text>
            </View>
          ) : (
            <ClayButton label="Find 1v1 match" tone="primary" onPress={findMatch} style={styles.button} />
          )}
          {!searching && note ? <Text style={[styles.note, { color: colors.textSecondary }]}>{note}</Text> : null}
        </GlassCard>

        <GlassCard style={styles.card}>
          <Icon name="sparkle" size={40} tone="primary" />
          <Text style={[styles.title, { color: colors.primary }]}>Kurdish Wordle</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Guess the daily word in six tries — solo.</Text>
          <ClayButton label="Play Wordle" tone="neutral" onPress={() => navigation.navigate('Wordle')} style={styles.button} />
        </GlassCard>

        <GlassCard style={styles.card}>
          <Icon name="chat" size={40} tone="primary" />
          <Text style={[styles.title, { color: colors.primary }]}>Rhyming Words</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Find Kurdish words that rhyme, against the clock — solo.</Text>
          <ClayButton label="Play Rhymes" tone="neutral" onPress={() => navigation.navigate('Rhyme')} style={styles.button} />
        </GlassCard>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, alignItems: 'center', padding: spacing.xl, gap: spacing.lg },
  card: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.md },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  subtitle: { fontSize: typography.sizes.md, textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: spacing.md },
  searching: { alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  note: { fontSize: typography.sizes.md, textAlign: 'center' },
});
