import type { AvatarConfig, AvatarSlot } from '@kurda/shared';

/** Kurdish-first slot labels for the editor tabs. */
export const SLOT_LABELS: Record<AvatarSlot, { ku: string; en: string }> = {
  skinTone: { ku: 'Çerm', en: 'Skin' },
  hairStyle: { ku: 'Por', en: 'Hair' },
  hairColor: { ku: 'Rengê por', en: 'Hair color' },
  outfit: { ku: 'Cil', en: 'Outfit' },
  headwear: { ku: 'Serpoş', en: 'Headwear' },
  background: { ku: 'Paşxane', en: 'Background' },
};

export const SLOT_ORDER: AvatarSlot[] = [
  'skinTone',
  'hairStyle',
  'hairColor',
  'outfit',
  'headwear',
  'background',
];

export interface EditorState {
  /** What the preview shows (unsaved). */
  config: AvatarConfig;
  /** Last server-confirmed config (cancel target). */
  saved: AvatarConfig;
}

export function initEditor(saved: AvatarConfig): EditorState {
  return { config: { ...saved }, saved: { ...saved } };
}

/** Selecting a locked item is a no-op — the UI deep-links to the shop instead. */
export function select(
  state: EditorState,
  slot: AvatarSlot,
  itemId: string,
  owned: boolean,
): EditorState {
  if (!owned) return state;
  if (state.config[slot] === itemId) return state;
  return { ...state, config: { ...state.config, [slot]: itemId } };
}

export function cancel(state: EditorState): EditorState {
  return { ...state, config: { ...state.saved } };
}

export function markSaved(state: EditorState): EditorState {
  return { ...state, saved: { ...state.config } };
}

export function isDirty(state: EditorState): boolean {
  return SLOT_ORDER.some((slot) => state.config[slot] !== state.saved[slot]);
}
