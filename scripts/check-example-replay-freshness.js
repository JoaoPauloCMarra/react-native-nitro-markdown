const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const manifestRelativePath = "e2e/markdown-replay-coverage.json";
const lockRelativePath = "e2e/markdown-replay-source-lock.json";
const sourceExtensions = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".gradle",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".json",
  ".kt",
  ".m",
  ".mm",
  ".plist",
  ".podspec",
  ".pro",
  ".properties",
  ".swift",
  ".ts",
  ".tsx",
  ".xml",
]);
const assetExtensions = new Set([
  ".gif",
  ".jpg",
  ".jpeg",
  ".otf",
  ".png",
  ".svg",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
]);
const excludedDirectoryNames = new Set([
  ".cache",
  ".cxx",
  ".expo",
  ".git",
  ".gradle",
  ".turbo",
  "__tests__",
  "build",
  "cache",
  "coverage",
  "dist",
  "lib",
  "node_modules",
  "Pods",
  "test",
  "tests",
  "type-tests",
]);
const runtimeDirectoryRules = [
  { path: "packages/react-native-nitro-markdown/src", kind: "source" },
  {
    path: "packages/react-native-nitro-markdown/android/src/main",
    kind: "source",
  },
  { path: "packages/react-native-nitro-markdown/cpp", kind: "source" },
  {
    path: "packages/react-native-nitro-markdown/nitrogen/generated",
    kind: "source",
  },
  { path: "apps/example", kind: "example" },
];
const runtimeFileRules = [
  "package.json",
  "bun.lock",
  "packages/react-native-nitro-markdown/android/CMakeLists.txt",
  "packages/react-native-nitro-markdown/android/build.gradle",
  "packages/react-native-nitro-markdown/android/gradle.properties",
  "packages/react-native-nitro-markdown/android/proguard-rules.pro",
  "packages/react-native-nitro-markdown/app.plugin.js",
  "packages/react-native-nitro-markdown/nitro.json",
  "packages/react-native-nitro-markdown/package.json",
  "packages/react-native-nitro-markdown/react-native-nitro-markdown.podspec",
  "apps/example/app.config.js",
  "apps/example/babel.config.js",
  "apps/example/metro.config.js",
  "apps/example/package.json",
  "apps/example/tsconfig.json",
];

function inside(root, relativePath) {
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(path.resolve(root), absolute);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `Replay coverage path escapes the repository: ${relativePath}`,
    );
  }
  if (fs.existsSync(absolute)) {
    const resolved = path.relative(
      fs.realpathSync(root),
      fs.realpathSync(absolute),
    );
    if (
      resolved === ".." ||
      resolved.startsWith(`..${path.sep}`) ||
      path.isAbsolute(resolved)
    ) {
      throw new Error(
        `Replay coverage path escapes the repository through a symlink: ${relativePath}`,
      );
    }
  }
  return absolute;
}

function isSecretPath(relativePath) {
  const basename = path.posix.basename(relativePath);
  return (
    /^\.env(?:\.|$)/i.test(basename) ||
    /\.(?:key|pem|p12|pfx|mobileprovision|provisionprofile)$/i.test(basename)
  );
}

function collectDirectoryFiles(root, relativeDirectory, kind) {
  const absoluteDirectory = inside(root, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  const files = [];
  const visit = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (kind === "example" && directory === absoluteDirectory && ["android", "ios"].includes(entry.name)) continue;
        if (!excludedDirectoryNames.has(entry.name)) visit(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (isSecretPath(relative)) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (kind === "asset" || (kind === "example" && assetExtensions.has(extension))) {
        if (assetExtensions.has(extension)) files.push(relative);
        continue;
      }
      if (!sourceExtensions.has(extension)) continue;
      if (/\.(?:spec|test)\.[^.]+$/i.test(entry.name)) continue;
      if (
        /(?:Test|Tests)\.(?:c|cc|cpp|h|hpp|m|mm|kt|java|swift)$/.test(
          entry.name,
        )
      )
        continue;
      files.push(relative);
    }
  };
  visit(absoluteDirectory);
  return files;
}

function dropGitIgnored(root, files) {
  if (files.length === 0) return files;
  const result = spawnSync("git", ["check-ignore", "--stdin", "-z"], {
    cwd: root,
    input: files.join("\0"),
    encoding: "utf8",
  });
  if (result.status !== 0) return files;
  const ignored = new Set(result.stdout.split("\0").filter(Boolean));
  return files.filter((file) => !ignored.has(file));
}

function collectRuntimeFiles(root) {
  const absoluteRoot = path.resolve(root);
  const files = new Set();
  for (const rule of runtimeDirectoryRules) {
    for (const file of collectDirectoryFiles(
      absoluteRoot,
      rule.path,
      rule.kind,
    )) {
      files.add(file);
    }
  }
  for (const relativePath of runtimeFileRules) {
    const filePath = inside(absoluteRoot, relativePath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      files.add(relativePath);
    }
  }
  return dropGitIgnored(absoluteRoot, [...files].sort());
}

function hashFiles(root, relativePaths) {
  const hash = createHash("sha256");
  for (const relativePath of relativePaths) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(inside(root, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function hasTestId(source, id) {
  return source.includes(`testID="${id}"`) ||
    [...source.matchAll(/testID=\{([^{}]+)\}/g)].some((match) =>
      match[1].includes(JSON.stringify(id)),
    );
}

function readCoverageManifest(root, manifestPath = manifestRelativePath) {
  const absoluteRoot = path.resolve(root);
  const manifestFile = inside(absoluteRoot, manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (
    manifest.version !== 1 ||
    manifest.entry !== "scripts/run-example-replay.js"
  ) {
    throw new Error(
      "Markdown replay coverage manifest must use version 1 and name its runner",
    );
  }
  if (
    !Array.isArray(manifest.suites) ||
    manifest.suites.length === 0 ||
    !Array.isArray(manifest.features) ||
    manifest.features.length === 0 ||
    !Array.isArray(manifest.pending) ||
    manifest.pending.length === 0
  ) {
    throw new Error(
      "Markdown replay manifest must list flows, replay assertions, and pending prerequisites",
    );
  }

  const suiteIds = new Set();
  const suitePaths = new Set();
  const suiteFiles = new Map();
  for (const suite of manifest.suites) {
    if (
      !suite ||
      typeof suite.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(suite.id) ||
      suiteIds.has(suite.id) ||
      typeof suite.path !== "string" ||
      !suite.path.startsWith("e2e/") ||
      suite.path.includes("..") ||
      suite.path.includes("\\") ||
      !suite.path.endsWith(".ad") ||
      suitePaths.has(suite.path) ||
      typeof suite.purpose !== "string" ||
      suite.purpose.trim() === ""
    ) {
      throw new Error(
        "Markdown replay manifest contains an invalid or duplicate flow",
      );
    }
    suiteIds.add(suite.id);
    suitePaths.add(suite.path);
    const suiteFile = inside(absoluteRoot, suite.path);
    if (!fs.existsSync(suiteFile) || !fs.lstatSync(suiteFile).isFile()) {
      throw new Error(`Replay flow is missing: ${suite.path}`);
    }
    const source = fs.readFileSync(suiteFile, "utf8");
    const commands = source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));
    if (commands.at(-1) !== "close") {
      throw new Error(
        `${suite.path} must close its app flow as its final command`,
      );
    }
    suiteFiles.set(suite.path, source);
  }

  const featureIds = new Set();
  for (const feature of manifest.features) {
    if (
      !feature ||
      typeof feature.id !== "string" ||
      !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(feature.id) ||
      featureIds.has(feature.id)
    ) {
      throw new Error(
        `Replay feature has a missing or duplicate semantic id: ${feature?.id}`,
      );
    }
    featureIds.add(feature.id);
    const suite = suiteFiles.get(feature.suite);
    if (!suite) {
      throw new Error(`${feature.id} names a flow outside the manifest`);
    }
    if (
      feature.coverage !== "replay-asserted" ||
      !["public-api", "test-adapter", "visual-only", "coverage-state"].includes(
        feature.kind,
      ) ||
      typeof feature.transport !== "string" ||
      feature.transport.trim() === ""
    ) {
      throw new Error(
        `${feature.id} must state its coverage, surface, and transport`,
      );
    }
    if (
      ["test-adapter", "visual-only", "coverage-state"].includes(
        feature.kind,
      ) &&
      !feature.claimLimit
    ) {
      throw new Error(
        `${feature.id} must state the limit of its coverage claim`,
      );
    }
    if (
      typeof feature.source !== "string" ||
      !feature.source.startsWith("apps/example/")
    ) {
      throw new Error(`${feature.id} must point at an example source file`);
    }
    const sourcePath = inside(absoluteRoot, feature.source);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      throw new Error(`${feature.id} source is missing: ${feature.source}`);
    }
    const source = fs.readFileSync(sourcePath, "utf8");
    for (const [name, value] of [
      ["statusId", feature.statusId],
      ["expectedText", feature.expectedText],
      ["assertion", feature.assertion],
    ]) {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`${feature.id} has no ${name}`);
      }
    }
    if (!source.includes(feature.assertion)) {
      throw new Error(
        `${feature.id} public assertion is missing from ${feature.source}`,
      );
    }
    const statusSourcePath = feature.statusSource ?? feature.source;
    if (
      typeof statusSourcePath !== "string" ||
      !statusSourcePath.startsWith("apps/example/")
    ) {
      throw new Error(`${feature.id} has an unsafe status source`);
    }
    const absoluteStatusSource = inside(absoluteRoot, statusSourcePath);
    if (
      !fs.existsSync(absoluteStatusSource) ||
      !fs.statSync(absoluteStatusSource).isFile()
    ) {
      throw new Error(
        `${feature.id} status source is missing: ${statusSourcePath}`,
      );
    }
    const statusSource = fs.readFileSync(absoluteStatusSource, "utf8");
    if (!hasTestId(statusSource, feature.statusId)) {
      throw new Error(
        `${feature.id} status id is missing from ${statusSourcePath}`,
      );
    }
    if (feature.controlId) {
      if (!hasTestId(source, feature.controlId)) {
        throw new Error(
          `${feature.id} control is missing from ${feature.source}`,
        );
      }
      if (!suite.includes(`press id="${feature.controlId}"`)) {
        throw new Error(
          `${feature.id} control is not pressed in ${feature.suite}`,
        );
      }
    } else if (feature.trigger !== "screen-load") {
      throw new Error(
        `${feature.id} must name a control or screen-load trigger`,
      );
    }
    if (!suite.includes(`wait id="${feature.statusId}"`)) {
      throw new Error(
        `${feature.id} status is not observed in ${feature.suite}`,
      );
    }
    if (!suite.includes(`wait text "${feature.expectedText}"`)) {
      throw new Error(
        `${feature.id} expected text is missing from ${feature.suite}`,
      );
    }
  }

  for (const pending of manifest.pending) {
    if (
      !pending ||
      typeof pending.id !== "string" ||
      !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(pending.id) ||
      featureIds.has(pending.id)
    ) {
      throw new Error(
        `Pending row has a missing or duplicate semantic id: ${pending?.id}`,
      );
    }
    featureIds.add(pending.id);
    if (
      pending.state !== "pending-prerequisites" ||
      typeof pending.reason !== "string" ||
      pending.reason.trim() === "" ||
      !Array.isArray(pending.prerequisites) ||
      pending.prerequisites.length === 0 ||
      pending.prerequisites.some(
        (prerequisite) =>
          typeof prerequisite !== "string" || prerequisite.trim() === "",
      ) ||
      typeof pending.acceptance !== "string" ||
      pending.acceptance.trim() === "" ||
      Object.hasOwn(pending, "expectedText")
    ) {
      throw new Error(
        `${pending.id} must remain pending with concrete prerequisites and acceptance`,
      );
    }
  }

  return {
    manifest,
    manifestFile,
    suiteFiles,
    suitePaths: manifest.suites.map((suite) => suite.path),
  };
}

function createExpectedLock(root, options = {}) {
  const manifestPath = options.manifestPath ?? manifestRelativePath;
  const { manifest, suitePaths } = readCoverageManifest(root, manifestPath);
  const runtimeFiles = collectRuntimeFiles(root);
  const replayFiles = [manifestPath, ...suitePaths].sort();
  return {
    version: 1,
    runtimeSourceSha256: hashFiles(root, runtimeFiles),
    runtimeSourceFiles: runtimeFiles,
    replayInputsSha256: hashFiles(root, replayFiles),
    replayInputs: replayFiles,
    suites: manifest.suites.map((suite) => suite.id),
  };
}

function checkReplayFreshness({
  root = process.cwd(),
  manifestPath = manifestRelativePath,
  lockPath = lockRelativePath,
} = {}) {
  let expected;
  try {
    expected = createExpectedLock(root, { manifestPath });
  } catch (error) {
    return {
      fresh: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  const absoluteLockPath = inside(root, lockPath);
  if (!fs.existsSync(absoluteLockPath)) {
    return { fresh: false, expected, reason: "source lock is missing" };
  }
  let actual;
  try {
    actual = JSON.parse(fs.readFileSync(absoluteLockPath, "utf8"));
  } catch {
    return { fresh: false, expected, reason: "source lock is invalid JSON" };
  }
  const fresh = JSON.stringify(actual) === JSON.stringify(expected);
  return {
    fresh,
    expected,
    actual,
    reason: fresh
      ? undefined
      : "runtime source, replay flow, or coverage manifest changed",
  };
}

function refreshReplayLock({
  root = process.cwd(),
  manifestPath = manifestRelativePath,
  lockPath = lockRelativePath,
} = {}) {
  const expected = createExpectedLock(root, { manifestPath });
  const absoluteLockPath = inside(root, lockPath);
  fs.mkdirSync(path.dirname(absoluteLockPath), { recursive: true });
  fs.writeFileSync(absoluteLockPath, `${JSON.stringify(expected, null, 2)}\n`);
  return expected;
}

function main(argv) {
  if (
    argv.length > 1 ||
    (argv[0] && argv[0] !== "--check" && argv[0] !== "--refresh")
  ) {
    throw new Error(
      "Usage: bun scripts/check-example-replay-freshness.js [--check|--refresh]",
    );
  }
  if (argv[0] === "--refresh") {
    const lock = refreshReplayLock();
    process.stdout.write(
      `Markdown replay source lock refreshed for ${lock.runtimeSourceFiles.length} runtime files and ${lock.suites.length} flows.\n`,
    );
    return 0;
  }
  const result = checkReplayFreshness();
  if (!result.fresh) {
    process.stderr.write(
      `Markdown replay source lock is stale: ${result.reason}. Review the affected app assertion, flow, and coverage rows before refreshing the lock.\n`,
    );
    return 1;
  }
  process.stdout.write(
    `Markdown replay source lock is current for ${result.expected.runtimeSourceFiles.length} runtime files and ${result.expected.suites.length} flows.\n`,
  );
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

module.exports = {
  hasTestId,
  checkReplayFreshness,
  collectRuntimeFiles,
  readCoverageManifest,
  refreshReplayLock,
};
