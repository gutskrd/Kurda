import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { MAX_REASON, MIN_REASON, REPORT_CATEGORIES, reportUser, type ReportCategory } from './blocks';

const CATEGORY_LABEL: Record<ReportCategory, TranslationKey> = {
  harassment: 'moderation.category.harassment',
  spam: 'moderation.category.spam',
  impersonation: 'moderation.category.impersonation',
  hate: 'moderation.category.hate',
  self_harm: 'moderation.category.selfHarm',
  other: 'moderation.category.other',
};

/**
 * Reporting a person (KUR-083).
 *
 * The phone could report a post or a comment, but not the person — through the
 * two-button `confirmReport` alert, which is all a post needs because the post
 * itself is the evidence. A report about a person has nothing attached to it,
 * so what is written here *is* the case: without it there is nothing for a
 * moderator to act on. That is why this is a sheet with a category and a
 * required sentence rather than a yes/no.
 *
 * A Modal, not a positioned View — anything else inside the tab navigator
 * renders under the tab bar and lets taps through to it.
 *
 * Reporting sits next to blocking because they are what you reach for in the
 * same moment and do different halves of the job: a block ends it for you and
 * tells nobody, a report tells a moderator and changes nothing you can see.
 * Neither is offered as a substitute for the other.
 */
export function ReportUserSheet({
  userId,
  name,
  onClose,
}: {
  userId: string;
  name: string;
  onClose: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [category, setCategory] = useState<ReportCategory>('harassment');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const short = reason.trim().length < MIN_REASON;

  const send = (): void => {
    if (short || busy) return;
    setBusy(true);
    setError(null);
    void reportUser(client, userId, category, reason.trim()).then((res) => {
      setBusy(false);
      if (!res.ok) {
        setError(describeError(res.error, t));
        return;
      }
      // the server tells nobody anything either way, so this note is the only
      // acknowledgement there is — and it must not promise an outcome
      setDone(true);
    });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
        {/* a tap inside the sheet must not reach the backdrop and close it */}
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background }]}
          onPress={() => undefined}
        >
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('moderation.reportWho', { name })}</Text>

          {done ? (
            <>
              <Text style={[styles.note, { color: colors.textSecondary }]}>{t('moderation.reportThanks')}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" style={styles.primary}>
                <Text style={[styles.primaryText, { color: colors.primary }]}>{t('common.done')}</Text>
              </Pressable>
            </>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('moderation.whatIsHappening')}</Text>
              <View style={styles.chips}>
                {REPORT_CATEGORIES.map((c) => {
                  const on = c === category;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setCategory(c)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: on ? colors.primary : colors.controlTrack,
                          borderColor: on ? colors.primary : colors.glassBorder,
                        },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: on ? colors.textOnPrimary : colors.textPrimary }]}>
                        {t(CATEGORY_LABEL[c])}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('moderation.whatShouldModKnow')}</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder={t('moderation.reasonPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={MAX_REASON}
                style={[
                  styles.input,
                  { color: colors.textPrimary, backgroundColor: colors.controlTrack },
                ]}
              />
              <Text style={[styles.note, { color: colors.textSecondary }]}>
                {short
                  ? t('moderation.reasonTooShort', { min: MIN_REASON })
                  : t('moderation.charactersLeft', { count: MAX_REASON - reason.trim().length })}
              </Text>

              {error ? <Text style={[styles.note, { color: colors.danger }]}>{error}</Text> : null}

              <View style={styles.actions}>
                <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
                  <Text style={[styles.primaryText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
                </Pressable>
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Pressable onPress={send} accessibilityRole="button" disabled={short} hitSlop={8}>
                    {/* dimmed rather than hidden: a button that is there but not
                        yet usable says what is missing, one that vanishes does not */}
                    <Text style={[styles.primaryText, { color: colors.primary, opacity: short ? 0.4 : 1 }]}>
                      {t('moderation.sendReport')}
                    </Text>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  title: { ...display(typography.sizes.lg), marginBottom: spacing.xs },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  chipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  input: {
    minHeight: 90,
    textAlignVertical: 'top',
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: typography.sizes.md,
    marginTop: spacing.xs,
  },
  note: { fontSize: typography.sizes.sm, marginTop: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.lg, marginTop: spacing.md },
  primary: { alignItems: 'center', paddingVertical: spacing.md },
  primaryText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
