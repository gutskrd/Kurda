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
 * The app's own action sheet: what a "⋯" or a long press opens on Android
 * and the web (on an iPhone the system's sheet does it; theme/actionSheet.ts
 * says why). Mounted once at the root, over every screen, and shown when
 * `showActions` is called.
 *
 * Every action is listed, however many there are, with the ones that cannot
 * be taken back last and in red; it is put away by its ✕, a tap on the
 * scrim, or the back button, and then nothing is done. An action chosen runs
 * once the sheet has gone, so what it opens (a report, a confirmation) is
 * not drawn under the sheet on its way out.
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

/** How long after the sheet is told to go an action runs: its fade, so a sheet the action opens is not laid over it. */
const AFTER_CLOSE_MS = 220;

const styles = StyleSheet.create({
  list: { borderRadius: radii.lg, paddingVertical: spacing.xs, overflow: 'hidden' },
  // a row the height of a list row, its words the size of a list row's
  row: { minHeight: Math.max(MIN_TOUCH_TARGET, 52), justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  label: { fontSize: typography.ios.row, fontWeight: typography.weights.regular },
});
