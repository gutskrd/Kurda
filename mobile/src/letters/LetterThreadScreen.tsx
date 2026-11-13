import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LetterItem, LetterThread } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { HeaderButton } from '../navigation/HeaderButton';
import { showActions } from '../theme/actionSheet';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { ReportSheet, type ReportTarget } from '../reports/ReportSheet';
import { blockUser } from '../social/blocks';
import { haptic } from '../feedback/haptics';
import { BirdBadge, LetterPaper, LetterSheet } from './LetterParts';
import { letterErrorText } from './errors';

/**
 * One correspondence, on the phone (the website's /app/letters/:id,
 * web/src/letters/LetterThreadPage.tsx): every letter, oldest first, each on
 * its own sheet, and at the foot either the paper to write back on — when it
 * is your turn — or a line saying your bird is with them.
 *
 * The pen pal's ⋯ holds what ends things, plainly named: report them, block
 * them, and say goodbye, asked first, which closes the letters for both. A
 * letter written to you can be reported on its own, from under it.
 */
export function LetterThreadScreen({ threadId, onExit }: { threadId: string; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const [thread, setThread] = useState<LetterThread | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<LetterItem | null>(null);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  // a letter sent is shown at once; a fresh sheet of paper only with their answer
  const [paperKey, setPaperKey] = useState(0);

  const load = useCallback(async (): Promise<void> => {
    const res = await client.get<LetterThread>(`/letters/threads/${encodeURIComponent(threadId)}`);
    if (res.ok) {
      setThread(res.data);
      setError(null);
    } else setError(res.error);
  }, [client, threadId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const name = thread?.person.name ?? '';

  const reply = async (body: string): Promise<void> => {
    setBusy(true);
    setSendError(null);
    const res = await client.post<{ letter: LetterItem }>(`/letters/threads/${encodeURIComponent(threadId)}`, { body });
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      setSendError(letterErrorText(res.error, t) ?? describeError(res.error, t));
      return;
    }
    haptic('tap');
    setSent(res.data.letter);
    setPaperKey((k) => k + 1);
  };

  const block = useCallback(() => {
    if (!thread) return;
    Alert.alert(t('moderation.blockWhoTitle', { name }), t('moderation.blockNote'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('moderation.block'),
        style: 'destructive',
        onPress: () => {
          void blockUser(client, thread.person.id).then((res) => {
            if (res.ok) onExit();
            else Alert.alert(describeError(res.error, t));
          });
        },
      },
    ]);
  }, [client, thread, name, onExit, t]);

  const goodbye = useCallback(() => {
    Alert.alert(t('letters.goodbye.title', { name }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('letters.goodbye'),
        style: 'destructive',
        onPress: () => {
          void client.post(`/letters/threads/${encodeURIComponent(threadId)}/end`).then((res) => {
            if (res.ok) onExit();
            else Alert.alert(describeError(res.error, t));
          });
        },
      },
    ]);
  }, [client, threadId, name, onExit, t]);

  /** The menu about them: what ends things, each plainly named. */
  const more = useCallback(() => {
    if (!thread) return;
    showActions({
      title: name,
      cancel: t('common.cancel'),
      actions: [
        ...(thread.closed ? [] : [{ label: t('letters.goodbye'), destructive: true, onPress: goodbye }]),
        { label: t('moderation.report'), onPress: () => setReporting({ type: 'user', userId: thread.person.id }) },
        { label: t('moderation.block'), destructive: true, onPress: block },
      ],
    });
  }, [thread, name, goodbye, block, t]);

  const letters = thread ? (sent && !thread.letters.some((l) => l.id === sent.id) ? [...thread.letters, sent] : thread.letters) : [];
  const yourTurn = thread !== null && thread.yourTurn && !sent;

  return (
    <GradientBackground>
      <ScreenHeader
        title={name}
        onBack={onExit}
        hairline
        right={thread ? <HeaderButton icon="more" label={t('moderation.moreAbout', { name })} onPress={more} edge="end" testID="letters-more" /> : undefined}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!thread ? (
            error ? (
              <ErrorRetry message={describeError(error, t)} onRetry={() => void load()} />
            ) : null
          ) : (
            <>
              <View style={[styles.who, { flexDirection: dir.row }]}>
                <BirdBadge bird={thread.person.bird} size={52} />
                <Text style={[styles.name, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
                  {name}
                </Text>
              </View>
              <View style={styles.list}>
                {letters.map((l) => (
                  <LetterSheet
                    key={l.id}
                    letter={l}
                    from={l.mine ? t('letters.you') : name}
                    onReport={l.mine ? undefined : () => setReporting({ type: 'letter', letterId: l.id })}
                  />
                ))}
              </View>
              {thread.closed ? (
                <Text style={[styles.note, { color: colors.textSecondary, backgroundColor: colors.surface }]} testID="letters-closed">
                  {t('letters.thread.closed')}
                </Text>
              ) : yourTurn ? (
                <LetterPaper key={paperKey} label={t('letters.writeBack', { name })} busy={busy} onSend={(body) => void reply(body)} error={sendError} testID="letters-reply" />
              ) : (
                <Text style={[styles.note, { color: colors.textSecondary, backgroundColor: colors.surface }]} testID="letters-waiting">
                  {t('letters.thread.waiting', { name })}
                </Text>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {thread ? (
        <ReportSheet
          visible={reporting !== null}
          target={reporting ?? { type: 'user', userId: thread.person.id }}
          name={name}
          blockable={{ userId: thread.person.id, name }}
          onClose={() => setReporting(null)}
          onBlocked={() => {
            setReporting(null);
            onExit();
          }}
        />
      ) : null}
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: layout.gutter, paddingBottom: spacing.xxl, gap: spacing.lg },
  who: { alignItems: 'center', gap: spacing.md - 4 },
  name: { flex: 1, ...display(typography.sizes.xl) },
  list: { gap: spacing.md - 4 },
  note: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center', padding: spacing.md - 2, borderRadius: radii.lg, overflow: 'hidden' },
});
