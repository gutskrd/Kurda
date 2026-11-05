import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  APP_LOCALES,
  BLUFF_DEFAULT_ROUNDS,
  BLUFF_DEFAULT_WRITE_SECONDS,
  BLUFF_ROUNDS,
  BLUFF_WRITE_SECONDS,
  GAME_DIFFICULTIES,
  WHO_AM_I_RACE_DEFAULT_MINUTES,
  WHO_AM_I_RACE_MINUTES,
  defaultBluffLanguage,
  type AppLocale,
  type GameDifficulty,
  type LetterDialect,
} from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { Segmented } from '../theme/glass';
import { spacing } from '../theme/tokens';
import { Note, SectionLabel } from '../stories/ui';
import type { MpDialectOffer } from './mpAvailability';

/**
 * What a host chooses for Kurdish Bluff and the Who Am I? race on the phone,
 * in the invite sheet (play/InviteSheet.tsx): only what is offered in the
 * Kurdish chosen above — a language the Bluff cards have real meanings in, a
 * difficulty the identities fill — handed up as the lobby's settings as they
 * change, or null when the game cannot be made in that Kurdish.
 */

export const DIFFICULTY_KEY: Record<GameDifficulty, TranslationKey> = {
  beginner: 'games.solo.difficulty.beginner',
  intermediate: 'games.solo.difficulty.intermediate',
  advanced: 'games.solo.difficulty.advanced',
};

/** A language by the name its own speakers call it. */
export function languageName(code: string): string {
  return APP_LOCALES.find((l) => l.code === code)?.nativeName ?? code;
}

export function BluffChoices({
  offers,
  dialect,
  onChange,
}: {
  offers: readonly MpDialectOffer[];
  dialect: LetterDialect;
  onChange: (settings: Record<string, unknown> | null) => void;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const languages = offers.find((o) => o.dialect === dialect && o.group)?.languages ?? [];
  const [language, setLanguage] = useState<AppLocale | null>(null);
  const [rounds, setRounds] = useState<string>(String(BLUFF_DEFAULT_ROUNDS));
  const [writeSeconds, setWriteSeconds] = useState<string>(String(BLUFF_DEFAULT_WRITE_SECONDS));
  const chosen = language && languages.some((l) => l.language === language) ? language : defaultBluffLanguage(languages, locale);
  useEffect(() => {
    onChange(chosen ? { dialect, language: chosen, rounds: Number(rounds), writeSeconds: Number(writeSeconds) } : null);
  }, [dialect, chosen, rounds, writeSeconds, onChange]);
  if (!chosen) return <Note icon="quotes">{t('games.bluff.notOffered')}</Note>;
  return (
    <>
      <View style={styles.field}>
        <SectionLabel>{t('games.bluff.language')}</SectionLabel>
        <Segmented<string>
          groupLabel={t('games.bluff.language')}
          options={languages.map((l) => l.language)}
          value={chosen}
          onChange={(v) => setLanguage(v as AppLocale)}
          labelOf={languageName}
        />
      </View>
      <View style={styles.field}>
        <SectionLabel>{t('games.bluff.rounds')}</SectionLabel>
        <Segmented<string>
          groupLabel={t('games.bluff.rounds')}
          options={BLUFF_ROUNDS.map(String)}
          value={rounds}
          onChange={setRounds}
          labelOf={(n) => t('games.bluff.roundsCount', { count: Number(n) })}
        />
      </View>
      <View style={styles.field}>
        <SectionLabel>{t('games.bluff.writeTime')}</SectionLabel>
        <Segmented<string>
          groupLabel={t('games.bluff.writeTime')}
          options={BLUFF_WRITE_SECONDS.map(String)}
          value={writeSeconds}
          onChange={setWriteSeconds}
          labelOf={(s) => t('games.lastLetter.seconds', { count: Number(s) })}
        />
      </View>
    </>
  );
}

export function RaceChoices({
  offers,
  dialect,
  onChange,
}: {
  offers: readonly MpDialectOffer[];
  dialect: LetterDialect;
  onChange: (settings: Record<string, unknown> | null) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const difficulties = GAME_DIFFICULTIES.filter((d) => offers.find((o) => o.dialect === dialect && o.group)?.difficulties?.includes(d));
  const [difficulty, setDifficulty] = useState<GameDifficulty | null>(null);
  const [minutes, setMinutes] = useState<string>(String(WHO_AM_I_RACE_DEFAULT_MINUTES));
  const chosen = difficulty && difficulties.includes(difficulty) ? difficulty : (difficulties[0] ?? null);
  useEffect(() => {
    onChange(chosen ? { dialect, difficulty: chosen, minutes: Number(minutes) } : null);
  }, [dialect, chosen, minutes, onChange]);
  if (!chosen) return <Note icon="question">{t('games.whoAmI.notOffered')}</Note>;
  return (
    <>
      <View style={styles.field}>
        <SectionLabel>{t('games.solo.difficulty')}</SectionLabel>
        <Segmented<GameDifficulty> groupLabel={t('games.solo.difficulty')} options={difficulties} value={chosen} onChange={setDifficulty} labelOf={(d) => t(DIFFICULTY_KEY[d])} />
      </View>
      <View style={styles.field}>
        <SectionLabel>{t('games.whoAmI.minutes')}</SectionLabel>
        <Segmented<string>
          groupLabel={t('games.whoAmI.minutes')}
          options={WHO_AM_I_RACE_MINUTES.map(String)}
          value={minutes}
          onChange={setMinutes}
          labelOf={(m) => t('games.whoAmI.minutesCount', { count: Number(m) })}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
});
