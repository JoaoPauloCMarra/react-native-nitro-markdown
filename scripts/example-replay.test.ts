import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  checkReplayFreshness,
  collectRuntimeFiles,
  hasTestId,
  readCoverageManifest,
  refreshReplayLock,
} from "./check-example-replay-freshness.js";
import { parseArgs, readSuites, runExampleReplay } from "./run-example-replay.js";

const projectRoot = path.resolve(__dirname, "..");

test("conditional test IDs are tied to rendered props, not arbitrary marker strings", () => {
  const source = 'testID={transition ? "transition-status" : "direct-status"}';
  assert.equal(hasTestId(source, "direct-status"), true);
  assert.equal(hasTestId(source, "transition-status"), true);
  assert.equal(hasTestId(source, "unknown-status"), false);
  assert.equal(hasTestId('const marker = "direct-status";', "direct-status"), false);
});

function writeFile(root: string, relativePath: string, contents: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function createReplayFixture(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "nitro-markdown-replay-test-"),
  );
  writeFile(
    root,
    "packages/react-native-nitro-markdown/src/index.ts",
    "export const apiVersion = 1;\n",
  );
  writeFile(
    root,
    "packages/react-native-nitro-markdown/android/src/main/MarkdownAdapter.kt",
    "class MarkdownAdapter\n",
  );
  writeFile(
    root,
    "packages/react-native-nitro-markdown/cpp/HybridMarkdown.cpp",
    "void parseMarkdown() {}\n",
  );
  writeFile(
    root,
    "packages/react-native-nitro-markdown/nitrogen/generated/android/Markdown.kt",
    "class MarkdownBinding\n",
  );
  writeFile(root, "packages/react-native-nitro-markdown/nitro.json", "{}\n");
  writeFile(root, "packages/react-native-nitro-markdown/package.json", "{}\n");
  writeFile(root, "apps/example/app/e2e.tsx", "export const screen = true;\n");
  writeFile(
    root,
    "apps/example/components/probe.tsx",
    '<Button testID="probe-run" /><Text testID="probe-status">pass:probe</Text>\nconst result = value === undefined;\n',
  );
  writeFile(root, "apps/example/assets/icon.svg", "<svg />\n");
  writeFile(root, "apps/example/app.config.js", "module.exports = {};\n");
  writeFile(root, "apps/example/package.json", "{}\n");
  writeFile(
    root,
    "e2e/probe.ad",
    'open "com.nitromarkdown.example"\nwait id="probe-screen"\npress id="probe-run"\nwait id="probe-status"\nwait text "pass:probe"\nclose\n',
  );
  writeFile(
    root,
    "e2e/markdown-replay-coverage.json",
    `${JSON.stringify(
      {
        version: 1,
        entry: "scripts/run-example-replay.js",
        suites: [
          {
            id: "probe",
            path: "e2e/probe.ad",
            purpose: "Probe a public result",
          },
        ],
        features: [
          {
            id: "probe.result",
            coverage: "replay-asserted",
            kind: "public-api",
            transport: "Local public API result",
            suite: "e2e/probe.ad",
            source: "apps/example/components/probe.tsx",
            controlId: "probe-run",
            statusId: "probe-status",
            expectedText: "pass:probe",
            assertion: "value === undefined",
          },
        ],
        pending: [
          {
            id: "hardware.pending",
            state: "pending-prerequisites",
            reason: "Requires an installed native app and visual acceptance",
            prerequisites: ["Dedicated native QA target"],
            acceptance:
              "Verify native rendering on the selected target.",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

function removeTempDirectories(directories: string[]): void {
  for (const directory of directories) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("the checked-in Markdown replay manifest and source lock are current", () => {
  const result = checkReplayFreshness({ root: projectRoot });
  assert.equal(result.fresh, true, result.reason);
});

test("runtime source drift invalidates the lock until an explicit refresh", () => {
  const root = createReplayFixture();
  const manifestPath = "e2e/markdown-replay-coverage.json";
  const lockPath = "e2e/markdown-replay-source-lock.json";
  try {
    const initial = refreshReplayLock({ root, manifestPath, lockPath });
    assert.equal(
      checkReplayFreshness({ root, manifestPath, lockPath }).fresh,
      true,
    );

    writeFile(
      root,
      "packages/react-native-nitro-markdown/src/index.ts",
      "export const apiVersion = 2;\n",
    );
    const stale = checkReplayFreshness({ root, manifestPath, lockPath });
    assert.equal(stale.fresh, false);
    assert.notEqual(
      stale.expected?.runtimeSourceSha256,
      initial.runtimeSourceSha256,
    );

    const refreshed = refreshReplayLock({ root, manifestPath, lockPath });
    assert.notEqual(refreshed.runtimeSourceSha256, initial.runtimeSourceSha256);
    assert.equal(
      checkReplayFreshness({ root, manifestPath, lockPath }).fresh,
      true,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("freshness covers runtime wiring and excludes tests and generated app projects", () => {
  const root = createReplayFixture();
  try {
    writeFile(
      root,
      "apps/example/components/smoke-test.tsx",
      "export const liveProbe = true;\n",
    );
    writeFile(root, "apps/example/android/app/src/main/Main.kt", "generated\n");
    writeFile(root, "apps/example/ios/AppDelegate.swift", "generated\n");
    writeFile(root, "apps/example/.env.local", "DO_NOT_HASH_ME\n");
    writeFile(root, "apps/example/hooks/use-theme.ts", "export const theme = 1;\n");
    writeFile(root, "apps/example/theme.ts", "export const color = 1;\n");
    writeFile(
      root,
      "packages/react-native-nitro-markdown/src/__tests__/unit.test.ts",
      "test\n",
    );
    writeFile(
      root,
      "packages/react-native-nitro-markdown/android/src/test/MarkdownTest.kt",
      "test\n",
    );

    const files = collectRuntimeFiles(root);
    assert.ok(
      files.includes("packages/react-native-nitro-markdown/src/index.ts"),
    );
    assert.ok(
      files.includes(
        "packages/react-native-nitro-markdown/android/src/main/MarkdownAdapter.kt",
      ),
    );
    assert.ok(
      files.includes(
        "packages/react-native-nitro-markdown/nitrogen/generated/android/Markdown.kt",
      ),
    );
    assert.ok(files.includes("apps/example/components/probe.tsx"));
    assert.ok(files.includes("apps/example/components/smoke-test.tsx"));
    assert.ok(files.includes("apps/example/hooks/use-theme.ts"));
    assert.ok(files.includes("apps/example/theme.ts"));
    assert.ok(files.includes("apps/example/assets/icon.svg"));
    assert.ok(files.includes("apps/example/app.config.js"));
    assert.ok(
      !files.some((file) => file.includes("/__tests__/")),
      "unit tests must not enter the runtime digest",
    );
    assert.ok(
      !files.some((file) => file.startsWith("apps/example/android/")),
      "generated Android app projects must not enter the runtime digest",
    );
    assert.ok(
      !files.some((file) => file.startsWith("apps/example/ios/")),
      "generated iOS app projects must not enter the runtime digest",
    );
    assert.ok(!files.includes("apps/example/.env.local"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("git-ignored files inside hashed directories stay out of the runtime digest", () => {
  const root = createReplayFixture();
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    writeFile(root, ".gitignore", "apps/example/expo-env.d.ts\n");
    writeFile(root, "apps/example/expo-env.d.ts", "/// <reference types=\"expo/types\" />\n");
    writeFile(root, "apps/example/env.d.ts", "export {};\n");

    const files = collectRuntimeFiles(root);
    assert.ok(!files.includes("apps/example/expo-env.d.ts"));
    assert.ok(files.includes("apps/example/env.d.ts"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a missing concrete source assertion or replay expectation fails freshness", () => {
  const root = createReplayFixture();
  const manifestPath = "e2e/markdown-replay-coverage.json";
  const lockPath = "e2e/markdown-replay-source-lock.json";
  try {
    refreshReplayLock({ root, manifestPath, lockPath });
    const sourcePath = "apps/example/components/probe.tsx";
    const source = fs.readFileSync(path.join(root, sourcePath), "utf8");
    writeFile(root, sourcePath, source.replace("value === undefined", "value"));

    const missingAssertion = checkReplayFreshness({
      root,
      manifestPath,
      lockPath,
    });
    assert.equal(missingAssertion.fresh, false);
    assert.match(missingAssertion.reason ?? "", /public assertion is missing/i);
    assert.throws(
      () => refreshReplayLock({ root, manifestPath, lockPath }),
      /public assertion is missing/i,
    );

    writeFile(root, sourcePath, source);
    refreshReplayLock({ root, manifestPath, lockPath });
    const original = fs.readFileSync(path.join(root, "e2e/probe.ad"), "utf8");
    writeFile(
      root,
      "e2e/probe.ad",
      original.replace('wait text "pass:probe"\n', ""),
    );

    const result = checkReplayFreshness({ root, manifestPath, lockPath });
    assert.equal(result.fresh, false);
    assert.match(result.reason ?? "", /expected text|assertion/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("all manifest flows are distinct, safe, present, and closed", () => {
  const suites = readSuites();
  assert.deepEqual(
    suites.map((suite) => suite.id),
    JSON.parse(
      fs.readFileSync(
        path.join(projectRoot, "e2e/markdown-replay-coverage.json"),
        "utf8",
      ),
    ).suites.map((suite: { id: string }) => suite.id),
  );
  for (const suite of suites) {
    const source = fs.readFileSync(path.join(projectRoot, suite.path), "utf8");
    assert.match(
      source,
      /^close\s*$/m,
      `${suite.path} must close its app flow`,
    );
    assert.match(source.trimEnd(), /\bclose\s*$/);
  }
});

test("outside symlink flows are rejected before spawning or refreshing coverage", () => {
  const root = createReplayFixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "nitro-outside-flow-"));
  let calls = 0;
  try {
    const flow = path.join(root, "e2e/probe.ad");
    const externalFlow = path.join(outside, "probe.ad");
    fs.copyFileSync(flow, externalFlow);
    fs.unlinkSync(flow);
    fs.symlinkSync(externalFlow, flow);
    assert.throws(
      () =>
        runExampleReplay({
          argv: ["--platform", "ios", "--udid", "owned-simulator"],
          manifestFile: path.join(root, "e2e/markdown-replay-coverage.json"),
          spawn: () => {
            calls += 1;
            return { status: 0 };
          },
        }),
      /escapes|symlink|regular/i,
    );
    assert.equal(calls, 0);
    assert.throws(
      () => refreshReplayLock({ root }),
      /escapes|symlink|regular/i,
    );
  } finally {
    removeTempDirectories([root, outside]);
  }
});

test("fixture and hardware coverage cannot be reported as native replay proof", () => {
  const { manifest } = readCoverageManifest(projectRoot);
  assert.ok(manifest.pending.length > 0);
  for (const row of manifest.pending) {
    assert.equal(row.state, "pending-prerequisites");
    assert.ok(row.prerequisites.length > 0 && row.acceptance.length > 0);
    assert.equal(Object.hasOwn(row, "expectedText"), false);
  }
  for (const feature of manifest.features) {
    if (feature.kind === "test-adapter") assert.ok(feature.claimLimit);
  }
});

test("missing platform or exact target fails before spawn", () => {
  const calls: unknown[][] = [];
  let tempDirectoryCalls = 0;
  const spawn = (...args: unknown[]) => {
    calls.push(args);
    return { status: 0 };
  };
  assert.throws(
    () =>
      runExampleReplay({
        argv: ["--udid", "sim-1"],
        env: {},
        makeTempDirectory: () => {
          tempDirectoryCalls += 1;
          return "unused";
        },
        spawn,
      }),
    /--platform must be ios or android/,
  );
  assert.throws(
    () =>
      runExampleReplay({
        argv: ["--platform", "ios"],
        env: {},
        makeTempDirectory: () => {
          tempDirectoryCalls += 1;
          return "unused";
        },
        spawn,
      }),
    /Provide one exact ios target with --udid/,
  );
  assert.equal(calls.length, 0);
  assert.equal(tempDirectoryCalls, 0);
});

test("invalid flow selection and ambiguous targets fail before spawn", () => {
  const calls: unknown[][] = [];
  const spawn = (...args: unknown[]) => {
    calls.push(args);
    return { status: 0 };
  };
  assert.throws(
    () =>
      parseArgs([
        "--platform",
        "ios",
        "--udid",
        "sim-1,sim-2",
        "--flow",
        "render-stress",
      ]),
    /comma-separated targets are ambiguous/,
  );
  assert.throws(
    () =>
      runExampleReplay({
        argv: [
          "--platform",
          "android",
          "--serial",
          "emulator-5554",
          "--flow",
          "does-not-exist",
        ],
        env: {},
        spawn,
      }),
    /unknown replay flow/i,
  );
  assert.equal(calls.length, 0);
});

test("runner sends the selected manifest flow to official agent-device test", () => {
  const calls: {
    command: string;
    args: string[];
    options: { cwd: string; env: NodeJS.ProcessEnv };
  }[] = [];
  const artifacts: string[] = [];
  const root = projectRoot;
  try {
    const status = runExampleReplay({
      argv: ["--platform", "ios", "--udid", "sim-123", "--flow", "render-stress"],
      env: { PATH: "/bin", USER: "fixture" },
      uuid: () => "run-123",
      makeTempDirectory: (prefix: string) => {
        const directory = fs.mkdtempSync(prefix);
        artifacts.push(directory);
        return directory;
      },
      spawn: (
        command: string,
        args: string[],
        options: { cwd: string; env: NodeJS.ProcessEnv },
      ) => {
        calls.push({ command, args, options });
        return { status: 0 };
      },
      cwd: root,
    });
    assert.equal(status, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.command, "agent-device");
    assert.deepEqual(calls[0]?.args, [
      "test",
      "e2e/qa-render-stress.ad",
      "--udid",
      "sim-123",
      "--session",
      "nitro-markdown-replay-run-123",
      "--artifacts-dir",
      artifacts[0],
      "--fail-fast",
      "--retries",
      "0",
      "--timeout",
      "180000",
    ]);
    assert.equal(calls[0]?.options.cwd, root);
    assert.equal(calls[0]?.options.env.PATH, "/bin");
    assert.equal(artifacts.length, 1);
    const relative = path.relative(os.tmpdir(), artifacts[0] ?? "");
    assert.ok(!relative.startsWith(".."));
    assert.ok(path.relative(root, artifacts[0] ?? "").startsWith(".."));
  } finally {
    removeTempDirectories(artifacts);
  }
});

test("default selection runs every manifest flow with one unique temp directory and session", () => {
  const calls: { command: string; args: string[] }[] = [];
  const artifacts: string[] = [];
  try {
    const status = runExampleReplay({
      argv: ["--platform", "android", "--serial", "emulator-5554"],
      env: {},
      uuid: () => "all-run",
      makeTempDirectory: (prefix: string) => {
        const directory = fs.mkdtempSync(prefix);
        artifacts.push(directory);
        return directory;
      },
      spawn: (command: string, args: string[]) => {
        calls.push({ command, args });
        return { status: 0 };
      },
    });
    assert.equal(status, 0);
    const suitePaths = readSuites().map(
      (suite: { path: string }) => suite.path,
    );
    assert.deepEqual(
      calls[0]?.args.slice(1, 1 + suitePaths.length),
      suitePaths,
    );
    assert.equal(artifacts.length, 1);
    assert.match(
      calls[0]?.args.join(" ") ?? "",
      /--session nitro-markdown-replay-all-run/,
    );
    assert.match(calls[0]?.args.join(" ") ?? "", /--artifacts-dir/);
    assert.ok(
      !calls.some((call) =>
        /prebuild|expo run|start --/.test(call.args.join(" ")),
      ),
    );
  } finally {
    removeTempDirectories(artifacts);
  }
});

test("separate replay invocations get distinct OS temp directories and sessions", () => {
  const calls: { args: string[] }[] = [];
  const artifacts: string[] = [];
  let nextRun = 0;
  try {
    for (const flow of ["deeplink", "render-stress"]) {
      const status = runExampleReplay({
        argv: ["--platform", "ios", "--udid", "sim-unique", "--flow", flow],
        env: {},
        uuid: () => `unique-run-${++nextRun}`,
        makeTempDirectory: (prefix: string) => {
          const directory = fs.mkdtempSync(prefix);
          artifacts.push(directory);
          return directory;
        },
        spawn: (_command: string, args: string[]) => {
          calls.push({ args });
          return { status: 0 };
        },
      });
      assert.equal(status, 0);
    }
    assert.equal(new Set(artifacts).size, 2);
    assert.notEqual(
      calls[0]?.args[calls[0]?.args.indexOf("--session") + 1],
      calls[1]?.args[calls[1]?.args.indexOf("--session") + 1],
    );
    assert.notEqual(
      calls[0]?.args[calls[0]?.args.indexOf("--artifacts-dir") + 1],
      calls[1]?.args[calls[1]?.args.indexOf("--artifacts-dir") + 1],
    );
  } finally {
    removeTempDirectories(artifacts);
  }
});

test("failed replay propagates the agent-device exit status without extra spawns", () => {
  const calls: { command: string; args: string[] }[] = [];
  const artifacts: string[] = [];
  try {
    const status = runExampleReplay({
      argv: [
        "--platform",
        "android",
        "--serial",
        "device-xyz",
        "--flow",
        "deeplink",
      ],
      env: {},
      uuid: () => "failed-run",
      makeTempDirectory: (prefix: string) => {
        const directory = fs.mkdtempSync(prefix);
        artifacts.push(directory);
        return directory;
      },
      spawn: (command: string, args: string[]) => {
        calls.push({ command, args });
        return { status: calls.length === 1 ? 17 : 0 };
      },
    });
    assert.equal(status, 17);
    assert.equal(calls.length, 1);
  } finally {
    removeTempDirectories(artifacts);
  }
});

test("spawn errors return a failing status without extra spawns", () => {
  const calls: { command: string; args: string[] }[] = [];
  const artifacts: string[] = [];
  try {
    const status = runExampleReplay({
      argv: ["--platform", "ios", "--udid", "sim-err"],
      env: {},
      uuid: () => "spawn-error",
      makeTempDirectory: (prefix: string) => {
        const directory = fs.mkdtempSync(prefix);
        artifacts.push(directory);
        return directory;
      },
      spawn: (command: string, args: string[]) => {
        calls.push({ command, args });
        return calls.length === 1
          ? { status: null, error: new Error("agent-device unavailable") }
          : { status: 0 };
      },
    });
    assert.equal(status, 1);
    assert.equal(calls.length, 1);
  } finally {
    removeTempDirectories(artifacts);
  }
});
