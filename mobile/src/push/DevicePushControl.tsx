import { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { SettingsBand, SettingsRow, SettingsSection } from '../settings/list';
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
      <SettingsSection title={t('notifications.device.title')} first>
        <View accessibilityLiveRegion="polite">
          <SettingsRow
            icon={state.status === 'granted' ? 'check' : 'bell'}
            title={line}
          />
        </View>
        {action !== 'none' ? (
          <SettingsRow
            icon={action === 'request' ? 'bell' : 'gear'}
            title={action === 'request' ? t('notifications.device.allow') : t('notifications.device.openSettings')}
            opens={action === 'openSettings'}
            onPress={asking ? undefined : () => void press()}
          />
        ) : null}
      </SettingsSection>
      {/* the switches come next: a band between, as between any two sections */}
      <SettingsBand />
    </>
  );
}
