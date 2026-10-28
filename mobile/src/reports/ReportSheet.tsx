import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { useNavigation } from '@react-navigation/native';
import {
  HELPLINE_URL,
  MAX_REPORT_NOTE_LEN,
  REPORT_CATEGORIES,
  type FileReportRequest,
  type PlayGame,
  type ReportCategory,
  type ReportCategoryInfo,
  type ReportReceipt,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { blockUser } from '../social/blocks';
import { leaveGroup } from '../groups/api';
import type { RootNavigation } from '../navigation/rootStack';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useTheme } from '../theme/ThemeProvider';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { Icon } from '../theme/Icon';
import { ClayButton } from '../theme/glass';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { fileReport } from './api';
import { CATEGORY_LABEL } from './labels';
import { useDirection } from './direction';

/**
 * What is being reported. The sheet turns it into `POST /reports`.
 *
 * A game player is named by the game and their seat, never by an account id:
 * a game shows people who are not your friends as "Player N", and the server
 * maps the seat to the person (shared `FileReportRequest`).
 */
export type ReportTarget =
  | { type: 'user'; userId: string }
  | { type: 'dm_message'; messageId: string }
  | { type: 'group_message'; messageId: string }
  | { type: 'group'; groupId: string }
  | { type: 'library_post'; postId: string }
  | { type: 'library_comment'; commentId: string }
  | { type: 'image_post'; postId: string }
  | { type: 'image_comment'; commentId: string }
  | { type: 'game_player'; game: PlayGame; gameId: string; seat: number };

/**
 * The one report sheet, everywhere something can be reported.
 *
 * Props:
 * - `visible` — show it (it is a BottomSheet; keep it mounted and flip this).
 * - `target` — what is reported (`ReportTarget`).
 * - `name` — whom the title names ("Report Rojda", "Report Player 2"); left
 *   out, the title says what it is ("Report this message").
 * - `blockable` — `{ userId, name }` of the person behind it, to offer
 *   **Block** on the done screen (`name` null when the screen has none to
 *   show: "Block this person"). Leave it out when you only know a seat or the
 *   person is you; nothing is offered then.
 * - `leavable` — `{ groupId, name }` to offer **Leave group** on the done
 *   screen (a group, or a message in one).
 * - `onClose()` — the sheet was closed (the ✕, a drag down, Done, the back button).
 * - `onBlocked(userId)` / `onLeftGroup(groupId)` — after the one-tap action
 *   worked, so the screen can step away from what is now gone.
 *
 * Stories (mobile-games) reports a player with
 * `<ReportSheet visible target={{ type: 'game_player', game: 'stories', gameId, seat }} name={t('…', { seat })} onClose={…} />`.
 *
 * The steps, as the contract asks (M1): a category in plain, child-friendly
 * words, most urgent first; "Someone may hurt themselves" shows where to find
 * help *before* anything else; then an optional note — no minimum length, so a
 * child never has to find words; then a done screen that says what happens
 * next and offers the things that help right now. There is no Mute: the app
 * has no personal mute to offer.
 */
export function ReportSheet({
  visible,
  target,
  name,
  blockable,
  leavable,
  onClose,
  onBlocked,
  onLeftGroup,
}: {
  visible: boolean;
  target: ReportTarget;
  name?: string | null;
  blockable?: { userId: string; name: string | null } | null;
  leavable?: { groupId: string; name: string } | null;
  onClose: () => void;
  onBlocked?: (userId: string) => void;
  onLeftGroup?: (groupId: string) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const [step, setStep] = useState<'category' | 'help' | 'note' | 'done'>('category');
  const [category, setCategory] = useState<ReportCategoryInfo | null>(null);
  const [receipt, setReceipt] = useState<ReportReceipt | null>(null);

  // a sheet opened again starts again: the last report is not this one
  useEffect(() => {
    if (!visible) return;
    setStep('category');
    setCategory(null);
    setReceipt(null);
  }, [visible]);

  const title = name ? t('report.title.named', { name }) : t(TITLE[target.type]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} icon="flag" contentStyle={styles.scroller}>
      <SheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        {step === 'category' ? (
          <CategoryStep
            onPick={(c) => {
              setCategory(c);
              setStep(c.showsHelp ? 'help' : 'note');
            }}
          />
        ) : step === 'help' ? (
          <HelpFirst onContinue={() => setStep('note')} />
        ) : step === 'note' && category ? (
          <NoteStep
            target={target}
            category={category}
            onChange={() => setStep('category')}
            onSent={(r) => {
              setReceipt(r);
              setStep('done');
            }}
          />
        ) : receipt ? (
          <DoneStep
            receipt={receipt}
            blockable={blockable ?? null}
            leavable={leavable ?? null}
            onClose={onClose}
            onBlocked={onBlocked}
            onLeftGroup={onLeftGroup}
          />
        ) : null}
      </SheetScrollView>
    </BottomSheet>
  );
}

const TITLE: Record<ReportTarget['type'], TranslationKey> = {
  user: 'report.title.user',
  dm_message: 'report.title.message',
  group_message: 'report.title.message',
  group: 'report.title.group',
  library_post: 'report.title.post',
  library_comment: 'report.title.comment',
  image_post: 'report.title.post',
  image_comment: 'report.title.comment',
  game_player: 'report.title.player',
};

/** A step's heading, said aloud when the step changes — the sheet does not move focus by itself. */
function useAnnounce(text: string): void {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(text);
  }, [text]);
}

function CategoryStep({ onPick }: { onPick: (c: ReportCategoryInfo) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const heading = t('report.whatsWrong');
  useAnnounce(heading);
  return (
    <>
      <Text style={[styles.lead, dir.text, { color: colors.textPrimary }]}>{heading}</Text>
      <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('report.private')}</Text>
      <View style={styles.list} accessibilityRole="list">
        {REPORT_CATEGORIES.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => onPick(c)}
            accessibilityRole="button"
            accessibilityLabel={t(CATEGORY_LABEL[c.key])}
            style={({ pressed }) => [
              styles.option,
              { flexDirection: dir.row, backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.optionText, dir.text, { color: colors.textPrimary }]}>{t(CATEGORY_LABEL[c.key])}</Text>
            <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip} />
          </Pressable>
        ))}
      </View>
    </>
  );
}

/**
 * Help, before the report: when someone may hurt themselves, the first thing
 * on the screen is where to find help — for them, or for the person reporting,
 * who may be the one at risk. The report still goes on afterwards.
 */
function HelpFirst({ onContinue }: { onContinue: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const heading = t('report.help.title');
  useAnnounce(heading);
  return (
    <View style={[styles.help, { backgroundColor: colors.successFill, alignItems: dir.rtl ? 'flex-end' : 'flex-start' }]}>
      <Icon name="lifebuoy" size={28} color={colors.success} />
      <Text style={[styles.lead, styles.stretch, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {heading}
      </Text>
      <Text style={[styles.bodyText, styles.stretch, dir.text, { color: colors.textPrimary }]}>{t('report.help.body')}</Text>
      <ClayButton
        label={t('report.help.find')}
        tone="success"
        size="large"
        icon="globe"
        onPress={() => void Linking.openURL(HELPLINE_URL)}
        style={styles.stretch}
      />
      <ClayButton label={t('report.help.continue')} variant="outline" onPress={onContinue} style={styles.stretch} />
    </View>
  );
}

function NoteStep({
  target,
  category,
  onChange,
  onSent,
}: {
  target: ReportTarget;
  category: ReportCategoryInfo;
  onChange: () => void;
  onSent: (receipt: ReportReceipt) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = t('report.noteLabel');
  useAnnounce(t('report.chosen', { category: t(CATEGORY_LABEL[category.key]) }));

  const send = (): void => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void fileReport(client, requestFor(target, category.key, note)).then((res) => {
      setBusy(false);
      if (res.ok) onSent(res.data);
      else setError(reportErrorText(res.error, t));
    });
  };

  return (
    <>
      <View style={[styles.chosen, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
        <Text style={[styles.chosenText, dir.text, { color: colors.textPrimary }]}>
          {t('report.chosen', { category: t(CATEGORY_LABEL[category.key]) })}
        </Text>
        <Pressable onPress={onChange} accessibilityRole="button" hitSlop={10} style={styles.changeBtn}>
          <Text style={[styles.link, { color: colors.primary }]}>{t('report.change')}</Text>
        </Pressable>
      </View>
      <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={t('report.notePlaceholder')}
        placeholderTextColor={colors.textSecondary}
        multiline
        maxLength={MAX_REPORT_NOTE_LEN}
        accessibilityLabel={label}
        style={[styles.input, dir.text, { color: colors.textPrimary, backgroundColor: colors.controlTrack }]}
      />
      {error ? (
        <Text style={[styles.note, dir.text, { color: colors.danger }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <ClayButton label={t('report.send')} tone="primary" size="large" busy={busy} onPress={send} style={styles.stretch} />
    </>
  );
}

/**
 * After: thanks, what happens next, and the things that help at once — a
 * block ends it for you and tells nobody; leaving a group takes you out of it.
 * Each is one tap, and says so when it is done.
 */
function DoneStep({
  receipt,
  blockable,
  leavable,
  onClose,
  onBlocked,
  onLeftGroup,
}: {
  receipt: ReportReceipt;
  blockable: { userId: string; name: string | null } | null;
  leavable: { groupId: string; name: string } | null;
  onClose: () => void;
  onBlocked?: (userId: string) => void;
  onLeftGroup?: (groupId: string) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const navigation = useNavigation<RootNavigation>();
  const dir = useDirection();
  const [blocked, setBlocked] = useState<'idle' | 'busy' | 'done'>('idle');
  const [left, setLeft] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const heading = t('report.done.title');
  useAnnounce(heading);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const block = (): void => {
    if (!blockable || blocked !== 'idle') return;
    setBlocked('busy');
    void blockUser(client, blockable.userId).then((res) => {
      if (!alive.current) return;
      if (res.ok) {
        setBlocked('done');
        onBlocked?.(blockable.userId);
      } else {
        setBlocked('idle');
        setError(describeError(res.error, t));
      }
    });
  };

  const leave = (): void => {
    if (!leavable || left !== 'idle') return;
    setLeft('busy');
    void leaveGroup(client, leavable.groupId).then((res) => {
      if (!alive.current) return;
      if (res.ok) {
        setLeft('done');
        onLeftGroup?.(leavable.groupId);
      } else {
        setLeft('idle');
        setError(describeError(res.error, t));
      }
    });
  };

  return (
    <>
      <View style={styles.doneHead}>
        <View style={[styles.doneMark, { backgroundColor: colors.successFill }]}>
          <Icon name="check" size={26} color={colors.success} />
        </View>
        <Text style={[styles.lead, styles.center, { color: colors.textPrimary }]} accessibilityRole="header">
          {heading}
        </Text>
        {receipt.deduped ? (
          <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>{t('report.done.deduped')}</Text>
        ) : null}
      </View>

      {receipt.help ? (
        <PressableScale
          onPress={() => void Linking.openURL(receipt.help?.url ?? HELPLINE_URL)}
          accessibilityRole="link"
          style={[styles.helpRow, { flexDirection: dir.row, backgroundColor: colors.successFill }]}
        >
          <Icon name="lifebuoy" size={20} color={colors.success} />
          <Text style={[styles.helpRowText, { color: colors.textPrimary }]}>{t('report.help.find')}</Text>
        </PressableScale>
      ) : null}

      <View style={[styles.next, { backgroundColor: colors.controlTrack }]}>
        <Text style={[styles.label, dir.text, { color: colors.textSecondary, marginTop: 0 }]}>{t('report.next.title')}</Text>
        <Text style={[styles.bodyText, dir.text, { color: colors.textPrimary }]}>{t('report.next.body')}</Text>
      </View>

      {blockable ? (
        <View style={styles.action}>
          <ClayButton
            label={
              blocked === 'done'
                ? t('report.done.blocked')
                : blockable.name
                  ? t('report.done.block', { name: blockable.name })
                  : t('report.done.blockThem')
            }
            icon={blocked === 'done' ? 'check' : 'block'}
            tone="danger"
            variant="outline"
            busy={blocked === 'busy'}
            disabled={blocked === 'done'}
            onPress={block}
            style={styles.stretch}
          />
          <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('report.done.blockHint')}</Text>
        </View>
      ) : null}

      {leavable ? (
        <ClayButton
          label={left === 'done' ? t('report.done.left') : t('groups.leave', { group: leavable.name })}
          icon={left === 'done' ? 'check' : 'sign-out'}
          tone="danger"
          variant="outline"
          busy={left === 'busy'}
          disabled={left === 'done'}
          onPress={leave}
          style={styles.stretch}
        />
      ) : null}

      {error ? (
        <Text style={[styles.note, { color: colors.danger }]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <View style={[styles.footer, { flexDirection: dir.row }]}>
        <Pressable
          onPress={() => {
            onClose();
            navigation.navigate('MyReports');
          }}
          accessibilityRole="link"
          style={styles.footerLink}
        >
          <Text style={[styles.link, { color: colors.primary }]}>{t('reports.title')}</Text>
        </Pressable>
        <ClayButton label={t('common.done')} tone="primary" onPress={onClose} style={styles.doneBtn} />
      </View>
    </>
  );
}

/** The request for a target and a category; an empty note is left out. */
export function requestFor(target: ReportTarget, category: ReportCategory, note: string): FileReportRequest {
  const trimmed = note.trim();
  const base = { category, ...(trimmed ? { note: trimmed } : {}) };
  switch (target.type) {
    case 'user':
      return { ...base, targetType: 'user', targetId: target.userId };
    case 'dm_message':
    case 'group_message':
      return { ...base, targetType: target.type, targetId: target.messageId };
    case 'group':
      return { ...base, targetType: 'group', targetId: target.groupId };
    case 'library_post':
    case 'image_post':
      return { ...base, targetType: target.type, targetId: target.postId };
    case 'library_comment':
    case 'image_comment':
      return { ...base, targetType: target.type, targetId: target.commentId };
    case 'game_player':
      return { ...base, targetType: 'game_player', targetId: target.gameId, game: target.game, seat: target.seat };
  }
}

/** The report's own refusals in plain words; anything else as every screen says it. */
function reportErrorText(error: ApiError, t: (key: TranslationKey, vars?: Record<string, string | number>) => string): string {
  if (error.code === 'REPORT_LIMIT') return t('report.error.limit');
  if (error.code === 'TARGET_NOT_FOUND') return t('report.error.gone');
  if (error.code === 'SELF_REPORT') return t('report.error.self');
  return describeError(error, t);
}

const styles = StyleSheet.create({
  // the gutter is the ScrollView's own, so it scrolls edge to edge under the sheet's header
  scroller: { paddingHorizontal: 0 },
  body: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm, gap: spacing.sm },
  lead: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold },
  note: { fontSize: typography.sizes.sm, lineHeight: 20 },
  bodyText: { fontSize: typography.sizes.md, lineHeight: 22 },
  center: { textAlign: 'center' },
  list: { gap: spacing.xs, marginTop: spacing.xs },
  option: {
    minHeight: 52,
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  optionText: { flex: 1, fontSize: typography.sizes.md, lineHeight: 21 },
  help: { borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md },
  stretch: { alignSelf: 'stretch' },
  chosen: {
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    paddingStart: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
  },
  chosenText: { flex: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  changeBtn: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.md },
  link: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, marginTop: spacing.sm },
  input: {
    minHeight: 100,
    textAlignVertical: 'top',
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: typography.sizes.md,
  },
  doneHead: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  doneMark: { width: 56, height: 56, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  helpRow: {
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  helpRowText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  next: { borderRadius: radii.md, padding: spacing.md, gap: spacing.xs },
  action: { gap: spacing.xs },
  footer: { alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, gap: spacing.md },
  footerLink: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  doneBtn: { minWidth: 120 },
});
