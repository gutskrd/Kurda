import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { EntryDetail } from './EntryDetail';

interface WordOfDay {
  entryId: string;
  headword: string;
  pos: string | null;
  definitionEn: string | null;
}

/** Home-screen word-of-the-day card (KUR-046); tapping opens the entry. */
export function WordOfDayCard() {
  const { client } = useAuth();
  const [word, setWord] = useState<WordOfDay | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void client.get<{ word: WordOfDay | null }>('/dictionary/word-of-day').then((res) => {
      if (active && res.ok) setWord(res.data.word);
    });
    return () => {
      active = false;
    };
  }, [client]);

  if (!word) return null;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.card} accessibilityRole="button">
        <Text style={styles.label}>Word of the day</Text>
        <Text style={styles.headword}>{word.headword}</Text>
        <Text style={styles.def} numberOfLines={1}>
          {word.pos ? `${word.pos} · ` : ''}
          {word.definitionEn ?? ''}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <EntryDetail entryId={word.entryId} onBack={() => setOpen(false)} />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  label: { fontSize: typography.sizes.xs, color: colors.textOnPrimary, textTransform: 'uppercase', opacity: 0.8 },
  headword: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.textOnPrimary },
  def: { fontSize: typography.sizes.md, color: colors.textOnPrimary, opacity: 0.9 },
});
