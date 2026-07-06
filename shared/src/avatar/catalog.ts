/**
 * Kurdish avatar catalog (KUR-075). Every visual option is a cosmetic
 * item with a slot, Kurdish-first naming, and an ownership tier:
 * base items are free for everyone (identity features — skin, hair —
 * are always free by design); premium items come from the shop (#69)
 * or achievements (#78).
 */

export type AvatarSlot =
  | 'skinTone'
  | 'hairStyle'
  | 'hairColor'
  | 'outfit'
  | 'headwear'
  | 'background';

export interface CosmeticItem {
  id: string;
  slot: AvatarSlot;
  nameKu: string;
  nameEn: string;
  /** Free for every account; identity items are always base. */
  base: boolean;
  /** Reserved for the animation pipeline (KUR-080). */
  animatable?: boolean;
}

export const AVATAR_CATALOG: readonly CosmeticItem[] = [
  // ---- skin tones (all free — identity is never paywalled) ----
  { id: 'skin-genimi', slot: 'skinTone', nameKu: 'Genimî', nameEn: 'Wheat', base: true },
  { id: 'skin-ronahi', slot: 'skinTone', nameKu: 'Ronahî', nameEn: 'Light', base: true },
  { id: 'skin-zerin', slot: 'skinTone', nameKu: 'Zêrîn', nameEn: 'Golden', base: true },
  { id: 'skin-qehweyi', slot: 'skinTone', nameKu: 'Qehweyî', nameEn: 'Brown', base: true },
  { id: 'skin-esmer', slot: 'skinTone', nameKu: 'Esmer', nameEn: 'Deep', base: true },

  // ---- hair styles (all free) ----
  { id: 'hair-kurt', slot: 'hairStyle', nameKu: 'Porê kurt', nameEn: 'Short hair', base: true },
  { id: 'hair-direj', slot: 'hairStyle', nameKu: 'Porê dirêj', nameEn: 'Long hair', base: true },
  { id: 'hair-guli', slot: 'hairStyle', nameKu: 'Gulî', nameEn: 'Braids', base: true },
  { id: 'hair-xelek', slot: 'hairStyle', nameKu: 'Porê xelek', nameEn: 'Curly hair', base: true },
  { id: 'hair-tune', slot: 'hairStyle', nameKu: 'Bê por', nameEn: 'No hair', base: true },

  // ---- hair colors (all free) ----
  { id: 'harc-res', slot: 'hairColor', nameKu: 'Reş', nameEn: 'Black', base: true },
  { id: 'harc-qehweyi', slot: 'hairColor', nameKu: 'Qehweyî', nameEn: 'Brown', base: true },
  { id: 'harc-hene', slot: 'hairColor', nameKu: 'Hene', nameEn: 'Henna red', base: true },
  { id: 'harc-gewr', slot: 'hairColor', nameKu: 'Gewr', nameEn: 'Grey', base: true },

  // ---- outfits (traditional Kurdish dress is the star of the set) ----
  {
    id: 'outfit-sal-sapik',
    slot: 'outfit',
    nameKu: 'Şal û şapik',
    nameEn: 'Şal û şapik (traditional suit)',
    base: true,
  },
  {
    id: 'outfit-kiras-fistan',
    slot: 'outfit',
    nameKu: 'Kiras û fistan',
    nameEn: 'Kiras û fistan (traditional dress)',
    base: true,
  },
  { id: 'outfit-modern', slot: 'outfit', nameKu: 'Cilên modern', nameEn: 'Modern', base: true },
  {
    id: 'outfit-pesmerge',
    slot: 'outfit',
    nameKu: 'Cilên pêşmerge',
    nameEn: 'Peshmerga uniform',
    base: false,
  },
  {
    id: 'outfit-newroz',
    slot: 'outfit',
    nameKu: 'Cilên Newrozê',
    nameEn: 'Newroz festive outfit',
    base: false,
  },

  // ---- headwear ----
  { id: 'head-tune', slot: 'headwear', nameKu: 'Tune', nameEn: 'None', base: true },
  {
    id: 'head-jamadani',
    slot: 'headwear',
    nameKu: 'Cemedanî',
    nameEn: 'Jamadani (checkered wrap)',
    base: true,
  },
  { id: 'head-kum', slot: 'headwear', nameKu: 'Kum', nameEn: 'Felt cap', base: false },
  {
    id: 'head-kofi',
    slot: 'headwear',
    nameKu: 'Kofî',
    nameEn: 'Kofî (coin headdress)',
    base: false,
  },
  { id: 'head-sasik', slot: 'headwear', nameKu: 'Şaşik', nameEn: 'White turban', base: false },

  // ---- backgrounds ----
  { id: 'bg-sade', slot: 'background', nameKu: 'Sade', nameEn: 'Plain', base: true },
  { id: 'bg-ciya', slot: 'background', nameKu: 'Çiya', nameEn: 'Mountains', base: true },
  {
    id: 'bg-roj',
    slot: 'background',
    nameKu: 'Roja Kurdistanê',
    nameEn: 'Kurdish sun',
    base: false,
  },
  {
    id: 'bg-newroz',
    slot: 'background',
    nameKu: 'Agirê Newrozê',
    nameEn: 'Newroz fire',
    base: false,
    animatable: true,
  },
  { id: 'bg-dest', slot: 'background', nameKu: 'Deşt', nameEn: 'Green plains', base: true },
] as const;

export interface AvatarConfig {
  skinTone: string;
  hairStyle: string;
  hairColor: string;
  outfit: string;
  headwear: string;
  background: string;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  skinTone: 'skin-genimi',
  hairStyle: 'hair-kurt',
  hairColor: 'harc-res',
  outfit: 'outfit-sal-sapik',
  headwear: 'head-tune',
  background: 'bg-sade',
};

export function catalogItem(id: string): CosmeticItem | undefined {
  return AVATAR_CATALOG.find((item) => item.id === id);
}

export function itemsForSlot(slot: AvatarSlot): CosmeticItem[] {
  return AVATAR_CATALOG.filter((item) => item.slot === slot);
}

export function baseItemIds(): Set<string> {
  return new Set(AVATAR_CATALOG.filter((i) => i.base).map((i) => i.id));
}

export type AvatarValidationError =
  | { kind: 'unknown_item'; slot: AvatarSlot; id: string }
  | { kind: 'wrong_slot'; slot: AvatarSlot; id: string }
  | { kind: 'not_owned'; slot: AvatarSlot; id: string };

/**
 * Validates a config against the catalog and an ownership set (base
 * items are implicitly owned). Falls back to nothing — invalid configs
 * are rejected, not silently corrected; the renderer separately falls
 * back per-layer so a stale stored config still draws (KUR-075 edge).
 */
export function validateAvatarConfig(
  config: AvatarConfig,
  ownedItemIds: ReadonlySet<string>,
): AvatarValidationError[] {
  const errors: AvatarValidationError[] = [];
  const slots: AvatarSlot[] = [
    'skinTone',
    'hairStyle',
    'hairColor',
    'outfit',
    'headwear',
    'background',
  ];
  for (const slot of slots) {
    const id = config[slot];
    const item = catalogItem(id);
    if (!item) {
      errors.push({ kind: 'unknown_item', slot, id });
      continue;
    }
    if (item.slot !== slot) {
      errors.push({ kind: 'wrong_slot', slot, id });
      continue;
    }
    if (!item.base && !ownedItemIds.has(id)) {
      errors.push({ kind: 'not_owned', slot, id });
    }
  }
  return errors;
}
