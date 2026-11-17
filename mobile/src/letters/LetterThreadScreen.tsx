import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LetterItem, LetterThread } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { HeaderButton } from '../navigation/HeaderButton';
import { showActions } from '../theme/actionSheet';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
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
import { BirdBadge, LetterSheet } from './LetterParts';
import { LetterComposer, rememberedPaper, type ComposedLetter } from './LetterComposer';
import { usePaperScroll } from './usePaperScroll';
import { useWidgetPin } from './widgetPin';
import { letterErrorText } from './errors';

/**
 * One correspondence, on the phone (the website's /app/letters/:id,
 * web/src/letters/LetterThreadPage.tsx): every letter, oldest first, each on
 * its own sheet, and at the foot either the paper to write back on — when it
 * is your turn — or a line saying your bird is with them.
 *
 * Each letter is on the paper it was written on, with its drawing and its
 * notes, and the answer is written on paper of your own, drawn on if you
 * like: two pen pals may send each other drawings. A letter written to you
 * can be kept on your home-screen widget for good — "Show on my widget" —
 * until it is taken off again, when the widget goes back to the newest.
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
  // the page the paper lies on: held still while drawing, and kept with the writing above the keyboard
  const page = usePaperScroll();
  const widget = useWidgetPin(client);

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

  const reply = async (letter: ComposedLetter): Promise<void> => {
    setBusy(true);
    setSendError(null);
    const res = await client.post<{ letter: LetterItem }>(`/letters/threads/${encodeURIComponent(threadId)}`, letter);
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
  // the paper you last wrote on anywhere, or else the one you last wrote on to them
  const ownPaper = rememberedPaper() ?? [...letters].reverse().find((l) => l.mine && l.decor)?.decor?.paper ?? null;

  return (
    <GradientBackground>
      <ScreenHeader
        title={name}
        onBack={onExit}
        hairline
        right={thread ? <HeaderButton icon="more" label={t('moderation.moreAbout', { name })} onPress={more} testID="letters-more" /> : undefined}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView {...page.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!thread ? (
            error ? (
              <ErrorRetry message={describeError(error, t)} onRetry={() => void load()} />
            ) : (
              <ThreadSkeleton />
            )
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
                    widget={
                      !l.mine && widget.pinned !== undefined
                        ? {
                            pinned: widget.pinned === l.id,
                            busy: widget.busy === l.id,
                            // a letter taken down meanwhile cannot be pinned: the letters are read again, and it shows as taken down
                            onToggle: () => void widget.toggle(l.id).then((code) => (code === 'LETTER_REMOVED' ? load() : undefined)),
                          }
                        : undefined
                    }
                  />
                ))}
                {widget.error ? (
                  <Text style={[styles.widgetError, dir.text, { color: colors.danger }]} accessibilityLiveRegion="polite" testID="letters-widget-error">
                    {widget.error.code === 'LETTER_REMOVED' ? t('letters.removed') : describeError(widget.error, t)}
                  </Text>
                ) : null}
              </View>
              {thread.closed ? (
                <Text style={[styles.note, { color: colors.textSecondary, backgroundColor: colors.surface }]} testID="letters-closed">
                  {t('letters.thread.closed')}
                </Text>
              ) : yourTurn ? (
                <LetterComposer
                  key={paperKey}
                  label={t('letters.writeBack', { name })}
                  busy={busy}
                  onSend={(letter) => void reply(letter)}
                  error={sendError}
                  canDraw
                  paper={ownPaper}
                  host={page.host}
                  testID="letters-reply"
                />
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

/**
 * The correspondence while it is read, in its own shape: their bird and their
 * name, and a sheet of paper with a few lines on it — not a blank under the
 * header.
 */
function ThreadSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  const start = dir.row === 'row-reverse' ? 'flex-end' : 'flex-start';
  return (
    <View style={styles.skeleton} accessibilityLabel={t('common.loading')} testID="letters-thread-loading">
      <View style={[styles.who, { flexDirection: dir.row }]}>
        <Skeleton width={52} height={52} radius={radii.pill} />
        <SkeletonText size={typography.sizes.xl} width="40%" align={start} style={styles.flex} />
      </View>
      <Skeleton height={260} radius={radii.xs} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  skeleton: { gap: spacing.lg },
  content: { padding: layout.gutter, paddingBottom: spacing.xxl, gap: spacing.lg },
  who: { alignItems: 'center', gap: spacing.md - 4 },
  name: { flex: 1, ...display(typography.sizes.xl) },
  list: { gap: spacing.md },
  widgetError: { fontSize: typography.sizes.sm, lineHeight: 19 },
  note: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center', padding: spacing.md - 2, borderRadius: radii.lg, overflow: 'hidden' },
});
