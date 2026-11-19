import type { BadgesResponse, LeagueView, UnseenBadge } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/** The weekly leagues, badges and frames over the API. The shapes are @kurda/shared's. */

export const getLeague = (client: ApiClient): Promise<ApiResult<LeagueView>> => client.get('/me/league');

export const getBadges = (client: ApiClient): Promise<ApiResult<BadgesResponse>> => client.get('/me/badges');

export const getUnseenBadges = (client: ApiClient): Promise<ApiResult<{ unseen: UnseenBadge[] }>> => client.get('/me/badges/unseen');

/** The celebration was shown: these unlocks are seen (all of them, without keys). */
export const markBadgesSeen = (client: ApiClient, keys?: string[]): Promise<ApiResult<{ seen: true }>> =>
  client.post('/me/badges/seen', keys ? { keys } : {});

export const setShowcase = (client: ApiClient, keys: string[]): Promise<ApiResult<{ showcase: string[] }>> =>
  client.put('/me/badges/showcase', { keys });

/** Wear a frame you own, or none. */
export const wearFrame = (client: ApiClient, sku: string | null): Promise<ApiResult<{ frameSku: string | null }>> =>
  client.put('/me/cosmetics/frame', { sku });
