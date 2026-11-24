import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AppState, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { formatParentCode } from '@kurda/shared';
import { describeError, isMaintenance } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { SettingsNote, SettingsPage } from '../settings/list';
import { ClayButton } from '../theme/glass';
import { Loading } from '../theme/Loading';
import { Pressable } from '../theme/Pressable';
import { heldDim } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { makeParentCode, nameOf, readParental, type ParentCode, type PersonRef } from './api';
import { keepParentalOverview } from './overview';
import { SuccessMoment } from './parts';

/** How often the page asks whether a teen has used the code while it is open. */
export const CODE_POLL_MS = 5000;

/** How long "Copied" stands in the button's place. */
const COPIED_MS = 1600;

/**
 * A parent adding a teen: a fresh code, large and spaced to be read across a room, that works once within a day, and
 * the ways to pass it on. While the page is open it watches for a teen to use it, then says so and opens their page.
 * Opening the page or making a new code voids the one before.
 */
export function CodePage({ onExit }: { onExit: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [code, setCode] = useState<ParentCode | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState<PersonRef | null>(null);
  // The teens already connected when the page opened, so only a new one counts.
  const known = useRef<Set<string> | null>(null);

  const make = useCallback(async () => {
    setMaking(true);
    setFailed(null);
    const res = await makeParentCode(client);
    setMaking(false);
    if (res.ok) setCode(res.data);
    // Full is said to the parent as their own limit, not as the teen hears it.
    else if (!isMaintenance(res.error)) setFailed(res.error.code === 'PARENTAL_PARENT_FULL' ? t('parental.full') : describeError(res.error, t));
  }, [client, t]);
  useEffect(() => {
    void make();
  }, [make]);

  useFocusEffect(
    useCallback(() => {
      if (joined) return;
      let live = true;
      const look = async (): Promise<void> => {
        if (AppState.currentState === 'background') return;
        const res = await readParental(client);
        if (!live || !res.ok || res.data.role !== 'parent') return;
        const teens = res.data.teens ?? [];
        if (known.current === null) {
          known.current = new Set(teens.map((w) => w.teen.userId));
          return;
        }
        const fresh = teens.find((w) => !known.current!.has(w.teen.userId));
        if (!fresh) return;
        if (user) keepParentalOverview(user.id, res.data);
        haptic('celebrate');
        setJoined(fresh.teen);
      };
      void look();
      const timer = setInterval(() => void look(), CODE_POLL_MS);
      return () => {
        live = false;
        clearInterval(timer);
      };
    }, [client, joined, user]),
  );

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const shown = code ? formatParentCode(code.code) : null;
  const copy = (): void => {
    if (!shown) return;
    haptic('tap');
    void Clipboard.setStringAsync(shown).then(() => setCopied(true));
  };
  const share = (): void => {
    if (shown) void Share.share({ message: t('parental.code.shareText', { code: shown }) }).catch(() => undefined);
  };

  return (
    <SettingsPage
      title={t('parental.addTeen')}
      onExit={onExit}
      overlay={
        joined ? (
          <SuccessMoment
            text={t('parental.code.joined', { name: nameOf(joined) })}
            onDone={() => navigation.replace('SettingsPage', { page: 'parentalTeen', teenId: joined.userId })}
          />
        ) : null
      }
    >
      <View style={styles.page}>
        <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('parental.code.lead')}</Text>
        <View style={[styles.card, { backgroundColor: colors.glassFill, shadowColor: colors.softShadow }]}>
          {shown ? (
            <Text
              selectable
              style={[styles.code, { color: colors.textPrimary }]}
              accessibilityLabel={shown.split('').join(' ')}
              maxFontSizeMultiplier={1.3}
              testID="parent-code"
            >
              {shown}
            </Text>
          ) : failed ? null : (
            <Loading style={styles.codeWait} />
          )}
          {shown ? <Text style={[styles.valid, { color: colors.textSecondary }]}>{t('parental.code.valid')}</Text> : null}
        </View>
        {failed ? <SettingsNote>{failed}</SettingsNote> : null}
        <View style={[styles.buttons, { flexDirection: dir.row }]}>
          <ClayButton
            label={copied ? t('share.copied') : t('parental.code.copy')}
            icon={copied ? 'check' : 'copy'}
            variant="outline"
            disabled={!shown}
            onPress={copy}
            style={styles.button}
          />
          <ClayButton label={t('share.title')} icon="share" variant="outline" disabled={!shown} onPress={share} style={styles.button} />
        </View>
        <Pressable
          onPress={() => void make()}
          disabled={making}
          accessibilityRole="button"
          style={({ pressed }) => [styles.again, pressed && heldDim]}
          testID="parent-code-new"
        >
          {making && code ? <Loading /> : <Text style={[styles.againText, { color: colors.primary }]}>{t('parental.code.new')}</Text>}
        </Pressable>
        {shown ? (
          <View style={[styles.waiting, { flexDirection: dir.row }]} accessibilityLiveRegion="polite">
            <Loading label={t('parental.code.waiting')} />
            <Text style={[styles.lead, { color: colors.textSecondary }]}>{t('parental.code.waiting')}</Text>
          </View>
        ) : null}
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: layout.gutter, paddingTop: spacing.md, gap: spacing.md },
  lead: { fontSize: typography.sizes.text, lineHeight: 22 },
  card: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  code: { fontSize: typography.sizes.title, fontWeight: typography.weights.semibold, letterSpacing: 6, fontVariant: ['tabular-nums'] },
  codeWait: { height: 34 },
  valid: { fontSize: typography.sizes.text },
  buttons: { gap: spacing.sm },
  button: { flex: 1 },
  again: { minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  againText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  waiting: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
