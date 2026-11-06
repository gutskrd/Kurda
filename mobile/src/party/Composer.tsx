import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { dialectDirection, type GameDialect } from '@kurda/shared';
import type { ApiError, ApiResult } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/**
 * The box a clue or a guess is typed into on the phone, in a party game: in
 * the game's Kurdish (right to left for Soranî), with the slip the box can see
 * said before it is sent and the server's refusal said after, both read out.
 * Sent with the keyboard's Send or the button; cleared once the move is taken.
 */
export function PartyComposer({
  label,
  placeholder,
  sendLabel,
  dialect,
  maxLength,
  slip,
  onSend,
  errorOf,
}: {
  label: string;
  placeholder: string;
  sendLabel: string;
  dialect: GameDialect;
  maxLength: number;
  slip: (text: string) => string | null;
  onSend: (text: string) => Promise<ApiResult<unknown>>;
  errorOf: (error: ApiError) => string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rtl = dialectDirection(dialect).dir === 'rtl';
  const hint = text.trim() ? slip(text) : null;

  const send = async (): Promise<void> => {
    if (!text.trim() || hint || busy) return;
    setBusy(true);
    setError(null);
    const res = await onSend(text);
    setBusy(false);
    if (res.ok) setText('');
    else setError(errorOf(res.error));
  };

  const note = error ?? hint;
  return (
    <View style={styles.compose}>
      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          setError(null);
        }}
        onSubmitEditing={() => void send()}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={maxLength}
        returnKeyType="send"
        style={[
          styles.input,
          { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' },
          { color: colors.textPrimary, borderColor: hint ? colors.danger : colors.clayBorder },
        ]}
      />
      <ClayButton label={busy ? '…' : sendLabel} tone="primary" busy={busy} disabled={!text.trim() || hint !== null} onPress={() => void send()} />
      {note ? (
        <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.danger }]}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * How much of the present wait is left, as a flat bar that empties (drawn
 * from the server's clock), read out as the seconds left. Under five seconds
 * on the viewer's own turn it turns to the warning colour.
 */
export function PartyTimer({ share, low, label, color }: { share: number; low: boolean; label: string; color?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={label} style={[styles.track, { backgroundColor: colors.controlTrack }]}>
      <View style={[styles.fill, { width: `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`, backgroundColor: low ? colors.danger : (color ?? colors.primary) }]} />
    </View>
  );
}

/** The share of a wait left, and its seconds, from the server's clock. */
export function waitLeft(startedAt: string | null | undefined, endsAt: string | null | undefined, now: number): { share: number; seconds: number } {
  if (!startedAt || !endsAt) return { share: 0, seconds: 0 };
  const total = Math.max(1, Date.parse(endsAt) - Date.parse(startedAt));
  const left = Math.max(0, Date.parse(endsAt) - now);
  return { share: Math.min(1, left / total), seconds: Math.ceil(left / 1000) };
}

const styles = StyleSheet.create({
  compose: { gap: spacing.sm },
  input: { minHeight: 48, fontSize: 19, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 12 },
  hint: { fontSize: typography.sizes.sm },
  track: { height: 8, borderRadius: radii.pill, overflow: 'hidden', minWidth: MIN_TOUCH_TARGET },
  fill: { height: 8, borderRadius: radii.pill },
});
