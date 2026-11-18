import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useDirection } from '../reports/direction';
import { hostActions, type ActionRequest, type SheetAction } from './actionSheet';
import { BottomSheet } from './BottomSheet';
import { heldRow } from './MotionParts';
import { Pressable } from './Pressable';
import { useTheme } from './ThemeProvider';
import { radii, spacing, typography } from './tokens';

/**
 * The app's own action sheet, opened by a "⋯" or long press on Android and the web (theme/actionSheet.ts says why
 * iOS uses the system's). Mounted once at the root and shown by `showActions`. Every action is listed, destructive
 * ones last in red; the ✕, the scrim or the back button dismiss it with nothing done. A chosen action runs once the
 * sheet has gone, so what it opens is not drawn under the leaving sheet.
 */
export function ActionSheetHost(): React.JSX.Element | null {
  const { colors } = useTheme();
  const dir = useDirection();
  const [request, setRequest] = useState<ActionRequest | null>(null);
  const [open, setOpen] = useState(false);
  const chosen = useRef<SheetAction | null>(null);

  useEffect(
    () =>
      hostActions((next) => {
        chosen.current = null;
        setRequest(next);
        setOpen(true);
      }),
    [],
  );

  useEffect(() => {
    if (open || !chosen.current) return;
    const action = chosen.current;
    chosen.current = null;
    const timer = setTimeout(() => action.onPress(), AFTER_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  if (!request) return null;
  return (
    <BottomSheet visible={open} onClose={() => setOpen(false)} title={request.title} testID="action-sheet">
      <View style={[styles.list, { backgroundColor: colors.surface }]}>
        {request.actions.map((action, i) => (
          <Pressable
            key={`${i}:${action.label}`}
            onPress={() => {
              chosen.current = action;
              setOpen(false);
            }}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={({ pressed }) => [styles.row, pressed && heldRow(colors.controlTrack)]}
          >
            <Text style={[styles.label, dir.text, { color: action.destructive ? colors.danger : colors.textPrimary }]}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

/** The delay before a chosen action runs: the sheet's fade, so a sheet the action opens is not laid over it. */
const AFTER_CLOSE_MS = 220;

const styles = StyleSheet.create({
  list: { borderRadius: radii.lg, paddingVertical: spacing.xs, overflow: 'hidden' },
  // A list row's height and text size.
  row: { minHeight: Math.max(MIN_TOUCH_TARGET, 52), justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  label: { fontSize: typography.ios.row, fontWeight: typography.weights.regular },
});
