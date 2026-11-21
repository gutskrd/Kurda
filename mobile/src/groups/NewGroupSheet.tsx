import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import type { LimitDetails } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { limitText } from '../limits/limitCopy';
import { useDirection } from '../reports/direction';
import { HeldNotice, useAccountHeld } from '../reports/HeldNotice';
import { SendErrorNotice } from '../reports/SendError';
import { restrictionOf } from '../reports/sendErrors';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { createGroup } from './api';

/**
 * Starting a group from Messages: a name, and Create. Every group is private, so there is nothing to choose about who
 * may find it; its chat opens next with the sheet for adding friends (`onCreated`). At a group limit (`limit`) it says
 * which and what makes room, and has nothing to send.
 */
export function NewGroupSheet({
  open,
  limit,
  onClose,
  onCreated,
}: {
  open: boolean;
  limit: LimitDetails | null;
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  // Starting a group is joining one, which a held account waits for.
  const held = useAccountHeld();

  const ready = name.trim().length >= 2 && !limit && !held;

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    const res = await createGroup(client, { name: trimmed, description: description.trim() || undefined });
    setBusy(false);
    if (!res.ok) {
      haptic('wrong');
      setError(res.error);
      return;
    }
    haptic('correct');
    setName('');
    setDescription('');
    onCreated(res.data.id, trimmed);
  };

  return (
    <BottomSheet visible={open} onClose={onClose} title={t('groups.new')} dismissible={!busy}>
      {held ? (
        <HeldNotice onNavigate={onClose} style={styles.held} />
      ) : limit ? (
        <Text style={[styles.notice, dir.text, { color: colors.textSecondary }]}>{limitText(limit, t)}</Text>
      ) : null}
      <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{t('groups.name')}</Text>
      <TextInput
        style={[styles.input, dir.free, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
        value={name}
        onChangeText={setName}
        placeholder={t('groups.namePlaceholder')}
        placeholderTextColor={colors.textSecondary}
        maxLength={60}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        accessibilityLabel={t('groups.name')}
      />

      <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{t('groups.descriptionOptional')}</Text>
      <TextInput
        style={[styles.input, styles.multiline, dir.free, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={300}
        accessibilityLabel={t('groups.descriptionOptional')}
      />
      <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('groups.privateHint')}</Text>

      {/* A limit on the account is said calmly, with the way to Account standing; anything else as before. */}
      {error && restrictionOf(error) ? (
        <SendErrorNotice error={error} onNavigate={onClose} style={styles.limit} heldShownBeside />
      ) : error ? (
        <Text style={[styles.error, { color: colors.danger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {describeError(error, t)}
        </Text>
      ) : null}

      <ClayButton label={busy ? t('groups.creating') : t('groups.create')} tone="primary" size="large" busy={busy} disabled={!ready} onPress={() => void submit()} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  notice: { fontSize: typography.sizes.text, lineHeight: 20 },
  label: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sizes.text,
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  hint: { fontSize: typography.sizes.text, lineHeight: 18 },
  error: { textAlign: 'center', fontSize: typography.sizes.text },
  held: { marginBottom: spacing.xs },
  // The sheet already has its own margins.
  limit: { marginHorizontal: 0, marginBottom: 0 },
});
