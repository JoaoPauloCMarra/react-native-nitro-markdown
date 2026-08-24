"use strict";

const {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  rename,
  symlink,
  writeFile,
} = require("node:fs/promises");
const path = require("node:path");

const defaultFsOps = {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
};
let fsOps = defaultFsOps;

function setSnapshotFsForTest(overrides = {}) {
  fsOps = { ...defaultFsOps, ...overrides };
}

function resetSnapshotFsForTest() {
  fsOps = defaultFsOps;
}

const MAX_SNAPSHOT_ENTRIES = 100_000;
const MAX_SNAPSHOT_DEPTH = 256;
const MAX_SNAPSHOT_KEY_LENGTH = 4_096;
const MAX_SNAPSHOT_FILE_BYTES = 64 * 1024 * 1024;
const MAX_SNAPSHOT_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_SNAPSHOT_SYMLINK_BYTES = 4_096;

function assertAllowedParent(packageParent) {
  if (typeof packageParent !== "string" || packageParent.length === 0) {
    throw new Error("Snapshot package parent must be a non-empty absolute directory");
  }
  if (packageParent.includes("\0") || !path.isAbsolute(packageParent)) {
    throw new Error("Snapshot package parent must be absolute");
  }

  const normalized = path.resolve(packageParent);
  if (packageParent !== normalized || normalized === path.parse(normalized).root) {
    throw new Error("Snapshot package parent must be a normalized non-root directory");
  }
  return normalized;
}

function assertGeneratedSubdirectory(generatedSubdirectory) {
  if (
    typeof generatedSubdirectory !== "string" ||
    generatedSubdirectory.length === 0 ||
    generatedSubdirectory.includes("\0") ||
    path.isAbsolute(generatedSubdirectory) ||
    path.win32.isAbsolute(generatedSubdirectory) ||
    generatedSubdirectory.startsWith("/") ||
    generatedSubdirectory.startsWith("\\")
  ) {
    throw new Error("Generated snapshot directory must be a strict relative path");
  }

  const segments = generatedSubdirectory.split(/[\\/]/);
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment.length === 0 || segment === "." || segment === "..",
    ) ||
    segments[segments.length - 1] !== "generated"
  ) {
    throw new Error("Generated snapshot directory must end in generated");
  }

  const normalized = segments.join(path.sep);
  if (generatedSubdirectory !== normalized) {
    throw new Error("Generated snapshot directory must use normalized separators");
  }
  if (segments.length > MAX_SNAPSHOT_DEPTH) {
    throw new Error("Generated snapshot directory is too deep");
  }
  return segments;
}

function resolveSnapshotRoot(packageParent, generatedSubdirectory) {
  const parent = assertAllowedParent(packageParent);
  const segments = assertGeneratedSubdirectory(generatedSubdirectory);
  const root = path.resolve(parent, ...segments);
  const relative = path.relative(parent, root);
  if (
    relative.length === 0 ||
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    throw new Error("Generated snapshot directory must stay beneath its package parent");
  }
  return { parent, root, segments };
}

async function assertSafeSnapshotRoot(packageParent, generatedSubdirectory) {
  const resolved = resolveSnapshotRoot(packageParent, generatedSubdirectory);
  let parentStat;
  try {
    parentStat = await fsOps.lstat(resolved.parent);
  } catch (error) {
    throw new Error(`Snapshot package parent is not available: ${resolved.parent}`, {
      cause: error,
    });
  }
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new Error("Snapshot package parent must be a real directory");
  }

  const realParent = await fsOps.realpath(resolved.parent);

  let current = resolved.parent;
  for (const segment of resolved.segments) {
    current = path.join(current, segment);
    let currentStat;
    try {
      currentStat = await fsOps.lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
    if (currentStat.isSymbolicLink()) {
      throw new Error(`Generated snapshot path contains a symlink: ${current}`);
    }
    if (!currentStat.isDirectory()) {
      throw new Error(`Generated snapshot path is not a directory: ${current}`);
    }
    const realCurrent = await fsOps.realpath(current);
    const relative = path.relative(realParent, realCurrent);
    if (
      relative.length === 0 ||
      path.isAbsolute(relative) ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`)
    ) {
      throw new Error("Generated snapshot path escapes its package parent");
    }
  }

  return resolved;
}

function resolveSnapshotEntry(root, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error("Snapshot entry key must be non-empty");
  }
  if (
    relativePath.length > MAX_SNAPSHOT_KEY_LENGTH ||
    relativePath.includes("\0") ||
    path.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    relativePath.startsWith("/") ||
    relativePath.startsWith("\\")
  ) {
    throw new Error(`Unsafe snapshot entry key: ${JSON.stringify(relativePath)}`);
  }

  const segments = relativePath.split(/[\\/]/);
  if (
    segments.length > MAX_SNAPSHOT_DEPTH ||
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new Error(`Unsafe snapshot entry key: ${JSON.stringify(relativePath)}`);
  }

  const target = path.resolve(root, ...segments);
  const relativeToRoot = path.relative(root, target);
  if (
    target === root ||
    relativeToRoot.length === 0 ||
    path.isAbsolute(relativeToRoot) ||
    relativeToRoot === ".." ||
    relativeToRoot.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`Snapshot entry escapes its root: ${JSON.stringify(relativePath)}`);
  }

  return { relativePath, target, segments };
}

function assertMode(mode, label) {
  if (!Number.isSafeInteger(mode) || mode < 0 || mode > 0o7777) {
    throw new Error(`Invalid ${label} mode`);
  }
}

function assertFileBytes(bytes, label, totalBytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error(`Invalid snapshot file bytes: ${label}`);
  }
  if (bytes.byteLength > MAX_SNAPSHOT_FILE_BYTES) {
    throw new Error(`Snapshot file exceeds the per-file byte limit: ${label}`);
  }
  if (totalBytes + bytes.byteLength > MAX_SNAPSHOT_TOTAL_BYTES) {
    throw new Error("Generated directory snapshot exceeds the total byte limit");
  }
  return totalBytes + bytes.byteLength;
}

function validateSnapshot(snapshot, root) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Invalid generated directory snapshot");
  }
  if (typeof snapshot.exists !== "boolean") {
    throw new Error("Invalid generated directory snapshot existence flag");
  }
  assertMode(snapshot.mode, "snapshot");
  if (!(snapshot.entries instanceof Map)) {
    throw new Error("Generated directory snapshot entries must be a Map");
  }
  if (!snapshot.exists && snapshot.entries.size > 0) {
    throw new Error("A missing snapshot root cannot contain entries");
  }
  if (snapshot.entries.size > MAX_SNAPSHOT_ENTRIES) {
    throw new Error("Generated directory snapshot contains too many entries");
  }

  const entries = [];
  const byPath = new Map();
  let totalBytes = 0;
  for (const [key, entry] of snapshot.entries) {
    const resolved = resolveSnapshotEntry(root, key);
    if (byPath.has(resolved.relativePath)) {
      throw new Error(`Duplicate snapshot entry: ${resolved.relativePath}`);
    }
    if (!entry || typeof entry !== "object") {
      throw new Error(`Invalid snapshot entry: ${resolved.relativePath}`);
    }
    if (
      entry.kind !== "directory" &&
      entry.kind !== "file" &&
      entry.kind !== "symlink"
    ) {
      throw new Error(`Invalid snapshot entry kind: ${resolved.relativePath}`);
    }
    assertMode(entry.mode, `snapshot entry ${resolved.relativePath}`);
    if (entry.kind === "file") {
      totalBytes = assertFileBytes(entry.bytes, resolved.relativePath, totalBytes);
    } else if (
      entry.kind === "symlink" &&
      (typeof entry.target !== "string" ||
        entry.target.includes("\0") ||
        Buffer.byteLength(entry.target, "utf8") > MAX_SNAPSHOT_SYMLINK_BYTES)
    ) {
      throw new Error(`Invalid snapshot symlink target: ${resolved.relativePath}`);
    }

    const normalized = { ...resolved, entry };
    entries.push(normalized);
    byPath.set(resolved.relativePath, normalized);
  }

  for (const item of entries) {
    for (let index = 1; index < item.segments.length; index += 1) {
      const parentKey = item.segments.slice(0, index).join(path.sep);
      const parent = byPath.get(parentKey);
      if (!parent) {
        throw new Error(`Snapshot entry is missing its parent directory: ${parentKey}`);
      }
      if (parent.entry.kind !== "directory") {
        throw new Error(`Snapshot entry follows a non-directory: ${parentKey}`);
      }
    }
  }

  return entries;
}

async function snapshotDirectory(packageParent, generatedSubdirectory) {
  const { root } = await assertSafeSnapshotRoot(
    packageParent,
    generatedSubdirectory,
  );
  let rootStat;
  try {
    rootStat = await fsOps.lstat(root);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { exists: false, mode: 0, entries: new Map() };
    }
    throw error;
  }

  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Generated path is not a directory: ${root}`);
  }

  const entries = new Map();
  const pendingDirectories = [""];
  let entryCount = 0;
  let totalBytes = 0;
  while (pendingDirectories.length > 0) {
    const relativeDirectory = pendingDirectories.pop();
    const absoluteDirectory = relativeDirectory
      ? resolveSnapshotEntry(root, relativeDirectory).target
      : root;
    const children = await fsOps.readdir(absoluteDirectory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));

    for (const child of children) {
      entryCount += 1;
      if (entryCount > MAX_SNAPSHOT_ENTRIES) {
        throw new Error("Generated directory contains too many entries");
      }
      const relativePath = relativeDirectory
        ? path.join(relativeDirectory, child.name)
        : child.name;
      const resolved = resolveSnapshotEntry(root, relativePath);
      const childStat = await fsOps.lstat(resolved.target);
      const mode = childStat.mode & 0o7777;

      if (childStat.isDirectory()) {
        entries.set(resolved.relativePath, { kind: "directory", mode });
        if (resolved.segments.length >= MAX_SNAPSHOT_DEPTH) {
          throw new Error("Generated directory is too deep");
        }
        pendingDirectories.push(resolved.relativePath);
      } else if (childStat.isFile()) {
        if (
          !Number.isSafeInteger(childStat.size) ||
          childStat.size > MAX_SNAPSHOT_FILE_BYTES
        ) {
          throw new Error(`Generated file exceeds the per-file byte limit: ${resolved.target}`);
        }
        totalBytes += childStat.size;
        if (totalBytes > MAX_SNAPSHOT_TOTAL_BYTES) {
          throw new Error("Generated directory exceeds the total byte limit");
        }
        const bytes = new Uint8Array(await fsOps.readFile(resolved.target));
        if (bytes.byteLength !== childStat.size) {
          throw new Error(`Generated file changed while being snapshotted: ${resolved.target}`);
        }
        entries.set(resolved.relativePath, { kind: "file", mode, bytes });
      } else if (childStat.isSymbolicLink()) {
        const target = await fsOps.readlink(resolved.target);
        if (Buffer.byteLength(target, "utf8") > MAX_SNAPSHOT_SYMLINK_BYTES) {
          throw new Error(`Generated symlink target is too large: ${resolved.target}`);
        }
        entries.set(resolved.relativePath, {
          kind: "symlink",
          mode,
          target,
        });
      } else {
        throw new Error(`Unsupported generated entry: ${resolved.target}`);
      }
    }
  }

  return {
    exists: true,
    mode: rootStat.mode & 0o7777,
    entries,
  };
}

async function assertNoSymlinkPath(root, target) {
  const relative = path.relative(root, target);
  const segments = relative ? relative.split(path.sep) : [];
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    let currentStat;
    try {
      currentStat = await fsOps.lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (currentStat.isSymbolicLink()) {
      throw new Error(`Refusing to follow symlink while restoring: ${current}`);
    }
    if (!currentStat.isDirectory() && current !== target) {
      throw new Error(`Refusing to traverse non-directory while restoring: ${current}`);
    }
  }
}

async function createSiblingTemporaryDirectory(parent, label) {
  const prefix = path.join(parent, `.${path.basename(parent)}.${label}-`);
  const temporary = await fsOps.mkdtemp(prefix);
  const relative = path.relative(parent, temporary);
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    await fsOps.rm(temporary, { force: true, recursive: true }).catch(() => {});
    throw new Error("Snapshot temporary directory escaped its package parent");
  }
  const temporaryStat = await fsOps.lstat(temporary);
  if (!temporaryStat.isDirectory() || temporaryStat.isSymbolicLink()) {
    await fsOps.rm(temporary, { force: true, recursive: true }).catch(() => {});
    throw new Error("Snapshot temporary directory must be a real directory");
  }
  return temporary;
}

function snapshotTarget(root, segments) {
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    throw new Error("Snapshot entry escaped its temporary root");
  }
  return target;
}

async function buildSnapshotTree(root, snapshot, entries) {
  if (!snapshot.exists) return;
  entries.sort((left, right) => {
    const depthDifference = left.segments.length - right.segments.length;
    return depthDifference || left.relativePath.localeCompare(right.relativePath);
  });

  for (const { segments, entry } of entries) {
    const target = snapshotTarget(root, segments);
    const parent = path.dirname(target);
    await assertNoSymlinkPath(root, parent);
    if (entry.kind === "directory") {
      await fsOps.mkdir(target, { recursive: false, mode: entry.mode });
      await fsOps.chmod(target, entry.mode);
    } else if (entry.kind === "file") {
      await fsOps.writeFile(target, entry.bytes, { mode: entry.mode, flag: "wx" });
      await fsOps.chmod(target, entry.mode);
    } else {
      await fsOps.symlink(entry.target, target);
    }
  }

  await fsOps.chmod(root, snapshot.mode);
}

async function readExistingSnapshotRoot(root) {
  try {
    const rootStat = await fsOps.lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new Error(`Refusing to replace non-directory snapshot root: ${root}`);
    }
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function swapSnapshotRoot(parent, root, temporaryRoot, snapshotExists) {
  let backupRoot;
  let targetMoved = false;
  let temporaryMoved = false;
  let committed = false;

  try {
    if (!snapshotExists) {
      await fsOps.rm(temporaryRoot, { force: true, recursive: true });
      temporaryRoot = undefined;
    }

    const targetExists = await readExistingSnapshotRoot(root);
    if (targetExists) {
      backupRoot = await createSiblingTemporaryDirectory(parent, "snapshot-backup");
      await fsOps.rm(backupRoot, { force: true, recursive: true });
      await fsOps.rename(root, backupRoot);
      targetMoved = true;
    }

    if (snapshotExists) {
      await fsOps.rename(temporaryRoot, root);
      temporaryMoved = true;
      temporaryRoot = undefined;
    }
    committed = true;

    if (backupRoot) {
      await fsOps.rm(backupRoot, { force: true, recursive: true });
      backupRoot = undefined;
    }
  } catch (error) {
    if (!committed && targetMoved && backupRoot) {
      try {
        await fsOps.rename(backupRoot, root);
        backupRoot = undefined;
      } catch (rollbackError) {
        throw new Error("Snapshot restore failed and rollback was not proven", {
          cause: new AggregateError([error, rollbackError]),
        });
      }
    }
    throw error;
  } finally {
    if (temporaryRoot) {
      await fsOps.rm(temporaryRoot, { force: true, recursive: true }).catch(() => {});
    }
    if (committed && backupRoot) {
      await fsOps.rm(backupRoot, { force: true, recursive: true }).catch(() => {});
    }
    if (temporaryMoved) {
      temporaryMoved = false;
    }
  }
}

async function restoreDirectorySnapshot(
  packageParent,
  generatedSubdirectory,
  snapshot,
) {
  const { root } = await assertSafeSnapshotRoot(
    packageParent,
    generatedSubdirectory,
  );
  const entries = validateSnapshot(snapshot, root);
  const temporaryRoot = await createSiblingTemporaryDirectory(
    path.dirname(root),
    "snapshot-restore",
  );
  try {
    await buildSnapshotTree(temporaryRoot, snapshot, entries);
    await swapSnapshotRoot(
      path.dirname(root),
      root,
      temporaryRoot,
      snapshot.exists,
    );
  } catch (error) {
    await fsOps.rm(temporaryRoot, { force: true, recursive: true }).catch(() => {});
    throw error;
  }
}

async function withDirectoryRestored(
  packageParent,
  generatedSubdirectory,
  task,
) {
  const snapshot = await snapshotDirectory(packageParent, generatedSubdirectory);
  try {
    return await task();
  } finally {
    await restoreDirectorySnapshot(packageParent, generatedSubdirectory, snapshot);
  }
}

function snapshotsMatch(expected, actual) {
  if (expected.exists !== actual.exists || expected.mode !== actual.mode) {
    return false;
  }
  if (!expected.exists) return true;
  if (expected.entries.size !== actual.entries.size) return false;

  for (const [relativePath, expectedEntry] of expected.entries) {
    const actualEntry = actual.entries.get(relativePath);
    if (!actualEntry || expectedEntry.kind !== actualEntry.kind) return false;
    if (expectedEntry.mode !== actualEntry.mode) return false;
    if (expectedEntry.kind === "file") {
      if (expectedEntry.bytes.length !== actualEntry.bytes.length) return false;
      for (let index = 0; index < expectedEntry.bytes.length; index += 1) {
        if (expectedEntry.bytes[index] !== actualEntry.bytes[index]) {
          return false;
        }
      }
    } else if (
      expectedEntry.kind === "symlink" &&
      expectedEntry.target !== actualEntry.target
    ) {
      return false;
    }
  }

  return true;
}

function changedFiles(expected, actual) {
  const paths = new Set([
    ...expected.entries.keys(),
    ...actual.entries.keys(),
  ]);
  return [...paths]
    .filter((relativePath) => {
      const expectedEntry = expected.entries.get(relativePath);
      const actualEntry = actual.entries.get(relativePath);
      if (!expectedEntry || !actualEntry) {
        const presentEntry = expectedEntry ?? actualEntry;
        return presentEntry?.kind !== "directory";
      }
      if (
        expectedEntry.kind !== actualEntry.kind ||
        expectedEntry.mode !== actualEntry.mode
      ) {
        if (
          expectedEntry.kind === "directory" &&
          actualEntry.kind === "directory"
        ) {
          return false;
        }
        return true;
      }
      if (expectedEntry.kind === "directory") return false;
      if (expectedEntry.kind === "file") {
        if (expectedEntry.bytes.length !== actualEntry.bytes.length) return true;
        return expectedEntry.bytes.some(
          (value, index) => value !== actualEntry.bytes[index],
        );
      }
      return (
        expectedEntry.kind === "symlink" &&
        expectedEntry.target !== actualEntry.target
      );
    })
    .sort();
}

module.exports = {
  MAX_SNAPSHOT_DEPTH,
  MAX_SNAPSHOT_ENTRIES,
  MAX_SNAPSHOT_FILE_BYTES,
  MAX_SNAPSHOT_KEY_LENGTH,
  MAX_SNAPSHOT_SYMLINK_BYTES,
  MAX_SNAPSHOT_TOTAL_BYTES,
  changedFiles,
  resolveSnapshotRoot,
  restoreDirectorySnapshot,
  snapshotsMatch,
  snapshotDirectory,
  setSnapshotFsForTest,
  resetSnapshotFsForTest,
  withDirectoryRestored,
};
