import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { storyCoverFor } from '@kurda/shared';
import { assetUrl } from '../api/env';
import { radii } from '../theme/tokens';

/**
 * A story's cover: the picture the editor chose for it (its `cover` key, one
 * of the shared `STORY_COVERS` — the legends' own paintings and the shop's
 * scenes and kilims, which the admin's picker offers), or, when none was
 * chosen, one of the seven painted kilims, so a shelf of stories never has a
 * blank spine on it (design notes §7). Which kilim is the story's own for
 * good: the shared `storyCoverFor` takes it from the slug, so the library,
 * the story's page and the website all lay the story on the same rug.
 *
 * The pictures are files on the website (`/cosmetics/backgrounds/…`), loaded
 * from there through `assetUrl` as the profile backgrounds are, rather than
 * shipped inside the app a second time. Under the picture is a plain ground
 * in the rug's main colour: that is what the card shows while the picture
 * loads, and what is left if it will not load — a quiet block of a rug's
 * colour, never a broken image and never an empty box.
 *
 * Art colours are the colours of the things drawn, not the interface's: a
 * kilim stays red on the dark theme. Only the frame around the picture is the
 * card's.
 */

/** The cover, drawn to fill `style`'s box: the story's own picture, or the kilim its slug gives it. */
export function StoryCover({
  slug,
  cover,
  style,
  radius = radii.md,
}: {
  slug: string;
  cover: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}): React.JSX.Element {
  const art = storyCoverFor({ slug, cover });
  const uri = assetUrl(art.path);
  // the address that failed, so a story given another picture tries that one
  const [failed, setFailed] = useState<string | null>(null);
  const picture = uri !== null && uri !== failed ? uri : null;
  return (
    <View
      style={[styles.box, { borderRadius: radius, backgroundColor: art.ground }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="story-cover"
    >
      {picture ? (
        <Image source={{ uri: picture }} style={styles.fill} resizeMode="cover" onError={() => setFailed(picture)} accessibilityIgnoresInvertColors />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
});
