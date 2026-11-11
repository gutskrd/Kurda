import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import type { LimitDetails } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { describeError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { limitText } from '../limits/limitCopy';
import { useDirection } from '../reports/direction';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { createGroup } from './api';

/**
 * Starting a group, from Messages: a name, and Create.
 *
 * A name is all a group needs; what it is about can be said here or later,
 * from its page. There is nothing to choose about who may find it or come in,
 * because every group is private: the line under the fields says so, and the
 * group's chat opens next with the sheet for adding friends, which is how
 * anyone else gets into it (`onCreated`).
 *
 * The shared bottom sheet, so it moves up out of the keyboard's way while the
 * name is typed. At a group limit (`limit`, counted from the reader's own
 * groups as the server counts them) it says which one and what makes room,
 * and has nothing to send.
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
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim().length >= 2 && !limit;

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    const res = await createGroup(client, { name: trimmed, description: description.trim() || undefined });
    setBusy(false);
    if (!res.ok) {
      haptic('wrong');
      setError(describeError(res.error, t));
      return;
    }
    haptic('correct');
    setName('');
    setDescription('');
    onCreated(res.data.id, trimmed);
  };

  return (
    <BottomSheet visible={open} onClose={onClose} title={t('groups.new')} dismissible={!busy}>
      {limit ? <Text style={[styles.notice, dir.text, { color: colors.textSecondary }]}>{limitText(limit, t)}</Text> : null}
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

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <ClayButton label={busy ? t('groups.creating') : t('groups.create')} tone="primary" size="large" busy={busy} disabled={!ready} onPress={() => void submit()} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  notice: { fontSize: typography.sizes.sm, lineHeight: 20 },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sizes.md,
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  hint: { fontSize: typography.sizes.xs, lineHeight: 18 },
  error: { textAlign: 'center', fontSize: typography.sizes.sm },
});
