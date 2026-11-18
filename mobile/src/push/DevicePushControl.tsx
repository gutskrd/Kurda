import { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';
import { SettingsBand, SettingsRow, SettingsSection } from '../settings/list';
import { openPhoneSettings, pushSupported, readPermission, requestPermission } from './device';
import { saveOfferShown, settingsAction, type PushPermissionState } from './permission';

/**
 * Whether this phone lets Hevalo notify at all, at the top of Settings → Notification settings; the switches
 * below choose what is sent. It shows the current state and the one step that changes it: the system prompt while
 * the phone will still show it, the phone's settings once it will not. Rechecked on returning from those
 * settings; nothing on the web build.
 *
 * The row leading to the system prompt says "Continue", not "Allow": allowing is the prompt's own choice to
 * offer. Whatever the prompt's outcome, the row stays pressable and says where it leads now. A prompt answered
 * here counts as reminders having been raised (permission.ts), so Learn's banner does not follow up on the next
 * visit.
 */
export function DevicePushControl({ store = deviceStore }: { store?: DeviceStore } = {}): React.JSX.Element | null {
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
    try {
      setState(await requestPermission(t('notifications.title')));
      // The phone has asked, which counts as raising reminders whatever the answer.
      void saveOfferShown(store, Date.now()).catch(() => undefined);
    } catch {
      // No answer came back: the phone is asked where things stand instead.
      refresh();
    } finally {
      // Never left waiting, whatever happened: a row that stays off is a setting nobody can reach.
      setAsking(false);
    }
  };

  return (
    <>
      <SettingsSection title={t('notifications.device.title')} first>
        <View accessibilityLiveRegion="polite">
          {/* On, in ink: nothing to do; off or not yet asked, in violet: the one thing here to act on. */}
          <SettingsRow icon={state.status === 'granted' ? 'check' : 'alert'} title={line} attention={state.status !== 'granted'} />
        </View>
        {action !== 'none' ? (
          <SettingsRow
            icon={action === 'request' ? 'bell' : 'gear'}
            title={action === 'request' ? t('common.continue') : t('notifications.device.openSettings')}
            opens={action === 'openSettings'}
            onPress={asking ? undefined : () => void press()}
          />
        ) : null}
      </SettingsSection>
      {/* The switches come next: a band between, as between any two sections. */}
      <SettingsBand />
    </>
  );
}
