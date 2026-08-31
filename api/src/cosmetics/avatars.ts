import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

/**
 * Default-avatar registry — the ONE source of truth for which built-in avatars
 * exist and which require Premium. Loaded once from the committed manifest
 * (api/content/cosmetics.json). Static/global: no per-request DB work.
 *
 * `default-01` is the universal, always-free fallback: any user with no avatar,
 * an invalid/removed selection, or a premium avatar they can no longer use
 * resolves here so a valid avatar is ALWAYS produced.
 */
export const DEFAULT_AVATAR_KEY = 'default-01';

/** Web-static base (served by the web app at its own origin). */
const STATIC_BASE = '/cosmetics';

export interface AvatarEntry {
  key: string;
  requiresPremium: boolean;
}

function loadRegistry(): Map<string, AvatarEntry> {
  const registry = new Map<string, AvatarEntry>();
  try {
    const p = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'content', 'cosmetics.json');
    const manifest = JSON.parse(readFileSync(p, 'utf8')) as {
      avatars: Array<{ key: string; requiresPremium?: boolean }>;
    };
    for (const a of manifest.avatars) {
      // the universal fallback is always free, whatever the manifest says
      const requiresPremium = a.key === DEFAULT_AVATAR_KEY ? false : a.requiresPremium ?? true;
      registry.set(a.key, { key: a.key, requiresPremium });
    }
  } catch {
    // fall through with an empty registry; the fallback avatar still resolves
  }
  return registry;
}

const REGISTRY = loadRegistry();

export function isValidAvatarKey(key: string): boolean {
  return REGISTRY.has(key);
}

export function avatarRequiresPremium(key: string): boolean {
  return REGISTRY.get(key)?.requiresPremium ?? false;
}

/** Web-static URL for a default-avatar key. Never null. */
export function avatarAssetUrl(key: string): string {
  return `${STATIC_BASE}/avatars/${key}.png`;
}

/** The full registry (for exposing the picker catalog to clients). */
export function avatarRegistry(): AvatarEntry[] {
  return [...REGISTRY.values()];
}

/**
 * The avatar key that should actually render: the user's selection when it is
 * valid AND allowed (free, or premium-gated while premium is active); otherwise
 * the universal default. The result is always a valid, renderable key.
 */
export function effectiveAvatarKey(selectedKey: string | null, premiumActive: boolean): string {
  if (selectedKey && REGISTRY.has(selectedKey)) {
    if (!avatarRequiresPremium(selectedKey) || premiumActive) return selectedKey;
  }
  return DEFAULT_AVATAR_KEY;
}
