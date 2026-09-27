/**
 * A bundled image, as a module.
 *
 * Metro resolves an image import to an asset reference — a number on a phone,
 * an object on the web export — and `ImageSourcePropType` is the union that
 * covers both, which is exactly what an `<Image source>` takes.
 *
 * Without this the only way to reach a bundled picture is `require()`, which
 * the lint config forbids, and which is untyped anyway: `require('./a.png')`
 * and `require('./a.pdf')` have the same type, which is `any`.
 *
 * Expo ships declarations for stylesheets in `expo/types/global.d.ts` and none
 * for images, so this is ours.
 */
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';

  const asset: ImageSourcePropType;
  export default asset;
}

declare module '*.jpg' {
  import type { ImageSourcePropType } from 'react-native';

  const asset: ImageSourcePropType;
  export default asset;
}

declare module '*.webp' {
  import type { ImageSourcePropType } from 'react-native';

  const asset: ImageSourcePropType;
  export default asset;
}
