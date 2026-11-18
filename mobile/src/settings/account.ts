import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert } from 'react-native';
import { describeError, isMaintenance } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { visibilityOffered, type Visibility } from '../social/format';

/**
 * The account fields Settings shows and changes, from GET /me: username, profile visibility, league
 * participation, and whether the user is 13–17 (which decides what is offered). Refetched whenever a settings
 * screen comes into view, so rows reflect changes made on a page behind them. Each is null until loaded, so a row
 * shows no value rather than a guess.
 */
export interface MyAccount {
  username: string | null;
  visibility: Visibility | null;
  leagues: boolean | null;
  minor: boolean;
  /** The error from loading the account, until the next attempt; a page that needs it shows the error and a retry. */
  failed: string | null;
  retry: () => void;
  changeVisibility: (next: Visibility) => void;
  changeLeagues: (on: boolean) => void;
}

interface Me {
  user: { profileVisibility: Visibility; username: string; minor?: boolean; leaguesEnabled?: boolean };
}

export function useMyAccount(): MyAccount {
  const { client } = useAuth();
  const { t } = useI18n();
  const [username, setUsername] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const [leagues, setLeagues] = useState<boolean | null>(null);
  const [minor, setMinor] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setFailed(null);
      void client.get<Me>('/me').then((res) => {
        if (!active) return;
        if (!res.ok) {
          // Hevalo offline for a while is said by the screen over the app.
          if (!isMaintenance(res.error)) setFailed(describeError(res.error, t));
          return;
        }
        setUsername(res.data.user.username);
        setVisibility(res.data.user.profileVisibility);
        setMinor(res.data.user.minor === true);
        setLeagues(res.data.user.leaguesEnabled !== false);
      });
      return () => {
        active = false;
      };
      // `round` is Try again: a new round asks again.
    }, [client, t, round]),
  );
  const retry = useCallback(() => setRound((r) => r + 1), []);

  /** Saved at once and shown at once; put back, and said why, if the server says no. */
  const changeVisibility = (next: Visibility): void => {
    if (!visibilityOffered(next, minor) || next === visibility) return;
    const before = visibility;
    setVisibility(next);
    void client.put('/me/privacy', { visibility: next }).then((res) => {
      if (res.ok) return;
      setVisibility(before);
      if (!isMaintenance(res.error)) Alert.alert(t('settings.privacy.title'), describeError(res.error, t));
    });
  };

  /**
   * Join or leave the weekly leagues. Leaving removes you from this week's table at once and changes nothing else
   * you have earned.
   */
  const changeLeagues = (on: boolean): void => {
    setLeagues(on);
    void client.patch('/me', { leaguesEnabled: on }).then((res) => {
      if (res.ok) return;
      setLeagues(!on);
      if (!isMaintenance(res.error)) Alert.alert(t('settings.leagues.title'), describeError(res.error, t));
    });
  };

  return { username, visibility, leagues, minor, failed, retry, changeVisibility, changeLeagues };
}
