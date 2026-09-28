/**
 * User tags & badges (KUR-286/287) — re-exported from `@kurda/shared`.
 *
 * The shapes and the three view helpers moved there when the browser needed
 * them too: none of it touches a UI framework or a catalogue, so a second copy
 * would have been two places to disagree about which tags to offer. The
 * re-export keeps every `./types` import in this folder working, and is the only
 * thing left here.
 */
export {
  claimableCatalog,
  purchasableTags,
  tagLabel,
  type Acquisition,
  type ClaimedTag,
  type DisplayTag,
  type ProfileTags,
  type TagKind,
  type TagRow,
} from '@kurda/shared';
