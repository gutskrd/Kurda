import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { InviteSheet, type InviteTarget } from './InviteSheet';

/**
 * The game button in a chat composer (contract §B1). In a DM it starts a game
 * with that friend already picked (the invite's card lands in the DM); in a
 * group it posts the game's card to the group, for whoever wants to join.
 */
export function ChatGameButton({ target }: { target: Extract<InviteTarget, { kind: 'dm' } | { kind: 'group' }> }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('play.chat.button')}
        style={({ pressed }) => [styles.button, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
      >
        <Icon name="play" size={20} color={colors.primary} />
      </Pressable>
      {open ? <InviteSheet target={target} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
