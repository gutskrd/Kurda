import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { Icon } from '../theme/Icon';
import { DEL, ENTER, KEYBOARD_ROWS, keyFeedback, type Feedback } from './board';
import { feedbackColor, feedbackWord } from './WordleBoard';

/**
 * The Kurmancî keyboard, coloured by what each letter has scored so far.
 *
 * Pulled out of the solo screen alongside the board: a battle needs the same
 * three rows, the same ê/û/î/ş/ç keys, and the same rule that a key only ever
 * upgrades — grey to yellow to green, never back.
 */
export function WordleKeyboard({
  keyboard,
  onKey,
  disabled = false,
}: {
  keyboard: Record<string, Feedback>;
  onKey: (key: string) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View style={styles.keyboard} accessibilityLabel={t('games.wordle.keyboard')}>
      {KEYBOARD_ROWS.map((row, ri) => (
        <View key={ri} style={styles.keyRow}>
          {row.map((key) => {
            const fb = keyFeedback(keyboard, key);
            const control = key === ENTER || key === DEL;
            return (
              <Pressable
                key={key}
                onPress={() => onKey(key)}
                accessibilityRole="button"
                accessibilityLabel={
                  control
                    ? key === ENTER
                      ? t('games.wordle.enter')
                      : t('games.wordle.backspace')
                    : fb
                      ? `${key}, ${feedbackWord(fb, t)}`
                      : key
                }
                disabled={disabled}
                style={[
                  styles.key,
                  control && styles.keyWide,
                  { backgroundColor: fb ? feedbackColor(fb, colors) : colors.controlTrack, borderColor: colors.glassBorder },
                ]}
              >
                {key === DEL ? (
                  <Icon name="close" size={16} color={colors.textPrimary} />
                ) : (
                  <Text style={[styles.keyText, { color: fb ? colors.textOnPrimary : colors.textPrimary }]}>
                    {control ? '↵' : key.toUpperCase()}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: { gap: spacing.xs, marginTop: spacing.lg },
  keyRow: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  key: {
    minWidth: 26,
    flex: 1,
    maxWidth: 34,
    height: 46,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyWide: { maxWidth: 48, flex: 1.4 },
  keyText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
