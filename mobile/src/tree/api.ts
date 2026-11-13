import type { TreeSpecies, TreeStage, TreeView } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/** A kind as the nursery offers it: what it costs and whether it is the learner's to plant. */
export interface TreeKindOffer {
  species: TreeSpecies;
  starter: boolean;
  price: number;
  owned: boolean;
}

/** GET /me/tree */
export interface MyTree {
  tree: TreeView | null;
  planted: number;
  kinds: TreeKindOffer[];
  zer: number;
}

/** POST /me/tree/water */
export interface Watered {
  tree: TreeView;
  poured: number;
  grew: TreeStage | null;
  harvests: number;
  zer: number;
  revived: boolean;
}

export const getTree = (client: ApiClient): Promise<ApiResult<MyTree>> => client.get<MyTree>('/me/tree');

export const plantTree = (client: ApiClient, species: TreeSpecies): Promise<ApiResult<MyTree>> => client.post<MyTree>('/me/tree/plant', { species });

export const buyTreeKind = (client: ApiClient, species: TreeSpecies): Promise<ApiResult<MyTree>> => client.post<MyTree>(`/me/tree/kinds/${species}/buy`);

export const waterTree = (client: ApiClient, count: number): Promise<ApiResult<Watered>> => client.post<Watered>('/me/tree/water', { count });

/** A server that has no trees yet answers 404: the tree is then simply not shown anywhere. */
export const treesMissing = (res: ApiResult<unknown>): boolean => !res.ok && res.error.status === 404;
