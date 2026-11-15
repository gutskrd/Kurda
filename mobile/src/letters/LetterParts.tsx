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
import { LetterOnPaper } from './PaperSheet';

/**
 * The small pieces the letters screens share, as the website has them
 * (web/src/letters/LetterParts.tsx): a pen pal's bird as their picture, and a
 * letter as it is read — on its own paper (PaperSheet.tsx), with the way to
 * report one written to you, and to keep it on your home-screen widget.
 * Writing one is LetterComposer.tsx.
 */

const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** The plain warm paper a letter taken down is shown on, light and dark, as it always was. */
function useRemovedPaper(): { paper: string; line: string; soft: string } {
  const { scheme } = useTheme();
  return scheme === 'dark' ? { paper: '#e9dfcd', line: '#d6c8ad', soft: '#6f6476' } : { paper: '#fbf3e4', line: '#e9dcc3', soft: '#6f6476' };
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

/** What the widget action under a letter you were sent needs to know and do. */
export interface WidgetAction {
  pinned: boolean;
  busy: boolean;
  onToggle: () => void;
}

/**
 * A letter as it is read: on its own paper, with who wrote it and when at the
 * top of the sheet, and under it, for one written to you, the ways to keep it
 * on your widget and to report it. A letter taken down by moderation is a
 * plain card saying so, its paper, drawing and notes gone with it.
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
    when = new Date(letter.sentAt).toLocaleString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
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
              disabled={widget.busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: widget.busy, busy: widget.busy }}
              accessibilityLabel={`${widget.pinned ? t('letters.pin.remove') : t('letters.pin.show')}, ${t('letters.fromWhom', { name: from })}`}
              testID={`letter-widget-${letter.id}`}
              style={[styles.action, { flexDirection: dir.row }, widget.busy ? styles.busy : null]}
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
  // the quiet things to do with a letter, under it toward the end of the line
  actions: { justifyContent: 'flex-end', flexWrap: 'wrap', columnGap: spacing.md },
  action: { alignItems: 'center', gap: 5, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.xs },
  actionText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  busy: { opacity: 0.5 },

  removedCard: { gap: spacing.sm, borderRadius: radii.lg, borderWidth: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md - 2, paddingBottom: spacing.sm + 2 },
  removedHead: { justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  from: { flexShrink: 1, fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  when: { fontSize: typography.sizes.xs },
  removed: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
});
