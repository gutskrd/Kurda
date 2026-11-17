import type {
  GameDialect,
  ProverbList,
  ProverbRoundCorrection,
  ProverbRoundHint,
  ProverbRoundItemView,
  ProverbRoundMode,
  ProverbView,
  RiddleAnswer,
  RiddleDetail,
  RiddleHint,
  RiddleList,
  SoloAnswerResult,
  SoloResults,
  SoloSessionView,
} from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import { SITE_ORIGIN } from '../feed/api';

/**
 * The riddles and the proverbs over the API (api/src/lore/routes.ts). The
 * shapes are @kurda/shared's (lore.ts); nothing is redefined here.
 *
 * A list and a riddle's page never carry a hint not yet taken, the answer or
 * its explanation: those come one call at a time, a hint when it is asked
 * for and the answer with a right guess or a reveal, and nothing on the phone
 * asks for one before the learner does.
 *
 * Reading and playing need no account; what a signed-in learner does is kept
 * by the server and what a solve pays is paid there. The proverbs' round is a
 * solo round and needs one (a guest's counts).
 */

const slugPath = (slug: string): string => encodeURIComponent(slug);

export const getRiddles = (client: ApiClient, dialect: GameDialect): Promise<ApiResult<RiddleList>> => client.get(`/riddles?dialect=${dialect}`);

export const getRiddle = (client: ApiClient, slug: string): Promise<ApiResult<{ riddle: RiddleDetail }>> => client.get(`/riddles/${slugPath(slug)}`);

/** One hint, by its place (0, then 1): taken in order. */
export const takeHint = (client: ApiClient, slug: string, index: number): Promise<ApiResult<{ hint: RiddleHint }>> =>
  client.post(`/riddles/${slugPath(slug)}/hint`, { index });

/** The answer, asked for: a signed-in learner's riddle is revealed from then on (one already solved stays solved). */
export const revealRiddle = (client: ApiClient, slug: string): Promise<ApiResult<{ answer: RiddleAnswer }>> => client.post(`/riddles/${slugPath(slug)}/reveal`);

export const getProverbs = (client: ApiClient, dialect: GameDialect): Promise<ApiResult<ProverbList>> => client.get(`/proverbs?dialect=${dialect}`);

export const getProverb = (client: ApiClient, slug: string): Promise<ApiResult<{ proverb: ProverbView }>> => client.get(`/proverbs/${slugPath(slug)}`);

export type ProverbRoundView = SoloSessionView<ProverbRoundItemView>;
export type ProverbRoundResult = SoloAnswerResult<ProverbRoundHint, ProverbRoundCorrection>;

export const startProverbRound = (client: ApiClient, dialect: GameDialect, mode: ProverbRoundMode): Promise<ApiResult<ProverbRoundView>> =>
  client.post('/proverbs/rounds', { dialect, mode });

/** A round of this mode left unfinished, to come back to; null when there is none. */
export const openProverbRound = (client: ApiClient, dialect: GameDialect, mode: ProverbRoundMode): Promise<ApiResult<{ id: string | null }>> =>
  client.get(`/proverbs/rounds/open?dialect=${dialect}&mode=${mode}`);

export const getProverbRound = (client: ApiClient, id: string): Promise<ApiResult<ProverbRoundView & { expired?: boolean }>> => client.get(`/proverbs/rounds/${id}`);

export const answerProverbRound = (client: ApiClient, id: string, index: number, choice: number, attempt: number): Promise<ApiResult<ProverbRoundResult>> =>
  client.post(`/proverbs/rounds/${id}/answers`, { index, answer: { choice }, attempt });

export const finishProverbRound = (client: ApiClient, id: string): Promise<ApiResult<SoloResults>> => client.post(`/proverbs/rounds/${id}/finish`);

/**
 * A riddle's address, as anybody can open it: the website's page for it,
 * which the app opens too where it is installed. It names the riddle and
 * nothing else, so a friend sent it meets the question and has to think.
 */
export const riddleUrl = (slug: string): string => `${SITE_ORIGIN}/app/learn/riddles/${slugPath(slug)}`;
export const proverbUrl = (slug: string): string => `${SITE_ORIGIN}/app/learn/proverbs/${slugPath(slug)}`;
