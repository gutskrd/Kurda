import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
import { GREETINGS } from './greetings';
import { pressedDim } from '../theme/motion';

/**
 * A calm card in the middle of a group chat with nothing in it: the group's
 * picture large, its name, and a line about where the chat stands. Shared by
 * the welcome below and by the card that says where someone who is out of
 * the group stands (Standing.tsx), so the two read as the same place.
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
 * The card itself, around any picture: a group's, or the face of the one
 * friend a new conversation is with (chat/DmWelcome.tsx). `picture` is
 * handed the size the card has room for.
 */
export function CalmFrame({ name, picture, children }: { name: string; picture: (size: number) => ReactNode; children: ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  // a short phone (an SE) keeps the whole card on screen: a smaller picture, less air
  const compact = useWindowDimensions().height < 700;
  return (
    <View style={[styles.card, compact && styles.compact, { backgroundColor: colors.surface }]}>
      {/* the name under it says whose picture it is */}
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
 * The welcome in an empty group chat.
 *
 * A brand-new chat says it is the start of the group; one the reader cleared
 * for themselves says when, and that new messages will show; one an admin
 * cleared for everyone has its line at the top (ClearedLine) and this under
 * it. Then three greetings in the learner's own Kurdish, one tap to send —
 * not when the reader cannot post (`canGreet`), nor in a chat they only
 * cleared for themselves, where the others may be mid-conversation. The
 * owner or an admin of a group nobody else is in yet is offered
 * to add friends (`onAddFriends`).
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
 * Three ways to say hello, in the learner's own Kurdish, each sent with one
 * tap: the first word in a new chat is already practice. The same under a
 * group's welcome and under a first conversation with one friend
 * (chat/DmWelcome.tsx); `hint` tells a screen reader where the tap sends it.
 */
export function Greetings({ hint, onGreet }: { hint: string; onGreet: (greeting: string) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const script = useCourseDialect();
  return (
    <View style={styles.greet}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('groups.welcome.sayHello')}</Text>
      <View style={styles.chips}>
        {GREETINGS[script].map((greeting) => (
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
 * "Azad cleared the chat · 2h ago", centred at the top of the history, where
 * an admin cleared it for everyone: so nobody wonders where the messages went.
 * "You" for the admin who did it, and "An admin" once that account is gone.
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  chip: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.pill },
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
