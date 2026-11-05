import { useEffect, useState } from 'react';
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
  type BluffLanguageCount,
  type BluffRounds,
  type BluffWriteSeconds,
  type GameDifficulty,
  type LetterDialect,
  type WhoAmIRaceMinutes,
} from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { dialectName } from '../learn/map';
import { ChipRadio } from '../play/ChipRadio';
import type { MpDialectOffer } from './mpAvailability';

/**
 * What a host chooses for Kurdish Bluff and the Who Am I? race, as chips in
 * the invite sheet (play/InviteSheet.tsx) and on each game's own page: only
 * what is offered — a dialect the game can be played in, a language the
 * Bluff cards have real meanings in, a difficulty the identities fill — each
 * with the lobby's settings handed up as they change.
 */

export type BluffOffer = MpDialectOffer & { languages?: BluffLanguageCount[] };
export type RaceOffer = MpDialectOffer & { difficulties?: GameDifficulty[] };

const VARIETY: Record<LetterDialect, 'kurmanci' | 'sorani'> = { kmr: 'kurmanci', ckb: 'sorani' };

export const DIFFICULTY_KEY: Record<GameDifficulty, MessageKey> = {
  beginner: 'games.solo.difficulty.beginner',
  intermediate: 'games.solo.difficulty.intermediate',
  advanced: 'games.solo.difficulty.advanced',
};

/** A language by the name its own speakers call it. */
export function languageName(code: string): string {
  return APP_LOCALES.find((l) => l.code === code)?.nativeName ?? code;
}

/** The dialect to start from: the learner's own when it is offered, else the first that is. */
function firstDialect(offered: readonly LetterDialect[], preferred: LetterDialect): LetterDialect | null {
  return offered.includes(preferred) ? preferred : (offered[0] ?? null);
}

export function BluffChoices({
  offers,
  preferred,
  onChange,
}: {
  offers: readonly BluffOffer[];
  preferred: LetterDialect;
  onChange: (settings: Record<string, unknown> | null) => void;
}): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const open = offers.filter((o) => o.group && (o.languages?.length ?? 0) > 0);
  const [dialect, setDialect] = useState<LetterDialect | null>(null);
  const [language, setLanguage] = useState<AppLocale | null>(null);
  const [rounds, setRounds] = useState<BluffRounds>(BLUFF_DEFAULT_ROUNDS);
  const [writeSeconds, setWriteSeconds] = useState<BluffWriteSeconds>(BLUFF_DEFAULT_WRITE_SECONDS);
  const chosenDialect = dialect && open.some((o) => o.dialect === dialect) ? dialect : firstDialect(open.map((o) => o.dialect), preferred);
  const languages = open.find((o) => o.dialect === chosenDialect)?.languages ?? [];
  const chosenLanguage = language && languages.some((l) => l.language === language) ? language : defaultBluffLanguage(languages, locale);
  useEffect(() => {
    onChange(chosenDialect && chosenLanguage ? { dialect: chosenDialect, language: chosenLanguage, rounds, writeSeconds } : null);
  }, [chosenDialect, chosenLanguage, rounds, writeSeconds, onChange]);
  if (!chosenDialect) return <p className="story-setup-note">{t('games.bluff.notOffered')}</p>;
  return (
    <>
      {open.length > 1 && (
        <ChipRadio
          label={t('games.dialect')}
          value={chosenDialect}
          onChange={setDialect}
          options={open.map((o) => ({ value: o.dialect, label: dialectName(VARIETY[o.dialect]) }))}
        />
      )}
      {chosenLanguage && (
        <ChipRadio
          label={t('games.bluff.language')}
          value={chosenLanguage}
          onChange={setLanguage}
          options={languages.map((l) => ({ value: l.language, label: languageName(l.language) }))}
        />
      )}
      <ChipRadio
        label={t('games.bluff.rounds')}
        value={rounds}
        onChange={setRounds}
        options={BLUFF_ROUNDS.map((n) => ({ value: n, label: t('games.bluff.roundsCount', { count: n }) }))}
      />
      <ChipRadio
        label={t('games.bluff.writeTime')}
        value={writeSeconds}
        onChange={setWriteSeconds}
        options={BLUFF_WRITE_SECONDS.map((sec) => ({ value: sec, label: t('games.lastLetter.seconds', { count: sec }) }))}
      />
    </>
  );
}

export function RaceChoices({
  offers,
  preferred,
  onChange,
}: {
  offers: readonly RaceOffer[];
  preferred: LetterDialect;
  onChange: (settings: Record<string, unknown> | null) => void;
}): React.JSX.Element | null {
  const t = useT();
  const open = offers.filter((o) => o.group && (o.difficulties?.length ?? 0) > 0);
  const [dialect, setDialect] = useState<LetterDialect | null>(null);
  const [difficulty, setDifficulty] = useState<GameDifficulty | null>(null);
  const [minutes, setMinutes] = useState<WhoAmIRaceMinutes>(WHO_AM_I_RACE_DEFAULT_MINUTES);
  const chosenDialect = dialect && open.some((o) => o.dialect === dialect) ? dialect : firstDialect(open.map((o) => o.dialect), preferred);
  const difficulties = GAME_DIFFICULTIES.filter((d) => open.find((o) => o.dialect === chosenDialect)?.difficulties?.includes(d));
  const chosenDifficulty = difficulty && difficulties.includes(difficulty) ? difficulty : (difficulties[0] ?? null);
  useEffect(() => {
    onChange(chosenDialect && chosenDifficulty ? { dialect: chosenDialect, difficulty: chosenDifficulty, minutes } : null);
  }, [chosenDialect, chosenDifficulty, minutes, onChange]);
  if (!chosenDialect || !chosenDifficulty) return <p className="story-setup-note">{t('games.whoAmI.notOffered')}</p>;
  return (
    <>
      {open.length > 1 && (
        <ChipRadio
          label={t('games.dialect')}
          value={chosenDialect}
          onChange={setDialect}
          options={open.map((o) => ({ value: o.dialect, label: dialectName(VARIETY[o.dialect]) }))}
        />
      )}
      <ChipRadio
        label={t('games.solo.difficulty')}
        value={chosenDifficulty}
        onChange={setDifficulty}
        options={difficulties.map((d) => ({ value: d, label: t(DIFFICULTY_KEY[d]) }))}
      />
      <ChipRadio
        label={t('games.whoAmI.minutes')}
        value={minutes}
        onChange={setMinutes}
        options={WHO_AM_I_RACE_MINUTES.map((m) => ({ value: m, label: t('games.whoAmI.minutesCount', { count: m }) }))}
      />
    </>
  );
}
