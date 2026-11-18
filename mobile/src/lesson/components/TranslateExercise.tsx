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
  /** The course's variety of Kurdish, for the key bar. */
  dialect?: string | null;
  /** How the answer was graded, once it has been. */
  verdict?: 'right' | 'wrong' | null;
}

/**
 * Translate the sentence Hevalo says in his bubble, whose words can be tapped for their meaning. The answer is built
 * from word tiles when the item has them (unless this device prefers typing), or typed with the Kurdish key bar.
 * An item with `ask` gets its headline and the line alone in the bubble (`AskScene`): into English, the Kurdish
 * line's recording plays from the bubble, at speed or slowly; into Kurdish, the line is English with nothing to play.
 */
export function TranslateExercise({ exercise, text, onChangeText, disabled, dialect, verdict = null }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const bank = exercise.bank && exercise.bank.length > 0 ? exercise.bank : null;
  const [mode, setMode] = useAnswerMode();
  const tiles = !!bank && mode === 'tiles';
  const [placed, setPlaced] = useState<number[]>([]);
  // Only an `ask` item plays its recording before the answer; others keep their old screen.
  const model = useAudio(exercise.ask ? exercise.modelAudioUrl : undefined);
  const headline = askHeadline(exercise, { dialect });
  const reaction = verdict === 'right' ? 'cheer' : verdict === 'wrong' ? 'hmm' : null;

  // Back on the tiles, the answer is what they say again.
  useEffect(() => {
    if (tiles && bank) onChangeText(tileAnswer(bank, placed));
    // Only when the answer mode changes; laying a tile updates it by itself.
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
  // The field's card, edge and face match the answer box (KurdishAnswerInput).
  input: { minHeight: MIN_TOUCH_TARGET, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  dim: { opacity: 0.6 },
});
