import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import type { NarrationItem, NarrationState, Narrator } from './narration';
import type { NarrationRate } from './prefs';

/**
 * The whole story, read aloud — shown only for a story recorded from end to
 * end. Play and pause, the sentence before and after, and a slower speed;
 * the sentence being read is lit up in the text below.
 */
export function NarrationBar({
  narrator,
  state,
  items,
  rate,
  onRate,
}: {
  narrator: Narrator;
  state: NarrationState;
  items: readonly NarrationItem[];
  rate: NarrationRate;
  onRate: (rate: NarrationRate) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const mine = state.scope === 'story';
  const playing = mine && state.playing;
  const position = mine ? t('stories.reader.sentenceOf', { index: state.index + 1, total: state.total }) : t('stories.reader.wholeStory');

  const toggle = (): void => {
    if (mine) narrator.toggle();
    else narrator.play(items, 'story');
  };

  const button = (icon: 'skip-back' | 'skip-forward', label: string, onPress: () => void, disabled: boolean) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.round, { opacity: disabled ? 0.35 : 1 }]}
    >
      <Icon name={icon} size={20} color={colors.textPrimary} />
    </Pressable>
  );

  return (
    <View style={[styles.bar, { backgroundColor: colors.glassFill }]}>
      {button('skip-back', t('stories.reader.previousSentence'), () => narrator.previous(), !mine || state.index === 0)}
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? t('stories.reader.pause') : t('stories.reader.listenWhole')}
        style={[styles.play, { backgroundColor: colors.primary }]}
      >
        <Icon name={playing ? 'audio-pause' : 'audio-play'} size={22} color={colors.textOnPrimary} />
      </Pressable>
      {button('skip-forward', t('stories.reader.nextSentence'), () => narrator.next(), !mine || state.index >= state.total - 1)}
      <Text style={[styles.position, { color: colors.textSecondary }]} numberOfLines={1}>
        {position}
      </Text>
      <Pressable
        onPress={() => onRate(rate === 1 ? 0.75 : 1)}
        accessibilityRole="button"
        accessibilityLabel={rate === 1 ? t('stories.reader.slower') : t('stories.reader.normalSpeed')}
        style={[styles.rate, { backgroundColor: colors.controlTrack }]}
      >
        <Text style={[styles.rateText, { color: colors.textPrimary }]}>{rate === 1 ? '1×' : '0.75×'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radii.lg, padding: spacing.sm },
  round: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  play: { width: 48, height: 48, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  position: { flex: 1, fontSize: typography.sizes.sm, marginLeft: spacing.xs },
  rate: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, borderRadius: radii.pill, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  rateText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
});
