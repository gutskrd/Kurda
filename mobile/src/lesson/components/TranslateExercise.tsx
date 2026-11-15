import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { tileAnswer } from '@kurda/shared';
import { spacing } from '../../theme/tokens';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { useTheme } from '../../theme/ThemeProvider';
import type { Exercise } from '../types';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { useAnswerMode } from '../answerModePref';
import { askHeadline } from '../asks';
import { useAudio } from '../useAudio';
import { AskScene } from './AskParts';
import { ExerciseHeadline } from './ExerciseHeadline';
import { KurdishAnswerInput } from './KurdishAnswerInput';
import { PromptScene, saidStyle } from './SpeechBubble';
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
 *
 * An item that says which way it goes (`ask`) has the headline for it and
 * the line alone in the bubble (`AskScene`). Into English, the line is
 * Kurdish, and its native recording — when there is one to hear before
 * answering — plays from the bubble, at speed or slowly, said by its
 * character. Into Kurdish, the line is English, with nothing to play.
 */
export function TranslateExercise({ exercise, text, onChangeText, disabled, dialect, verdict = null }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const bank = exercise.bank && exercise.bank.length > 0 ? exercise.bank : null;
  const [mode, setMode] = useAnswerMode();
  const tiles = !!bank && mode === 'tiles';
  const [placed, setPlaced] = useState<number[]>([]);
  // only an item that says what it asks plays its recording before the answer; one without keeps the screen it had
  const model = useAudio(exercise.ask ? exercise.modelAudioUrl : undefined);
  const headline = askHeadline(exercise, { dialect });
  const reaction = verdict === 'right' ? 'cheer' : verdict === 'wrong' ? 'hmm' : null;

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
      <ExerciseHeadline>{headline ? t(headline.key, headline.params) : t('lesson.translate.prompt')}</ExerciseHeadline>
      {exercise.ask && exercise.prompt ? (
        <AskScene exercise={exercise} model={model} reaction={reaction} />
      ) : exercise.prompt ? (
        <PromptScene voice={null} audio={null} reaction={reaction}>
          <PromptWords prompt={exercise.prompt} tokens={exercise.promptTokens} style={[saidStyle(exercise.prompt), { color: colors.textPrimary }]} />
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
          style={[styles.input, disabled && styles.dim]}
          accessibilityLabel={t('lesson.translate.answerLabel')}
        />
      )}
      {bank && !disabled ? <AnswerModeSwitch mode={mode} onChange={setMode} end={dir.rtl ? 'left' : 'right'} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  // the field's card, edge and face are the answer box's own (KurdishAnswerInput)
  input: { minHeight: MIN_TOUCH_TARGET, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  dim: { opacity: 0.6 },
});
