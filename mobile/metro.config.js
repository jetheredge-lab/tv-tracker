// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo's default config already understands this npm-workspaces monorepo: it
// watches the repo root and both workspaces, and resolves node_modules from
// mobile/ and the root. Hand-rolled watchFolders / nodeModulesPaths overrides
// are unnecessary here, and replacing watchFolders actually drops entries.
const config = getDefaultConfig(__dirname);

// zustand 4.5's ESM build (esm/index.mjs, esm/vanilla.mjs) guards its dev
// warnings with `import.meta.env`. On web, package exports pick that ESM entry,
// but Metro emits one classic <script> - so the browser throws "Cannot use
// 'import.meta' outside a module" before React ever mounts and the page stays
// blank. Native is unaffected: it takes the "react-native" export condition,
// which is already CommonJS.
//
// Point zustand at its CommonJS build on web. Note that handing Expo's resolver
// a context with a narrowed `unstable_conditionNames` does NOT work - Expo
// recomputes the condition list per platform and overwrites ours, so the .mjs
// still wins. Resolving the file path ourselves is what actually sticks. Scoped
// to this one package so no other dependency's resolution changes.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest || context.resolveRequest;

  if (platform === 'web' && (moduleName === 'zustand' || moduleName.startsWith('zustand/'))) {
    try {
      // require() conditions never match zustand's "import"/"module" keys, so
      // this lands on the CJS build (index.js, vanilla.js, middleware.js, ...).
      return {
        type: 'sourceFile',
        filePath: require.resolve(moduleName, { paths: [__dirname] }),
      };
    } catch (e) {
      // Subpath without a CJS target - fall through to the default resolver.
    }
  }

  return resolve(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
