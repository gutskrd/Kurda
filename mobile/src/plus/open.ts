import { PLUS_ON_SALE } from '@kurda/shared';

/**
 * Whether the Hevalo+ page can be opened: once Hevalo+ is on sale, and in a development build, so the page can be built
 * and looked at before then. Nothing links to it; a pitch for something nobody can buy would only mislead.
 */
export const PLUS_PAGE_OPEN = PLUS_ON_SALE || __DEV__;
