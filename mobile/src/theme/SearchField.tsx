import { forwardRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type ReturnKeyTypeOptions } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { Icon } from './Icon';
import { useTheme } from './ThemeProvider';
import { radii, spacing, typography } from './tokens';

/**
 * A search field: a magnifier, the words, and a clear button once there are
 * words to clear.
 *
 * Messages filters its own list with one and Search asks the server with
 * another, and they looked different — one with a clear button and one
 * without, at two heights. Same field now, 44 tall, with the clear button a
 * fingertip wide.
 */
export const SearchField = forwardRef<TextInput, {
  value: string;
  onChangeText: (text: string) => void;
  /** What the field is for, said to a screen reader and shown until something is typed. */
  label: string;
  placeholder?: string;
  onSubmit?: () => void;
  returnKeyType?: ReturnKeyTypeOptions;
  autoFocus?: boolean;
}>(function SearchField({ value, onChangeText, label, placeholder, onSubmit, returnKeyType = 'search', autoFocus }, ref) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const clearable = value.length > 0;
  // the magnifier's side always has its inset; the other side has the clear
  // button's own 44pt, or an inset of its own when there is nothing to clear
  const lead = spacing.md - 4;
  const inset = dir.row === 'row-reverse'
    ? { paddingRight: lead, paddingLeft: clearable ? 0 : lead }
    : { paddingLeft: lead, paddingRight: clearable ? 0 : lead };
  return (
    <View style={[styles.field, inset, { backgroundColor: colors.controlTrack, flexDirection: dir.row }]}>
      <Icon name="search" size={18} color={colors.textSecondary} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.textSecondary}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        accessibilityLabel={label}
        style={[styles.input, dir.text, { color: colors.textPrimary }]}
      />
      {clearable ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={t('search.clear')}
          style={styles.clear}
        >
          <Icon name="clear-fill" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
  },
  input: { flex: 1, fontSize: typography.sizes.md, minHeight: MIN_TOUCH_TARGET, paddingVertical: 0 },
  clear: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
