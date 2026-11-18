import {
  shouldAskStoreReview,
  shouldOfferFeedbackBox,
  type AppFeedbackState,
  type AppPlatform,
} from '@kurda/shared';
import type { GameFinish } from './gameFinished';

/**
 * What to do after a game during this app session. The box and the store prompt never share a session: the API
 * keeps them a day apart across devices, and this module state enforces it from launch until the app closes.
 */
export type AfterGame = 'box' | 'store' | 'nothing';

export class FeedbackSession {
  boxShown = false;
  storeAsked = false;

  decide(input: {
    state: AppFeedbackState | null;
    finish: GameFinish;
    platform: AppPlatform;
    /** The server already never offers it to a minor; this is the phone saying so too. */
    minor: boolean;
  }): AfterGame {
    const { state, finish } = input;
    if (
      !this.boxShown &&
      shouldOfferFeedbackBox({ state, justFinished: true, gaveUp: !!finish.gaveUp, storePromptThisSession: this.storeAsked })
    ) {
      return 'box';
    }
    if (
      !input.minor &&
      !finish.gaveUp &&
      shouldAskStoreReview({
        state,
        platform: input.platform,
        moment: finish.moment,
        feedbackBoxThisSession: this.boxShown,
        storePromptThisSession: this.storeAsked,
      })
    ) {
      return 'store';
    }
    return 'nothing';
  }
}

/** This run of the app. */
export const feedbackSession = new FeedbackSession();
