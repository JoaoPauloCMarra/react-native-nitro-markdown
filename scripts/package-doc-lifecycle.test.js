"use strict";

const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPackageDocLifecycle } = require("./package-doc-lifecycle.js");

const defaultEntries = [
  { source: "README.md", target: "README.md" },
  { source: "CHANGELOG.md", target: "CHANGELOG.md" },
  { source: "LICENSE", target: "LICENSE" },
  { source: "SECURITY.md", target: "SECURITY.md" },
  { source: "docs", target: "docs" },
];

function fixture(entries = defaultEntries) {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "nitro-doc-lifecycle-")),
  );
  const repoRoot = path.join(root, "repo");
  const packageRoot = path.join(repoRoot, "package");
  fs.mkdirSync(path.join(repoRoot, "docs"), { recursive: true });
  for (const entry of ["README.md", "CHANGELOG.md", "LICENSE", "SECURITY.md"]) {
    fs.writeFileSync(path.join(repoRoot, entry), `canonical-${entry}`);
  }
  fs.writeFileSync(path.join(repoRoot, "docs", "guide.md"), "canonical-guide");
  return {
    root,
    repoRoot,
    packageRoot,
    lifecycle: createPackageDocLifecycle({ repoRoot, packageRoot, entries }),
  };
}

function removeFixture(state) {
  fs.rmSync(state.root, { recursive: true, force: true });
}

function testExistingRestore() {
  const state = fixture();
  try {
    fs.mkdirSync(path.join(state.packageRoot, "docs"), { recursive: true });
    fs.writeFileSync(path.join(state.packageRoot, "README.md"), "user-readme");
    fs.chmodSync(path.join(state.packageRoot, "README.md"), 0o600);
    fs.writeFileSync(
      path.join(state.packageRoot, "docs", "user.md"),
      "user-doc",
    );
    state.lifecycle.prepare();
    assert.equal(
      fs.readFileSync(path.join(state.packageRoot, "README.md"), "utf8"),
      "canonical-README.md",
    );
    state.lifecycle.cleanup();
    assert.equal(
      fs.readFileSync(path.join(state.packageRoot, "README.md"), "utf8"),
      "user-readme",
    );
    assert.equal(
      fs.statSync(path.join(state.packageRoot, "README.md")).mode & 0o777,
      0o600,
    );
    assert.equal(
      fs.readFileSync(path.join(state.packageRoot, "docs", "user.md"), "utf8"),
      "user-doc",
    );
  } finally {
    removeFixture(state);
  }
}

function testMissingRestore() {
  const state = fixture();
  try {
    state.lifecycle.prepare();
    assert.ok(fs.existsSync(path.join(state.packageRoot, "README.md")));
    state.lifecycle.cleanup();
    assert.equal(
      fs.existsSync(path.join(state.packageRoot, "README.md")),
      false,
    );
    assert.equal(fs.existsSync(state.lifecycle.stateRoot), false);
  } finally {
    removeFixture(state);
  }
}

function testChangedRefused() {
  const state = fixture();
  try {
    state.lifecycle.prepare();
    fs.writeFileSync(
      path.join(state.packageRoot, "README.md"),
      "changed-by-user",
    );
    assert.throws(() => state.lifecycle.cleanup(), /changed after prepare/);
    assert.equal(
      fs.readFileSync(path.join(state.packageRoot, "README.md"), "utf8"),
      "changed-by-user",
    );
    assert.ok(fs.existsSync(state.lifecycle.manifestPath));
  } finally {
    removeFixture(state);
  }
}

function testStaleRecovery() {
  const state = fixture();
  try {
    state.lifecycle.prepare();
    state.lifecycle.prepare();
    state.lifecycle.cleanup();
    assert.equal(fs.existsSync(state.lifecycle.stateRoot), false);
  } finally {
    removeFixture(state);
  }
}

function testOverlappingTargets() {
  const state = fixture([
    { source: "README.md", target: "README.md" },
    { source: "CHANGELOG.md", target: "CHANGELOG.md" },
    { source: "LICENSE", target: "LICENSE" },
    { source: "SECURITY.md", target: "SECURITY.md" },
    { source: "docs", target: "docs", persistent: false },
    {
      source: "docs/guide.md",
      target: "docs/guide.md",
      persistent: false,
      copy: false,
    },
  ]);
  try {
    state.lifecycle.prepare();
    assert.equal(
      fs.readFileSync(path.join(state.packageRoot, "docs", "guide.md"), "utf8"),
      "canonical-guide",
    );
    state.lifecycle.cleanup();
    assert.equal(fs.existsSync(path.join(state.packageRoot, "docs")), false);
  } finally {
    removeFixture(state);
  }
}

function testSymlinkAndTraversalSafety() {
  const state = fixture();
  const outside = path.join(state.root, "outside.txt");
  try {
    fs.writeFileSync(outside, "outside");
    state.lifecycle.prepare();
    fs.unlinkSync(path.join(state.packageRoot, "README.md"));
    fs.symlinkSync(outside, path.join(state.packageRoot, "README.md"));
    assert.throws(() => state.lifecycle.cleanup(), /changed after prepare/);
    assert.equal(
      fs.readlinkSync(path.join(state.packageRoot, "README.md")),
      outside,
    );

    const invalid = fixture();
    try {
      fs.mkdirSync(invalid.lifecycle.stateRoot, { recursive: true });
      fs.writeFileSync(
        invalid.lifecycle.manifestPath,
        JSON.stringify({
          version: 1,
          entries: [
            {
              target: "../../outside.txt",
              original: { kind: "missing" },
              originalHash: "x",
              preparedHash: "x",
            },
          ],
        }),
      );
      assert.throws(
        () => invalid.lifecycle.cleanup(),
        /allowlist|Invalid manifest target/,
      );
    } finally {
      removeFixture(invalid);
    }
  } finally {
    removeFixture(state);
  }
}

function lifecycleFor(repoRoot, packageRoot, stateDirectory) {
  return createPackageDocLifecycle({
    repoRoot,
    packageRoot,
    entries: defaultEntries,
    ...(stateDirectory === undefined ? {} : { stateDirectory }),
  });
}

function testAnchoredRootsAndStatePaths() {
  const state = fixture();
  try {
    const repoLink = path.join(state.root, "repo-link");
    fs.symlinkSync(state.repoRoot, repoLink);
    assert.throws(
      () => lifecycleFor(repoLink, path.join(repoLink, "package")),
      /symlink|canonical|identity/,
    );

    const outsidePackage = path.join(state.root, "outside-package");
    fs.mkdirSync(outsidePackage);
    const packageLink = path.join(state.repoRoot, "package-link");
    fs.symlinkSync(outsidePackage, packageLink);
    assert.throws(
      () => lifecycleFor(state.repoRoot, packageLink),
      /symlink|canonical|identity/,
    );

    const ancestorLink = path.join(state.root, "ancestor-link");
    fs.symlinkSync(state.repoRoot, ancestorLink);
    assert.throws(
      () =>
        lifecycleFor(
          path.join(ancestorLink, "."),
          path.join(ancestorLink, "package"),
        ),
      /symlink|canonical|identity/,
    );

    assert.throws(
      () => lifecycleFor(state.repoRoot, state.packageRoot, "../outside-state"),
      /fixed child/,
    );

    fs.mkdirSync(state.packageRoot, { recursive: true });
    const outsideState = path.join(state.root, "outside-state");
    fs.mkdirSync(outsideState);
    fs.symlinkSync(outsideState, state.lifecycle.stateRoot);
    assert.throws(() => state.lifecycle.prepare(), /state path|symlink/);
  } finally {
    removeFixture(state);
  }
}

function testStateHardlinkAndConcurrentOwnership() {
  const state = fixture();
  try {
    fs.mkdirSync(state.packageRoot, { recursive: true });
    fs.mkdirSync(state.lifecycle.stateRoot);
    const outsideManifest = path.join(state.root, "outside-manifest");
    fs.writeFileSync(outsideManifest, "outside-manifest");
    fs.linkSync(outsideManifest, state.lifecycle.manifestPath);
    assert.throws(() => state.lifecycle.cleanup(), /hardlink|manifest|unsafe/);
    assert.equal(fs.readFileSync(outsideManifest, "utf8"), "outside-manifest");
    fs.unlinkSync(state.lifecycle.manifestPath);
    fs.rmdirSync(state.lifecycle.stateRoot);
  } finally {
    removeFixture(state);
  }

  const active = fixture();
  try {
    active.lifecycle.prepare();
    const other = lifecycleFor(active.repoRoot, active.packageRoot);
    assert.throws(() => other.prepare(), /already active|active/);
    assert.throws(() => other.cleanup(), /already active|active/);
    active.lifecycle.cleanup();
  } finally {
    removeFixture(active);
  }
}

function testStaleRecoveryAndSiblingHandoff() {
  const stale = fixture();
  try {
    fs.mkdirSync(stale.packageRoot, { recursive: true });
    fs.mkdirSync(stale.lifecycle.stateRoot);
    const lockPath = path.join(stale.lifecycle.stateRoot, ".lock");
    fs.mkdirSync(lockPath);
    fs.writeFileSync(
      path.join(lockPath, "owner.json"),
      JSON.stringify({
        version: 1,
        token: "dead-owner-token-123456",
        pid: 99999999,
        parentPid: 99999998,
        hostname: os.hostname(),
        createdAt: 0,
        expiresAt: 0,
        operation: "prepare",
      }),
    );
    stale.lifecycle.prepare();
    stale.lifecycle.cleanup();
    assert.equal(fs.existsSync(stale.lifecycle.stateRoot), false);
  } finally {
    removeFixture(stale);
  }

  const handoff = fixture();
  const helperPath = path.resolve(__dirname, "package-doc-lifecycle.js");
  const childScript = `
    const { createPackageDocLifecycle } = require(process.argv[1]);
    const lifecycle = createPackageDocLifecycle({
      repoRoot: process.argv[2],
      packageRoot: process.argv[3],
      entries: ${JSON.stringify(defaultEntries)},
    });
    if (process.argv[4] === "prepare") lifecycle.prepare();
    else lifecycle.cleanup();
  `;
  try {
    const prepare = spawnSync(
      process.execPath,
      [
        "-e",
        childScript,
        helperPath,
        handoff.repoRoot,
        handoff.packageRoot,
        "prepare",
      ],
      { cwd: handoff.repoRoot, encoding: "utf8" },
    );
    assert.equal(prepare.status, 0, `${prepare.stdout}\n${prepare.stderr}`);
    const cleanup = spawnSync(
      process.execPath,
      [
        "-e",
        childScript,
        helperPath,
        handoff.repoRoot,
        handoff.packageRoot,
        "cleanup",
      ],
      { cwd: handoff.repoRoot, encoding: "utf8" },
    );
    assert.equal(cleanup.status, 0, `${cleanup.stdout}\n${cleanup.stderr}`);
    assert.equal(fs.existsSync(handoff.lifecycle.stateRoot), false);
  } finally {
    removeFixture(handoff);
  }
}

function waitFor(condition) {
  const deadline = Date.now() + 3000;
  const signal = new Int32Array(new SharedArrayBuffer(4));
  while (!condition()) {
    if (Date.now() >= deadline)
      throw new Error("Timed out waiting for lifecycle child");
    Atomics.wait(signal, 0, 0, 20);
  }
}

function testActiveChildAndSignalRecovery() {
  const state = fixture();
  const helperPath = path.resolve(__dirname, "package-doc-lifecycle.js");
  const markerPath = path.join(state.root, "child-ready");
  const childScript = `
    const fs = require("node:fs");
    const { createPackageDocLifecycle } = require(process.argv[1]);
    const lifecycle = createPackageDocLifecycle({
      repoRoot: process.argv[2],
      packageRoot: process.argv[3],
      entries: ${JSON.stringify(defaultEntries)},
    });
    lifecycle.prepare();
    fs.writeFileSync(process.argv[4], "ready");
    setInterval(() => {}, 1000);
  `;
  let child;
  try {
    child = spawn(
      process.execPath,
      [
        "-e",
        childScript,
        helperPath,
        state.repoRoot,
        state.packageRoot,
        markerPath,
      ],
      { cwd: state.repoRoot, stdio: "ignore" },
    );
    waitFor(() => {
      try {
        process.kill(child.pid, 0);
        return fs.existsSync(markerPath);
      } catch {
        return false;
      }
    });
    const other = lifecycleFor(state.repoRoot, state.packageRoot);
    assert.throws(() => other.cleanup(), /already active|active/);
    process.kill(child.pid, "SIGTERM");
    waitFor(() => {
      const result = spawnSync("ps", ["-p", String(child.pid), "-o", "stat="], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return result.status !== 0 || result.stdout.trim().startsWith("Z");
    });
    other.cleanup();
    assert.equal(fs.existsSync(state.lifecycle.stateRoot), false);
  } finally {
    if (child && child.exitCode === null) {
      try {
        process.kill(child.pid, "SIGKILL");
      } catch {}
    }
    removeFixture(state);
  }
}

function testNoArtifactStateLeakage() {
  const state = fixture();
  try {
    state.lifecycle.prepare();
    state.lifecycle.cleanup();
    assert.equal(fs.existsSync(state.lifecycle.stateRoot), false);
    if (fs.existsSync(state.packageRoot)) {
      const names = fs.readdirSync(state.packageRoot);
      assert.equal(
        names.some((name) => name.includes("pack-docs")),
        false,
      );
    }
    state.lifecycle.sync();
    assert.equal(fs.existsSync(state.lifecycle.stateRoot), false);
  } finally {
    removeFixture(state);
  }
}

function testPrepareFailureAndFinally() {
  const missing = fixture();
  try {
    fs.unlinkSync(path.join(missing.repoRoot, "LICENSE"));
    assert.throws(() => missing.lifecycle.prepare(), /source is missing/);
    assert.equal(
      fs.existsSync(path.join(missing.packageRoot, "README.md")),
      false,
    );
  } finally {
    removeFixture(missing);
  }

  const copyFailure = fixture();
  fs.mkdirSync(copyFailure.packageRoot, { recursive: true });
  fs.writeFileSync(
    path.join(copyFailure.packageRoot, "README.md"),
    "user-readme",
  );
  const rename = fs.renameSync;
  try {
    fs.renameSync = (from, to) => {
      if (path.basename(String(from)).includes(".pack-docs-")) {
        throw new Error("simulated copy failure");
      }
      return rename(from, to);
    };
    assert.throws(
      () => copyFailure.lifecycle.prepare(),
      /simulated copy failure/,
    );
  } finally {
    fs.renameSync = rename;
  }
  try {
    assert.ok(fs.existsSync(copyFailure.lifecycle.manifestPath));
    copyFailure.lifecycle.prepare();
    copyFailure.lifecycle.cleanup();
    assert.equal(
      fs.readFileSync(path.join(copyFailure.packageRoot, "README.md"), "utf8"),
      "user-readme",
    );
    assert.equal(fs.existsSync(copyFailure.lifecycle.stateRoot), false);
  } finally {
    removeFixture(copyFailure);
  }

  const failedPack = fixture();
  try {
    try {
      failedPack.lifecycle.prepare();
      throw new Error("pack failed");
    } catch (error) {
      assert.equal(error.message, "pack failed");
    } finally {
      failedPack.lifecycle.cleanup();
    }
    assert.equal(
      fs.existsSync(path.join(failedPack.packageRoot, "README.md")),
      false,
    );
  } finally {
    removeFixture(failedPack);
  }
}

testExistingRestore();
testMissingRestore();
testChangedRefused();
testStaleRecovery();
testOverlappingTargets();
testSymlinkAndTraversalSafety();
testAnchoredRootsAndStatePaths();
testStateHardlinkAndConcurrentOwnership();
testStaleRecoveryAndSiblingHandoff();
testActiveChildAndSignalRecovery();
testNoArtifactStateLeakage();
testPrepareFailureAndFinally();
console.log("package doc lifecycle fixture tests passed");
