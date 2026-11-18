import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * The mark on a picture its poster made: the Hevalo logo and whose picture it is. Burned in on the server, since a
 * client-applied mark could be left off; a picture posted as not their own goes without it. The composer previews a
 * matching mark, but this is the one in the file.
 */

/** Signature height as a share of the picture's shorter edge. */
const SCALE = 0.055;
/** Never smaller than this, or it is unreadable on a small picture. */
const MIN_HEIGHT = 22;
const MAX_HEIGHT = 56;
/** Distance from the bottom-right corner, as a share of the shorter edge. */
const INSET = 0.028;

const MARK_PATH = fileURLToPath(new URL('../../assets/mark.png', import.meta.url));

let markCache: Buffer | null = null;
async function mark(): Promise<Buffer> {
  markCache ??= await readFile(MARK_PATH);
  return markCache;
}

/** Strip anything that would break out of the SVG we drop the name into. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface SignatureOptions {
  /** the handle, without the @ */
  username: string;
  /** the picture this will sit on */
  width: number;
  height: number;
}

/** A transparent PNG of the signature sized for this picture, on a soft dark plate with a light stroke so it reads on any background. */
export async function renderSignature(opts: SignatureOptions): Promise<Buffer> {
  const shortEdge = Math.min(opts.width, opts.height);
  const h = Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, shortEdge * SCALE)));
  const pad = Math.round(h * 0.34);
  const glyph = Math.round(h * 0.62);
  const font = Math.round(h * 0.46);
  const handle = `@${escapeXml(opts.username)}`;

  // 0.62em per character deliberately overestimates a proportional face: a plate slightly too wide looks intended,
  // one too narrow clips the name.
  const textWidth = Math.ceil(handle.length * font * 0.62);
  const w = pad + glyph + Math.round(pad * 0.5) + textWidth + pad;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect x="0" y="0" width="${w}" height="${h}" rx="${Math.round(h / 2)}" fill="rgba(8,10,14,0.46)"/>
  <text x="${pad + glyph + Math.round(pad * 0.5)}" y="${Math.round(h * 0.68)}"
        font-family="DejaVu Sans, Noto Sans, Liberation Sans, sans-serif"
        font-size="${font}" fill="rgba(255,255,255,0.94)">${handle}</text>
</svg>`;

  return sharp(Buffer.from(svg))
    .composite([
      {
        input: await sharp(await mark()).resize(glyph, glyph, { fit: 'inside' }).toBuffer(),
        left: pad,
        top: Math.round((h - glyph) / 2),
      },
    ])
    .png()
    .toBuffer();
}

/** Where the signature sits on a picture of this size. */
export function signaturePlacement(
  picture: { width: number; height: number },
  sig: { width: number; height: number },
): { left: number; top: number } {
  const inset = Math.round(Math.min(picture.width, picture.height) * INSET);
  return {
    left: Math.max(0, picture.width - sig.width - inset),
    top: Math.max(0, picture.height - sig.height - inset),
  };
}

/** Puts the signature on a picture. Fails open, since losing an upload to a missing font is worse than a missing mark; the caller logs it. */
export async function signPicture(
  webp: Buffer,
  username: string,
): Promise<{ ok: true; signed: Buffer } | { ok: false; reason: string }> {
  try {
    const meta = await sharp(webp).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 80 || height < 60) return { ok: false, reason: 'picture too small to sign' };

    const sig = await renderSignature({ username, width, height });
    const sigMeta = await sharp(sig).metadata();
    if (!sigMeta.width || !sigMeta.height) return { ok: false, reason: 'signature had no size' };
    // a signature wider than the picture would be cropped into nonsense
    if (sigMeta.width > width * 0.9) return { ok: false, reason: 'signature wider than the picture' };

    const signed = await sharp(webp)
      .composite([{ input: sig, ...signaturePlacement({ width, height }, { width: sigMeta.width, height: sigMeta.height }) }])
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    return { ok: true, signed };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}
