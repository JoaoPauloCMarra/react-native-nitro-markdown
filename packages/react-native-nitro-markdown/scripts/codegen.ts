#!/usr/bin/env bun

import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const nitrogenArgs = ["--log-level=debug", ...Bun.argv.slice(2)];
const { restoreDirectorySnapshot, snapshotDirectory } = await import(
  "../../../scripts/generated-snapshot.js"
);
const { runProcess } = await import("../../../scripts/process-runner.js");

const before = await snapshotDirectory(packageRoot, "nitrogen/generated");
const result = await runProcess({
  command: "nitrogen",
  args: nitrogenArgs,
  cwd: packageRoot,
  stdio: "inherit",
});

if (!result.ok) {
  await restoreDirectorySnapshot(packageRoot, "nitrogen/generated", before);
  console.error("Nitro codegen failed; generated files were restored.");
  process.exitCode = result.exitCode;
} else {
  process.exitCode = 0;
}
