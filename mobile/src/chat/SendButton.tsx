import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
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
 * A conversation's message field: one rounded pill with the words on one
 * side of it and Send inside it on the other, growing upwards to five lines
 * or so as a long message is written, with Send staying by the last line.
 *
 * The field and the button were two shapes side by side, a grey pill and a
 * disc beside it. Inside the pill the button reads as the field's own, the
 * row is one control shorter, and the words get the width the gap took.
 *
 * In a browser the field being typed in is ringed, as a keyboard needs: the
 * ring is the pill's, since the browser's own would be a rectangle drawn
 * round the words inside it. A phone shows a caret and no ring.
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
    <View style={[styles.field, { flexDirection: dir.row, backgroundColor: colors.controlTrack }, ringed ? [styles.fieldRinged, { outlineColor: colors.textPrimary }] : null]}>
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
        // a browser draws an empty multi-line field two lines tall; a phone draws one, and is left to it
        {...(Platform.OS === 'web' ? { rows: 1 } : null)}
        accessibilityLabel={t('chat.messagePlaceholder')}
      />
      <SendButton ready={value.trim().length > 0} onPress={onSend} />
    </View>
  );
}

/**
 * The composer's Send, the same wherever something written is sent — a chat,
 * a club's thread, a comment: an arrow in a filled circle once there is
 * something to send, a faint arrow before — the shape every message field
 * has, so nobody has to look for it. (A comment's used to be a bare chevron,
 * the glyph that elsewhere means "go on to the next page".) Ready, the circle
 * is the gold your own words are sent in.
 *
 * Empty, it is disabled and says so to a screen reader, rather than taking
 * the tap and doing nothing with it. The arrow points the way the text runs.
 * `label` is what it is called when it is not a message being sent ("Post
 * comment").
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
  // the buttons stay by the last line as a long message grows the field upwards
  field: { flex: 1, alignItems: 'flex-end', borderRadius: radii.xl },
  fieldRinged: { outlineWidth: 2, outlineStyle: 'solid' },
  // 44 on one line, as every field is: the line and the padding round it add up to it
  fieldInput: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: typography.sizes.md,
    lineHeight: 22,
    textAlignVertical: 'center',
    // the pill wears the ring (above); a browser's own ignores a width, and has to be told there is none
    outlineWidth: 0,
    ...({ outlineStyle: 'none' } as object),
  },
  button: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  disc: { width: DISC, height: DISC, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
