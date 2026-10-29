import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { tileAnswer } from '@kurda/shared';
import { radii, spacing, typography } from '../../theme/tokens';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { useTheme } from '../../theme/ThemeProvider';
import type { Exercise } from '../types';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { useAnswerMode } from '../answerModePref';
import { ExerciseHeadline } from './ExerciseHeadline';
import { KurdishAnswerInput } from './KurdishAnswerInput';
import { PromptScene } from './SpeechBubble';
import { PromptWords } from './PromptWords';
import { AnswerModeSwitch, WordBank } from './WordBank';

interface Props {
  exercise: Exercise;
  text: string;
  onChangeText: (text: string) => void;
  disabled: boolean;
  /** the course's variety of Kurdish, for the key bar */
  dialect?: string | null;
  /** how the answer was graded, once it has been */
  verdict?: 'right' | 'wrong' | null;
}

/**
 * Translate the sentence Hevalo says in his speech bubble — its words dotted
 * where they can be tapped for what they mean. The answer is built from word
 * tiles when the item comes with them (unless this device would rather type),
 * or typed with the Kurdish key bar. Hevalo is pleased with a right answer and
 * thinks a wrong one over with you.
 */
export function TranslateExercise({ exercise, text, onChangeText, disabled, dialect, verdict = null }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const bank = exercise.bank && exercise.bank.length > 0 ? exercise.bank : null;
  const [mode, setMode] = useAnswerMode();
  const tiles = !!bank && mode === 'tiles';
  const [placed, setPlaced] = useState<number[]>([]);

  // back on the tiles, the answer is what they say again
  useEffect(() => {
    if (tiles && bank) onChangeText(tileAnswer(bank, placed));
    // only as the way of answering changes; laying a tile says it itself
  }, [tiles]);

  const lay = (next: number[]): void => {
    setPlaced(next);
    if (bank) onChangeText(tileAnswer(bank, next));
  };

  return (
    <View style={styles.container}>
      <ExerciseHeadline>{t('lesson.translate.prompt')}</ExerciseHeadline>
      {exercise.prompt ? (
        <PromptScene voice={null} audio={null} reaction={verdict === 'right' ? 'cheer' : verdict === 'wrong' ? 'hmm' : null}>
          <PromptWords prompt={exercise.prompt} tokens={exercise.promptTokens} style={[styles.prompt, { color: colors.textPrimary }]} />
        </PromptScene>
      ) : null}
      {tiles && bank ? (
        <WordBank
          bank={bank}
          placed={placed}
          onChange={lay}
          disabled={disabled}
          verdict={verdict}
          lineLabel={t('lesson.translate.answerLabel')}
        />
      ) : (
        <KurdishAnswerInput
          text={text}
          onChangeText={onChangeText}
          dialect={dialect}
          disabled={disabled}
          verdict={verdict}
          placeholder={t('lesson.translate.placeholder')}
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.controlTrack }, disabled && styles.dim]}
          accessibilityLabel={t('lesson.translate.answerLabel')}
        />
      )}
      {bank && !disabled ? <AnswerModeSwitch mode={mode} onChange={setMode} end={dir.rtl ? 'left' : 'right'} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  prompt: { fontSize: typography.sizes.lg, fontWeight: typography.weights.medium },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: typography.sizes.lg,
  },
  dim: { opacity: 0.6 },
});
