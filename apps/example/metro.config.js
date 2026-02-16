const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

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

module.exports = config;
