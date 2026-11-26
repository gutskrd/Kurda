/** The little of jsdom that scripts/prerender.ts uses: a document and its window. */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html: string, options?: { url?: string; pretendToBeVisual?: boolean });
    readonly window: unknown;
  }
}
