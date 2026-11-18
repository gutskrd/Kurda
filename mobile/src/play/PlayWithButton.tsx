import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { InviteSheet } from './InviteSheet';
import { pressedDim } from '../theme/motion';

/**
 * "Play" with a friend (contract §B1): a full button on their profile, an icon on a friends-list row. Both open the
 * invite sheet with the friend picked.
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
          style={({ pressed }) => [styles.icon, { backgroundColor: colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
        >
          <Icon name="play" size={20} color={colors.primary} />
        </Pressable>
      ) : (
        <ClayButton label={t('games.play')} icon="play" tone="primary" variant="outline" size="large" onPress={() => setOpen(true)} />
      )}
      {open ? <InviteSheet target={{ kind: 'new', friendId }} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  icon: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
