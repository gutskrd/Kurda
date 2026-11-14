/**
 * Leaving a riddle, its answer or a proverb: back to wherever it was opened
 * from. Opened by a link (a friend's challenge) there is nothing behind it,
 * and it leaves to its collection instead, in its place, so Back from the
 * list does not come round to the riddle again.
 */
export function leaveLore(
  navigation: { canGoBack: () => boolean; goBack: () => void; replace: (screen: 'Riddles' | 'Proverbs') => void },
  collection: 'Riddles' | 'Proverbs',
): void {
  if (navigation.canGoBack()) navigation.goBack();
  else navigation.replace(collection);
}
