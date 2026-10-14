import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { isEmptyDraft, parsePostDraft, postDraftStorageKey, type PostDraft } from '@kurda/shared';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * The composer's draft, kept on this phone.
 *
 * One per person (`postDraftStorageKey`), saved a moment after each change and
 * cleared when the post goes up or the draft is deleted. Drafts used to be
 * saved on the server with a "Save draft" button, and nothing ever let you
 * open one again; on the phone they cost nothing, and they are back the next
 * time the composer opens.
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
 * A picked picture lives in the picker's cache, which the system may empty at
 * any time. A draft has to outlast that, so each picture is copied into the
 * app's own documents first (and the copy removed when it is no longer on a
 * draft). In the web build there is no such folder, and the picture lives as
 * long as the tab does.
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
    // already gone
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
