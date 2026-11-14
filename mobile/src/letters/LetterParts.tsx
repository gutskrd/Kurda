import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { LETTER_MAX, letterBirdSvg, letterProblem, type LetterItem, type LetterProblem } from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useTheme } from '../theme/ThemeProvider';
import { useDirection } from '../reports/direction';
import { PressableScale } from '../theme/MotionParts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';

/**
 * The small pieces the letters screens share, as the website has them
 * (web/src/letters/LetterParts.tsx): a pen pal's bird as their picture, the
 * sheet of lined paper a letter is written on, and a letter as it is read.
 *
 * A letter is warm paper with the deep ink on it in either theme — an object
 * on the screen, like the pictures, not a surface of it — a little dimmer in
 * the dark so it does not glare.
 */

const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** The paper's own colours, light and dark. */
export function usePaper(): { paper: string; line: string; ink: string; soft: string } {
  const { scheme } = useTheme();
  return scheme === 'dark'
    ? { paper: '#e9dfcd', line: '#d6c8ad', ink: '#2b2238', soft: '#6f6476' }
    : { paper: '#fbf3e4', line: '#e9dcc3', ink: '#2b2238', soft: '#6f6476' };
}

let drawings = 0;
/** An id prefix of this drawing's own, so two birds on a screen never share a clip. */
function useArtId(): string {
  const id = useRef<string | null>(null);
  if (id.current === null) {
    drawings += 1;
    id.current = `hvl${drawings.toString(36)}`;
  }
  return id.current;
}

/** Somebody's pigeon, its portrait in a round of its own as their picture. Decoration: their name is always beside it. */
export function BirdBadge({ bird, size = 44 }: { bird: number; size?: number }): React.JSX.Element {
  const id = useArtId();
  const xml = useMemo(() => letterBirdSvg({ bird, portrait: true, size, idPrefix: id }), [bird, size, id]);
  return (
    <View {...HIDDEN} style={[styles.badge, { width: size, height: size }]}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}

/** What to tell the writer about a letter that cannot go as it is. */
const PROBLEM: Record<LetterProblem, TranslationKey> = {
  short: 'letters.problem.short',
  long: 'letters.problem.long',
  link: 'letters.problem.link',
  contact: 'letters.problem.contact',
};

/** How far apart the paper's rules are: one a line of writing. */
const RULE = 30;

/**
 * A sheet of lined paper to write a letter on, and the bird's send. What the
 * server would refuse is said under it as it is written — a link, a phone
 * number, too long — so nothing is refused after the bird has left; that it
 * is still empty is said only once somebody tries to send it. A single word
 * is a letter.
 */
export function LetterPaper({
  label,
  sendLabel,
  busy,
  onSend,
  error,
  testID,
}: {
  label: string;
  /** what sending it is called, when it is not your own bird that takes it */
  sendLabel?: string;
  busy: boolean;
  onSend: (body: string) => void;
  /** what the server answered, when it refused */
  error?: string | null;
  testID?: string;
}): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const paper = usePaper();
  const [body, setBody] = useState('');
  const [tried, setTried] = useState(false);
  const problem = letterProblem(body);
  const shown = problem && (problem !== 'short' || tried) ? t(PROBLEM[problem]) : null;
  const length = [...body.trim()].length;
  const send = (): void => {
    setTried(true);
    if (!problem && !busy) onSend(body);
  };
  return (
    <View style={styles.paperBlock}>
      <Text style={[styles.paperLabel, dir.text, { color: colors.textPrimary }]}>{label}</Text>
      <View style={[styles.sheet, { backgroundColor: paper.paper, borderColor: paper.line }]}>
        {/* the rules of the paper, behind the writing */}
        <View {...HIDDEN} pointerEvents="none" style={StyleSheet.absoluteFill}>
          {Array.from({ length: 8 }, (_, i) => (
            <View key={i} style={[styles.rule, { top: 12 + (i + 1) * RULE, backgroundColor: paper.line }]} />
          ))}
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={LETTER_MAX + 200}
          placeholder={t('letters.placeholder')}
          placeholderTextColor={paper.soft}
          accessibilityLabel={label}
          accessibilityHint={t('letters.hint')}
          testID={testID ? `${testID}-input` : undefined}
          style={[styles.input, { color: paper.ink, textAlign: dir.row === 'row-reverse' ? 'right' : 'left' }]}
        />
      </View>
      <View style={[styles.paperFoot, { flexDirection: dir.row }]}>
        <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('letters.hint')}</Text>
        <Text {...HIDDEN} style={[styles.count, { color: length > LETTER_MAX ? colors.danger : colors.textSecondary }]}>
          {length} / {LETTER_MAX}
        </Text>
      </View>
      {shown || error ? (
        <Text accessibilityLiveRegion="polite" testID={testID ? `${testID}-problem` : undefined} style={[styles.problem, dir.text, { color: colors.danger }]}>
          {shown ?? error}
        </Text>
      ) : null}
      <ClayButton label={busy ? t('letters.sending') : (sendLabel ?? t('letters.send'))} onPress={send} tone="primary" busy={busy} testID={testID ? `${testID}-send` : undefined} />
    </View>
  );
}

/** A letter as it is read: on its paper, who wrote it and when, and for one written to you, the way to report it. */
export function LetterSheet({ letter, from, onReport }: { letter: LetterItem; from: string; onReport?: () => void }): React.JSX.Element {
  const { t, locale } = useI18n();
  const dir = useDirection();
  const paper = usePaper();
  let when = '';
  try {
    when = new Date(letter.sentAt).toLocaleString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  } catch {
    when = new Date(letter.sentAt).toLocaleString();
  }
  // mine stand toward the end of the line, theirs toward its start, as letters laid on a table
  const side = letter.mine ? (dir.row === 'row-reverse' ? styles.toLeft : styles.toRight) : dir.row === 'row-reverse' ? styles.toRight : styles.toLeft;
  return (
    <View accessible={false} style={[styles.letter, side, { backgroundColor: paper.paper, borderColor: paper.line }]}>
      <View style={[styles.letterHead, { flexDirection: dir.row }]}>
        <Text style={[styles.from, { color: paper.ink }]} numberOfLines={1}>
          {from}
        </Text>
        <Text style={[styles.when, { color: paper.soft }]}>{when}</Text>
      </View>
      {letter.removed ? (
        <Text style={[styles.removed, dir.text, { color: paper.soft }]}>{t('letters.removed')}</Text>
      ) : (
        <Text style={[styles.body, dir.free, { color: paper.ink }]} selectable>
          {letter.body}
        </Text>
      )}
      {onReport && !letter.removed ? (
        <PressableScale
          onPress={onReport}
          accessibilityRole="button"
          accessibilityLabel={`${t('letters.reportLetter')}, ${t('letters.fromWhom', { name: from })}`}
          testID={`letter-report-${letter.id}`}
          style={[styles.report, { flexDirection: dir.row, alignSelf: dir.row === 'row-reverse' ? 'flex-start' : 'flex-end' }]}
        >
          <Icon name="flag" size={14} color={paper.soft} />
          <Text style={[styles.reportText, { color: paper.soft }]}>{t('letters.reportLetter')}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: radii.pill, backgroundColor: '#e3f1fb' },

  paperBlock: { gap: spacing.sm },
  paperLabel: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  sheet: { borderRadius: radii.lg, borderWidth: 1, overflow: 'hidden' },
  rule: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth * 2 },
  input: {
    minHeight: RULE * 7,
    paddingHorizontal: spacing.md,
    paddingTop: 14,
    paddingBottom: spacing.sm,
    fontSize: typography.sizes.md,
    lineHeight: RULE,
    textAlignVertical: 'top',
  },
  paperFoot: { justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  hint: { flex: 1, fontSize: typography.sizes.xs, lineHeight: 17 },
  count: { fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
  problem: { fontSize: typography.sizes.sm, lineHeight: 19 },

  letter: { gap: spacing.sm, borderRadius: radii.lg, borderWidth: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md - 2, paddingBottom: spacing.sm + 2 },
  toRight: { marginLeft: '10%' },
  toLeft: { marginRight: '10%' },
  letterHead: { justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  from: { flexShrink: 1, fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  when: { fontSize: typography.sizes.xs },
  body: { fontSize: typography.sizes.md, lineHeight: 25 },
  removed: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
  report: { alignItems: 'center', gap: 5, minHeight: MIN_TOUCH_TARGET - 12, paddingHorizontal: spacing.xs },
  reportText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
});
