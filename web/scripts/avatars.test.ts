import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR_KEYS, avatarAssetUrl } from '../src/lib/cosmetics';

/**
 * The picker's offline list, the API's manifest and the pictures on disk are
 * three copies of one list. They drifted once (40 keys, 16 pictures); this keeps
 * them equal. Paths are tried from both roots vitest may run from.
 */
function repoPath(p: string): string {
  const candidates = [resolve(process.cwd(), '..', p), resolve(process.cwd(), p)];
  const found = candidates.find((f) => existsSync(f));
  if (!found) throw new Error(`cannot find ${p}; looked in ${candidates.join(', ')}`);
  return found;
}

describe('default avatars', () => {
  const manifest = JSON.parse(readFileSync(repoPath('api/content/cosmetics.json'), 'utf8')) as {
    avatars: Array<{ key: string }>;
  };
  const files = readdirSync(repoPath('web/public/cosmetics/avatars')).filter((f) => f.startsWith('default-'));

  it('offers exactly the avatars the API accepts', () => {
    expect([...DEFAULT_AVATAR_KEYS]).toEqual(manifest.avatars.map((a) => a.key));
  });

  it('has a picture for every avatar and no picture without one', () => {
    expect(files.sort()).toEqual(DEFAULT_AVATAR_KEYS.map((k) => avatarAssetUrl(k).split('/').pop()).sort());
  });
});
