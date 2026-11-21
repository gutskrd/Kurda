import { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { letterBirdSvg, type LetterItem } from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { useDirection } from '../reports/direction';
import { PressableScale } from '../theme/MotionParts';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { HIDDEN, LetterOnPaper } from './PaperSheet';

/**
 * Pieces the letters screens share, matching web/src/letters/LetterParts.tsx: a pen pal's bird as their picture,
 * and a letter as it is read on its own paper (PaperSheet.tsx), with report and widget actions. Writing is
 * LetterComposer.tsx.
 */

/** The plain paper a removed letter is shown on, in light and dark. */
function useRemovedPaper(): { paper: string; line: string; soft: string } {
  const { scheme } = useTheme();
  return scheme === 'dark' ? { paper: '#e9dfcd', line: '#d6c8ad', soft: '#6f6476' } : { paper: '#fbf3e4', line: '#e9dcc3', soft: '#6f6476' };
}

let drawings = 0;
/** An id prefix per drawing, so two birds on a screen never share a clip path. */
function useArtId(): string {
  const id = useRef<string | null>(null);
  if (id.current === null) {
    drawings += 1;
    id.current = `hvl${drawings.toString(36)}`;
  }
  return id.current;
}

/** A pen pal's pigeon portrait as their picture. Decorative, since their name is always beside it. */
export function BirdBadge({ bird, size = 44 }: { bird: number; size?: number }): React.JSX.Element {
  const id = useArtId();
  const xml = useMemo(() => letterBirdSvg({ bird, portrait: true, size, idPrefix: id }), [bird, size, id]);
  return (
    <View {...HIDDEN} style={[styles.badge, { width: size, height: size }]}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}

/** The widget action under a received letter. */
interface WidgetAction {
  pinned: boolean;
  onToggle: () => void;
}

/**
 * A letter as it is read: on its own paper with sender and time at the top, and under a received letter the widget
 * and report actions. A letter removed by moderation is a plain card saying so, without its paper or decor.
 */
export function LetterSheet({
  letter,
  from,
  onReport,
  widget,
}: {
  letter: LetterItem;
  from: string;
  onReport?: () => void;
  widget?: WidgetAction;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const plain = useRemovedPaper();
  let when = '';
  try {
    // The hour as a chat shows it, without a leading zero where the language uses none.
    when = new Date(letter.sentAt).toLocaleString(locale, { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  } catch {
    when = new Date(letter.sentAt).toLocaleString();
  }
  if (letter.removed) {
    return (
      <View style={[styles.removedCard, { backgroundColor: plain.paper, borderColor: plain.line }]} testID={`letter-${letter.id}`}>
        <View style={[styles.removedHead, { flexDirection: dir.row }]}>
          <Text style={[styles.from, { color: '#2b2238' }]} numberOfLines={1}>
            {from}
          </Text>
          <Text style={[styles.when, { color: plain.soft }]}>{when}</Text>
        </View>
        <Text style={[styles.removed, dir.text, { color: plain.soft }]}>{t('letters.removed')}</Text>
      </View>
    );
  }
  const actions = onReport || widget;
  return (
    <View style={styles.letter}>
      <LetterOnPaper body={letter.body} decor={letter.decor ?? null} from={from} when={when} pinned={widget?.pinned ?? false} testID={`letter-${letter.id}`} />
      {actions ? (
        <View style={[styles.actions, { flexDirection: dir.row }]}>
          {widget ? (
            <PressableScale
              onPress={widget.onToggle}
              accessibilityRole="button"
              accessibilityLabel={`${widget.pinned ? t('letters.pin.remove') : t('letters.pin.show')}, ${t('letters.fromWhom', { name: from })}`}
              testID={`letter-widget-${letter.id}`}
              style={[styles.action, { flexDirection: dir.row }]}
            >
              <Icon name="pin" size={14} color={colors.textSecondary} />
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>{widget.pinned ? t('letters.pin.remove') : t('letters.pin.show')}</Text>
            </PressableScale>
          ) : null}
          {onReport ? (
            <PressableScale
              onPress={onReport}
              accessibilityRole="button"
              accessibilityLabel={`${t('letters.reportLetter')}, ${t('letters.fromWhom', { name: from })}`}
              testID={`letter-report-${letter.id}`}
              style={[styles.action, { flexDirection: dir.row }]}
            >
              <Icon name="flag" size={14} color={colors.textSecondary} />
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>{t('letters.reportLetter')}</Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: radii.pill, backgroundColor: '#e3f1fb' },

  letter: { gap: 2 },
  // The quiet actions under a letter, toward the end of the line.
  actions: { justifyContent: 'flex-end', flexWrap: 'wrap', columnGap: spacing.md },
  action: { alignItems: 'center', gap: 5, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.xs },
  actionText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },

  removedCard: { gap: spacing.sm, borderRadius: radii.lg, borderWidth: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md - 2, paddingBottom: spacing.sm + 2 },
  removedHead: { justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  from: { flexShrink: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  when: { fontSize: typography.sizes.text },
  removed: { fontSize: typography.sizes.text, fontStyle: 'italic' },
});
