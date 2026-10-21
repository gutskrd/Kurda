import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { sectionLabel } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { openPhoneSettings, pushSupported, readPermission, requestPermission } from './device';
import { settingsAction, type PushPermissionState } from './permission';

/**
 * Whether this phone lets Hevalo notify at all, at the top of Settings →
 * Notification settings (KUR-094): the switches below choose what is sent,
 * this says whether anything can arrive. It says where things stand and
 * offers the one step that changes it — the system prompt while the phone
 * will still show it, the phone's own settings once it will not. Read again
 * on coming back from those settings. Nothing on the web build, which has no
 * push.
 */
export function DevicePushControl(): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [state, setState] = useState<PushPermissionState | null>(null);
  const [asking, setAsking] = useState(false);

  const refresh = useCallback(() => {
    void readPermission().then(setState);
  }, []);

  useEffect(() => {
    if (!pushSupported()) return;
    refresh();
    const foreground = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => foreground.remove();
  }, [refresh]);

  if (!state || state.status === 'unavailable') return null;

  const action = settingsAction(state);
  const line =
    state.status === 'granted'
      ? t('notifications.device.on')
      : state.status === 'undetermined'
        ? t('notifications.device.notAsked')
        : t('notifications.device.off');

  const press = async () => {
    if (action === 'openSettings') {
      openPhoneSettings();
      return;
    }
    setAsking(true);
    setState(await requestPermission(t('notifications.title')));
    setAsking(false);
  };

  return (
    <>
      <Text style={[styles.section, { color: colors.textSecondary }]}>{t('notifications.device.title')}</Text>
      <View style={[styles.card, { backgroundColor: colors.controlTrack }]}>
        <View style={styles.row}>
          <Icon
            name={state.status === 'granted' ? 'check' : 'bell'}
            size={20}
            color={state.status === 'granted' ? colors.success : colors.textSecondary}
          />
          <Text style={[styles.line, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">
            {line}
          </Text>
        </View>
        {action !== 'none' ? (
          <ClayButton
            label={action === 'request' ? t('notifications.device.allow') : t('notifications.device.openSettings')}
            tone="primary"
            busy={asking}
            onPress={() => void press()}
          />
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: { ...sectionLabel, marginTop: spacing.lg, marginBottom: spacing.xs },
  card: { gap: spacing.sm, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  line: { flex: 1, fontSize: typography.sizes.md },
});
