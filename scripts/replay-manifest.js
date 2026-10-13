const fs = require("node:fs");
const path = require("node:path");

const FLOW_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isOutside(relative) {
  return (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

function inside(root, relativePath) {
  const absolute = path.resolve(root, relativePath);
  if (isOutside(path.relative(path.resolve(root), absolute))) {
    throw new Error(`Replay path escapes the repository: ${relativePath}`);
  }
  if (fs.existsSync(absolute)) {
    const resolved = path.relative(
      fs.realpathSync(root),
      fs.realpathSync(absolute),
    );
    if (isOutside(resolved)) {
      throw new Error(
        `Replay path escapes the repository through a symlink: ${relativePath}`,
      );
    }
  }
  return absolute;
}

function validateSuite(suite, root, seenIds, seenPaths) {
  if (
    !suite ||
    typeof suite.id !== "string" ||
    !FLOW_ID_PATTERN.test(suite.id) ||
    seenIds.has(suite.id) ||
    typeof suite.path !== "string" ||
    !suite.path.startsWith("e2e/") ||
    suite.path.includes("..") ||
    suite.path.includes("\\") ||
    !suite.path.endsWith(".ad") ||
    seenPaths.has(suite.path) ||
    typeof suite.purpose !== "string" ||
    suite.purpose.trim() === "" ||
    (suite.requires !== undefined && suite.requires !== "http-fixture")
  ) {
    throw new Error(
      "Markdown replay manifest contains an invalid or duplicate flow",
    );
  }
  seenIds.add(suite.id);
  seenPaths.add(suite.path);
  const suiteFile = inside(root, suite.path);
  if (!fs.existsSync(suiteFile) || !fs.lstatSync(suiteFile).isFile()) {
    throw new Error(`Replay flow is missing: ${suite.path}`);
  }
  return suiteFile;
}

module.exports = { FLOW_ID_PATTERN, inside, validateSuite };
