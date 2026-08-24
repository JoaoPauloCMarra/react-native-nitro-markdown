"use strict";

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

class LifecycleError extends Error {}

const STATE_DIRECTORY = ".pack-docs-state";
const LOCK_DIRECTORY = ".lock";
const LOCK_OWNER_FILE = "owner.json";
const LOCK_TTL_MS = 60_000;
const OPEN_NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;
const MAX_TEMP_ATTEMPTS = 16;
const STATE_TEMP_PATTERN = /^\.manifest-[0-9]+-[0-9]+-[a-f0-9]+\.tmp$/;

function createPackageDocLifecycle({
  repoRoot,
  packageRoot,
  entries,
  stateDirectory = STATE_DIRECTORY,
}) {
  if (stateDirectory !== STATE_DIRECTORY) {
    throw new LifecycleError(
      `Lifecycle state directory must be the fixed child ${STATE_DIRECTORY}`,
    );
  }

  const repoPath = path.resolve(repoRoot);
  const packagePath = path.resolve(packageRoot);
  const packageRelative = path.relative(repoPath, packagePath);
  if (
    packageRelative === "" ||
    packageRelative === ".." ||
    packageRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(packageRelative)
  ) {
    throw new LifecycleError(
      `Package root must be a child of the repository root: ${packagePath}`,
    );
  }

  const repoIdentity = assertInitialDirectory(repoPath, "Repository root");
  const packageIdentity = path.resolve(repoIdentity, packageRelative);
  assertInitialPackageRoot(packagePath, packageIdentity);

  const normalizedEntries = entries.map((entry) => ({
    source: normalizeRelative(entry.source, "source"),
    target: normalizeRelative(entry.target, "target"),
    persistent: entry.persistent !== false,
    copy: entry.copy !== false,
  }));
  const allowedTargets = new Set(
    normalizedEntries.map((entry) => entry.target),
  );
  if (allowedTargets.size !== normalizedEntries.length) {
    throw new LifecycleError("Package doc targets must be unique");
  }

  const stateRoot = path.join(packagePath, STATE_DIRECTORY);
  const manifestPath = path.join(stateRoot, "manifest.json");
  const lockPath = path.join(stateRoot, LOCK_DIRECTORY);
  const lockOwnerPath = path.join(lockPath, LOCK_OWNER_FILE);
  let activeOwner = null;

  function tryLstat(absolutePath) {
    try {
      return fs.lstatSync(absolutePath);
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      throw error;
    }
  }

  function assertDirectoryChain(absolutePath, label, allowMissingFinal) {
    const resolved = path.resolve(absolutePath);
    const parsed = path.parse(resolved);
    let current = parsed.root;
    const segments = resolved
      .slice(parsed.root.length)
      .split(path.sep)
      .filter(Boolean);
    for (const segment of segments) {
      current = path.join(current, segment);
      const stat = tryLstat(current);
      if (!stat) {
        if (current === resolved && allowMissingFinal) return;
        return;
      }
      if (stat.isSymbolicLink()) {
        throw new LifecycleError(`${label} ancestor is a symlink: ${current}`);
      }
      if (!stat.isDirectory()) {
        throw new LifecycleError(
          `${label} ancestor is not a directory: ${current}`,
        );
      }
    }
  }

  function assertInitialDirectory(absolutePath, label) {
    assertDirectoryChain(absolutePath, label, false);
    const stat = tryLstat(absolutePath);
    if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
      throw new LifecycleError(
        `${label} is not a real directory: ${absolutePath}`,
      );
    }
    const identity = fs.realpathSync.native(absolutePath);
    if (identity !== absolutePath) {
      throw new LifecycleError(`${label} is not canonical: ${absolutePath}`);
    }
    return identity;
  }

  function assertInitialPackageRoot(absolutePath, expectedIdentity) {
    assertDirectoryChain(absolutePath, "Package root", true);
    const stat = tryLstat(absolutePath);
    if (!stat) return;
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new LifecycleError(
        `Package root is not a real directory: ${absolutePath}`,
      );
    }
    if (fs.realpathSync.native(absolutePath) !== expectedIdentity) {
      throw new LifecycleError(
        `Package root identity changed: ${absolutePath}`,
      );
    }
  }

  function assertAnchoredRoots() {
    assertDirectoryChain(repoPath, "Repository root", false);
    const currentRepo = tryLstat(repoPath);
    if (
      !currentRepo ||
      !currentRepo.isDirectory() ||
      currentRepo.isSymbolicLink() ||
      fs.realpathSync.native(repoPath) !== repoIdentity
    ) {
      throw new LifecycleError(`Repository root identity changed: ${repoPath}`);
    }
    assertDirectoryChain(packagePath, "Package root", true);
    const currentPackage = tryLstat(packagePath);
    if (currentPackage) {
      if (
        !currentPackage.isDirectory() ||
        currentPackage.isSymbolicLink() ||
        fs.realpathSync.native(packagePath) !== packageIdentity
      ) {
        throw new LifecycleError(
          `Package root identity changed: ${packagePath}`,
        );
      }
    }
  }

  function assertRootIdentity(root) {
    const resolved = path.resolve(root);
    if (resolved === repoPath) {
      const stat = tryLstat(repoPath);
      if (
        !stat ||
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        fs.realpathSync.native(repoPath) !== repoIdentity
      ) {
        throw new LifecycleError(
          `Repository root identity changed: ${repoPath}`,
        );
      }
      return;
    }
    if (resolved === packagePath) {
      const stat = tryLstat(packagePath);
      if (
        !stat ||
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        fs.realpathSync.native(packagePath) !== packageIdentity
      ) {
        throw new LifecycleError(
          `Package root identity changed: ${packagePath}`,
        );
      }
      return;
    }
    throw new LifecycleError(`Unsupported lifecycle root: ${resolved}`);
  }

  function assertInside(root, candidate, label) {
    const relativePath = path.relative(root, candidate);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      throw new LifecycleError(
        `${label} escapes its allowed root: ${candidate}`,
      );
    }
  }

  function assertSafeParent(
    absolutePath,
    root = packagePath,
    label = "Package doc",
  ) {
    assertAnchoredRoots();
    const resolvedRoot = path.resolve(root);
    const resolvedPath = path.resolve(absolutePath);
    assertRootIdentity(resolvedRoot);
    assertInside(resolvedRoot, resolvedPath, label);
    if (resolvedPath === resolvedRoot) return;
    const parent = path.dirname(resolvedPath);
    assertInside(resolvedRoot, parent, `${label} parent`);
    const relativeParent = path.relative(resolvedRoot, parent);
    let current = resolvedRoot;
    for (const segment of relativeParent
      ? relativeParent.split(path.sep)
      : []) {
      current = path.join(current, segment);
      const stat = tryLstat(current);
      if (!stat) continue;
      if (stat.isSymbolicLink()) {
        throw new LifecycleError(`${label} parent is a symlink: ${current}`);
      }
      if (!stat.isDirectory()) {
        throw new LifecycleError(
          `${label} parent is not a directory: ${current}`,
        );
      }
    }
  }

  function ensureDirectoryPath(directory, root = packagePath, mode = 0o755) {
    const resolvedRoot = path.resolve(root);
    const resolvedDirectory = path.resolve(directory);
    assertRootIdentity(resolvedRoot);
    assertInside(resolvedRoot, resolvedDirectory, "Directory");
    const relativeDirectory = path.relative(resolvedRoot, resolvedDirectory);
    let current = resolvedRoot;
    for (const segment of relativeDirectory
      ? relativeDirectory.split(path.sep)
      : []) {
      current = path.join(current, segment);
      const existing = tryLstat(current);
      if (!existing) {
        try {
          fs.mkdirSync(current, { mode, recursive: false });
        } catch (error) {
          if (!error || error.code !== "EEXIST") throw error;
        }
      }
      const stat = tryLstat(current);
      if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new LifecycleError(`Directory path is unsafe: ${current}`);
      }
    }
    assertSafeParent(resolvedDirectory, resolvedRoot, "Directory");
  }

  function ensureStateRoot() {
    assertAnchoredRoots();
    const packageStat = tryLstat(packagePath);
    if (!packageStat) {
      const parent = path.dirname(packagePath);
      assertRootIdentity(repoPath);
      if (parent !== repoPath) {
        throw new LifecycleError(
          `Package root parent is not anchored: ${parent}`,
        );
      }
      try {
        fs.mkdirSync(packagePath, { mode: 0o755, recursive: false });
      } catch (error) {
        if (!error || error.code !== "EEXIST") throw error;
      }
      const created = tryLstat(packagePath);
      if (
        !created ||
        created.isSymbolicLink() ||
        !created.isDirectory() ||
        fs.realpathSync.native(packagePath) !== packageIdentity
      ) {
        throw new LifecycleError(
          `Package root identity changed: ${packagePath}`,
        );
      }
    }
    ensureDirectoryPath(stateRoot, packagePath, 0o700);
    const stat = tryLstat(stateRoot);
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new LifecycleError(
        `Lifecycle state path is not a private directory: ${stateRoot}`,
      );
    }
  }

  function assertStateRoot() {
    assertAnchoredRoots();
    const stat = tryLstat(stateRoot);
    if (!stat) return false;
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new LifecycleError(
        `Lifecycle state path is not a private directory: ${stateRoot}`,
      );
    }
    assertSafeParent(stateRoot, packagePath, "Lifecycle state");
    return true;
  }

  function targetPath(relativeTarget) {
    const target = normalizeRelative(relativeTarget, "manifest target");
    if (!allowedTargets.has(target)) {
      throw new LifecycleError(
        `Manifest target is outside the package doc allowlist: ${target}`,
      );
    }
    const absolute = path.resolve(packagePath, target);
    assertInside(packagePath, absolute, "Manifest target");
    return absolute;
  }

  function sourcePath(relativeSource) {
    const source = normalizeRelative(relativeSource, "source");
    const absolute = path.resolve(repoPath, source);
    assertInside(repoPath, absolute, "Source");
    return absolute;
  }

  function readBytes(absolutePath, label, rejectHardlink) {
    const stat = tryLstat(absolutePath);
    if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
      throw new LifecycleError(
        `${label} is not a regular file: ${absolutePath}`,
      );
    }
    if (rejectHardlink && stat.nlink > 1) {
      throw new LifecycleError(`${label} is a hardlink: ${absolutePath}`);
    }
    let descriptor;
    try {
      descriptor = fs.openSync(
        absolutePath,
        fs.constants.O_RDONLY | OPEN_NOFOLLOW,
      );
      const opened = fs.fstatSync(descriptor);
      if (!opened.isFile() || opened.isSymbolicLink()) {
        throw new LifecycleError(
          `${label} changed during read: ${absolutePath}`,
        );
      }
      if (rejectHardlink && opened.nlink > 1) {
        throw new LifecycleError(`${label} became a hardlink: ${absolutePath}`);
      }
      return fs.readFileSync(descriptor);
    } catch (error) {
      if (error && error.code === "ELOOP") {
        throw new LifecycleError(`${label} is a symlink: ${absolutePath}`);
      }
      throw error;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }

  function writeBytesExclusive(absolutePath, bytes, mode) {
    assertSafeParent(absolutePath, packagePath, "Lifecycle output");
    if (tryLstat(absolutePath)) {
      throw new LifecycleError(
        `Refusing to overwrite existing lifecycle file: ${absolutePath}`,
      );
    }
    let descriptor;
    try {
      descriptor = fs.openSync(
        absolutePath,
        fs.constants.O_WRONLY |
          fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          OPEN_NOFOLLOW,
        mode,
      );
      let offset = 0;
      while (offset < bytes.length) {
        offset += fs.writeSync(
          descriptor,
          bytes,
          offset,
          bytes.length - offset,
        );
      }
      fs.fsyncSync(descriptor);
      fs.fchmodSync(descriptor, mode);
      const opened = fs.fstatSync(descriptor);
      if (!opened.isFile() || opened.nlink !== 1) {
        throw new LifecycleError(
          `Lifecycle output changed during write: ${absolutePath}`,
        );
      }
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
    const written = tryLstat(absolutePath);
    if (
      !written ||
      written.isSymbolicLink() ||
      !written.isFile() ||
      written.nlink !== 1
    ) {
      throw new LifecycleError(
        `Lifecycle output is unsafe after write: ${absolutePath}`,
      );
    }
  }

  function removePath(absolutePath) {
    assertSafeParent(absolutePath, packagePath, "Lifecycle path");
    const stat = tryLstat(absolutePath);
    if (!stat) return;
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      fs.rmSync(absolutePath, { recursive: true, force: true });
      return;
    }
    fs.unlinkSync(absolutePath);
  }

  function snapshot(absolutePath, root = packagePath) {
    assertSafeParent(absolutePath, root, "Package document");
    const stat = tryLstat(absolutePath);
    if (!stat) return { kind: "missing" };
    const mode = stat.mode & 0o7777;
    if (stat.isSymbolicLink()) {
      return { kind: "symlink", mode, target: fs.readlinkSync(absolutePath) };
    }
    if (stat.isFile()) {
      return {
        kind: "file",
        mode,
        bytes: readBytes(absolutePath, "Package document", false).toString(
          "base64",
        ),
      };
    }
    if (stat.isDirectory()) {
      const children = fs
        .readdirSync(absolutePath)
        .sort()
        .map((name) => ({
          name,
          state: snapshot(path.join(absolutePath, name), root),
        }));
      return { kind: "directory", mode, children };
    }
    throw new LifecycleError(`Unsupported package doc entry: ${absolutePath}`);
  }

  function hash(state) {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(state))
      .digest("hex");
  }

  function bytesHash(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
  }

  function reserveTemporary(parent, prefix) {
    ensureDirectoryPath(parent, packagePath, 0o755);
    for (let attempt = 0; attempt < MAX_TEMP_ATTEMPTS; attempt += 1) {
      const candidate = path.join(
        parent,
        `${prefix}-${process.pid}-${Date.now()}-${crypto
          .randomBytes(8)
          .toString("hex")}.tmp`,
      );
      if (!tryLstat(candidate)) return candidate;
    }
    throw new LifecycleError(
      `Could not reserve a private lifecycle temporary path in ${parent}`,
    );
  }

  function writeSnapshot(absolutePath, state) {
    assertSafeParent(absolutePath, packagePath, "Lifecycle output");
    if (state.kind === "missing") return;
    ensureDirectoryPath(path.dirname(absolutePath), packagePath, 0o755);
    if (tryLstat(absolutePath)) {
      throw new LifecycleError(
        `Refusing to overwrite lifecycle output: ${absolutePath}`,
      );
    }
    if (state.kind === "symlink") {
      if (state.target.includes("\0")) {
        throw new LifecycleError(
          `Unsafe saved symlink target: ${absolutePath}`,
        );
      }
      fs.symlinkSync(state.target, absolutePath);
      const created = tryLstat(absolutePath);
      if (!created || !created.isSymbolicLink()) {
        throw new LifecycleError(
          `Lifecycle symlink was not created safely: ${absolutePath}`,
        );
      }
      return;
    }
    if (state.kind === "file") {
      writeBytesExclusive(
        absolutePath,
        Buffer.from(state.bytes, "base64"),
        state.mode,
      );
      return;
    }
    if (state.kind === "directory") {
      fs.mkdirSync(absolutePath, { mode: state.mode, recursive: false });
      const created = tryLstat(absolutePath);
      if (!created || created.isSymbolicLink() || !created.isDirectory()) {
        throw new LifecycleError(
          `Lifecycle directory was not created safely: ${absolutePath}`,
        );
      }
      for (const child of state.children) {
        writeSnapshot(path.join(absolutePath, child.name), child.state);
      }
      fs.chmodSync(absolutePath, state.mode);
      return;
    }
    throw new LifecycleError(
      `Unsupported saved package doc state: ${state.kind}`,
    );
  }

  function atomicWriteJson(filePath, value) {
    ensureStateRoot();
    assertInside(stateRoot, filePath, "Lifecycle manifest");
    const existing = tryLstat(filePath);
    if (
      existing &&
      (existing.isSymbolicLink() ||
        existing.nlink > 1 ||
        existing.isDirectory())
    ) {
      throw new LifecycleError(
        `Lifecycle manifest destination is unsafe: ${filePath}`,
      );
    }
    const temporaryPath = reserveTemporary(stateRoot, ".manifest");
    writeBytesExclusive(
      temporaryPath,
      Buffer.from(JSON.stringify(value, null, 2)),
      0o600,
    );
    try {
      const current = tryLstat(filePath);
      if (
        current &&
        (current.isSymbolicLink() || current.nlink > 1 || current.isDirectory())
      ) {
        throw new LifecycleError(
          `Lifecycle manifest destination changed unsafely: ${filePath}`,
        );
      }
      fs.renameSync(temporaryPath, filePath);
    } catch (error) {
      throw new LifecycleError(
        `Lifecycle manifest write failed; state was preserved at ${stateRoot}: ${error.message}`,
      );
    }
  }

  function readManifest() {
    if (!assertStateRoot()) return null;
    const manifestStat = tryLstat(manifestPath);
    if (!manifestStat) {
      const names = fs
        .readdirSync(stateRoot)
        .filter((name) => name !== LOCK_DIRECTORY);
      if (names.length === 0) return null;
      throw new LifecycleError(
        `Lifecycle state is incomplete at ${stateRoot}; preserve it and recover manually before retrying.`,
      );
    }
    const bytes = readBytes(manifestPath, "Lifecycle manifest", true);
    let manifest;
    try {
      manifest = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      throw new LifecycleError(
        `Lifecycle manifest is unreadable: ${error.message}`,
      );
    }
    Object.defineProperty(manifest, "__fileHash", {
      value: bytesHash(bytes),
      enumerable: false,
    });
    validateManifest(manifest);
    return manifest;
  }

  function assertManifestUnchanged(manifest) {
    const bytes = readBytes(manifestPath, "Lifecycle manifest", true);
    if (manifest.__fileHash && bytesHash(bytes) !== manifest.__fileHash) {
      throw new LifecycleError(
        `Refusing cleanup because lifecycle manifest changed after prepare; preserve ${manifestPath} and review it before retrying.`,
      );
    }
  }

  function removeManifest(manifest) {
    assertManifestUnchanged(manifest);
    const stat = tryLstat(manifestPath);
    if (!stat) return;
    if (stat.isSymbolicLink() || stat.nlink > 1 || !stat.isFile()) {
      throw new LifecycleError(
        `Lifecycle manifest became unsafe: ${manifestPath}`,
      );
    }
    fs.unlinkSync(manifestPath);
  }

  function validateManifest(manifest) {
    if (
      !manifest ||
      manifest.version !== 1 ||
      !Array.isArray(manifest.entries)
    ) {
      throw new LifecycleError(
        `Lifecycle manifest has an unsupported shape at ${manifestPath}`,
      );
    }
    if (
      (manifest.repoIdentity && manifest.repoIdentity !== repoIdentity) ||
      (manifest.packageIdentity && manifest.packageIdentity !== packageIdentity)
    ) {
      throw new LifecycleError(
        `Lifecycle manifest roots do not match this package: ${manifestPath}`,
      );
    }
    if (manifest.owner !== undefined) validateOwner(manifest.owner);
    const seen = new Set();
    for (const entry of manifest.entries) {
      if (
        !entry ||
        typeof entry.target !== "string" ||
        seen.has(entry.target)
      ) {
        throw new LifecycleError(
          `Lifecycle manifest has duplicate or invalid targets at ${manifestPath}`,
        );
      }
      const absolute = targetPath(entry.target);
      assertSafeParent(absolute, packagePath, "Manifest target");
      const expectedEntry = normalizedEntries.find(
        (candidate) => candidate.target === entry.target,
      );
      if (!expectedEntry || entry.source !== expectedEntry.source) {
        throw new LifecycleError(
          `Lifecycle manifest source is outside the package doc allowlist for ${entry.target}`,
        );
      }
      seen.add(entry.target);
      if (!entry.original || typeof entry.originalHash !== "string") {
        throw new LifecycleError(
          `Lifecycle manifest is missing original state for ${entry.target}`,
        );
      }
      validateSnapshot(entry.original, entry.target);
      if (hash(entry.original) !== entry.originalHash) {
        throw new LifecycleError(
          `Lifecycle manifest original state hash is invalid for ${entry.target}`,
        );
      }
      if (
        entry.preparedHash !== null &&
        typeof entry.preparedHash !== "string"
      ) {
        throw new LifecycleError(
          `Lifecycle manifest is missing prepared state for ${entry.target}`,
        );
      }
      if (
        entry.sourceHash !== undefined &&
        typeof entry.sourceHash !== "string"
      ) {
        throw new LifecycleError(
          `Lifecycle manifest is missing canonical source state for ${entry.target}`,
        );
      }
    }
    if (
      seen.size !== allowedTargets.size ||
      [...allowedTargets].some((target) => !seen.has(target))
    ) {
      throw new LifecycleError(
        `Lifecycle manifest target set does not match the package doc allowlist`,
      );
    }
  }

  function validateSnapshot(state, label) {
    if (!state || typeof state !== "object" || typeof state.kind !== "string") {
      throw new LifecycleError(
        `Lifecycle manifest contains an invalid snapshot for ${label}`,
      );
    }
    if (state.kind === "missing") return;
    if (state.kind === "symlink") {
      if (
        typeof state.target !== "string" ||
        state.target.includes("\0") ||
        !isMode(state.mode)
      ) {
        throw new LifecycleError(
          `Lifecycle manifest contains an invalid symlink snapshot for ${label}`,
        );
      }
      return;
    }
    if (state.kind === "file") {
      if (typeof state.bytes !== "string" || !isMode(state.mode)) {
        throw new LifecycleError(
          `Lifecycle manifest contains an invalid file snapshot for ${label}`,
        );
      }
      return;
    }
    if (
      state.kind !== "directory" ||
      !isMode(state.mode) ||
      !Array.isArray(state.children)
    ) {
      throw new LifecycleError(
        `Lifecycle manifest contains an invalid directory snapshot for ${label}`,
      );
    }
    const names = new Set();
    for (const child of state.children) {
      if (
        !child ||
        typeof child.name !== "string" ||
        child.name.length === 0 ||
        child.name === "." ||
        child.name === ".." ||
        child.name.includes("/") ||
        child.name.includes("\\") ||
        child.name.includes("\0") ||
        names.has(child.name)
      ) {
        throw new LifecycleError(
          `Lifecycle manifest contains an unsafe child path for ${label}`,
        );
      }
      names.add(child.name);
      validateSnapshot(child.state, `${label}/${child.name}`);
    }
  }

  function isMode(value) {
    return Number.isInteger(value) && value >= 0 && value <= 0o7777;
  }

  function validateOwner(owner) {
    if (
      !owner ||
      owner.version !== 1 ||
      typeof owner.token !== "string" ||
      owner.token.length < 16 ||
      !Number.isInteger(owner.pid) ||
      owner.pid <= 0 ||
      !Number.isInteger(owner.parentPid) ||
      owner.parentPid < 0 ||
      owner.hostname !== os.hostname() ||
      !Number.isSafeInteger(owner.createdAt) ||
      !Number.isSafeInteger(owner.expiresAt) ||
      owner.expiresAt < owner.createdAt ||
      typeof owner.operation !== "string" ||
      (owner.processStart !== undefined &&
        owner.processStart !== null &&
        typeof owner.processStart !== "string") ||
      (owner.parentStart !== undefined &&
        owner.parentStart !== null &&
        typeof owner.parentStart !== "string") ||
      (owner.processCommand !== undefined &&
        owner.processCommand !== null &&
        typeof owner.processCommand !== "string") ||
      (owner.parentCommand !== undefined &&
        owner.parentCommand !== null &&
        typeof owner.parentCommand !== "string")
    ) {
      throw new LifecycleError(
        `Lifecycle lock owner is invalid at ${lockOwnerPath}`,
      );
    }
    if (
      owner.repoIdentity !== undefined &&
      owner.repoIdentity !== repoIdentity
    ) {
      throw new LifecycleError(
        `Lifecycle lock owner repository does not match: ${lockOwnerPath}`,
      );
    }
    if (
      owner.packageIdentity !== undefined &&
      owner.packageIdentity !== packageIdentity
    ) {
      throw new LifecycleError(
        `Lifecycle lock owner package does not match: ${lockOwnerPath}`,
      );
    }
  }

  function createOwner(operation) {
    const createdAt = Date.now();
    return {
      version: 1,
      token: crypto.randomBytes(16).toString("hex"),
      pid: process.pid,
      parentPid: process.ppid,
      hostname: os.hostname(),
      processStart: getProcessStartIdentity(process.pid),
      parentStart: getProcessStartIdentity(process.ppid),
      processCommand: getProcessCommandIdentity(process.pid),
      parentCommand: getProcessCommandIdentity(process.ppid),
      createdAt,
      expiresAt: createdAt + LOCK_TTL_MS,
      operation,
      repoIdentity,
      packageIdentity,
    };
  }

  function readOwner() {
    const stat = tryLstat(lockOwnerPath);
    if (!stat) {
      throw new LifecycleError(
        `Lifecycle lock is incomplete at ${lockPath}; preserve it and recover manually before retrying.`,
      );
    }
    const bytes = readBytes(lockOwnerPath, "Lifecycle lock owner", true);
    let owner;
    try {
      owner = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      throw new LifecycleError(
        `Lifecycle lock owner is unreadable: ${error.message}`,
      );
    }
    validateOwner(owner);
    return owner;
  }

  function getProcessStartIdentity(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return null;
    const result = spawnSync("ps", ["-p", String(pid), "-o", "lstart="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0) return null;
    const identity = result.stdout.trim();
    return identity || null;
  }

  function getProcessCommandIdentity(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return null;
    const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0) return null;
    const identity = result.stdout.trim();
    return identity || null;
  }

  function getProcessStateIdentity(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return null;
    const result = spawnSync("ps", ["-p", String(pid), "-o", "stat="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0) return null;
    const identity = result.stdout.trim();
    return identity || null;
  }

  function processIsAlive(pid, expectedStart, expectedCommand) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    let signaled = true;
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error && error.code === "ESRCH") signaled = false;
    }
    if (!signaled) return false;
    const state = getProcessStateIdentity(pid);
    if (state && state.startsWith("Z")) return false;
    if (expectedStart) {
      const actualStart = getProcessStartIdentity(pid);
      if (!actualStart) return true;
      if (actualStart !== expectedStart) return false;
    }
    if (expectedCommand) {
      const actualCommand = getProcessCommandIdentity(pid);
      if (!actualCommand) return true;
      if (actualCommand !== expectedCommand) return false;
    }
    return true;
  }

  function preparedManifestBelongsTo(owner) {
    const manifestStat = tryLstat(manifestPath);
    if (
      !manifestStat ||
      manifestStat.isSymbolicLink() ||
      !manifestStat.isFile()
    ) {
      return false;
    }
    try {
      const manifest = JSON.parse(
        readBytes(manifestPath, "Lifecycle manifest", true).toString("utf8"),
      );
      return (
        manifest.phase === "prepared" &&
        manifest.owner &&
        manifest.owner.token === owner.token
      );
    } catch {
      return false;
    }
  }

  function canClaimOwner(owner) {
    const parentAlive =
      owner.parentPid > 0 &&
      processIsAlive(owner.parentPid, owner.parentStart, owner.parentCommand);
    const currentStart = getProcessStartIdentity(process.pid);
    const currentCommand = getProcessCommandIdentity(process.pid);
    const sameCurrentProcess =
      owner.pid === process.pid &&
      (!owner.processStart ||
        !currentStart ||
        currentStart === owner.processStart) &&
      (!owner.processCommand ||
        !currentCommand ||
        currentCommand === owner.processCommand);
    if (sameCurrentProcess) return false;
    if (processIsAlive(owner.pid, owner.processStart, owner.processCommand)) {
      return false;
    }
    if (owner.operation === "prepare" && preparedManifestBelongsTo(owner)) {
      return true;
    }
    if (parentAlive && process.ppid === owner.parentPid) return true;
    if (parentAlive || Date.now() < owner.expiresAt) return false;
    return true;
  }

  function sameOwner(left, right) {
    return Boolean(
      left && right && left.token === right.token && left.pid === right.pid,
    );
  }

  function removeStaleLock(owner) {
    const current = readOwner();
    if (!sameOwner(current, owner)) {
      throw new LifecycleError(
        "Lifecycle lock changed while stale recovery was in progress; retry safely.",
      );
    }
    const stat = tryLstat(lockOwnerPath);
    if (!stat || stat.isSymbolicLink() || stat.nlink > 1 || !stat.isFile()) {
      throw new LifecycleError(
        `Lifecycle lock owner became unsafe at ${lockOwnerPath}`,
      );
    }
    fs.unlinkSync(lockOwnerPath);
    try {
      fs.rmdirSync(lockPath);
    } catch (error) {
      throw new LifecycleError(
        `Lifecycle stale-lock recovery could not remove ${lockPath}: ${error.message}`,
      );
    }
  }

  function acquireLock(operation, createState) {
    assertAnchoredRoots();
    if (activeOwner) return { owner: activeOwner, acquired: false };
    if (!assertStateRoot()) {
      if (!createState) return null;
      ensureStateRoot();
    }
    for (let attempt = 0; attempt < MAX_TEMP_ATTEMPTS; attempt += 1) {
      assertStateRoot();
      const existingLock = tryLstat(lockPath);
      if (existingLock) {
        if (existingLock.isSymbolicLink() || !existingLock.isDirectory()) {
          throw new LifecycleError(
            `Lifecycle lock path is unsafe: ${lockPath}`,
          );
        }
        const existingOwner = readOwner();
        if (!canClaimOwner(existingOwner)) {
          throw new LifecycleError(
            `Lifecycle operation is already active (pid ${existingOwner.pid}, parent ${existingOwner.parentPid}); preserve ${stateRoot} and retry after it exits.`,
          );
        }
        removeStaleLock(existingOwner);
        continue;
      }
      try {
        fs.mkdirSync(lockPath, { mode: 0o700, recursive: false });
      } catch (error) {
        if (error && error.code === "EEXIST") continue;
        throw error;
      }
      const owner = createOwner(operation);
      try {
        writeBytesExclusive(
          lockOwnerPath,
          Buffer.from(JSON.stringify(owner, null, 2)),
          0o600,
        );
      } catch (error) {
        throw new LifecycleError(
          `Lifecycle lock owner could not be recorded; preserve ${stateRoot}: ${error.message}`,
        );
      }
      activeOwner = owner;
      return { owner, acquired: true };
    }
    throw new LifecycleError(
      `Lifecycle lock could not be acquired safely at ${lockPath}`,
    );
  }

  function releaseLock() {
    if (!activeOwner) return;
    assertStateRoot();
    const current = readOwner();
    if (!sameOwner(current, activeOwner)) {
      throw new LifecycleError(
        `Lifecycle lock ownership changed; preserve ${stateRoot} for manual recovery.`,
      );
    }
    const ownerStat = tryLstat(lockOwnerPath);
    if (
      !ownerStat ||
      ownerStat.isSymbolicLink() ||
      ownerStat.nlink > 1 ||
      !ownerStat.isFile()
    ) {
      throw new LifecycleError(
        `Lifecycle lock owner became unsafe at ${lockOwnerPath}`,
      );
    }
    fs.unlinkSync(lockOwnerPath);
    fs.rmdirSync(lockPath);
    activeOwner = null;
    const stateStat = tryLstat(stateRoot);
    if (
      stateStat &&
      stateStat.isDirectory() &&
      fs.readdirSync(stateRoot).length === 0
    ) {
      fs.rmdirSync(stateRoot);
    }
  }

  function recoverStateWithoutManifest() {
    if (!assertStateRoot() || tryLstat(manifestPath)) return;
    const names = fs.readdirSync(stateRoot);
    for (const name of names) {
      if (name === LOCK_DIRECTORY) continue;
      if (!STATE_TEMP_PATTERN.test(name)) {
        throw new LifecycleError(
          `Lifecycle state is incomplete at ${stateRoot}; preserve it and recover manually before retrying.`,
        );
      }
      const temporaryPath = path.join(stateRoot, name);
      const stat = tryLstat(temporaryPath);
      if (!stat || stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1) {
        throw new LifecycleError(
          `Lifecycle temporary state is unsafe: ${temporaryPath}`,
        );
      }
      fs.unlinkSync(temporaryPath);
    }
  }

  function validateSources() {
    for (const entry of normalizedEntries) {
      const source = sourcePath(entry.source);
      assertSafeParent(source, repoPath, "Source");
      const stat = tryLstat(source);
      if (!stat) {
        throw new LifecycleError(
          `Required package document source is missing: ${entry.source}`,
        );
      }
      if (!stat.isFile() && !stat.isDirectory() && !stat.isSymbolicLink()) {
        throw new LifecycleError(
          `Required package document source is unsupported: ${entry.source}`,
        );
      }
    }
  }

  function hasCopiedAncestor(entry) {
    return normalizedEntries.some(
      (candidate) =>
        candidate.copy &&
        candidate.target !== entry.target &&
        entry.target.startsWith(`${candidate.target}/`),
    );
  }

  function materializeTemporary(target, state, suffix) {
    const temporaryPath = reserveTemporary(
      path.dirname(target),
      `.${path.basename(target)}.${suffix}`,
    );
    writeSnapshot(temporaryPath, state);
    return temporaryPath;
  }

  function replaceTemporary(temporaryPath, target) {
    assertSafeParent(temporaryPath, packagePath, "Lifecycle temporary");
    assertSafeParent(target, packagePath, "Package document");
    const temporaryStat = tryLstat(temporaryPath);
    if (
      !temporaryStat ||
      (!temporaryStat.isFile() &&
        !temporaryStat.isDirectory() &&
        !temporaryStat.isSymbolicLink())
    ) {
      throw new LifecycleError(
        `Lifecycle temporary is missing or unsafe: ${temporaryPath}`,
      );
    }
    const targetStat = tryLstat(target);
    if (
      !targetStat ||
      targetStat.isSymbolicLink() ||
      !targetStat.isDirectory()
    ) {
      fs.renameSync(temporaryPath, target);
      return;
    }

    let displacedPath = null;
    for (let attempt = 0; attempt < MAX_TEMP_ATTEMPTS; attempt += 1) {
      const candidate = path.join(
        path.dirname(target),
        `.${path.basename(target)}.pack-docs-displaced-${process.pid}-${crypto
          .randomBytes(8)
          .toString("hex")}`,
      );
      if (tryLstat(candidate)) continue;
      try {
        fs.renameSync(target, candidate);
        displacedPath = candidate;
        break;
      } catch (error) {
        if (error && error.code === "EEXIST") continue;
        throw error;
      }
    }
    if (!displacedPath) {
      throw new LifecycleError(
        `Could not reserve a safe displaced path for ${target}`,
      );
    }
    try {
      fs.renameSync(temporaryPath, target);
    } catch (error) {
      const currentTarget = tryLstat(target);
      if (currentTarget) {
        throw new LifecycleError(
          `Package document replacement failed; original content remains at ${displacedPath} and the changed target was preserved: ${error.message}`,
        );
      }
      try {
        fs.renameSync(displacedPath, target);
      } catch (restoreError) {
        throw new LifecycleError(
          `Package document replacement failed and the original target could not be restored: ${error.message}; ${restoreError.message}`,
        );
      }
      throw error;
    }
    removePath(displacedPath);
  }

  function copyCanonical(entry, originalState) {
    const source = sourcePath(entry.source);
    const target = targetPath(entry.target);
    const sourceState = snapshot(source, repoPath);
    if (entry.sourceHash && hash(sourceState) !== entry.sourceHash) {
      throw new LifecycleError(
        `Canonical package document changed during prepare: ${source}`,
      );
    }
    const currentState = snapshot(target);
    if (hash(currentState) !== hash(originalState)) {
      throw new LifecycleError(
        `Package document changed during prepare: ${entry.target}; preserved the current file and lifecycle state.`,
      );
    }
    const temporaryPath = materializeTemporary(
      target,
      sourceState,
      "pack-docs",
    );
    replaceTemporary(temporaryPath, target);
    return hash(snapshot(target));
  }

  function restoreOriginal(manifest) {
    assertManifestUnchanged(manifest);
    const currentStates = manifest.entries.map((entry) => {
      const target = targetPath(entry.target);
      const current = snapshot(target);
      const currentHash = hash(current);
      if (entry.preparedHash === null) {
        if (currentHash !== entry.originalHash) {
          let sourceHash = entry.sourceHash;
          if (sourceHash) {
            const sourceState = snapshot(sourcePath(entry.source), repoPath);
            if (hash(sourceState) !== sourceHash) {
              throw new LifecycleError(
                `Refusing cleanup because ${entry.source} changed after prepare. The changed file is preserved; restore from ${manifestPath} only after reviewing it, then retry cleanup.`,
              );
            }
          } else {
            sourceHash = hash(snapshot(sourcePath(entry.source), repoPath));
          }
          if (currentHash !== sourceHash) {
            throw new LifecycleError(
              `Refusing cleanup because ${entry.target} changed after prepare. The changed file is preserved; restore from ${manifestPath} only after reviewing it, then retry cleanup.`,
            );
          }
        }
      } else if (currentHash !== entry.preparedHash) {
        throw new LifecycleError(
          `Refusing cleanup because ${entry.target} changed after prepare. The changed file is preserved; restore from ${manifestPath} only after reviewing it, then retry cleanup.`,
        );
      }
      return { entry, target };
    });

    for (const { entry, target } of currentStates) {
      removePath(target);
      writeSnapshot(target, entry.original);
      if (hash(snapshot(target)) !== entry.originalHash) {
        throw new LifecycleError(
          `Lifecycle restoration did not reproduce the original state for ${entry.target}; preserve ${manifestPath} for recovery.`,
        );
      }
    }
    removeManifest(manifest);
  }

  function prepare() {
    acquireLock("prepare", true);
    try {
      validateSources();
      recoverStateWithoutManifest();
      const staleManifest = readManifest();
      if (staleManifest) restoreOriginal(staleManifest);

      const originals = normalizedEntries.map((entry) => {
        const target = targetPath(entry.target);
        return {
          target: entry.target,
          source: entry.source,
          copy: entry.copy,
          original: snapshot(target),
          sourceHash: hash(snapshot(sourcePath(entry.source), repoPath)),
        };
      });
      const manifest = {
        version: 1,
        phase: "preparing",
        repoIdentity,
        packageIdentity,
        owner: activeOwner,
        entries: originals.map((entry) => ({
          ...entry,
          originalHash: hash(entry.original),
          preparedHash: null,
        })),
      };
      atomicWriteJson(manifestPath, manifest);

      for (const entry of manifest.entries) {
        if (!entry.copy) continue;
        entry.preparedHash = copyCanonical(entry, entry.original);
        atomicWriteJson(manifestPath, manifest);
      }
      for (const entry of manifest.entries) {
        if (entry.preparedHash !== null) continue;
        const current = snapshot(targetPath(entry.target));
        if (!hasCopiedAncestor(entry) && hash(current) !== entry.originalHash) {
          throw new LifecycleError(
            `Package document changed during prepare: ${entry.target}; preserved the current file and lifecycle state.`,
          );
        }
        entry.preparedHash = hash(current);
        atomicWriteJson(manifestPath, manifest);
      }
      manifest.phase = "prepared";
      atomicWriteJson(manifestPath, manifest);
    } catch (error) {
      throw new LifecycleError(
        `Package document prepare failed; lifecycle state was preserved at ${manifestPath}: ${error.message}`,
      );
    }
  }

  function cleanup() {
    if (!assertStateRoot()) return;
    let lock = null;
    try {
      lock = acquireLock("cleanup", false);
      if (!lock) return;
      if (!tryLstat(manifestPath)) {
        const names = fs
          .readdirSync(stateRoot)
          .filter((name) => name !== LOCK_DIRECTORY);
        if (names.length > 0) {
          throw new LifecycleError(
            `Lifecycle state is incomplete at ${stateRoot}; preserve it and recover manually before retrying.`,
          );
        }
        return;
      }
      const manifest = readManifest();
      if (manifest) restoreOriginal(manifest);
    } finally {
      if (lock) releaseLock();
    }
  }

  function sync() {
    const lock = acquireLock("sync", true);
    try {
      validateSources();
      for (const entry of normalizedEntries.filter(
        (candidate) => candidate.persistent && candidate.copy,
      )) {
        const target = targetPath(entry.target);
        const sourceState = snapshot(sourcePath(entry.source), repoPath);
        const temporaryPath = materializeTemporary(
          target,
          sourceState,
          "pack-docs-sync",
        );
        replaceTemporary(temporaryPath, target);
      }
    } finally {
      if (lock && lock.acquired) releaseLock();
    }
  }

  function check() {
    const lock = acquireLock("check", true);
    try {
      validateSources();
      const failures = [];
      for (const entry of normalizedEntries.filter(
        (candidate) => candidate.persistent && candidate.copy,
      )) {
        const sourceState = snapshot(sourcePath(entry.source), repoPath);
        const targetState = snapshot(targetPath(entry.target));
        if (hash(sourceState) !== hash(targetState))
          failures.push(entry.target);
      }
      if (failures.length > 0) {
        throw new LifecycleError(
          `Package document mirrors are out of sync: ${failures.join(", ")}`,
        );
      }
    } finally {
      if (lock && lock.acquired) releaseLock();
    }
  }

  return {
    prepare,
    cleanup,
    sync,
    check,
    manifestPath,
    stateRoot,
    entries: normalizedEntries,
  };
}

function normalizeRelative(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    path.isAbsolute(value)
  ) {
    throw new LifecycleError(`Invalid ${label} path: ${value}`);
  }
  const normalized = path.posix.normalize(value.split(path.sep).join("/"));
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new LifecycleError(`Invalid ${label} path: ${value}`);
  }
  return normalized;
}

module.exports = { LifecycleError, createPackageDocLifecycle };
