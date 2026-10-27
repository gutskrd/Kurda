import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert } from 'react-native';
import { describeError, isMaintenance } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { visibilityOffered, type Visibility } from '../social/format';

/**
 * What Settings shows of the account and changes on it, from GET /me: the
 * username, who can see the profile, whether you are in the weekly leagues,
 * and whether you are 13–17 (which decides what is offered).
 *
 * Asked again each time a settings screen comes into view, so a row shows what
 * a page behind it has just changed. Until the answer comes each is null, and
 * a row shows no value rather than a guess that then flips.
 */
export interface MyAccount {
  username: string | null;
  visibility: Visibility | null;
  leagues: boolean | null;
  minor: boolean;
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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void client.get<Me>('/me').then((res) => {
        if (!active || !res.ok) return;
        setUsername(res.data.user.username);
        setVisibility(res.data.user.profileVisibility);
        setMinor(res.data.user.minor === true);
        setLeagues(res.data.user.leaguesEnabled !== false);
      });
      return () => {
        active = false;
      };
    }, [client]),
  );

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
   * In or out of the weekly leagues, in one tap. A league ranks you against
   * strangers by XP every week, which suits some people and puts others off
   * learning; leaving takes you out of this week's table at once and changes
   * nothing else you have earned.
   */
  const changeLeagues = (on: boolean): void => {
    setLeagues(on);
    void client.patch('/me', { leaguesEnabled: on }).then((res) => {
      if (res.ok) return;
      setLeagues(!on);
      if (!isMaintenance(res.error)) Alert.alert(t('settings.leagues.title'), describeError(res.error, t));
    });
  };

  return { username, visibility, leagues, minor, changeVisibility, changeLeagues };
}
