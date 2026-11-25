/**
 * A profile's collection besides its badges (`GET /users/:id/collection`): the icons they own and the gifts they were
 * given, with who gave them only to the person they were given to, and for the owner alone what they gave. Shared so
 * the API and both apps agree on the shape.
 */

/** Most icons, and most distinct gift items in each list, one answer holds; `total` says how many there are. */
export const COLLECTION_LIST_MAX = 60;
/** Most givers or receivers named under one gift item, newest first; its `count` still counts them all. */
export const COLLECTION_PEOPLE_MAX = 20;

/** Somebody a gift came from or went to; null where they left, are blocked either way or are not available. */
export interface CollectionPerson {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface CollectionIcon {
  sku: string;
  name: string;
  assetUrl: string | null;
  /** the icon worn on their profile now */
  worn: boolean;
}

/** One kind of gift item, however many times it came or went. */
export interface CollectionGift {
  sku: string;
  name: string;
  category: string;
  assetUrl: string | null;
  count: number;
  /** the newest time it came or went */
  lastAt: string;
  /** the owner only: who sent it, or to whom it went, and when; newest first */
  people?: Array<{ person: CollectionPerson | null; at: string }>;
}

export interface CollectionList<T> {
  items: T[];
  total: number;
}

export interface CollectionResponse {
  /** true when the profile keeps its detail from this viewer; the lists are then empty */
  private: boolean;
  icons: CollectionList<CollectionIcon>;
  received: CollectionList<CollectionGift>;
  /** the owner only */
  sent?: CollectionList<CollectionGift>;
}
