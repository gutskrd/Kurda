import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { useNavigation } from '@react-navigation/native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useDirection } from '../reports/direction';
import { BottomSheet } from '../theme/BottomSheet';
import { display } from '../theme/fonts';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useAuth } from './AuthContext';
import { onGuestRefused } from './guestRefused';
import { pressedDim } from '../theme/motion';

/**
 * Where a guest (AuthContext `isGuest`) meets the things only an account can do, which the server refuses with 403
 * GUEST_ACCOUNT. A screen asks first with `if (!useAccountGate().require('post')) return;`: an account gets true, and a
 * guest gets the offer (a sheet titled for `reason`) and false. `GuestWall` is the same offer as a whole screen for a
 * route a guest should not see, and a refusal nothing asked about first opens the generic offer through `guestRefused`.
 *
 * `AccountGateProvider` is mounted once, under the signed-in screens; outside it (a test) the hook still answers and
 * the sheet does nothing.
 */
export type GateReason = 'post' | 'react' | 'comment' | 'message' | 'friends' | 'groups' | 'shop' | 'league' | 'profile' | 'play' | 'save' | 'generic';

/** What this needs, said for the thing that was tapped. */
const TITLE: Record<GateReason, TranslationKey> = {
  post: 'guest.gate.title.post',
  react: 'guest.gate.title.react',
  comment: 'guest.gate.title.comment',
  message: 'guest.gate.title.message',
  friends: 'guest.gate.title.friends',
  groups: 'guest.gate.title.groups',
  shop: 'guest.gate.title.shop',
  league: 'guest.gate.title.league',
  profile: 'guest.gate.title.profile',
  play: 'guest.gate.title.play',
  save: 'guest.gate.title.save',
  generic: 'guest.gate.title.generic',
};

/**
 * What an account keeps and opens, the same four lines wherever the offer is made: progress across phones, friends,
 * your own name and face, and the league and shop.
 */
const BENEFITS: ReadonlyArray<{ icon: IconName; key: TranslationKey }> = [
  { icon: 'devices', key: 'guest.benefit.progress' },
  { icon: 'people', key: 'guest.benefit.friends' },
  { icon: 'person', key: 'guest.benefit.profile' },
  { icon: 'trophy', key: 'guest.benefit.league' },
];

/**
 * How long after the offer is dismissed a server refusal is ignored: a screen that asked for several things has them
 * refused together, and an offer that returns straight after "Not now" is nagging.
 */
const QUIET_AFTER_DISMISS_MS = 1500;

interface GateValue {
  /** Open the offer for `reason`; one already up stays as it is. */
  open: (reason: GateReason) => void;
}

const GateContext = createContext<GateValue>({ open: () => undefined });

export function AccountGateProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { isGuest } = useAuth();
  // Above the root stack there is no screen's navigation, so this is the container's own.
  const navigation = useNavigation<RootNavigation>();
  const [reason, setReason] = useState<GateReason | null>(null);
  // The state as the next caller sees it, so two refusals in one frame open one sheet and buzz once.
  const showing = useRef<GateReason | null>(null);
  const dismissedAt = useRef(0);

  const open = useCallback((why: GateReason) => {
    if (showing.current !== null) return;
    showing.current = why;
    haptic('select');
    setReason(why);
  }, []);

  const close = useCallback(() => {
    showing.current = null;
    dismissedAt.current = Date.now();
    setReason(null);
  }, []);

  // The net under the gate: a refusal nothing asked about first.
  useEffect(() => {
    if (!isGuest) return;
    return onGuestRefused(() => {
      if (Date.now() - dismissedAt.current < QUIET_AFTER_DISMISS_MS) return;
      open('generic');
    });
  }, [isGuest, open]);

  // The account changed hands (claimed, or signed in to another): nothing to offer any more.
  useEffect(() => {
    if (!isGuest && showing.current !== null) close();
  }, [isGuest, close]);

  const create = useCallback(() => {
    close();
    navigation.navigate('ClaimAccount');
  }, [close, navigation]);
  const signIn = useCallback(() => {
    close();
    navigation.navigate('SignIn');
  }, [close, navigation]);

  const value = useMemo<GateValue>(() => ({ open }), [open]);
  const { t } = useI18n();

  return (
    <GateContext.Provider value={value}>
      {children}
      <BottomSheet visible={reason !== null} onClose={close} testID="account-gate">
        {reason ? <Offer reason={reason} onCreate={create} onSignIn={signIn} onDismiss={close} dismissLabel={t('guest.gate.notNow')} /> : null}
      </BottomSheet>
    </GateContext.Provider>
  );
}

/** Whether the person may do something only an account can, opening the offer when they may not. */
export function useAccountGate(): { isGuest: boolean; require: (reason: GateReason) => boolean } {
  const { isGuest } = useAuth();
  const { open } = useContext(GateContext);
  return useMemo(
    () => ({
      isGuest,
      require: (reason: GateReason) => {
        if (!isGuest) return true;
        open(reason);
        return false;
      },
    }),
    [isGuest, open],
  );
}

/**
 * A route a guest should not see, behind the offer: an account gets the screen; a guest gets the offer as a whole
 * screen, with the screen's way back.
 */
export function GuestWall({ reason = 'generic', onBack, children }: { reason?: GateReason; onBack: () => void; children: ReactNode }): React.JSX.Element {
  const { isGuest } = useAuth();
  if (!isGuest) return <>{children}</>;
  return <GuestWallScreen reason={reason} onBack={onBack} />;
}

function GuestWallScreen({ reason, onBack }: { reason: GateReason; onBack: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  return (
    <GradientBackground>
      <ScreenHeader onBack={onBack} />
      <ScrollView contentContainerStyle={styles.wall} showsVerticalScrollIndicator={false}>
        <Offer
          reason={reason}
          onCreate={() => navigation.navigate('ClaimAccount')}
          onSignIn={() => navigation.navigate('SignIn')}
          onDismiss={onBack}
          dismissLabel={t('guest.gate.notNow')}
        />
      </ScrollView>
    </GradientBackground>
  );
}

/**
 * The offer itself, as the sheet and the wall make it: what this needs, the four things an account keeps, the two ways
 * to one, and a quiet "not now".
 */
function Offer({
  reason,
  onCreate,
  onSignIn,
  onDismiss,
  dismissLabel,
}: {
  reason: GateReason;
  onCreate: () => void;
  onSignIn: () => void;
  onDismiss: () => void;
  dismissLabel: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={styles.offer}>
      <View style={[styles.mark, { backgroundColor: colors.controlTrack }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name="sparkle" size={30} tone="primary" />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
        {t(TITLE[reason])}
      </Text>
      <Text style={[styles.line, { color: colors.textSecondary }]}>{t('guest.gate.body')}</Text>
      <GlassCard style={styles.card}>
        <GuestBenefits />
      </GlassCard>
      <ClayButton label={t('guest.createAccount')} tone="primary" size="large" onPress={onCreate} style={styles.primary} />
      <ClayButton label={t('welcome.haveAccount')} variant="outline" tone="primary" size="large" onPress={onSignIn} />
      <Pressable onPress={onDismiss} accessibilityRole="button" style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}>
        <Text style={[styles.dismissText, dir.free, { color: colors.textSecondary }]}>{dismissLabel}</Text>
      </Pressable>
    </View>
  );
}

/** The four lines an account keeps, each with its glyph; the guest's profile card lists them too. */
export function GuestBenefits(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={styles.benefits}>
      {BENEFITS.map((benefit) => (
        <View key={benefit.key} style={[styles.benefit, { flexDirection: dir.row }]}>
          <View style={[styles.benefitIcon, { backgroundColor: colors.controlTrack }]}>
            <Icon name={benefit.icon} size={18} tone="primary" />
          </View>
          <Text style={[styles.benefitText, dir.text, { color: colors.textPrimary }]}>{t(benefit.key)}</Text>
        </View>
      ))}
    </View>
  );
}

const MARK = 60;
const BENEFIT_ICON = 36;

const styles = StyleSheet.create({
  wall: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: layout.gutter, paddingVertical: spacing.lg },
  offer: { gap: spacing.sm, paddingBottom: spacing.sm },
  mark: { alignSelf: 'center', width: MARK, height: MARK, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  title: { ...display(typography.sizes.text), textAlign: 'center' },
  line: { fontSize: typography.sizes.text, lineHeight: 22, textAlign: 'center', paddingHorizontal: spacing.sm },
  card: { marginTop: spacing.sm },
  benefits: { gap: spacing.sm + 4 },
  benefit: { alignItems: 'center', gap: spacing.md - 4 },
  benefitIcon: { width: BENEFIT_ICON, height: BENEFIT_ICON, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, lineHeight: 20 },
  primary: { marginTop: spacing.sm },
  dismiss: { minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  dismissText: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium },
  pressed: { opacity: pressedDim },
});
