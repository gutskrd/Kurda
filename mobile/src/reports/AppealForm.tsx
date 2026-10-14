import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_APPEAL_LEN, type AppealView, type FileAppealRequest } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import { describeError } from '../api/errors';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { ClayButton } from '../theme/glass';
import { radii, spacing, typography } from '../theme/tokens';
import { fileAppeal } from './api';
import { useDirection } from './direction';

/**
 * "Ask for a review" — one request per decision, for six months.
 *
 * The same few lines wherever a decision can be questioned: a sanction on
 * Account standing, a "doesn't break our rules" answer in My reports, and the
 * suspension screen, which has no session and passes a client that sends the
 * appeal token instead. Words are required (the server needs something to
 * look at again), but there is no minimum.
 */
export function AppealForm({
  client,
  subject,
  onFiled,
}: {
  client: ApiClient;
  /** the sanction, or the report's case, being questioned */
  subject: Pick<FileAppealRequest, 'sanctionId' | 'caseId'>;
  onFiled: (appeal: AppealView) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = t('appeal.label');

  const send = (): void => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    void fileAppeal(client, { ...subject, text: body }).then((res) => {
      setBusy(false);
      if (res.ok) {
        onFiled(res.data);
        return;
      }
      const code = res.error.code;
      setError(
        code === 'ALREADY_APPEALED'
          ? t('appeal.error.already')
          : code === 'APPEAL_WINDOW_CLOSED'
            ? t('appeal.error.closed')
            : res.error.status === 401
              ? t('suspension.expired')
              : describeError(res.error, t),
      );
    });
  };

  return (
    <View style={styles.form}>
      <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        maxLength={MAX_APPEAL_LEN}
        accessibilityLabel={label}
        style={[styles.input, dir.text, { color: colors.textPrimary, backgroundColor: colors.controlTrack }]}
      />
      <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('appeal.once')}</Text>
      {error ? (
        <Text style={[styles.hint, dir.text, { color: colors.danger }]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <ClayButton label={t('appeal.send')} tone="primary" busy={busy} disabled={!text.trim()} onPress={send} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm, marginTop: spacing.sm },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  input: {
    minHeight: 96,
    textAlignVertical: 'top',
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: typography.sizes.md,
  },
  hint: { fontSize: typography.sizes.sm, lineHeight: 20 },
});
