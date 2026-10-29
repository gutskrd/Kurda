import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, TextInput, View } from 'react-native';
import { GROUP_BAN_DURATIONS, GROUP_BAN_REASON_MAX, type GroupBan, type GroupBanDuration } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import type { TranslationKey } from '../i18n/translations';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { SettingsSwitch } from '../settings/list';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { ClayButton, Segmented } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { banMember } from './api';
import { groupError } from './groupError';

const DURATION_LABEL: Record<GroupBanDuration, TranslationKey> = {
  '1d': 'groups.ban.day',
  '7d': 'groups.ban.week',
  perm: 'groups.ban.forGood',
};

/**
 * Banning someone from a group, from the ⋯ beside them in its member list.
 *
 * How long, as one clear choice of three; a reason if there is one to give,
 * which they will read; whether their messages here go too; and one line on
 * how this differs from removing them. The button says who, in red, and the
 * sheet stays until the server has answered.
 */
export function BanSheet({
  groupId,
  member,
  onClose,
  onBanned,
}: {
  groupId: string;
  /** who is being banned; null when the sheet is shut */
  member: { userId: string; username: string } | null;
  onClose: () => void;
  onBanned: (ban: GroupBan) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [duration, setDuration] = useState<GroupBanDuration>('1d');
  const [reason, setReason] = useState('');
  const [deleteMessages, setDeleteMessages] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = member?.username ?? '';

  // each ban starts afresh: what was chosen for the last person is not this one's
  useEffect(() => {
    if (!member) return;
    setDuration('1d');
    setReason('');
    setDeleteMessages(false);
    setError(null);
  }, [member]);

  const ban = async (): Promise<void> => {
    if (!member) return;
    setBusy(true);
    setError(null);
    const res = await banMember(client, groupId, { userId: member.userId, duration, reason: reason.trim() || null, deleteMessages });
    setBusy(false);
    if (!res.ok) {
      haptic('wrong');
      setError(groupError(res.error, t));
      return;
    }
    haptic('correct');
    AccessibilityInfo.announceForAccessibility?.(t('groups.ban.done', { name }));
    onBanned(res.data.ban);
  };

  const reasonLabel = t('groups.ban.reason');
  return (
    <BottomSheet visible={member !== null} onClose={onClose} title={t('groups.ban.title', { name })} icon="block" dismissible={!busy} contentStyle={styles.sheet}>
      <SheetScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{t('groups.ban.howLong')}</Text>
        <Segmented<GroupBanDuration>
          options={GROUP_BAN_DURATIONS}
          value={duration}
          onChange={setDuration}
          labelOf={(d) => t(DURATION_LABEL[d])}
          groupLabel={t('groups.ban.howLong')}
        />

        <View style={[styles.fieldTop, { flexDirection: dir.row }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{reasonLabel}</Text>
          <Text style={[styles.count, { color: reason.length >= GROUP_BAN_REASON_MAX ? colors.goldText : colors.textSecondary }]} accessibilityElementsHidden importantForAccessibility="no">
            {`${reason.length}/${GROUP_BAN_REASON_MAX}`}
          </Text>
        </View>
        <TextInput
          value={reason}
          onChangeText={setReason}
          maxLength={GROUP_BAN_REASON_MAX}
          multiline
          accessibilityLabel={reasonLabel}
          accessibilityHint={t('groups.ban.reasonHint', { name })}
          style={[styles.input, dir.free, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
        />
        <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('groups.ban.reasonHint', { name })}</Text>

        {/* a list row, so it runs edge to edge as one in Settings does */}
        <View style={styles.edge}>
          <SettingsSwitch title={t('groups.ban.deleteMessages')} value={deleteMessages} onValueChange={setDeleteMessages} />
        </View>

        <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('groups.ban.difference')}</Text>
      </SheetScrollView>
      {/* under the scroll, so the button is in reach however little of the sheet a short phone shows */}
      <View style={styles.foot}>
        {error ? (
          <Text style={[styles.hint, dir.text, { color: colors.danger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <ClayButton label={t('groups.ban.title', { name })} tone="danger" size="large" busy={busy} onPress={() => void ban()} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // the gutter is the scroll view's own, so a row inside can run to the edges
  sheet: { paddingHorizontal: 0 },
  body: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm, gap: spacing.sm },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  fieldTop: { justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.sm },
  count: { fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
  input: { minHeight: 80, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.sizes.md, textAlignVertical: 'top' },
  hint: { fontSize: typography.sizes.sm, lineHeight: 20 },
  edge: { marginHorizontal: -layout.gutter },
  foot: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm, gap: spacing.sm },
});
