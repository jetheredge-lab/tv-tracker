// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo's default config already understands this npm-workspaces monorepo: it
// watches the repo root and both workspaces, and resolves node_modules from
// mobile/ and the root. Hand-rolled watchFolders / nodeModulesPaths overrides
// are unnecessary here, and replacing watchFolders actually drops entries.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
