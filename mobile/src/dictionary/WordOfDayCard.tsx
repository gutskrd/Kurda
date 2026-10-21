import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SkeletonText } from '../theme/Skeleton';
import { useAuth } from '../auth/AuthContext';
import { radii, spacing, typography } from '../theme/tokens';
import { display, sectionLabel } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { EntryDetail } from './EntryDetail';
import { useI18n } from '../i18n/I18nContext';

interface WordOfDay {
  entryId: string;
  headword: string;
  pos: string | null;
  definitionEn: string | null;
  definitionKu: string | null;
}

/** Home-screen word-of-the-day card (KUR-046); tapping opens the entry. */
export function WordOfDayCard() {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [word, setWord] = useState<WordOfDay | null>(null);
  const [open, setOpen] = useState(false);
  // until the first answer, the card's place is held in grey; with no word (or no answer) it is given up
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let active = true;
    void client.get<{ word: WordOfDay | null }>('/dictionary/word-of-day').then((res) => {
      if (!active) return;
      if (res.ok) setWord(res.data.word);
      setSettled(true);
    });
    return () => {
      active = false;
    };
  }, [client]);

  if (!word) return settled ? null : <WordOfDaySkeleton />;

  return (
    <>
      {/*
        A card like the others on the page, with the word itself as the
        thing that stands out. It used to be the one solid black (or white)
        block on the Learn screen, louder than the lesson above it.
      */}
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`${t('dictionary.wordOfDay')}: ${word.headword}`}
      >
        <Text style={[styles.label, { color: colors.goldText }]}>{t('dictionary.wordOfDay')}</Text>
        <Text style={[styles.headword, { color: colors.textPrimary }]}>{word.headword}</Text>
        <Text style={[styles.def, { color: colors.textSecondary }]} numberOfLines={1}>
          {word.pos ? `${word.pos} · ` : ''}
          {word.definitionEn ?? word.definitionKu ?? ''}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <EntryDetail entryId={word.entryId} onBack={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/** The card in grey: its label, the word, the line under it. */
function WordOfDaySkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <SkeletonText size={typography.sizes.xs} width={112} />
      <SkeletonText size={typography.sizes.xl} lineHeight={HEADWORD_LINE} width={96} />
      <SkeletonText size={typography.sizes.sm} width="40%" />
    </View>
  );
}

/** display(28) sets 1.12 */
const HEADWORD_LINE = Math.round(typography.sizes.xl * typography.displayLineHeight);

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: { ...sectionLabel },
  headword: { ...display(typography.sizes.xl) },
  def: { fontSize: typography.sizes.sm },
});
