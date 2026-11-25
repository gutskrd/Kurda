import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { LETTER_BIRD_ORDER, LETTER_BIRD_PRICE, isLetterBird, type LettersHome } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { describeError, isMaintenance } from '../api/errors';
import type { ApiError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { ZerValue, useZerValue } from './value';
import { BIRD_NAMES } from '../letters/BirdPicker';
import { BirdBadge } from '../letters/LetterParts';
import { useDirection } from '../reports/direction';
import { Sheet } from '../stories/ui';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Pop, PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { ART, YoursRow, YoursRowSkeleton } from './YoursRow';
import { LETTERS_HOME_PATH } from '../letters/homePath';

/**
 * Your pen pal bird in the Shop, as on the website (web/src/shop/YourBird.tsx): a row saying which bird is yours,
 * opening the same choice as the letters screen (letters/BirdPicker): the eight birds as radio buttons, what a new one
 * costs against your Zêr, and how many are missing when short. A new bird is confirmed as a purchase is; the first is
 * free and simply taken. Hidden for anyone letters are not for (a guest, no birth month, a writing limit), and on a
 * server without letters.
 */

/** What `GET /letters` holds, and the way to read it again or put a newer answer in its place. */
export interface LettersHomeState {
  data: LettersHome | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => Promise<void>;
  set: (next: LettersHome) => void;
}

/** Whether an answer is the letters page at all, rather than something an older server sent. */
function isLettersHome(value: unknown): value is LettersHome {
  const home = value as Partial<LettersHome> | null;
  return typeof home === 'object' && home !== null && isLetterBird(home.bird) && typeof home.birdChosen === 'boolean' && typeof home.zer === 'number';
}

/**
 * The letters page as the Shop needs it, read with the Shop's catalogue (on focus and on pull), not on its own. A guest
 * is never asked about; a 404 or 403 means nothing to show and nothing wrong. A later failed read keeps what the first
 * one showed.
 */
export function useLettersHome(): LettersHomeState {
  const { client, isGuest } = useAuth();
  const [state, setState] = useState<{ data: LettersHome | null; loading: boolean; error: ApiError | null }>({ data: null, loading: !isGuest, error: null });
  const reload = useCallback(async () => {
    if (isGuest) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const res = await client.get<LettersHome>(LETTERS_HOME_PATH);
    if (res.ok) setState({ data: isLettersHome(res.data) ? res.data : null, loading: false, error: null });
    else if (res.error.status === 404 || res.error.status === 403) setState({ data: null, loading: false, error: null });
    else setState((s) => ({ data: s.data, loading: false, error: s.data ? null : res.error }));
  }, [client, isGuest]);
  const set = useCallback((data: LettersHome) => setState({ data, loading: false, error: null }), []);
  return { ...state, reload, set };
}

export function YourBird({ home, zer, onZer }: { home: LettersHomeState; zer: number | null; onZer: (zer: number) => void }): React.JSX.Element | null {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const data = home.data;

  if (!data) {
    if (home.loading) return <YoursRowSkeleton />;
    // The read failed: the row stays, quietly offering to read it again.
    if (home.error) return <YoursRow art={<BirdBadge bird={0} size={ART} />} label={t('shop.bird.title')} value={t('common.retry')} onPress={() => void home.reload()} testID="shop-your-bird" />;
    return null;
  }
  // Somebody who cannot write letters yet is told why on the letters screen, where it can be put right.
  if (data.refusal !== null) return null;

  return (
    <>
      <YoursRow
        art={<BirdBadge bird={data.bird} size={ART} />}
        label={t('shop.bird.title')}
        value={data.birdChosen ? t(BIRD_NAMES[data.bird]!) : t('letters.bird.chooseTitle')}
        onPress={() => setOpen(true)}
        testID="shop-your-bird"
      />
      {open ? <BirdSheet home={home} data={data} zer={zer ?? data.zer} onZer={onZer} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** The eight birds, the one picked, and what getting it takes. */
function BirdSheet({
  home,
  data,
  zer,
  onZer,
  onClose,
}: {
  home: LettersHomeState;
  data: LettersHome;
  zer: number;
  onZer: (zer: number) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [picked, setPicked] = useState(data.bird);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // Made yours from this sheet: the bird takes a bow and the sheet says so, with one button to close it.
  const [done, setDone] = useState(false);
  const number = (n: number): string => formatNumber(n, locale);
  const value = useZerValue();
  const first = !data.birdChosen;
  const same = !first && picked === data.bird;
  const missing = first ? 0 : Math.max(0, LETTER_BIRD_PRICE - zer);
  const title = first ? t('letters.bird.chooseTitle') : t('letters.bird.changeTitle');
  const name = (bird: number): string => t(BIRD_NAMES[bird]!);

  const choose = async (): Promise<void> => {
    setBusy(true);
    setFailed(null);
    const res = await client.post<LettersHome>('/letters/bird', { bird: picked });
    if (res.ok) {
      setBusy(false);
      haptic('tap');
      home.set(res.data);
      onZer(res.data.zer);
      setDone(true);
      return;
    }
    // Spent elsewhere meanwhile: the Zêr there are now say how many are missing. The same bird again is no change, with
    // nothing to pay or say.
    if (res.error.code === 'INSUFFICIENT_FUNDS' || res.error.code === 'LETTER_BIRD_SAME') {
      const again = await client.get<LettersHome>(LETTERS_HOME_PATH);
      setBusy(false);
      if (again.ok && isLettersHome(again.data)) {
        home.set(again.data);
        onZer(again.data.zer);
      }
      if (res.error.code === 'INSUFFICIENT_FUNDS') haptic('error');
      return;
    }
    setBusy(false);
    // Hevalo being offline is shown by the screen over the app instead.
    if (isMaintenance(res.error)) return;
    haptic('error');
    setFailed(describeError(res.error, t));
  };

  /** The first bird is free and simply taken; another is asked about first, as anything bought in the Shop is. */
  const get = (): void => {
    if (first) {
      void choose();
      return;
    }
    Alert.alert(
      t('shop.confirmPurchase'),
      `${t('shop.spendOn', { price: number(LETTER_BIRD_PRICE), currency: 'Zêr', name: name(picked) })} ${value(LETTER_BIRD_PRICE)}\n${t('shop.balance', { zer: number(zer) })}\n\n${t('shop.finalNote')}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('shop.buy'), onPress: () => void choose() },
      ],
    );
  };

  const footer = done ? (
    <ClayButton label={t('common.done')} tone="primary" size="large" onPress={onClose} testID="shop-bird-done" />
  ) : (
    <>
      <ClayButton
        label={first ? t('letters.bird.choose') : t('letters.bird.buy', { price: number(LETTER_BIRD_PRICE) })}
        tone="primary"
        size="large"
        busy={busy}
        disabled={same || missing > 0}
        onPress={get}
        testID="shop-bird-get"
      />
      {!first ? <ClayButton label={t('letters.bird.keep')} variant="outline" disabled={busy} onPress={onClose} testID="shop-bird-keep" /> : null}
    </>
  );

  return (
    <Sheet title={title} onClose={onClose} footer={footer}>
      <Text style={[styles.lead, { color: colors.textSecondary }]}>
        {first ? t('letters.bird.chooseLead', { price: number(LETTER_BIRD_PRICE) }) : t('letters.bird.changeLead', { price: number(LETTER_BIRD_PRICE), zer: number(zer) })}
      </Text>
      <ZerValue zer={LETTER_BIRD_PRICE} style={styles.lead} />
      <View style={[styles.birds, { flexDirection: dir.row }]} accessibilityRole="radiogroup" accessibilityLabel={title}>
        {LETTER_BIRD_ORDER.map((bird) => {
          const mine = !first && bird === data.bird;
          const on = bird === picked;
          return (
            <PressableScale
              key={bird}
              onPress={() => {
                haptic('select');
                setPicked(bird);
                setFailed(null);
                setDone(false);
              }}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: busy }}
              aria-checked={on}
              accessibilityLabel={mine ? t('letters.bird.yours', { name: name(bird) }) : name(bird)}
              testID={`shop-bird-${bird}`}
              style={[styles.bird, { borderColor: on ? colors.primary : 'transparent' }]}
            >
              <Pop when={done && on}>
                <BirdBadge bird={bird} size={BIRD} />
              </Pop>
              {mine ? (
                <View style={[styles.mine, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
                  <Icon name="check" size={10} tone="onPrimary" />
                </View>
              ) : null}
            </PressableScale>
          );
        })}
      </View>
      {/* The bird picked, by its colour; the one that is yours says so, and again once a new one is. */}
      <View style={[styles.picked, { flexDirection: dir.row }]} accessibilityLiveRegion="polite">
        {same ? <Icon name="check" size={18} color={colors.primary} /> : null}
        <Text style={[styles.pickedText, { color: colors.textPrimary }]}>{same ? t('letters.bird.yours', { name: name(picked) }) : name(picked)}</Text>
      </View>
      {!same && missing > 0 ? <Text style={[styles.short, { color: colors.textPrimary }]}>{t('letters.bird.short', { count: number(missing) })}</Text> : null}
      {failed ? (
        <Text style={[styles.lead, { color: colors.danger }]} accessibilityRole="alert">
          {failed}
        </Text>
      ) : null}
    </Sheet>
  );
}

/** A bird's portrait in the sheet: four to a row, each more than a fingertip wide. */
const BIRD = 56;

const styles = StyleSheet.create({
  lead: { fontSize: typography.sizes.text, lineHeight: 22, textAlign: 'center' },
  // Two even rows of four.
  birds: { flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md, alignSelf: 'center', maxWidth: 4 * (BIRD + 10) + 3 * spacing.md + 2 },
  // Each bird a round button; the one picked ringed in the violet every chosen option wears.
  bird: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', padding: 3, borderWidth: 2, borderRadius: radii.pill },
  // The bird that is yours, ticked, whichever is picked.
  mine: { position: 'absolute', right: 0, bottom: 0, width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderRadius: radii.pill },
  picked: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: MIN_TOUCH_TARGET },
  pickedText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, textAlign: 'center' },
  short: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
});
