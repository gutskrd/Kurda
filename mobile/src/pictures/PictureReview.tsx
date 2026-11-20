import { useState } from 'react';
import { Image, Linking, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { HELPLINE_URL, PICTURE_REVIEW_NOTE_MAX, type PendingPicture, type PictureRejection } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { REFUSAL_KEY, askForReview, askOutcome } from './review';

/**
 * What the owner sees while a picture is checked: why one was refused, with the helpline after a self-harm refusal and
 * a way to ask a person to look again; and, for one held, a calm "being checked" mark and what it means. Said in the
 * same quiet tone everywhere, since nothing here is a mistake made just now.
 */

/**
 * A refused picture, said in place: the reason's sentence, the helpline where it may help, and "Ask a person to check"
 * when the server allows it, which opens a small sheet for an optional note. Once asked, the promise takes the button's
 * place.
 */
export function PictureRefusal({
  rejection,
  label,
  style,
  testID,
}: {
  rejection: PictureRejection;
  /** Which picture this is about, where there are several. */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [asking, setAsking] = useState(false);
  const [answered, setAnswered] = useState<string | null>(null);
  const start = dir.rtl ? 'flex-end' : 'flex-start';
  const helpline = rejection.reason === 'self_harm';
  return (
    <View style={[styles.refusal, { backgroundColor: colors.controlTrack }, style]} accessibilityLiveRegion="polite" testID={testID}>
      <View style={[styles.row, { flexDirection: dir.row }]}>
        <Icon name="shield" size={18} color={colors.textSecondary} />
        <View style={styles.flex}>
          {label ? <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{label}</Text> : null}
          <Text style={[styles.text, dir.text, { color: colors.textPrimary }]}>{t(REFUSAL_KEY[rejection.reason])}</Text>
        </View>
      </View>
      {helpline || answered || rejection.reviewId ? (
        // Under the words, past the icon, on the side they start from.
        <View style={[styles.next, { alignItems: start }, dir.rtl ? { paddingRight: TEXT_INSET } : { paddingLeft: TEXT_INSET }]}>
          {helpline ? (
            <PressableScale
              onPress={() => void Linking.openURL(HELPLINE_URL)}
              accessibilityRole="link"
              style={[styles.help, { flexDirection: dir.row, backgroundColor: colors.successFill }]}
              testID="picture-helpline"
            >
              <Icon name="lifebuoy" size={18} color={colors.success} />
              <Text style={[styles.helpText, { color: colors.textPrimary }]}>{t('report.help.find')}</Text>
            </PressableScale>
          ) : null}
          {answered ? (
            <Text style={[styles.text, dir.text, { color: colors.textSecondary }]} testID="picture-asked">
              {answered}
            </Text>
          ) : rejection.reviewId ? (
            <ClayButton label={t('picture.ask.button')} variant="outline" tone="primary" onPress={() => setAsking(true)} testID="picture-ask" />
          ) : null}
        </View>
      ) : null}
      {asking && rejection.reviewId ? (
        <AskPersonSheet
          reviewId={rejection.reviewId}
          onClose={() => setAsking(false)}
          onDone={(text) => {
            setAsking(false);
            setAnswered(text);
          }}
        />
      ) : null}
    </View>
  );
}

/** The small sheet behind "Ask a person to check": an optional note, and Send. A failure stays in the sheet with the note. */
function AskPersonSheet({ reviewId, onClose, onDone }: { reviewId: string; onClose: () => void; onDone: (text: string) => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = t('picture.ask.note');
  const send = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const outcome = askOutcome(await askForReview(client, reviewId, note), t);
    setBusy(false);
    if (outcome.done) onDone(outcome.text);
    else setError(outcome.text);
  };
  return (
    <BottomSheet visible onClose={onClose} dismissible={!busy} title={t('picture.ask.button')} contentStyle={styles.sheetScroller} testID="picture-ask-sheet">
      <SheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
        <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{label}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          maxLength={PICTURE_REVIEW_NOTE_MAX}
          multiline
          textAlignVertical="top"
          accessibilityLabel={label}
          style={[styles.note, dir.free, { color: colors.textPrimary, backgroundColor: colors.controlTrack }]}
          testID="picture-ask-note"
        />
        {error ? (
          <Text style={[styles.text, dir.text, { color: colors.danger }]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <ClayButton label={t('appeal.send')} tone="primary" busy={busy} onPress={() => void send()} testID="picture-ask-send" />
      </SheetScrollView>
    </BottomSheet>
  );
}

/** The quiet mark on something of yours that waits for a person: a clock and "Being checked". */
export function HeldChip({ style }: { style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const { t } = useI18n();
  return (
    <View style={[styles.chip, { flexDirection: dir.row, backgroundColor: colors.controlTrack, alignSelf: dir.rtl ? 'flex-end' : 'flex-start' }, style]}>
      <Icon name="clock" size={14} color={colors.textSecondary} />
      <Text style={[styles.chipText, { color: colors.textPrimary }]}>{t('picture.held.chip')}</Text>
    </View>
  );
}

/** A held post or letter as its owner sees it: the chip, and who can see it until a person has looked. */
export function HeldNote({ body = 'picture.held.body', style, testID }: { body?: TranslationKey; style?: StyleProp<ViewStyle>; testID?: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.held, style]} testID={testID}>
      <HeldChip />
      <Text style={[styles.text, dir.text, { color: colors.textSecondary }]}>{t(body)}</Text>
    </View>
  );
}

/**
 * A new profile or group photo waiting for a person, on its owner's own screens: the photo small, beside who sees which
 * meanwhile. Its private link lasts minutes, so a picture that no longer opens leaves the words alone.
 */
export function PendingPhoto({ pending, body, testID }: { pending: PendingPicture | null; body: TranslationKey; testID?: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [broken, setBroken] = useState(false);
  return (
    <View style={[styles.pending, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]} testID={testID}>
      {broken || !pending ? null : (
        <Image
          source={{ uri: pending.url }}
          onError={() => setBroken(true)}
          style={[styles.pendingPhoto, { backgroundColor: colors.separator }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('picture.held.chip')}
          accessibilityIgnoresInvertColors
        />
      )}
      <View style={styles.flex}>
        <HeldChip />
        <Text style={[styles.text, dir.text, { color: colors.textSecondary }]}>{t(body)}</Text>
      </View>
    </View>
  );
}

const PENDING = 48;
/** The icon's width and the gap after it: what follows the words lines up with them. */
const TEXT_INSET = 18 + spacing.sm;

const styles = StyleSheet.create({
  flex: { flex: 1, gap: spacing.xs },
  refusal: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.md },
  row: { alignItems: 'flex-start', gap: spacing.sm },
  label: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  text: { fontSize: typography.sizes.sm, lineHeight: 20 },
  next: { gap: spacing.sm },
  help: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, borderRadius: radii.pill },
  helpText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  // The ScrollView keeps the gutter, so the note scrolls edge to edge while the keyboard is up.
  sheetScroller: { paddingHorizontal: 0 },
  sheetBody: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm, gap: spacing.sm },
  note: { minHeight: 96, maxHeight: 180, borderRadius: radii.md, padding: spacing.md, fontSize: typography.sizes.md },
  chip: { alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.pill },
  chipText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  held: { gap: spacing.xs },
  pending: { alignItems: 'center', gap: spacing.md, padding: spacing.md - 4, borderRadius: radii.md },
  pendingPhoto: { width: PENDING, height: PENDING, borderRadius: radii.sm },
});
