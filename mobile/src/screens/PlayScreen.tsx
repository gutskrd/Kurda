import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { RootNavigation } from '../navigation/rootStack';
import { colors, radii, spacing, typography } from '../theme/tokens';

/**
 * Play tab (KUR-054): find a 1v1 match. Queuing returns a room once an
 * opponent is paired; the match itself runs in GameScreen.
 */
export function PlayScreen() {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
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
    <View style={styles.screen}>
      <Text style={styles.emoji}>🎮</Text>
      <Text style={styles.title}>Play</Text>
      <Text style={styles.subtitle}>Head-to-head Kurdish quiz — fastest correct answers win.</Text>

      {searching ? (
        <View style={styles.searching}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.note}>{note ?? 'Finding a match…'}</Text>
        </View>
      ) : (
        <Pressable onPress={findMatch} style={styles.button}>
          <Text style={styles.buttonText}>Find 1v1 match</Text>
        </Pressable>
      )}
      {!searching && note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  emoji: { fontSize: typography.sizes.xxl },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.primary },
  subtitle: { fontSize: typography.sizes.md, color: colors.textSecondary, textAlign: 'center' },
  button: { alignSelf: 'stretch', backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center', marginTop: spacing.md },
  buttonText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  searching: { alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  note: { color: colors.textSecondary, fontSize: typography.sizes.md, textAlign: 'center' },
});
