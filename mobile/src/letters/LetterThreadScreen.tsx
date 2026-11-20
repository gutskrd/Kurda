import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Alert, AppState, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  LETTERS_CHANGED,
  freshLetters,
  letterThreadPath,
  withEarlierLetters,
  type LetterItem,
  type LetterThread,
  type PictureRejection,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useUserEvents, type UserEvent } from '../realtime/useUserEvents';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { HeaderButton } from '../navigation/HeaderButton';
import { showActions } from '../theme/actionSheet';
import { ClayButton, ErrorRetry, GradientBackground } from '../theme/glass';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { ReportSheet, type ReportTarget } from '../reports/ReportSheet';
import { useBlock } from '../social/blocks';
import { haptic } from '../feedback/haptics';
import { BirdBadge, LetterSheet } from './LetterParts';
import { LetterComposer, rememberedPaper, type ComposedLetter } from './LetterComposer';
import { usePaperScroll } from './usePaperScroll';
import { useWidgetPin } from './widgetPin';
import { letterErrorText } from './errors';
import { keepDraft, threadDraft, useLetterDrafts } from './drafts';
import { onLetterNotice } from './letterPushes';
import { HeldNote, PictureRefusal } from '../pictures/PictureReview';
import { isHeld, rejectionOf } from '../pictures/review';

/** The minimum gap between re-reads when the app returns to the front. */
const FRONT_GAP_MS = 5000;

/**
 * One correspondence (the website's web/src/letters/LetterThreadPage.tsx): its newest letters oldest first, each on its
 * own paper, with the earlier ones a press away, and at the foot either the paper to write back on, when it is your
 * turn, or a line saying your bird is with them. A received letter can be pinned to the widget or reported. The pen pal's ⋯ menu holds report, block and
 * goodbye, which asks first and closes the letters for both. Your letter whose drawing waits for a person says so
 * instead, since its bird cannot fly until then; a drawing the check refuses says why under the paper.
 *
 * While in view it is re-read on `letters_changed`, on a notification for it, and on return to the front, so a new
 * letter appears here (it still lands at your window once); earlier letters already shown stay (shared `freshLetters`).
 * An answer in progress is kept as a draft (drafts.ts).
 */
export function LetterThreadScreen({ threadId, onExit }: { threadId: string; onExit: () => void }): React.JSX.Element {
  const { client, user } = useAuth();
  const who = user?.id ?? null;
  const draftsReady = useLetterDrafts(who);
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const [thread, setThread] = useState<LetterThread | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<PictureRejection | null>(null);
  const [sent, setSent] = useState<LetterItem | null>(null);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  // A sent letter shows at once; a fresh sheet only comes with their answer.
  const [paperKey, setPaperKey] = useState(0);
  // The page the paper lies on: held still while drawing, with the writing kept above the keyboard.
  const page = usePaperScroll();
  const blockNow = useBlock();

  const load = useCallback(async (): Promise<void> => {
    const res = await client.get<LetterThread>(letterThreadPath(threadId));
    if (res.ok) {
      setThread((shown) => freshLetters(shown, res.data));
      setError(null);
    } else setError(res.error);
  }, [client, threadId]);

  const [earlier, setEarlier] = useState<{ busy: boolean; error: ApiError | null }>({ busy: false, error: null });
  const firstShown = thread?.letters[0]?.id;
  const showEarlier = useCallback(() => {
    if (!firstShown) return;
    setEarlier({ busy: true, error: null });
    void client.get<LetterThread>(letterThreadPath(threadId, firstShown)).then((res) => {
      if (res.ok) setThread((shown) => (shown ? withEarlierLetters(shown, res.data) : shown));
      setEarlier({ busy: false, error: res.ok ? null : res.error });
    });
  }, [client, threadId, firstShown]);
  // A letter removed meanwhile cannot be pinned: read again, and it shows as removed.
  const widget = useWidgetPin(client, () => void load());

  const shownAt = useRef(0);
  useFocusEffect(
    useCallback(() => {
      shownAt.current = Date.now();
      void load();
    }, [load]),
  );

  // While in view, re-read on server changes and on notifications for this correspondence.
  const focused = useIsFocused();
  const inView = useRef(focused);
  inView.current = focused;
  const again = useCallback(() => {
    if (!inView.current) return;
    shownAt.current = Date.now();
    void load();
  }, [load]);
  useUserEvents(
    useCallback(
      (event: UserEvent) => {
        if (event.type === LETTERS_CHANGED) again();
      },
      [again],
    ),
  );
  useEffect(() => onLetterNotice((notice) => (notice.threadId === threadId ? again() : undefined)), [again, threadId]);
  useEffect(() => {
    const front = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - shownAt.current >= FRONT_GAP_MS) again();
    });
    return () => front.remove();
  }, [again]);

  const name = thread?.person.name ?? '';

  const reply = async (letter: ComposedLetter): Promise<void> => {
    setBusy(true);
    setSendError(null);
    setRefusal(null);
    const res = await client.post<{ letter: LetterItem }>(`/letters/threads/${encodeURIComponent(threadId)}`, letter);
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      const rejection = rejectionOf(res.error);
      if (rejection) setRefusal(rejection);
      else setSendError(letterErrorText(res.error, t) ?? describeError(res.error, t));
      return;
    }
    haptic('tap');
    keepDraft(who, threadDraft(threadId), null);
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
          blockNow(thread.person.id);
          onExit();
        },
      },
    ]);
  }, [blockNow, thread, name, onExit, t]);

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

  /** The menu about them, each action plainly named. */
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

  // A just-sent letter shows until a read includes it; from then on the server says whose turn it is.
  const pending = thread && sent && !thread.letters.some((l) => l.id === sent.id) ? sent : null;
  const letters = thread ? (pending ? [...thread.letters, pending] : thread.letters) : [];
  const yourTurn = thread !== null && thread.yourTurn && !pending;
  // The newest letter is yours and its drawing waits for a person: it has not gone yet.
  const held = letters.length > 0 && letters[letters.length - 1]!.mine && isHeld(letters[letters.length - 1]);
  // The paper you last wrote on anywhere, else the one you last wrote to them on.
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
          {!thread || !draftsReady ? (
            error && !thread ? (
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
              {thread.earlier ? (
                <View style={styles.earlier}>
                  <ClayButton
                    label={t('letters.thread.earlier')}
                    variant="outline"
                    busy={earlier.busy}
                    onPress={showEarlier}
                    style={styles.earlierButton}
                    testID="letters-earlier"
                  />
                  {earlier.error ? (
                    <Text style={[styles.widgetError, styles.centred, { color: colors.danger }]} accessibilityLiveRegion="polite">
                      {describeError(earlier.error, t)}
                    </Text>
                  ) : null}
                </View>
              ) : null}
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
                            onToggle: () => widget.toggle(l.id),
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
                <>
                  <LetterComposer
                    key={paperKey}
                    label={t('letters.writeBack', { name })}
                    busy={busy}
                    onSend={(letter) => void reply(letter)}
                    error={sendError}
                    canDraw
                    paper={ownPaper}
                    host={page.host}
                    draft={threadDraft(threadId)}
                    testID="letters-reply"
                  />
                  {refusal ? <PictureRefusal rejection={refusal} testID="letters-refused" /> : null}
                </>
              ) : held ? (
                <View style={[styles.heldNote, { backgroundColor: colors.surface }]}>
                  <HeldNote body="picture.held.letter" testID="letters-held" />
                </View>
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

/** The loading state in the correspondence's own shape: their bird and name, and a sheet with a few lines. */
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
  earlier: { alignItems: 'center', gap: spacing.sm },
  earlierButton: { alignSelf: 'center' },
  centred: { textAlign: 'center' },
  widgetError: { fontSize: typography.sizes.sm, lineHeight: 19 },
  note: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center', padding: spacing.md - 2, borderRadius: radii.lg, overflow: 'hidden' },
  heldNote: { padding: spacing.md - 2, borderRadius: radii.lg },
});
