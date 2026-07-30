#!/usr/bin/env bun

import { Glob } from "bun";

const projectRoot = new URL("..", import.meta.url).pathname;
const generatedPattern =
  "packages/react-native-nitro-markdown/nitrogen/generated/**/*";
const timeoutMs = 60_000;

async function snapshotGeneratedFiles(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const glob = new Glob(generatedPattern);

  for await (const path of glob.scan({
    cwd: projectRoot,
    onlyFiles: true,
  })) {
    files.set(path, await Bun.file(`${projectRoot}${path}`).text());
  }

  return files;
}

async function runCodegen(): Promise<void> {
  const startedAt = Date.now();
  console.log("[1/2] Running Nitro codegen");
  const child = Bun.spawn(["bun", "run", "codegen"], {
    cwd: projectRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  const timeout = setTimeout(() => child.kill(), timeoutMs);
  const exitCode = await child.exited;
  clearTimeout(timeout);

  if (exitCode !== 0) {
    process.exit(exitCode);
  }

  console.log(`[1/2] Codegen passed in ${Date.now() - startedAt}ms`);
}

function changedFiles(
  before: Map<string, string>,
  after: Map<string, string>,
): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths]
    .filter((path) => before.get(path) !== after.get(path))
    .sort();
}

const before = await snapshotGeneratedFiles();
await runCodegen();
console.log("[2/2] Checking generated output");
const after = await snapshotGeneratedFiles();
const changes = changedFiles(before, after);

if (changes.length > 0) {
  console.error("Nitro codegen changed generated bindings:");
  for (const path of changes) {
    console.error(`  ${path}`);
  }
  process.exit(1);
}

console.log(`[2/2] ${after.size} generated files unchanged`);
