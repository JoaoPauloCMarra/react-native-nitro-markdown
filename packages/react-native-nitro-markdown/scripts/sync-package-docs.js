"use strict";

const path = require("node:path");
const {
  createPackageDocLifecycle,
  LifecycleError,
} = require("../../../scripts/package-doc-lifecycle.js");

const repoRoot = path.resolve(__dirname, "../../..");
const packageRoot = path.resolve(__dirname, "..");
const lifecycle = createPackageDocLifecycle({
  repoRoot,
  packageRoot,
  entries: [
    { source: "README.md", target: "README.md", persistent: false },
    { source: "CHANGELOG.md", target: "CHANGELOG.md", persistent: false },
    { source: "LICENSE", target: "LICENSE", persistent: false },
    { source: "SECURITY.md", target: "SECURITY.md", persistent: false },
  ],
});

const mode = process.argv[2];
try {
  if (mode === "prepare") lifecycle.prepare();
  else if (mode === "cleanup") lifecycle.cleanup();
  else if (mode === "sync") lifecycle.sync();
  else if (mode === "--check") lifecycle.check();
  else
    throw new LifecycleError(
      "Usage: node scripts/sync-package-docs.js <prepare|cleanup|sync|--check>",
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
