import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { isEmptyDraft, parsePostDraft, postDraftStorageKey, type PostDraft } from '@kurda/shared';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * The composer's draft, kept on this phone: one per person (`postDraftStorageKey`), saved a moment after each change
 * and cleared when the post goes up or the draft is deleted.
 */
export async function loadDraft(userId: string, store: DeviceStore = deviceStore): Promise<PostDraft | null> {
  const draft = parsePostDraft(await store.get(postDraftStorageKey(userId)));
  return draft && !isEmptyDraft(draft) ? draft : null;
}

export async function saveDraft(userId: string, draft: PostDraft, store: DeviceStore = deviceStore): Promise<void> {
  if (isEmptyDraft(draft)) await store.remove(postDraftStorageKey(userId));
  else await store.set(postDraftStorageKey(userId), JSON.stringify(draft));
}

export async function clearDraft(userId: string, store: DeviceStore = deviceStore): Promise<void> {
  await store.remove(postDraftStorageKey(userId));
}

/*
 * A picked picture lives in the picker's cache, which the system may empty at any time, so each is copied into the
 * app's documents first (and removed once no draft uses it). The web build has no such folder; the picture lasts as
 * long as the tab.
 */
const FOLDER = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}composer/` : null;

/** Copy a picked picture somewhere it stays; the original address if that cannot be done. */
export async function keepPicture(uri: string): Promise<string> {
  if (Platform.OS === 'web' || !FOLDER) return uri;
  try {
    await FileSystem.makeDirectoryAsync(FOLDER, { intermediates: true });
    const ext = /\.(jpe?g|png|webp|heic|heif|gif)$/i.exec(uri)?.[1] ?? 'jpg';
    const to = `${FOLDER}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to });
    return to;
  } catch {
    return uri;
  }
}

/** Forget a kept copy (a picture removed, or a draft posted or deleted). Only ever our own folder. */
export async function dropPicture(uri: string | null): Promise<void> {
  if (!uri || !FOLDER || !uri.startsWith(FOLDER)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Already gone.
  }
}

/** Whether a kept picture is still there, so a draft does not bring back a blank tile. */
export async function pictureExists(uri: string | null): Promise<boolean> {
  if (!uri) return false;
  if (Platform.OS === 'web') return !uri.startsWith('blob:');
  if (!uri.startsWith('file:')) return true;
  try {
    return (await FileSystem.getInfoAsync(uri)).exists;
  } catch {
    return false;
  }
}
