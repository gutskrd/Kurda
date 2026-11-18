import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { StepFlow, type FlowStep } from '../../auth/guide/StepFlow';
import { GoalPicker } from '../../goals/GoalPicker';
import type { GoalOption } from '../../goals/format';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/translations';
import { currentMaintenance } from '../../maintenance/maintenance';
import { useDirection } from '../../reports/direction';
import { Icon, type IconName } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';

/** A new guest's daily goal, the server's default. */
const STARTING_GOAL: GoalOption = 20;

/** What a guest can do straight away, and the promise about later. */
const CAN_DO: ReadonlyArray<{ icon: IconName; key: TranslationKey }> = [
  { icon: 'book', key: 'guide.guest.can.lessons' },
  { icon: 'play', key: 'guide.guest.can.games' },
  { icon: 'translate', key: 'guide.guest.can.dictionary' },
  { icon: 'seal-check', key: 'guide.guest.can.later' },
];

/**
 * Trying Hevalo as a guest, in two steps: what a guest can do, then the daily goal. Start learning creates the guest
 * session (`continueAsGuest`) and sets the goal, and the app root then shows the signed-in screens. A refusal shows
 * under the picker, except during maintenance, which the screen over the app shows.
 */
export function GuestStartFlow({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { continueAsGuest, client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [goal, setGoal] = useState<GoalOption>(STARTING_GOAL);

  const steps: FlowStep[] = [
    {
      key: 'hello',
      question: t('guide.guest.hello.question'),
      says: t('guide.guest.hello.says'),
      render: () => (
        <View style={styles.list} testID="guest-can-do">
          {CAN_DO.map(({ icon, key }) => (
            <View key={key} style={[styles.row, { flexDirection: dir.row }]}>
              <Icon name={icon} size={22} color={colors.primary} />
              <Text style={[styles.rowText, dir.text, { color: colors.textPrimary }]}>{t(key)}</Text>
            </View>
          ))}
        </View>
      ),
    },
    {
      key: 'goal',
      question: t('guide.guest.goal.question'),
      says: t('guide.guest.goal.says'),
      action: t('guide.guest.start'),
      render: (tools) => (
        <View>
          <GoalPicker value={goal} onChange={setGoal} disabled={tools.busy} />
          <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('guide.guest.goal.hint')}</Text>
        </View>
      ),
      commit: async () => {
        const error = await continueAsGuest();
        // Maintenance is shown by the screen over the app, not under the picker.
        if (error) return { ok: false, error: currentMaintenance() ? null : error.message };
        // The session is already applied, so the goal is sent while the screens change.
        if (goal !== STARTING_GOAL) void client.put('/me/daily-goal', { goal });
        return { ok: true };
      },
    },
  ];

  return <StepFlow steps={steps} onFinish={() => undefined} onExit={onExit} testID="guest-flow" />;
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: { alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, fontSize: typography.sizes.md, lineHeight: 22 },
  hint: { fontSize: typography.sizes.sm, marginTop: spacing.md },
});
