import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { EntryDetail } from './EntryDetail';
import { useI18n } from '../i18n/I18nContext';

interface WordOfDay {
  entryId: string;
  headword: string;
  pos: string | null;
  definitionEn: string | null;
}

/** Home-screen word-of-the-day card (KUR-046); tapping opens the entry. */
export function WordOfDayCard() {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
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
      <Pressable onPress={() => setOpen(true)} style={[styles.card, { backgroundColor: colors.primary }]} accessibilityRole="button">
        <Text style={[styles.label, { color: colors.textOnPrimary }]}>{t('dictionary.wordOfDay')}</Text>
        <Text style={[styles.headword, { color: colors.textOnPrimary }]}>{word.headword}</Text>
        <Text style={[styles.def, { color: colors.textOnPrimary }]} numberOfLines={1}>
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
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  label: { fontSize: typography.sizes.xs, textTransform: 'uppercase', opacity: 0.8 },
  headword: { ...display(typography.sizes.xxl) },
  def: { fontSize: typography.sizes.md, opacity: 0.9 },
});
