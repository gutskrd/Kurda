import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { PlayGame } from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ReportSheet } from './ReportSheet';

/**
 * Report one player of a game, by their seat.
 *
 * A game shows people who are not your friends as "Player 2", and that is all
 * the report needs: the server maps the game and the seat to the person, so the
 * phone never holds anyone else's account id. A quiet flag at the end of their
 * row, with the sheet behind it; no Block on the done screen, since there is no
 * account here to block.
 */
export function PlayerReportButton({
  game,
  gameId,
  seat,
  name,
}: {
  game: PlayGame;
  gameId: string;
  seat: number;
  /** what the game calls them: their name when you may see it, else null ("Player 3") */
  name: string | null;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const label = name ?? t('report.playerSeat', { seat });
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('report.title.named', { name: label })}
        style={styles.button}
      >
        <Icon name="flag" size={16} color={colors.textSecondary} />
      </Pressable>
      <ReportSheet
        visible={open}
        target={{ type: 'game_player', game, gameId, seat }}
        name={label}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
