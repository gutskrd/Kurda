/**
 * Screens at the website's addresses, for the app's linking (App.tsx), so a link copied from either app opens here.
 * Each keeps the address the phone gave it before as an alias, since old links and notifications still carry them.
 */
export const WEB_PATH_LINKS = {
  Search: { path: 'app/search', alias: ['search'] },
  Lesson: { path: 'app/learn/lesson/:lessonId', alias: ['lesson/:lessonId'] },
  // The colours, numbers, days and months, and one set by name: `app/learn/words/colours?script=ckb`.
  Words: { path: 'app/learn/words', alias: ['app/words'] },
  WordSet: { path: 'app/learn/words/:set', alias: ['app/words/:set'] },
};
