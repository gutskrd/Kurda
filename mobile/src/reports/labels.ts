import type {
  AppealStatus,
  ReportCategory,
  ReportStatus,
  ReportTargetType,
  RestrictionScope,
  SanctionKind,
  SanctionOrigin,
  StandingStatus,
} from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

/**
 * The words for reports and standing, by value.
 *
 * Typed maps rather than keys built from strings: a category or a sanction the
 * shared module adds fails the typecheck here until it has words, instead of
 * rendering as its own key on someone's screen. The category keys are the ones
 * shared `REPORT_CATEGORIES` names (`labelKey`), so the browser and the phone
 * agree on which sentence belongs to which category.
 */
export const CATEGORY_LABEL: Record<ReportCategory, TranslationKey> = {
  child_safety: 'report.category.childSafety',
  self_harm: 'report.category.selfHarm',
  violence: 'report.category.violence',
  sexual: 'report.category.sexual',
  hate: 'report.category.hate',
  private_info: 'report.category.privateInfo',
  harassment: 'report.category.harassment',
  spam: 'report.category.spam',
  impersonation: 'report.category.impersonation',
  other: 'report.category.other',
};

/** What a report was about, when the server has no name it may show for it. */
export const TARGET_LABEL: Record<ReportTargetType, TranslationKey> = {
  user: 'reports.target.user',
  dm_message: 'reports.target.message',
  group_message: 'reports.target.message',
  group: 'reports.target.group',
  library_post: 'reports.target.post',
  library_comment: 'reports.target.comment',
  image_post: 'reports.target.post',
  image_comment: 'reports.target.comment',
  game_player: 'reports.target.player',
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, TranslationKey> = {
  open: 'reports.status.open',
  actioned: 'reports.status.actioned',
  no_violation: 'reports.status.noViolation',
};

export const SANCTION_LABEL: Record<SanctionKind, TranslationKey> = {
  warning: 'standing.kind.warning',
  content_removal: 'standing.kind.contentRemoval',
  chat_mute: 'standing.kind.chatMute',
  post_mute: 'standing.kind.postMute',
  feature_limit: 'standing.kind.featureLimit',
  suspension: 'standing.kind.suspension',
  permanent_ban: 'standing.kind.permanentBan',
};

export const SCOPE_LABEL: Record<RestrictionScope, TranslationKey> = {
  chat: 'standing.scope.chat',
  post: 'standing.scope.post',
  media: 'standing.scope.media',
  account: 'standing.scope.account',
};

export const STANDING_STATUS_LABEL: Record<StandingStatus, TranslationKey> = {
  good: 'standing.status.good',
  limited: 'standing.status.limited',
  suspended: 'standing.status.suspended',
  banned: 'standing.status.banned',
};

export const ORIGIN_LABEL: Record<SanctionOrigin, TranslationKey> = {
  report: 'standing.origin.report',
  automatic: 'standing.origin.automatic',
  moderator: 'standing.origin.moderator',
};

export const APPEAL_STATUS_LABEL: Record<AppealStatus, TranslationKey> = {
  open: 'appeal.status.open',
  upheld: 'appeal.status.upheld',
  overturned: 'appeal.status.overturned',
  modified: 'appeal.status.modified',
};
