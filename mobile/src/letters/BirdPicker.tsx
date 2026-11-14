import { StyleSheet, Text, View } from 'react-native';
import { LETTER_BIRDS, LETTER_BIRD_PRICE } from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { formatNumber } from '../i18n/format';
import { ClayButton } from '../theme/glass';
import { PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { BirdBadge } from './LetterParts';

/** Each bird by its colour, for whoever cannot see the picture: in the order of the shared LETTER_BIRDS. */
export const BIRD_NAMES: readonly TranslationKey[] = [
  'letters.bird.lavender',
  'letters.bird.sky',
  'letters.bird.rose',
  'letters.bird.green',
  'letters.bird.orange',
  'letters.bird.teal',
  'letters.bird.yellow',
  'letters.bird.violet',
];

/**
 * Choosing your bird, under your window, where the bird on the sill takes
 * the colour of whichever is picked (LettersScreen shows it there), as the
 * website has it (web/src/letters/BirdPicker.tsx).
 *
 * The first bird is chosen for free and is yours from then on; another after
 * it costs Zêr (shared LETTER_BIRD_PRICE), and the picker says so, and how
 * much there is, before anything is paid. The birds are a group of radio
 * buttons, each said by its colour.
 */
export function BirdPicker({
  first,
  current,
  picked,
  zer,
  busy,
  error,
  onPick,
  onConfirm,
  onCancel,
}: {
  /** choosing for the first time, for free; otherwise changing, for Zêr */
  first: boolean;
  current: number;
  picked: number;
  zer: number;
  busy: boolean;
  error: string | null;
  onPick: (bird: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const number = (n: number): string => formatNumber(n, locale);
  const short = first ? 0 : Math.max(0, LETTER_BIRD_PRICE - zer);
  const same = !first && picked === current;
  const title = first ? t('letters.bird.chooseTitle') : t('letters.bird.changeTitle');
  return (
    <View style={styles.picker} testID="letters-bird-picker">
      <Text style={[styles.status, styles.strong, { color: colors.textPrimary }]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[styles.status, { color: colors.textSecondary }]}>
        {first ? t('letters.bird.chooseLead', { price: number(LETTER_BIRD_PRICE) }) : t('letters.bird.changeLead', { price: number(LETTER_BIRD_PRICE), zer: number(zer) })}
      </Text>
      <View style={styles.birds} accessibilityRole="radiogroup" accessibilityLabel={title}>
        {LETTER_BIRDS.map((_, bird) => {
          const name = t(BIRD_NAMES[bird]!);
          const mine = !first && bird === current;
          return (
            <PressableScale
              key={bird}
              onPress={() => onPick(bird)}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ checked: bird === picked, disabled: busy }}
              accessibilityLabel={mine ? t('letters.bird.yours', { name }) : name}
              testID={`letters-bird-${bird}`}
              style={[styles.bird, { borderColor: bird === picked ? colors.textPrimary : 'transparent' }]}
            >
              <BirdBadge bird={bird} size={48} />
              {mine ? <View style={[styles.mine, { backgroundColor: colors.textPrimary, borderColor: colors.surface }]} /> : null}
            </PressableScale>
          );
        })}
      </View>
      {short > 0 ? <Text style={[styles.status, { color: colors.textPrimary }]}>{t('letters.bird.short', { count: number(short) })}</Text> : null}
      {error ? (
        <Text style={[styles.status, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <ClayButton
        label={first ? t('letters.bird.choose') : t('letters.bird.buy', { price: number(LETTER_BIRD_PRICE) })}
        onPress={onConfirm}
        tone="primary"
        busy={busy}
        disabled={same || short > 0}
        style={styles.action}
        testID="letters-bird-confirm"
      />
      {!first ? <ClayButton label={t('letters.bird.keep')} onPress={onCancel} variant="outline" disabled={busy} style={styles.action} testID="letters-bird-keep" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch' },
  status: { fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center', maxWidth: 360 },
  strong: { fontWeight: typography.weights.bold },
  // two even rows of four
  birds: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, maxWidth: 4 * (48 + 10) + 3 * spacing.sm + 2, marginVertical: spacing.xs },
  // each bird a round button, at least a finger wide; the one picked ringed in the ink colour
  bird: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', padding: 3, borderWidth: 2, borderRadius: radii.pill },
  // the bird that is yours now, marked with a small dot when choosing another
  mine: { position: 'absolute', right: 2, bottom: 2, width: 12, height: 12, borderWidth: 2, borderRadius: radii.pill },
  action: { alignSelf: 'stretch' },
});
