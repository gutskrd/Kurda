import { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';
import { SettingsBand, SettingsRow, SettingsSection } from '../settings/list';
import { openPhoneSettings, pushSupported, readPermission, requestPermission } from './device';
import { saveOfferShown, settingsAction, type PushPermissionState } from './permission';

/**
 * Whether this phone lets Hevalo notify at all, at the top of Settings →
 * Notification settings (KUR-094): the switches below choose what is sent,
 * this says whether anything can arrive. It says where things stand and
 * offers the one step that changes it — the system prompt while the phone
 * will still show it, the phone's own settings once it will not. Read again
 * on coming back from those settings. Nothing on the web build, which has no
 * push.
 *
 * The row that leads to the system prompt says "Continue", not "Allow":
 * allowing is the prompt's own word and the phone's to offer, and the line
 * over the row already says what continuing is about. Whatever comes of the
 * prompt, a no and an error included, the row is there to press again and
 * says where it leads now.
 *
 * A prompt answered from here counts as reminders having been brought up
 * (permission.ts keeps the record): somebody who has just said no on this
 * page is not met by Learn's banner about it on their next visit.
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
      // the phone has asked: that is one of the times reminders may be brought up, whatever was answered
      void saveOfferShown(store, Date.now()).catch(() => undefined);
    } catch {
      // no answer came back: the phone is asked where things stand instead
      refresh();
    } finally {
      // never left waiting, whatever happened: a row that stays off is a setting nobody can reach
      setAsking(false);
    }
  };

  return (
    <>
      <SettingsSection title={t('notifications.device.title')} first>
        <View accessibilityLiveRegion="polite">
          {/* on, in ink: nothing to do; off or not yet asked, in violet: the one thing here to act on */}
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
      {/* the switches come next: a band between, as between any two sections */}
      <SettingsBand />
    </>
  );
}
