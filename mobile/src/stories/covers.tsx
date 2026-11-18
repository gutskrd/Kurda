import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { storyCoverFor } from '@kurda/shared';
import { assetUrl } from '../api/env';
import { radii } from '../theme/tokens';

/**
 * A story's cover: the editor's chosen picture (its `cover` key, one of shared `STORY_COVERS`), or else one of the
 * seven kilims, fixed per story by shared `storyCoverFor` from its slug so every surface shows the same one.
 *
 * Pictures load from the website (`/cosmetics/backgrounds/…`) through `assetUrl` rather than shipping in the app.
 * A plain ground in the rug's main colour shows while loading and if loading fails, never a broken image. Art keeps
 * its own colours in the dark theme; only the frame follows the card.
 */

/** The cover, filling `style`'s box: the story's own picture, or its slug's kilim. */
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
  // The URL that failed, so a story given another picture tries that one.
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
