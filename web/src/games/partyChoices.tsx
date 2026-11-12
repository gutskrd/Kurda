import { useEffect, useState } from 'react';
import { GAME_DIFFICULTIES, WHO_AM_I_RACE_DEFAULT_MINUTES, WHO_AM_I_RACE_MINUTES, type GameDifficulty, type LetterDialect, type WhoAmIRaceMinutes } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { dialectName } from '../learn/map';
import { ChipRadio } from '../play/ChipRadio';
import type { MpDialectOffer } from './mpAvailability';

/**
 * What a host chooses for the Who Am I? race, as chips in the invite sheet
 * (play/InviteSheet.tsx) and on the game's own page: only what is offered — a
 * dialect the game can be played in, a difficulty the identities fill — with
 * the lobby's settings handed up as they change.
 */

export type RaceOffer = MpDialectOffer & { difficulties?: GameDifficulty[] };

const VARIETY: Record<LetterDialect, 'kurmanci' | 'sorani'> = { kmr: 'kurmanci', ckb: 'sorani' };

export const DIFFICULTY_KEY: Record<GameDifficulty, MessageKey> = {
  beginner: 'games.solo.difficulty.beginner',
  intermediate: 'games.solo.difficulty.intermediate',
  advanced: 'games.solo.difficulty.advanced',
};

/** The dialect to start from: the learner's own when it is offered, else the first that is. */
function firstDialect(offered: readonly LetterDialect[], preferred: LetterDialect): LetterDialect | null {
  return offered.includes(preferred) ? preferred : (offered[0] ?? null);
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
