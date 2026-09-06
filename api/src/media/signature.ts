import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * The mark every Dîmen carries: the MyKurda logo and whose picture it is.
 *
 * Burned in here rather than drawn by the browser, because a signature the
 * client applies is a signature the client can leave off — and the point of it
 * is that it is on every picture. The composer draws a matching one in its
 * preview so nothing about the result is a surprise, but this is the one that
 * ends up in the file.
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

/**
 * A transparent PNG of the signature, sized for this picture.
 *
 * Text sits on a soft dark plate with a light stroke so it stays readable on a
 * bright sky and on a black background alike — a plain white handle disappears
 * into half the photos people post.
 */
export async function renderSignature(opts: SignatureOptions): Promise<Buffer> {
  const shortEdge = Math.min(opts.width, opts.height);
  const h = Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, shortEdge * SCALE)));
  const pad = Math.round(h * 0.34);
  const glyph = Math.round(h * 0.62);
  const font = Math.round(h * 0.46);
  const handle = `@${escapeXml(opts.username)}`;

  // 0.62em per character is a deliberate over-estimate for a proportional face:
  // a plate slightly too wide looks intentional, one too narrow clips the name
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

/**
 * Put the signature on a picture.
 *
 * Fails open: a picture that could not be signed is still a picture, and losing
 * an upload because a font is missing on the host would be a worse outcome than
 * a missing mark. The caller logs it.
 */
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
