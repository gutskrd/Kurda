/**
 * Leaving a riddle, its answer or a proverb: back to wherever it was opened from. Opened by a link there is nothing
 * behind it, so it is replaced by its collection, and Back from the list does not return to it.
 */
export function leaveLore(
  navigation: { canGoBack: () => boolean; goBack: () => void; replace: (screen: 'Riddles' | 'Proverbs') => void },
  collection: 'Riddles' | 'Proverbs',
): void {
  if (navigation.canGoBack()) navigation.goBack();
  else navigation.replace(collection);
}
