import type { ReportCategory, ReportTargetType, RestrictionScope, SanctionKind } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';

/**
 * The words for moderation's names, in one place.
 *
 * Shared `REPORT_CATEGORIES` carries each category's `labelKey`; the keys are
 * written out here as well so the catalogue check can see they are read, and
 * so a category the API adds without a label fails the type check rather than
 * reaching someone as a raw key.
 */
export const CATEGORY_LABEL: Readonly<Record<ReportCategory, MessageKey>> = {
  child_safety: 'report.category.childSafety',
  self_harm: 'report.category.selfHarm',
  violence: 'report.category.violence',
  sexual: 'report.category.sexual',
  hate: 'report.category.hate',
  private_info: 'report.category.privateInfo',
  harassment: 'report.category.harassment',
  copyright: 'report.category.copyright',
  spam: 'report.category.spam',
  impersonation: 'report.category.impersonation',
  other: 'report.category.other',
};

/** One line under each category, in words a child would use, so nobody has to guess which fits. */
export const CATEGORY_HINT: Readonly<Record<ReportCategory, MessageKey>> = {
  child_safety: 'report.hint.childSafety',
  self_harm: 'report.hint.selfHarm',
  violence: 'report.hint.violence',
  sexual: 'report.hint.sexual',
  hate: 'report.hint.hate',
  private_info: 'report.hint.privateInfo',
  harassment: 'report.hint.harassment',
  copyright: 'report.hint.copyright',
  spam: 'report.hint.spam',
  impersonation: 'report.hint.impersonation',
  other: 'report.hint.other',
};

/** What was reported, as "My reports" names it ("a message", "a post"). */
export const TARGET_LABEL: Readonly<Record<ReportTargetType, MessageKey>> = {
  user: 'reports.target.user',
  dm_message: 'reports.target.dmMessage',
  group_message: 'reports.target.groupMessage',
  group: 'reports.target.group',
  library_post: 'reports.target.libraryPost',
  library_comment: 'reports.target.comment',
  image_post: 'reports.target.imagePost',
  image_comment: 'reports.target.comment',
  game_player: 'reports.target.gamePlayer',
};

/** A sanction as its person reads it: what happened, not the admin's term for it. */
export const SANCTION_LABEL: Readonly<Record<SanctionKind, MessageKey>> = {
  warning: 'standing.kind.warning',
  content_removal: 'standing.kind.contentRemoval',
  chat_mute: 'standing.kind.chatMute',
  post_mute: 'standing.kind.postMute',
  feature_limit: 'standing.kind.featureLimit',
  suspension: 'standing.kind.suspension',
  permanent_ban: 'standing.kind.permanentBan',
};

/** What a restriction stops, as Account standing lists it. */
export const SCOPE_LABEL: Readonly<Record<RestrictionScope, MessageKey>> = {
  chat: 'standing.scope.chat',
  post: 'standing.scope.post',
  media: 'standing.scope.media',
  account: 'standing.scope.account',
};
