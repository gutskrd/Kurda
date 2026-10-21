import * as Clipboard from 'expo-clipboard';
import type { AccessibilityActionEvent } from 'react-native';
import { haptic } from '../feedback/haptics';
import type { TranslationKey } from '../i18n/translations';
import { showActions, type SheetAction } from '../theme/actionSheet';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/**
 * What can be done with a message in a thread: Copy its words, and Report
 * somebody else's. Nothing sits beside a message for this — it is held, as
 * a message is in every messaging app, and the options rise from the bottom
 * of the screen where the thumb already is.
 *
 * A light tick says the hold landed. With nothing to offer (your own card,
 * a deleted message) the hold does nothing at all.
 */
export function messageActions(t: Translate, { words, onReport }: { words?: string | null; onReport?: () => void }): SheetAction[] {
  const actions: SheetAction[] = [];
  if (words?.trim()) actions.push({ label: t('chat.copy'), onPress: () => void Clipboard.setStringAsync(words) });
  if (onReport) actions.push({ label: t('moderation.report'), onPress: onReport, destructive: true });
  return actions;
}

/** Opens the options for a held message (see `messageActions`). */
export function openMessageOptions(t: Translate, what: { words?: string | null; onReport?: () => void }): void {
  const actions = messageActions(t, what);
  if (actions.length === 0) return;
  haptic('select');
  showActions({ actions, cancel: t('common.cancel') });
}

/**
 * The same options for a screen reader, as the message's own actions — a
 * hold is not a gesture VoiceOver users make — and what each one does.
 */
export function messageA11y(
  t: Translate,
  what: { words?: string | null; onReport?: () => void },
): { accessibilityActions?: { name: string; label: string }[]; onAccessibilityAction?: (e: AccessibilityActionEvent) => void } {
  const actions = messageActions(t, what);
  if (actions.length === 0) return {};
  const byName: Record<string, SheetAction> = {};
  const list = actions.map((a) => {
    const name = a.destructive ? 'report' : 'copy';
    byName[name] = a;
    return { name, label: a.label };
  });
  return { accessibilityActions: list, onAccessibilityAction: (e) => byName[e.nativeEvent.actionName]?.onPress() };
}
