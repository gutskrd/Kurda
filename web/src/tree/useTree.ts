import { useCallback, useEffect, useState } from 'react';
import type { TreeSpecies, TreeStage, TreeView } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';

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

export interface TreeState {
  data: MyTree | null;
  loading: boolean;
  error: string | null;
  /** the server has no trees yet (it is older than this page): the tree is simply not shown anywhere */
  unavailable: boolean;
  reload: () => void;
  /** put a newer answer in place, as an action's own answer is */
  set: (next: MyTree) => void;
}

/**
 * The learner's tree, asked for when the page opens. A server that does not
 * know about trees answers 404, and then there is nothing to show and nothing
 * wrong: the feature is not there yet, and no part of the page mentions it.
 */
export function useTree(enabled = true): TreeState {
  const { client, status } = useAuth();
  const t = useT();
  const [data, setData] = useState<MyTree | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [nonce, setNonce] = useState(0);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!enabled || !signedIn) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void client.get<MyTree>('/me/tree').then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) setData(res.data);
      else if (res.error.status === 404) setUnavailable(true);
      else setError(describeError(res.error, t));
    });
    return () => {
      cancelled = true;
    };
  }, [client, t, enabled, signedIn, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, unavailable, reload, set: setData };
}
