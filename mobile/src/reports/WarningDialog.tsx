import { useEffect, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StandingSanction } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { accountStanding, acknowledgeWarnings } from './api';
import { useDirection } from './direction';
import { CATEGORY_LABEL } from './labels';

/**
 * A warning, shown once, the next time the app is opened.
 *
 * A warning limits nothing, so there is no refusal anywhere that would tell
 * the person about it — this is the only place they hear of it. It says which
 * rule, what the reviewer wrote, and that nothing is limited; "I understand"
 * marks it seen (`POST /me/standing/ack`) so it is not shown again, and
 * Account standing is one tap away for the rest.
 *
 * Mounted once, signed in, and asks again whenever the app comes back to the
 * front. Renders nothing until there is a warning to show.
 */
export function WarningDialog(): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const navigation = useNavigation<RootNavigation>();
  const [warnings, setWarnings] = useState<StandingSanction[]>([]);

  // on sign-in, and each time the app comes back to the front: a phone is
  // resumed far more often than it is started, so "the next time the app is
  // opened" means that too, not only a cold start
  useEffect(() => {
    let alive = true;
    const check = (): void => {
      void accountStanding(client).then((res) => {
        // one already on screen stays as it is until it is answered
        if (alive && res.ok) setWarnings((shown) => (shown.length > 0 ? shown : res.data.unacknowledgedWarnings));
      });
    };
    check();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      alive = false;
      foreground.remove();
    };
  }, [client]);

  const first = warnings[0];
  if (!first) return null;

  // all of them at once: one dialog per warning, back to back, is a scolding
  const done = (then?: () => void): void => {
    const ids = warnings.map((w) => w.id);
    setWarnings([]);
    void acknowledgeWarnings(client, ids);
    then?.();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => done()}>
      <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
        <View style={[styles.card, { backgroundColor: colors.background }]} accessibilityViewIsModal accessibilityRole="alert">
          <View style={[styles.mark, { backgroundColor: colors.controlTrack }]}>
            <Icon name="shield" size={26} color={colors.textPrimary} />
          </View>
          <Text style={[styles.title, styles.center, { color: colors.textPrimary }]} accessibilityRole="header">
            {t('warning.title')}
          </Text>
          <Text style={[styles.body, dir.text, { color: colors.textPrimary }]}>
            {t('warning.body', { rule: t(CATEGORY_LABEL[first.policy]) })}
          </Text>
          {warnings.map((w) =>
            w.statement ? (
              <Text key={w.id} style={[styles.statement, dir.free, { color: colors.textSecondary }]}>
                {w.statement}
              </Text>
            ) : null,
          )}
          <ClayButton label={t('warning.ok')} tone="primary" size="large" onPress={() => done()} style={styles.stretch} />
          <Pressable
            onPress={() => done(() => navigation.navigate('AccountStanding'))}
            accessibilityRole="link"
            style={styles.link}
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>{t('restriction.seeStanding')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { width: '100%', maxWidth: 420, borderRadius: radii.xl, padding: spacing.lg, gap: spacing.md },
  mark: { alignSelf: 'center', width: 56, height: 56, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  title: { ...display(typography.sizes.lg) },
  center: { textAlign: 'center' },
  body: { fontSize: typography.sizes.md, lineHeight: 22 },
  statement: { fontSize: typography.sizes.sm, lineHeight: 20 },
  stretch: { alignSelf: 'stretch', marginTop: spacing.xs },
  link: { minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
});
