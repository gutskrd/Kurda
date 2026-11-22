import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { pressedDim } from '../theme/motion';

/** The filled circle the arrow sits in, inside the 44pt touch. */
const DISC = 34;

/**
 * A conversation's message field: one rounded pill with the text on one side and Send inside it on the other,
 * growing upward to about five lines with Send staying by the last line. In a browser the focused field shows a
 * violet ring on the pill, since the browser's own would be a rectangle around the text; phones show only a
 * caret.
 */
export function MessageField({
  value,
  onChangeText,
  onSend,
  maxLength,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  maxLength: number;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [focused, setFocused] = useState(false);
  const ringed = focused && Platform.OS === 'web';
  return (
    <View style={[styles.field, { flexDirection: dir.row, backgroundColor: colors.controlTrack }, ringed ? [styles.fieldRinged, { outlineColor: colors.primary }] : null]}>
      <TextInput
        style={[styles.fieldInput, dir.free, { color: colors.textPrimary }]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={t('chat.messagePlaceholder')}
        placeholderTextColor={colors.textSecondary}
        value={value}
        onChangeText={onChangeText}
        maxLength={maxLength}
        multiline
        // A browser draws an empty multi-line field two lines tall; a phone draws one, and is left to it.
        {...(Platform.OS === 'web' ? { rows: 1 } : null)}
        accessibilityLabel={t('chat.messagePlaceholder')}
      />
      <SendButton ready={value.trim().length > 0} onPress={onSend} />
    </View>
  );
}

/**
 * The composer's Send button, shared by chats, club threads and comments: an arrow in a filled circle once there
 * is something to send, a faint arrow before, filled in the colour your own messages use. Empty, it is disabled
 * and announced as such. The arrow points in the text direction. `label` names it when it is not sending a
 * message ("Post comment").
 */
export function SendButton({ ready, onPress, label }: { ready: boolean; onPress: () => void; label?: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <Pressable
      onPress={onPress}
      disabled={!ready}
      accessibilityRole="button"
      accessibilityLabel={label ?? t('chat.send')}
      accessibilityState={{ disabled: !ready }}
      style={({ pressed }) => [styles.button, { opacity: pressed ? pressedDim : 1 }]}
    >
      <View style={[styles.disc, { backgroundColor: ready ? colors.bubbleMine : 'transparent' }]}>
        <View style={dir.rtl ? dir.flip : null}>
          <Icon name="send" size={18} color={ready ? colors.bubbleMineInk : colors.textSecondary} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The buttons stay by the last line as a long message grows the field upwards.
  field: { flex: 1, alignItems: 'flex-end', borderRadius: radii.xl },
  fieldRinged: { outlineWidth: 2, outlineStyle: 'solid' },
  // 44 on one line, as every field is: the line and the padding round it add up to it.
  fieldInput: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: typography.sizes.text,
    lineHeight: 22,
    textAlignVertical: 'center',
    // The pill wears the ring (above); the browser's own ignores a width and must be told there is none.
    outlineWidth: 0,
    ...({ outlineStyle: 'none' } as object),
  },
  button: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  disc: { width: DISC, height: DISC, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
