import {
  HELPLINE_URL,
  reportCategoryInfo,
  type AppealOutcome,
  type BanContentChoice,
  type ModerationNotificationData,
  type PictureReviewOutcome,
  type PictureReviewTarget,
  type PictureSurface,
  type ReportCategory,
  type SanctionKind,
  type SanctionOrigin,
} from '@kurda/shared';

/**
 * Every message moderation sends to a person, in one place. Pure, so the decision preview and the delivery call the
 * same functions and cannot drift.
 *
 * A sanctioned person is told what happened, which rule, until when, whether it came from a report or our own checks,
 * whether a person reviewed it, and how to appeal (DSA Art. 17). A reporter is told only that we acted or that it does
 * not break the rules, never what the other person got. Calm, plain and short enough for a child. The text is English;
 * `data` carries the same facts for apps that render their own words.
 */

export interface Notice {
  title: string;
  body: string;
  data: ModerationNotificationData;
}

/** The inbox category moderation notices are filed under. */
export const SAFETY_CATEGORY = 'safety';

/** A fixed, unambiguous time for text that cannot know the reader's zone ("14 Oct 2026, 18:00 UTC"). */
export function formatUtc(at: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  return `${at.getUTCDate()} ${months[at.getUTCMonth()]} ${at.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

const TITLES: Readonly<Record<SanctionKind, string>> = {
  warning: 'A warning from Hevalo',
  content_removal: 'We removed something you shared',
  chat_mute: "You can't send messages for a while",
  post_mute: "You can't post or comment for a while",
  feature_limit: "You can't share pictures or voice for a while",
  suspension: 'Your account is suspended',
  permanent_ban: 'Your account has been closed',
};

function whatHappens(kind: SanctionKind, endsAt: Date | null): string {
  const until = endsAt ? `until ${formatUtc(endsAt)}` : 'with no end date';
  switch (kind) {
    case 'warning':
      return 'This is a warning. Nothing on your account is limited.';
    case 'content_removal':
      return 'It is no longer visible to anyone.';
    case 'chat_mute':
      return `You can't send direct or group messages ${until}.`;
    case 'post_mute':
      return `You can't post or comment ${until}.`;
    case 'feature_limit':
      return `You can't upload pictures or voice ${until}.`;
    case 'suspension':
      return `You can't use your account ${until}.`;
    case 'permanent_ban':
      return 'You can no longer use your account.';
  }
}

function howItCame(origin: SanctionOrigin, reviewedByPerson: boolean, policy?: ReportCategory): string {
  const source =
    origin === 'report' && policy === 'copyright'
      ? // a rights holder's notice comes from someone who is usually not a member
        'This came from a copyright complaint'
      : origin === 'report'
      ? 'This came from a report by another member'
      : origin === 'automatic'
        ? 'This came from our automatic checks'
        : 'This came from a Hevalo moderator';
  return reviewedByPerson ? `${source}, and a person reviewed it.` : `${source}. No person has reviewed it yet.`;
}

export interface SanctionNoticeInput {
  sanctionId: string;
  kind: SanctionKind;
  policy: ReportCategory;
  statement: string;
  endsAt: Date | null;
  origin: SanctionOrigin;
  reviewedByPerson: boolean;
  /** for a suspension or ban: what happens to what they shared */
  content?: { choice: BanContentChoice; includeMessages: boolean } | null;
}

/** What a suspension or ban does to what the person shared, said plainly; nothing when the decision did not say. */
export function contentSentence(kind: SanctionKind, content: { choice: BanContentChoice; includeMessages: boolean } | null | undefined): string | null {
  if (!content || (kind !== 'suspension' && kind !== 'permanent_ban')) return null;
  const messages = content.includeMessages ? ' Your private messages show as removed too.' : '';
  switch (content.choice) {
    case 'keep':
      return 'What you shared stays up, shown as from an account that isn’t available.';
    case 'hide':
      return kind === 'suspension'
        ? `Your posts, comments, pictures and profile are hidden from everyone until the suspension ends.${messages}`
        : `Your posts, comments, pictures and profile are hidden from everyone.${messages}`;
    case 'remove':
      return `Your posts, comments, pictures and profile are removed. They are kept privately for six months in case you ask for a review, then deleted for good.${messages}`;
  }
}

/** What a person is told about a sanction: the statement of reasons. */
export function sanctionNotice(input: SanctionNoticeInput): Notice {
  const rule = reportCategoryInfo(input.policy).label;
  const content = contentSentence(input.kind, input.content);
  const body = [
    input.statement.trim(),
    whatHappens(input.kind, input.endsAt),
    ...(content ? [content] : []),
    `The rule: ${rule}.`,
    howItCame(input.origin, input.reviewedByPerson, input.policy),
    input.policy === 'copyright' && input.kind === 'content_removal'
      ? // the DMCA's and the DSA's answer to a takedown: the counter-notice, besides the review.
        // Only a takedown has one; a warning or a limit under the same rule is reviewed like any other
        'Made it yourself, or allowed to use it? You can send a counter-notice from hevalo.app/copyright, or ask for a review from Account standing, within six months.'
      : 'Think we got it wrong? You can ask for a review from Account standing within six months.',
  ].join('\n\n');
  return {
    title: TITLES[input.kind],
    body,
    data: {
      kind: 'sanction',
      sanctionId: input.sanctionId,
      sanction: input.kind,
      policy: input.policy,
      until: input.endsAt ? input.endsAt.toISOString() : null,
    },
  };
}

/** What a reporter is told when their report is decided. Never the sanction. */
export function reportOutcomeNotice(outcome: 'actioned' | 'no_violation', reportIds: string[]): Notice {
  if (outcome === 'actioned') {
    return {
      title: 'Thanks for your report',
      body: 'We took action. Thanks for keeping Hevalo safe.',
      data: { kind: 'report_outcome', reportIds, outcome },
    };
  }
  return {
    title: 'We reviewed your report',
    body:
      "We reviewed it and it doesn't break our rules. You can block or mute them. " +
      'If you think we got it wrong, you can ask for a second look from My reports.',
    data: { kind: 'report_outcome', reportIds, outcome },
  };
}

/**
 * For someone who may be at risk: never a sanction, but a signpost to help at the point of contact. An admin's own
 * words go first.
 */
export function caringMessage(extra?: string | null): Notice {
  const personal = extra?.trim();
  const body = [
    ...(personal ? [personal] : []),
    "We wanted to check in. If things feel hard right now, you don't have to face it alone.",
    `You can find a free, confidential helpline in your country at ${HELPLINE_URL}.`,
    'If you are in danger right now, please call your local emergency number.',
  ].join('\n\n');
  // the admin's words travel in data too: a client that says the rest in the
  // reader's own language would otherwise have no way to keep them
  return {
    title: "We're thinking of you",
    body,
    data: { kind: 'caring_message', helplineUrl: HELPLINE_URL, ...(personal ? { message: personal } : {}) },
  };
}

/** A restriction ended early (revoked, unbanned, overturned). */
export function sanctionLiftedNotice(sanctionId: string): Notice {
  return {
    title: 'A restriction was lifted',
    body: 'A restriction on your account has been lifted. Thanks for your patience.',
    data: { kind: 'sanction_lifted', sanctionId },
  };
}

/** What the owner reads once a person approved a picture, by where it is shown. */
const APPROVED_NEXT: Readonly<Record<PictureSurface, string>> = {
  post: 'Your post is now visible.',
  profile_photo: 'Your new photo is now on your profile.',
  group_photo: 'The new group photo is now showing.',
  letter: 'Your letter is on its way.',
};

/**
 * A person checked a picture: approved (a held picture is shown now; a refusal its owner asked about can be shared),
 * or upheld (a refusal its owner asked about stays). A removal is a sanction notice instead.
 */
export function pictureReviewNotice(
  outcome: PictureReviewOutcome,
  surface: PictureSurface,
  target: PictureReviewTarget | null,
  asked = false,
): Notice {
  const data = { kind: 'picture_review' as const, outcome, surface, asked, target };
  if (outcome === 'upheld') {
    return { title: 'Your picture was checked', body: 'A person checked your picture. It can’t be shared on Hevalo.', data };
  }
  // a post's picture that never made it onto a post can simply be shared now
  const next = asked || (surface === 'post' && !target) ? 'You can share it now.' : APPROVED_NEXT[surface];
  return { title: 'Your picture was checked', body: `Your picture was checked and it’s fine. ${next}`, data };
}

/** The answer to an appeal. */
export function appealDecidedNotice(appealId: string, outcome: AppealOutcome, note: string): Notice {
  const lead =
    outcome === 'overturned'
      ? 'We looked at your request again and reversed our decision. Sorry about that.'
      : outcome === 'modified'
        ? 'We looked at your request again and changed our decision.'
        : 'We looked at your request again. Our decision stands.';
  return {
    title: 'Your review request was answered',
    body: [lead, note.trim()].filter(Boolean).join('\n\n'),
    data: { kind: 'appeal_decided', appealId, outcome },
  };
}
