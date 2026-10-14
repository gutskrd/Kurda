/**
 * Story game views for component tests: one game, "Nanê Germ" in Kurmancî,
 * in whatever state a test says. Shaped as @kurda/shared's StoryGameView, the
 * same thing the API sends.
 */
import type { StoryDetail, StoryGamePlayer, StoryGameStanding, StoryGameView } from '@kurda/shared';

export function player(over: Partial<StoryGamePlayer> = {}): StoryGamePlayer {
  return { seat: 1, name: null, avatarUrl: null, isHost: false, isMe: false, away: false, gone: false, score: 0, correct: 0, ...over };
}

export function standing(over: Partial<StoryGameStanding> = {}): StoryGameStanding {
  return { seat: 1, name: null, avatarUrl: null, isMe: false, score: 0, correct: 0, place: 1, ...over };
}

export function gameView(over: Partial<StoryGameView> = {}, settings: Partial<StoryGameView['settings']> = {}): StoryGameView {
  return {
    id: 'g1',
    code: null,
    mode: 'duo',
    status: 'lobby',
    version: 3,
    serverNow: new Date().toISOString(),
    phaseEndsAt: null,
    readingSoftCapAt: null,
    readingHardCapAt: null,
    settings: {
      storyId: 's1',
      storyTitle: 'Nanê Germ',
      storySlug: 'nane-germ',
      dialect: 'kurmanci',
      level: 1,
      length: 'short',
      questionCount: 5,
      timerSeconds: 0,
      textDuring: 'visible',
      access: 'friends',
      ...settings,
    },
    isHost: false,
    extraTime: false,
    players: [],
    activeCount: 2,
    readingDoneCount: 0,
    answeredCount: 0,
    continuedCount: 0,
    meDoneReading: false,
    meContinued: false,
    question: null,
    reveal: null,
    results: null,
    nextGameId: null,
    ...over,
  };
}

export const NANE_GERM: StoryDetail = {
  id: 's1',
  slug: 'nane-germ',
  title: 'Nanê Germ',
  summary: 'Dayik nan dipêje.',
  dialect: 'kurmanci',
  level: 1,
  length: 'short',
  wordCount: 40,
  readingMinutes: 1,
  fullyNarrated: false,
  paragraphs: ['Dayika min nan dipêje. Nan germ e.', 'Em li ber sobeyê rûdinin.'],
  glossary: [{ term: 'germ', meanings: { en: 'warm' } }],
  audio: {},
};
