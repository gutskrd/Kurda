import type { ReactNode } from 'react';
import { CHAT_GREETINGS, greetingDialect } from '@kurda/shared';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { scriptLanguage, scriptText } from '../alphabet/parts';
import { useI18n } from '../i18n/I18nContext';
import { useCourseDialect } from '../learn/courseDialect';
import { noticeTime } from '../notifications/inbox';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import type { ClearedView } from './clearing';
import { GroupAvatar } from './GroupAvatar';
import { pressedDim } from '../theme/motion';
import { useDirection } from '../reports/direction';

/**
 * A calm card in the middle of an empty group chat: the group's picture large, its name, and a line about the chat.
 * Shared with the standing card (Standing.tsx), so the two read as the same place.
 */
export function CalmCard({
  group,
  children,
}: {
  group: { id: string; name: string; photoUrl: string | null };
  children: ReactNode;
}): React.JSX.Element {
  return (
    <CalmFrame name={group.name} picture={(size) => <GroupAvatar name={group.name} id={group.id} size={size} photoUrl={group.photoUrl} />}>
      {children}
    </CalmFrame>
  );
}

/**
 * The card itself, around any picture: a group's, or the friend's face in a new conversation (chat/DmWelcome.tsx).
 * `picture` is handed the size the card has room for.
 */
export function CalmFrame({ name, picture, children }: { name: string; picture: (size: number) => ReactNode; children: ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  // A short phone keeps the whole card on screen: a smaller picture, less air.
  const compact = useWindowDimensions().height < 700;
  return (
    <View style={[styles.card, compact && styles.compact, { backgroundColor: colors.surface }]}>
      {/* The name under it says whose picture it is. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {picture(compact ? AVATAR_COMPACT : AVATAR)}
      </View>
      <Text style={[styles.name, { color: colors.textPrimary }]} accessibilityRole="header">
        {name}
      </Text>
      {children}
    </View>
  );
}

/** The line under the name on a calm card: where the chat stands. */
export function CalmLine({ children }: { children: string }): React.JSX.Element {
  const { colors } = useTheme();
  return <Text style={[styles.line, { color: colors.textSecondary }]}>{children}</Text>;
}

/**
 * The welcome in an empty group chat: that it is the group's start, or when the reader cleared it for themselves. Then
 * three greetings to send with one tap, except when the reader cannot post (`canGreet`) or only cleared the chat for
 * themselves, where the others may be mid-conversation. The owner or an admin alone in the group is offered to add
 * friends (`onAddFriends`).
 */
export function WelcomeCard({
  group,
  view,
  canGreet,
  onGreet,
  onAddFriends,
}: {
  group: { id: string; name: string; photoUrl: string | null };
  view: ClearedView;
  canGreet: boolean;
  onGreet: (greeting: string) => void;
  onAddFriends?: () => void;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const line =
    view.kind === 'none'
      ? t('groups.welcome.start', { group: group.name })
      : view.kind === 'mine'
        ? t('groups.welcome.clearedForMe', { when: noticeTime(view.at, t, locale) })
        : null;
  const greet = canGreet && view.kind !== 'mine';
  return (
    <CalmCard group={group}>
      {line ? <CalmLine>{line}</CalmLine> : null}
      {greet ? <Greetings hint={t('groups.welcome.greetHint')} onGreet={onGreet} /> : null}
      {onAddFriends ? <ClayButton label={t('groups.addFriends.title')} icon="user-plus" variant="outline" onPress={onAddFriends} style={styles.add} /> : null}
    </CalmCard>
  );
}

/**
 * Three ways to say hello in the reader's Kurdish (shared `greetingDialect`): the interface's when it is Kurdish, else
 * the course's. Each is sent with one tap. Shared with a first conversation with one friend (chat/DmWelcome.tsx);
 * `hint` tells a screen reader where the tap sends it.
 */
export function Greetings({ hint, onGreet }: { hint: string; onGreet: (greeting: string) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const script = greetingDialect(locale, useCourseDialect());
  // Right to left, the first greeting is on the right, as reading starts there.
  const dir = useDirection();
  return (
    <View style={styles.greet}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('groups.welcome.sayHello')}</Text>
      <View style={[styles.chips, { flexDirection: dir.row }]}>
        {CHAT_GREETINGS[script].map((greeting) => (
          <Pressable
            key={greeting}
            onPress={() => onGreet(greeting)}
            accessibilityRole="button"
            accessibilityLabel={greeting}
            accessibilityLanguage={scriptLanguage(script)}
            accessibilityHint={hint}
            style={({ pressed }) => [styles.chip, { backgroundColor: colors.controlTrack }, pressed && styles.pressed]}
          >
            <Text style={[styles.chipText, scriptText(script), { color: colors.textPrimary }]}>{greeting}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * "Azad cleared the chat · 2h ago" at the top of the history, so nobody wonders where the messages went. "You" for the
 * admin who did it, and "An admin" once that account is gone.
 */
export function ClearedLine({ by, at, me }: { by: string | null; at: string; me: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const when = noticeTime(at, t, locale);
  const text = by === null ? t('groups.cleared.byGone', { when }) : by === me ? t('groups.cleared.byYou', { when }) : t('groups.cleared.by', { name: by, when });
  return (
    <View style={styles.system}>
      <Text style={[styles.systemText, { color: colors.textSecondary, backgroundColor: colors.controlTrack }]}>{text}</Text>
    </View>
  );
}

const AVATAR = 88;
const AVATAR_COMPACT = 64;

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  compact: { paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
  name: { ...display(typography.sizes.lg), textAlign: 'center', marginTop: spacing.xs },
  line: { fontSize: typography.sizes.sm, lineHeight: 21, textAlign: 'center' },
  greet: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
  // Snug enough that the three greetings share one line on a phone.
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  chip: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.sm + 4, borderRadius: radii.pill },
  chipText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  pressed: { opacity: pressedDim },
  add: { marginTop: spacing.md, alignSelf: 'stretch' },
  system: { alignItems: 'center', paddingVertical: spacing.sm },
  systemText: {
    fontSize: typography.sizes.xs,
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});
