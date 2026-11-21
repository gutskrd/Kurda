import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useModalSlide } from '../a11y/useReducedMotion';
import { PressableScale } from '../theme/MotionParts';
import { ReachReset } from '../theme/Pressable';
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

/** The word-of-the-day card; tapping opens the entry. */
export function WordOfDayCard() {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [word, setWord] = useState<WordOfDay | null>(null);
  const [open, setOpen] = useState(false);
  const slide = useModalSlide();
  // Until the first answer the card's place is held in grey; with no word or no answer it is given up.
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
      {/* A card like the others on the page, with the word itself standing out. */}
      <PressableScale
        onPress={() => setOpen(true)}
        style={[styles.card, { backgroundColor: colors.surface }]}
        accessibilityRole="button"
        accessibilityLabel={`${t('dictionary.wordOfDay')}: ${word.headword}`}
      >
        <Text style={[styles.label, { color: colors.goldText }]}>{t('dictionary.wordOfDay')}</Text>
        <Text style={[styles.headword, { color: colors.textPrimary }]}>{word.headword}</Text>
        <Text style={[styles.def, { color: colors.textSecondary }]} numberOfLines={1}>
          {word.pos ? `${word.pos} · ` : ''}
          {word.definitionEn ?? word.definitionKu ?? ''}
        </Text>
      </PressableScale>
      <Modal visible={open} animationType={slide} onRequestClose={() => setOpen(false)}>
        {/* The entry is its own screen, away from the Learn page's controls, so their reach groups do not cap it. */}
        <ReachReset>
          <EntryDetail entryId={word.entryId} onBack={() => setOpen(false)} />
        </ReachReset>
      </Modal>
    </>
  );
}

/** The card in grey: its label, the word, the line under it. */
function WordOfDaySkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <SkeletonText size={typography.sizes.text} width={112} />
      <SkeletonText size={typography.sizes.title} lineHeight={HEADWORD_LINE} width={96} />
      <SkeletonText size={typography.sizes.text} width="40%" />
    </View>
  );
}

/** display(28) sets 1.12. */
const HEADWORD_LINE = Math.round(typography.sizes.title * typography.displayLineHeight);

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: { ...sectionLabel },
  headword: { ...display(typography.sizes.title) },
  def: { fontSize: typography.sizes.text },
});
