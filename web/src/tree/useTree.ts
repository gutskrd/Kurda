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
  /** The server has no trees yet, so the tree is not shown anywhere. */
  unavailable: boolean;
  reload: () => void;
  /** Replaces the state with a newer answer, such as an action's response. */
  set: (next: MyTree) => void;
}

/** The learner's tree, fetched when the page opens. A 404 means the server has no trees yet, which is not an error. */
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
