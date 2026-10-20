/**
 * The rules an uploaded background or icon has to meet, said before the file
 * is sent, and the server's refusals said in words an admin can act on. The
 * server checks all of it again (api/src/shop/art.ts); checking here first
 * means a wrong picture is caught the moment it is dropped, not after a
 * five-megabyte upload.
 */
import { foldForSearch } from '@kurda/shared';
import { ApiError } from '../api';
import { errorLine } from '../ui';
import type { ArtKind } from './model';

export interface ArtRule {
  /** width ÷ height */
  ratio: number;
  /** the shape in words, for "a background must be …" */
  shape: string;
  minWidth: number;
  minHeight: number;
  /** what the server stores it as, for the hint */
  stored: string;
  /** the most the stored file may weigh */
  weight: string;
  /** an example size, for the hint */
  example: string;
}

/** The same numbers as the server's ART_SPECS. */
export const ART_RULES: Readonly<Record<ArtKind, ArtRule>> = {
  background: { ratio: 16 / 9, shape: '16:9', minWidth: 1280, minHeight: 720, stored: 'WebP', weight: '120 KB', example: '1920×1080' },
  icon: { ratio: 1, shape: 'square', minWidth: 256, minHeight: 256, stored: 'PNG, transparency kept', weight: '80 KB', example: '512×512' },
};

/** How far off its shape a picture may be; the server trims that sliver from the centre. */
export const SHAPE_TOLERANCE = 0.03;

/** The server's upload limit (MEDIA_MAX_UPLOAD_MB). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_TYPES = ['image/png', 'image/webp', 'image/jpeg'] as const;

export const KIND_NAME: Record<ArtKind, { one: string; a: string; plural: string }> = {
  background: { one: 'background', a: 'a background', plural: 'Backgrounds' },
  icon: { one: 'icon', a: 'an icon', plural: 'Icons' },
};

/** "16:9, at least 1280×720 · PNG, WebP or JPEG up to 5 MB" */
export function ruleText(kind: ArtKind): string {
  const r = ART_RULES[kind];
  return `${r.shape === 'square' ? 'Square' : r.shape}, at least ${r.minWidth}×${r.minHeight} (${r.example} is ideal). PNG, WebP or JPEG up to 5 MB.`;
}

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB`;

/** Whether a file can even be tried: its type and size, before it is opened. */
export function checkFile(file: Pick<File, 'type' | 'size' | 'name'>): string | null {
  const type = file.type || (/\.(png|webp|jpe?g)$/i.test(file.name) ? 'image/png' : '');
  if (!(ACCEPTED_TYPES as readonly string[]).includes(type)) {
    return /\.svg$/i.test(file.name) || type === 'image/svg+xml'
      ? 'SVG files can’t be used. Export the picture as a PNG or WebP.'
      : 'That file isn’t a PNG, WebP or JPEG picture.';
  }
  if (file.size > MAX_UPLOAD_BYTES) return `That file is ${mb(file.size)}; the limit is ${mb(MAX_UPLOAD_BYTES)}. Export it smaller and try again.`;
  return null;
}

/** Whether a picture of this size is the kind's shape and big enough — the server's rules, in its order. */
export function checkSize(kind: ArtKind, width: number, height: number): string | null {
  const r = ART_RULES[kind];
  if (Math.abs(width / height / r.ratio - 1) > SHAPE_TOLERANCE) {
    return kind === 'background'
      ? `A background must be 16:9, like ${r.example}. This picture is ${width}×${height}.`
      : `An icon must be square, like ${r.example}. This picture is ${width}×${height}.`;
  }
  if (width < r.minWidth || height < r.minHeight) {
    return `${kind === 'background' ? 'A background' : 'An icon'} must be at least ${r.minWidth}×${r.minHeight}, so it looks sharp. This picture is ${width}×${height}.`;
  }
  return null;
}

function detail(err: ApiError, key: string): number | null {
  const d = err.details as Record<string, unknown> | undefined;
  return typeof d?.[key] === 'number' ? (d[key] as number) : null;
}

/** A refused upload, in plain words. */
export function uploadProblem(kind: ArtKind, err: unknown): string {
  if (!(err instanceof ApiError)) return errorLine(err, 'the upload');
  const width = detail(err, 'width');
  const height = detail(err, 'height');
  switch (err.code) {
    case 'STORAGE_UNAVAILABLE':
      return 'Picture storage isn’t set up on this server, so art can’t be uploaded yet. Whoever runs the server has to configure storage first.';
    case 'INVALID_IMAGE':
      return 'That file isn’t a PNG, WebP or JPEG picture.';
    case 'UPLOAD_TOO_LARGE':
    case 'FST_ERR_CTP_BODY_TOO_LARGE':
      return `That file is over the ${mb(MAX_UPLOAD_BYTES)} limit. Export it smaller and try again.`;
    case 'WRONG_SHAPE':
    case 'IMAGE_TOO_SMALL':
      return (width && height && checkSize(kind, width, height)) || err.message;
    case 'IMAGE_TOO_DETAILED':
      return `This picture has too much fine detail to fit in ${ART_RULES[kind].weight}. Try a simpler picture, or one with fewer fine textures.`;
    case 'MALFORMED_IMAGE':
      return 'That picture couldn’t be read; the file may be damaged. Export it again and retry.';
    case 'IMAGE_REJECTED':
      return 'This picture was removed by moderation before, so it can’t be used.';
    case 'MEDIA_STORAGE_LIMIT_REACHED':
      return 'Storage is full, so uploads are paused. Nothing was saved.';
    case 'MEDIA_OP_LIMIT_REACHED':
      return 'Uploads are paused for the rest of the month. Try again later.';
    case 'MEDIA_UPLOAD_FAILED':
      return 'The picture couldn’t be stored. Try again.';
    default:
      return errorLine(err, 'the upload');
  }
}

/** Where art is drawn from: uploaded art has a whole URL; the art that ships is a path on the site. */
const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined)?.trim() || 'https://hevalo.app').replace(/\/$/, '');

/**
 * Make an item's art URL one the admin can load. The admin is served from its
 * own origin, and the art that ships lives on the website's, so a site path
 * is resolved against the site — as the phone app does (mobile `assetUrl`).
 */
export function artSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//')) return url;
  return `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** A new item's SKU from its name: "Şeva Sor" → "bg-seva-sor". */
export function skuFrom(kind: ArtKind, name: string): string {
  const slug = foldForSearch(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug ? `${kind === 'background' ? 'bg' : 'icon'}-${slug}` : '';
}
