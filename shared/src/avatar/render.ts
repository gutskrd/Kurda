/**
 * Deterministic layered SVG renderer for Kurdish avatars (KUR-075).
 * Layers bottom-to-top: background → hair(back) → body/outfit → head →
 * hair(front) → headwear → face. Unknown item ids fall back per-layer to
 * the default so a stale config still renders — never a blank avatar.
 */
import { DEFAULT_AVATAR, catalogItem, type AvatarConfig, type AvatarSlot } from './catalog.js';

const SKIN: Record<string, string> = {
  'skin-genimi': '#E8B98A',
  'skin-ronahi': '#F5D5B8',
  'skin-zerin': '#D9A066',
  'skin-qehweyi': '#A96E43',
  'skin-esmer': '#7C4A26',
};

const HAIR: Record<string, string> = {
  'harc-res': '#23201D',
  'harc-qehweyi': '#5B3A21',
  'harc-hene': '#8E3B2F',
  'harc-gewr': '#9C9C9C',
};

function resolve(slot: AvatarSlot, id: string): string {
  const item = catalogItem(id);
  return item && item.slot === slot ? id : DEFAULT_AVATAR[slot];
}

function background(id: string, animate = false): string {
  switch (id) {
    case 'bg-ciya':
      return (
        `<rect width="200" height="200" fill="#DCE8F2"/>` +
        `<polygon points="0,200 70,90 140,200" fill="#8FA3B8"/>` +
        `<polygon points="70,90 92,125 48,125" fill="#FFFFFF"/>` +
        `<polygon points="90,200 150,110 200,200" fill="#6E8299"/>` +
        `<polygon points="150,110 168,138 132,138" fill="#FFFFFF"/>`
      );
    case 'bg-roj': {
      // Roja Kurdistanê: the sun disc with its 21 rays
      let rays = '';
      for (let i = 0; i < 21; i++) {
        const angle = (360 / 21) * i;
        rays += `<polygon points="100,22 96,44 104,44" fill="#FFC81F" transform="rotate(${angle.toFixed(2)} 100 100)"/>`;
      }
      return `<rect width="200" height="200" fill="#FFF3D6"/><circle cx="100" cy="100" r="58" fill="#FFC81F"/>${rays}`;
    }
    case 'bg-newroz': {
      // PoC animatable item (KUR-080): flame flicker as additive SMIL —
      // stripping the <animate*> nodes leaves the full static art
      const flicker = animate
        ? `<animateTransform attributeName="transform" type="scale" values="1 1;1.04 0.97;1 1" dur="1.6s" repeatCount="indefinite" additive="sum"/>`
        : '';
      const glow = animate
        ? `<animate attributeName="opacity" values="1;0.75;1" dur="2.2s" repeatCount="indefinite"/>`
        : '';
      return (
        `<rect width="200" height="200" fill="#1B2440"/>` +
        `<circle cx="160" cy="36" r="10" fill="#F5E9C9"/>` +
        `<g transform-origin="100 196">${flicker}` +
        `<polygon points="100,196 62,196 82,150 74,150 100,108 126,150 118,150 138,196" fill="#E2532B"/>` +
        `<polygon points="100,192 78,192 92,158 88,158 100,132 112,158 108,158 122,192" fill="#F5A623"/>` +
        `<polygon points="100,188 90,188 96,168 100,148 104,168 110,188" fill="#FFE08A">${glow}</polygon>` +
        `</g>`
      );
    }
    case 'bg-dest':
      return (
        `<rect width="200" height="200" fill="#CDE6F5"/>` +
        `<ellipse cx="100" cy="210" rx="140" ry="80" fill="#7DBB6C"/>`
      );
    default:
      return `<rect width="200" height="200" fill="#F4F6F5"/>`;
  }
}

function hairBack(style: string, color: string): string {
  switch (style) {
    case 'hair-direj':
      return `<path d="M58 78 Q56 150 72 158 L128 158 Q144 150 142 78 Z" fill="${color}"/>`;
    case 'hair-guli':
      return (
        `<rect x="60" y="90" width="12" height="58" rx="6" fill="${color}"/>` +
        `<rect x="128" y="90" width="12" height="58" rx="6" fill="${color}"/>` +
        `<rect x="59" y="118" width="14" height="5" rx="2" fill="#B23A48"/>` +
        `<rect x="127" y="118" width="14" height="5" rx="2" fill="#B23A48"/>`
      );
    default:
      return '';
  }
}

function outfit(id: string): string {
  switch (id) {
    case 'outfit-kiras-fistan': {
      // layered dress with sequins and a shoulder scarf
      let sequins = '';
      for (let i = 0; i < 7; i++) {
        sequins += `<circle cx="${64 + i * 12}" cy="${172 + (i % 2) * 8}" r="2" fill="#F2C94C"/>`;
      }
      return (
        `<path d="M60 200 L64 138 Q100 118 136 138 L140 200 Z" fill="#7A3E9D"/>` +
        `<path d="M64 150 Q100 136 136 150 L136 158 Q100 144 64 158 Z" fill="#9B59B6"/>` +
        `<path d="M64 138 Q82 128 100 130 L96 150 Q76 150 64 146 Z" fill="#C0392B"/>` +
        sequins
      );
    }
    case 'outfit-pesmerge':
      return (
        `<path d="M60 200 L64 138 Q100 120 136 138 L140 200 Z" fill="#7D7A54"/>` +
        `<rect x="64" y="168" width="72" height="12" fill="#4A4A33"/>` +
        `<path d="M100 132 L108 200 L92 200 Z" fill="#6B6847"/>` +
        `<rect x="70" y="146" width="14" height="10" rx="2" fill="#8C895F"/>` +
        `<rect x="116" y="146" width="14" height="10" rx="2" fill="#8C895F"/>`
      );
    case 'outfit-newroz':
      return (
        `<path d="M60 200 L64 138 Q100 120 136 138 L140 200 Z" fill="#D32011"/>` +
        `<path d="M62 168 L138 168 L139 182 L61 182 Z" fill="#FFD700"/>` +
        `<path d="M61 182 L139 182 L140 200 L60 200 Z" fill="#1E9E4A"/>`
      );
    case 'outfit-modern':
      return (
        `<path d="M60 200 L64 138 Q100 120 136 138 L140 200 Z" fill="#3E6B8F"/>` +
        `<path d="M88 128 Q100 138 112 128 L112 140 Q100 148 88 140 Z" fill="#335A79"/>`
      );
    default:
      // şal û şapik: earth-tone jacket with crossed lapels + red şûtik sash
      return (
        `<path d="M60 200 L64 138 Q100 120 136 138 L140 200 Z" fill="#6B705C"/>` +
        `<path d="M100 130 L82 152 L92 200 L100 200 Z" fill="#585D4B"/>` +
        `<path d="M100 130 L118 152 L108 200 L100 200 Z" fill="#585D4B"/>` +
        `<rect x="62" y="176" width="76" height="16" fill="#B23A48"/>` +
        `<path d="M96 176 L104 176 L108 192 L92 192 Z" fill="#8E2C38"/>`
      );
  }
}

function hairFront(style: string, color: string): string {
  switch (style) {
    case 'hair-kurt':
      return `<path d="M62 76 Q100 42 138 76 L138 66 Q100 34 62 66 Z" fill="${color}"/><path d="M62 76 Q100 48 138 76 Q100 58 62 76 Z" fill="${color}"/>`;
    case 'hair-direj':
    case 'hair-guli':
      return `<path d="M60 80 Q100 40 140 80 L140 70 Q100 32 60 70 Z" fill="${color}"/><path d="M60 80 Q100 50 140 80 Q100 62 60 80 Z" fill="${color}"/>`;
    case 'hair-xelek': {
      let curls = '';
      for (let i = 0; i < 6; i++) {
        curls += `<circle cx="${67 + i * 13.4}" cy="${i === 0 || i === 5 ? 72 : 60 - (i % 2) * 6}" r="11" fill="${color}"/>`;
      }
      return curls;
    }
    default:
      return '';
  }
}

function headwear(id: string): string {
  switch (id) {
    case 'head-jamadani': {
      // red-white checkered wrap
      let checks = '';
      for (let i = 0; i < 8; i++) {
        checks += `<rect x="${62 + i * 9.5}" y="${i % 2 ? 52 : 60}" width="9.5" height="8" fill="#C0392B" opacity="0.85"/>`;
      }
      return (
        `<path d="M58 68 Q100 30 142 68 L142 56 Q100 20 58 56 Z" fill="#F2F2F2"/>` +
        `<g clip-path="url(#hw)">${checks}</g>` +
        `<clipPath id="hw"><path d="M58 68 Q100 30 142 68 L142 56 Q100 20 58 56 Z"/></clipPath>` +
        `<path d="M140 62 Q152 72 148 88 L142 84 Q146 72 138 66 Z" fill="#F2F2F2"/>`
      );
    }
    case 'head-kum':
      return `<path d="M64 62 Q100 26 136 62 L136 54 Q100 20 64 54 Z" fill="#8B5E3C"/><rect x="64" y="56" width="72" height="8" rx="3" fill="#75492B"/>`;
    case 'head-kofi': {
      // ornate headdress with a row of gold coins on the brow
      let coins = '';
      for (let i = 0; i < 7; i++) {
        coins += `<circle cx="${70 + i * 10}" cy="66" r="3.2" fill="#F2C94C" stroke="#C9A227" stroke-width="0.6"/>`;
      }
      return (
        `<path d="M60 64 Q100 26 140 64 L140 52 Q100 16 60 52 Z" fill="#5B2A86"/>` +
        `<rect x="62" y="58" width="76" height="8" rx="3" fill="#7A3E9D"/>` +
        coins
      );
    }
    case 'head-sasik':
      return (
        `<path d="M60 66 Q100 26 140 66 L140 54 Q100 18 60 54 Z" fill="#FAFAF5"/>` +
        `<path d="M62 58 Q100 34 138 58" stroke="#DDD9CB" stroke-width="3" fill="none"/>` +
        `<path d="M64 64 Q100 42 136 64" stroke="#DDD9CB" stroke-width="3" fill="none"/>`
      );
    default:
      return '';
  }
}

function face(): string {
  return (
    `<circle cx="86" cy="88" r="4" fill="#2B2118"/>` +
    `<circle cx="114" cy="88" r="4" fill="#2B2118"/>` +
    `<path d="M80 78 Q86 74 92 77" stroke="#2B2118" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
    `<path d="M108 77 Q114 74 120 78" stroke="#2B2118" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
    `<path d="M88 104 Q100 114 112 104" stroke="#8E4B32" stroke-width="3" fill="none" stroke-linecap="round"/>`
  );
}

export interface RenderOptions {
  /**
   * Emits additive SMIL animation on animatable items (KUR-080).
   * Feature-flagged OFF by default: react-native-svg ignores SMIL and
   * renders the static base, so enabling is always safe, but the flag
   * stays until the mobile animation pipeline lands.
   */
  animate?: boolean;
}

export function kurdishAvatarSvg(config: AvatarConfig, size = 200, opts: RenderOptions = {}): string {
  const skinId = resolve('skinTone', config.skinTone);
  const styleId = resolve('hairStyle', config.hairStyle);
  const colorId = resolve('hairColor', config.hairColor);
  const outfitId = resolve('outfit', config.outfit);
  const headwearId = resolve('headwear', config.headwear);
  const backgroundId = resolve('background', config.background);

  const skin = SKIN[skinId] ?? SKIN['skin-genimi'];
  const hairColor = HAIR[colorId] ?? HAIR['harc-res'];

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}">` +
    background(backgroundId, opts.animate === true) +
    hairBack(styleId, hairColor as string) +
    outfit(outfitId) +
    `<rect x="90" y="108" width="20" height="18" fill="${skin}"/>` + // neck
    `<circle cx="100" cy="84" r="34" fill="${skin}"/>` + // head
    hairFront(styleId, hairColor as string) +
    headwear(headwearId) +
    face() +
    `</svg>`
  );
}
