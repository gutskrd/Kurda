import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ToggleRow } from '../../theme/Toggle';
import type { StoryGameView } from '@kurda/shared';
import { useAuth } from '../../auth/AuthContext';
import type { ApiError, ApiResult } from '../../api/types';
import { Icon } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';
import { useI18n } from '../../i18n/I18nContext';
import { setExtraTime } from '../api';
import { useStoryPrefs } from '../prefs';

/**
 * "Extra time" (contract §A1): doubles this player's own deadline on timed questions, without telling anyone else.
 * Remembered on this phone for the next game. Shown only in timed games.
 */
export function ExtraTimeSwitch({
  view,
  apply,
}: {
  view: StoryGameView;
  apply: (res: ApiResult<StoryGameView>) => ApiError | null;
}): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { prefs, ready, update } = useStoryPrefs();
  const [busy, setBusy] = useState(false);
  const synced = useRef(false);

  // A game joined before the preference was read is brought into line once.
  useEffect(() => {
    if (!ready || synced.current || view.settings.timerSeconds === 0) return;
    synced.current = true;
    if (prefs.extraTime !== view.extraTime && (view.status === 'lobby' || view.status === 'reading')) {
      void setExtraTime(client, view.id, prefs.extraTime).then(apply);
    }
  }, [ready, prefs.extraTime, view, client, apply]);

  if (view.settings.timerSeconds === 0) return null;

  const toggle = async (on: boolean): Promise<void> => {
    update({ extraTime: on });
    setBusy(true);
    apply(await setExtraTime(client, view.id, on));
    setBusy(false);
  };

  // The whole row toggles it and reads as one switch.
  return (
    <ToggleRow
      label={t('stories.extraTime')}
      hint={t('stories.extraTimeHint')}
      value={view.extraTime}
      onValueChange={(on) => void toggle(on)}
      disabled={busy}
      style={styles.row}
    >
      <Icon name="timer" size={18} color={colors.primary} />
      <View style={styles.text}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>{t('stories.extraTime')}</Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('stories.extraTimeHint')}</Text>
      </View>
    </ToggleRow>
  );
}

const styles = StyleSheet.create({
  // The icon sits close to its words; ToggleRow keeps the row a fingertip tall.
  row: { gap: spacing.sm },
  text: { flex: 1 },
  label: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  hint: { fontSize: typography.sizes.xs },
});
