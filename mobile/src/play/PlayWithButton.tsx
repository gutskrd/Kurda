import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { InviteSheet } from './InviteSheet';

/**
 * "Play" with a friend (contract §B1): on their profile a full button, on a
 * friends-list row an icon. Both open the invite sheet with that friend
 * already picked; the game and its presets are chosen there.
 */
export function PlayWithButton({ friendId, name, compact = false }: { friendId: string; name: string; compact?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      {compact ? (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('play.withName', { name })}
          style={({ pressed }) => [styles.icon, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name="play" size={20} color={colors.primary} />
        </Pressable>
      ) : (
        <ClayButton label={t('games.play')} icon="play" tone="accent" variant="outline" size="large" onPress={() => setOpen(true)} />
      )}
      {open ? <InviteSheet target={{ kind: 'new', friendId }} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  icon: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
