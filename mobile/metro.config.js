// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// npm workspaces hoists deps (expo, react-native, expo-router) to the repo
// root, which is ABOVE this project dir. Metro refuses to serve modules
// outside its root unless we tell it about the workspace.
// https://docs.expo.dev/guides/monorepos/
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

/** @type {import("expo/metro-config").MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Only look in the paths above, so a hoisted copy is not shadowed.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
