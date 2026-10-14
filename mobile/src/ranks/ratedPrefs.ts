import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { RankedGame } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { getRatedPreferences } from './api';
import { parseChoices, startingChoice, type RatedChoices } from './ratedChoice';

/**
 * Rated or Friendly, as the host last chose it per game (contract 4 §R2): on
 * this phone, and on the server (which remembers the choice whenever a game is
 * made). The server's memory wins — it is the same on every device — and this
 * phone's covers the moment before the server has answered, or an account
 * that has not made a game since choosing.
 *
 * With neither, a game starts Friendly: started from a chat or among friends
 * is the usual way in, and a first game with friends should not quietly put
 * anyone's rank on the line.
 */

const KEY = 'hevalo_rated_choice_v1';

async function read(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

async function write(value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, value);
    else await SecureStore.setItemAsync(KEY, value);
  } catch {
    // a remembered choice is a nicety; the sheet goes on with what it has
  }
}

let device: RatedChoices | null = null;

/**
 * The Rated/Friendly choice for a new game of `game`, starting where the host
 * left it, and a setter that remembers the new choice on this phone. A choice
 * made before the stored ones arrive is kept: the host's tap wins.
 */
export function useRatedChoice(game: RankedGame): [boolean, (rated: boolean) => void] {
  const { client } = useAuth();
  const [value, setValue] = useState<boolean>(() => startingChoice(game, null, device ?? {}));
  const touched = useRef(false);

  useEffect(() => {
    let live = true;
    // another game picked in the same sheet starts from its own memory
    touched.current = false;
    setValue(startingChoice(game, null, device ?? {}));
    void (async () => {
      if (!device) device = parseChoices(await read());
      const res = await getRatedPreferences(client);
      if (!live) return;
      const server = res.ok ? res.data.preferences : null;
      if (!touched.current) setValue(startingChoice(game, server, device ?? {}));
    })();
    return () => {
      live = false;
    };
  }, [client, game]);

  const choose = useCallback(
    (rated: boolean) => {
      touched.current = true;
      setValue(rated);
      device = { ...(device ?? {}), [game]: rated };
      void write(JSON.stringify(device));
    },
    [game],
  );

  return [value, choose];
}

/** For tests: forget what was read. */
export function resetRatedChoices(): void {
  device = null;
}
