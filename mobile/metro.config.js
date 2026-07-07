// Expo Metro config for the monorepo.
//
// The api/shared workspaces use NodeNext resolution, where TypeScript
// sources import each other with '.js' specifiers ("./kurdish-text.js"
// on disk as kurdish-text.ts). Metro resolves specifiers literally, so
// we retry without the '.js' suffix before falling back.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const priorResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const chain = priorResolveRequest ?? context.resolveRequest;
  if ((moduleName.startsWith('./') || moduleName.startsWith('../')) && moduleName.endsWith('.js')) {
    try {
      return chain(context, moduleName.slice(0, -3), platform);
    } catch {
      // fall through to the literal specifier
    }
  }
  return chain(context, moduleName, platform);
};

module.exports = config;
