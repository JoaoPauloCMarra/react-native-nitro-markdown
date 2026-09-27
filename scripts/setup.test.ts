import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtures: string[] = [];

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "nitro-markdown-setup-"));
  fixtures.push(root);

  const scriptDir = join(root, "scripts");
  const packageDir = join(root, "packages/react-native-nitro-markdown");
  const exampleDir = join(root, "apps/example");
  const binaryDir = join(root, "bin");
  mkdirSync(scriptDir, { recursive: true });
  mkdirSync(join(packageDir, "cpp/md4c"), { recursive: true });
  mkdirSync(exampleDir, { recursive: true });
  mkdirSync(binaryDir, { recursive: true });

  copyFileSync(
    fileURLToPath(new URL("./setup.js", import.meta.url)),
    join(scriptDir, "setup.js"),
  );

  const commandLog = join(root, "commands.log");
  const bunShim = join(binaryDir, "bun");
  writeFileSync(
    bunShim,
    `#!/bin/sh
printf '%s\\n' "$*" >> "$NITRO_SETUP_COMMAND_LOG"
if [ "$NITRO_SETUP_FAIL" = "$*" ]; then
  exit 17
fi
exit 0
`,
  );
  chmodSync(bunShim, 0o755);

  const preloadPath = join(root, "mock-network.cjs");
  writeFileSync(
    preloadPath,
    `const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");
const https = require("node:https");
https.get = (_url, callback) => {
  const request = new EventEmitter();
  process.nextTick(() => {
    const response = Readable.from(["fixture download"]);
    response.statusCode = 200;
    response.headers = {};
    callback(response);
  });
  return request;
};
`,
  );

  const result = (failure = "") =>
    spawnSync(process.execPath, [join(scriptDir, "setup.js")], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binaryDir}:${process.env.PATH ?? ""}`,
        NODE_OPTIONS: `--require=${preloadPath}`,
        NITRO_SETUP_COMMAND_LOG: commandLog,
        NITRO_SETUP_FAIL: failure,
      },
    });

  const commands = () =>
    existsSync(commandLog)
      ? readFileSync(commandLog, "utf8").trim().split("\n")
      : [];

  return { root, packageDir, result, commands };
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

describe("setup script lifecycle", () => {
  test("stops after codegen fails and exits unsuccessfully", () => {
    const fixture = createFixture();

    const result = fixture.result("run codegen");

    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("Setup complete!");
    expect(fixture.commands()).toEqual([
      "install",
      "run codegen",
    ]);
    expect(existsSync(join(fixture.root, "apps/example/assets/icon.png"))).toBe(
      false,
    );
  });

  test("stops after build fails and exits unsuccessfully", () => {
    const fixture = createFixture();

    const result = fixture.result("run build");

    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("Setup complete!");
    expect(fixture.commands()).toEqual([
      "install",
      "run codegen",
      "run build",
    ]);
    expect(existsSync(join(fixture.root, "apps/example/assets/icon.png"))).toBe(
      false,
    );
  });

  test("keeps the successful setup steps and completion message", () => {
    const fixture = createFixture();

    const result = fixture.result();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Setup complete!");
    expect(fixture.commands()).toEqual([
      "install",
      "run codegen",
      "run build",
    ]);
    for (const asset of ["icon.png", "splash.png", "adaptive-icon.png"]) {
      expect(
        existsSync(join(fixture.root, "apps/example/assets", asset)),
      ).toBe(true);
    }
    expect(
      existsSync(join(fixture.packageDir, "cpp/md4c/md4c.h")),
    ).toBe(true);
  });
});
