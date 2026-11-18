import type { BadgesResponse, ExpectedGains, LeagueView, RankResult, RankedGame, UnseenBadge } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/** The weekly leagues, badges and frames over the API, and what is left of game ranks. The shapes are @kurda/shared's. */

/** What a finished game did to your rank, with its one plain reason. */
export const getRankResult = (client: ApiClient, game: RankedGame, ref: string): Promise<ApiResult<RankResult>> =>
  client.get(`/ranks/results/${game}/${ref}`);

/** In a lobby: roughly what a win and a loss against each opponent would do, and whether it would count now. */
export const getExpectedGains = (client: ApiClient, game: RankedGame, lobbyId: string): Promise<ApiResult<ExpectedGains>> =>
  client.get(`/ranks/expected/${game}/${lobbyId}`);

/** Your remembered Rated/Friendly choice per game (what a setup sheet starts on). */
export const getRatedPreferences = (client: ApiClient): Promise<ApiResult<{ preferences: Partial<Record<RankedGame, boolean>> }>> =>
  client.get('/ranks/preferences');

/** The host changes a lobby's Rated/Friendly badge (the lobby is the only place it can change). */
export const setLobbyRated = (client: ApiClient, game: RankedGame, lobbyId: string, rated: boolean): Promise<ApiResult<{ ok: true; rated: boolean }>> =>
  client.put(`/play/${game}/${lobbyId}/rated`, { rated });

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
