import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { ApiClient } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';
import { useDirection } from '../reports/direction';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { readPermission, requestPermission } from './device';
import { readOfferRecord, saveOfferShown, shouldOfferReminders } from './permission';

/**
 * The one moment the app offers notifications by itself (KUR-094): a small
 * card at the end of a lesson, once the celebration has settled, saying what
 * they are for, with Allow and Not now. Only Allow shows the system prompt.
 * Whether it appears at all — never asked yet, not passed over too recently,
 * not a child — is permission.ts's to say.
 */
export function ReminderOffer({ ready, store = deviceStore }: { ready: boolean; store?: DeviceStore }): React.JSX.Element | null {
  const { client, user } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const [phase, setPhase] = useState<'deciding' | 'offer' | 'asking' | 'allowed' | 'gone'>('deciding');
  const noted = useRef(false);
  const knownMinor = user?.minor;

  useEffect(() => {
    let active = true;
    void (async () => {
      const permission = await readPermission();
      // the cheap answer first: most of the time there is nothing to ask about
      if (permission.status !== 'undetermined') {
        if (active) setPhase('gone');
        return;
      }
      const [record, minor] = await Promise.all([readOfferRecord(store), minorStatus(knownMinor, client)]);
      if (!active) return;
      setPhase(shouldOfferReminders({ permission, record, minor, now: Date.now() }) ? 'offer' : 'gone');
    })();
    return () => {
      active = false;
    };
  }, [client, knownMinor, store]);

  // counted when it is actually seen, not when it was decided on
  const visible = ready && phase !== 'deciding' && phase !== 'gone';
  useEffect(() => {
    if (!visible || noted.current) return;
    noted.current = true;
    void saveOfferShown(store, Date.now());
  }, [visible, store]);

  if (!visible) return null;

  if (phase === 'allowed') {
    return (
      <View style={[styles.card, styles.row, { flexDirection: dir.row, backgroundColor: colors.successFill }]} accessibilityLiveRegion="polite">
        <Icon name="check" size={18} color={colors.success} />
        <Text style={[styles.done, dir.text, { color: colors.textPrimary }]}>{t('notifications.device.on')}</Text>
      </View>
    );
  }

  const allow = async () => {
    setPhase('asking');
    const answer = await requestPermission(t('notifications.title'));
    setPhase(answer.status === 'granted' ? 'allowed' : 'gone');
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.controlTrack }]}>
      <View style={[styles.row, { flexDirection: dir.row }]}>
        <Icon name="bell" size={20} color={colors.textPrimary} />
        <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
          {t('lesson.reminder.title')}
        </Text>
      </View>
      <Text style={[styles.body, dir.text, { color: colors.textSecondary }]}>{t('lesson.reminder.body')}</Text>
      <View style={[styles.actions, { flexDirection: dir.row }]}>
        <ClayButton
          label={t('lesson.reminder.notNow')}
          variant="outline"
          onPress={() => setPhase('gone')}
          disabled={phase === 'asking'}
          style={styles.action}
        />
        <ClayButton label={t('lesson.reminder.allow')} tone="primary" onPress={() => void allow()} busy={phase === 'asking'} style={styles.action} />
      </View>
    </View>
  );
}

/**
 * Whether the account is a minor, as the server works it out. The session
 * from a fresh sign-in does not carry it (only `/me` does), so it is asked
 * for then; null when even that cannot say.
 */
export async function minorStatus(known: boolean | undefined, client: ApiClient): Promise<boolean | null> {
  if (typeof known === 'boolean') return known;
  const me = await client.get<{ user?: { minor?: unknown } }>('/me');
  return me.ok && typeof me.data.user?.minor === 'boolean' ? me.data.user.minor : null;
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', gap: spacing.sm, borderRadius: radii.md, padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  body: { fontSize: typography.sizes.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1 },
  done: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
});
