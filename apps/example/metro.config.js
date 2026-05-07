const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

const defaultWatchFolders = config.watchFolders ?? [];
const defaultBlockList = config.resolver.blockList;

// Keep Expo defaults and add the monorepo root.
config.watchFolders = Array.from(
  new Set([...defaultWatchFolders, monorepoRoot]),
);

// Let Metro know where to resolve packages from
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Resolve packages from the monorepo
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "react-native-nitro-markdown": path.resolve(
    monorepoRoot,
    "packages/react-native-nitro-markdown/src",
  ),
};

config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList) ? defaultBlockList : [defaultBlockList]).filter(Boolean),
  /node_modules\/react-native-nitro-modules\/android\/\.cxx\/.*/,
];

module.exports = config;
