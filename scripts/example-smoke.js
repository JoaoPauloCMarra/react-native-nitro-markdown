#!/usr/bin/env node

const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const exampleDir = path.join(projectRoot, "apps/example");
const outputDir = path.join(projectRoot, "artifacts/example-smoke");
const reportPath = path.join(outputDir, "report.json");
const scheme = "nitromarkdown";
const bundleId = "com.nitromarkdown.example";
const packageName = "com.nitromarkdown.example";
const port = Number(process.env.EXAMPLE_SMOKE_PORT ?? 8081);
const launchWaitMs = Number(process.env.EXAMPLE_SMOKE_LAUNCH_WAIT_MS ?? 15000);
const settleWaitMs = Number(process.env.EXAMPLE_SMOKE_SETTLE_WAIT_MS ?? 3000);

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};

function log(message, color = "green") {
  console.log(colors[color](message));
}

function parseArgs(argv) {
  const options = {
    android: false,
    ios: false,
    startMetro: true,
    allowSkip: false,
  };

  for (const arg of argv) {
    if (arg === "--android") options.android = true;
    else if (arg === "--ios") options.ios = true;
    else if (arg === "--no-start") options.startMetro = false;
    else if (arg === "--allow-skip") options.allowSkip = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.android && !options.ios) {
    options.android = true;
    options.ios = true;
  }

  return options;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    ...options,
  });
}

function tryRun(command, args, options = {}) {
  try {
    run(command, args, options);
  } catch {
    // Optional cleanup commands can fail when the app is not installed/running.
  }
}

function commandWorks(command, args = []) {
  try {
    run(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runAndroidExpo() {
  return new Promise((resolve, reject) => {
    const androidSdkPath =
      process.env.ANDROID_HOME ??
      process.env.ANDROID_SDK_ROOT ??
      path.join(os.homedir(), "Library/Android/sdk");
    const child = spawn("bun", ["run", "--cwd", "apps/example", "android"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ANDROID_HOME: androidSdkPath,
        ANDROID_SDK_ROOT: androidSdkPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let resolved = false;
    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      child.kill("SIGTERM");
      reject(new Error("Android Expo runner timed out"));
    }, 300000);

    const handleOutput = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      if (!resolved && text.includes("Android Bundled")) {
        resolved = true;
        clearTimeout(timeout);
        setTimeout(() => {
          child.kill("SIGTERM");
          resolve();
        }, 3000);
      }
    };

    child.stdout.on("data", handleOutput);
    child.stderr.on("data", handleOutput);
    child.on("error", (error) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Android Expo runner exited with ${code}`));
    });
  });
}

function isPortOpen(host, targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: targetPort });
    socket.setTimeout(500);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function waitForMetro() {
  for (let i = 0; i < 40; i += 1) {
    if (
      (await isPortOpen("127.0.0.1", port)) ||
      (await isPortOpen("::1", port)) ||
      (await isPortOpen("localhost", port))
    ) {
      return;
    }
    await wait(500);
  }

  throw new Error(`Metro did not start on port ${port}`);
}

function createDevClientUrl(host) {
  const bundleUrl = encodeURIComponent(`http://${host}:${port}`);
  return `${scheme}://expo-development-client/?url=${bundleUrl}`;
}

async function startMetroIfNeeded(enabled) {
  if (!enabled) return null;

  if (
    (await isPortOpen("127.0.0.1", port)) ||
    (await isPortOpen("::1", port)) ||
    (await isPortOpen("localhost", port))
  ) {
    log(`Metro already listening on ${port}`, "cyan");
    return null;
  }

  log(`Starting Metro on ${port}...`, "cyan");
  const metroLog = path.join(outputDir, "metro.log");
  const logFd = fs.openSync(metroLog, "a");
  const child = spawn(
    "bunx",
    ["expo", "start", "--dev-client", "--localhost", "--port", String(port)],
    {
      cwd: exampleDir,
      detached: true,
      stdio: ["ignore", logFd, logFd],
    },
  );
  child.unref();
  return child;
}

function ensureOutputDir() {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Deterministic smoke reporter. Every test records a terminal state:
 * executed (passed), explicitly skipped with a reason, or failed.
 * The report is machine-readable JSON; no fixed test-count assertions exist.
 */
function createReporter() {
  const tests = [];
  return {
    record(platform, name, status, reason) {
      tests.push({ platform, name, status, reason: reason ?? null });
      const icon = status === "passed" ? "✓" : status === "skipped" ? "⊘" : "✗";
      const detail = status === "passed" ? "" : ` (${reason ?? "no reason"})`;
      console.log(`  ${icon} [${platform}] ${name}${detail}`);
    },
    finish({ requiredPlatforms, allowSkip }) {
      const failed = tests.filter((test) => test.status === "failed");
      for (const platform of requiredPlatforms) {
        const executed = tests.some(
          (test) => test.platform === platform && test.status === "passed",
        );
        if (!executed && !allowSkip) {
          failed.push({
            platform,
            name: "platform-smoke-execution",
            status: "failed",
            reason: `No smoke test passed on ${platform}; rerun with --allow-skip only when device absence is intended`,
          });
        }
      }
      fs.writeFileSync(reportPath, JSON.stringify({ tests }, null, 2));
      log(`\nSmoke report written to ${reportPath}`, "cyan");
      if (failed.length > 0) {
        log(
          `Smoke failed: ${failed.length} failed / ${tests.length} total (${tests.filter((t) => t.status === "passed").length} passed, ${tests.filter((t) => t.status === "skipped").length} skipped)`,
          "red",
        );
        process.exit(1);
      }
      log(
        `Smoke complete: ${tests.length} tests, 0 failed, ${tests.filter((t) => t.status === "skipped").length} skipped with reasons`,
      );
    },
  };
}

// Android: deterministic UI assertions via uiautomator dumps (stable text
// identifiers instead of fixed coordinate taps).
function androidDumpWindow() {
  tryRun("adb", ["shell", "uiautomator", "dump", "/sdcard/window_dump.xml"], {
    stdio: "ignore",
  });
  try {
    return run("adb", ["shell", "cat", "/sdcard/window_dump.xml"]);
  } catch {
    return "";
  }
}

function androidFindTextBounds(dumpXml, text) {
  const escaped = text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const pattern = new RegExp(
    `<node[^>]*text="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
  );
  const match = dumpXml.match(pattern);
  if (!match) return null;
  const x1 = Number(match[1]);
  const y1 = Number(match[2]);
  const x2 = Number(match[3]);
  const y2 = Number(match[4]);
  return {
    x: Math.floor((x1 + x2) / 2),
    y: Math.floor((y1 + y2) / 2),
  };
}

function androidDumpContains(dumpXml, text) {
  const escaped = text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return new RegExp(`<node[^>]*text="${escaped}"`).test(dumpXml);
}

async function runAndroidSmoke(reporter) {
  if (!commandWorks("adb", ["devices"])) {
    reporter.record("android", "adb available", "skipped", "adb is not installed");
    return;
  }

  const devices = run("adb", ["devices"]);
  if (!devices.includes("\tdevice")) {
    reporter.record(
      "android",
      "emulator attached",
      "skipped",
      "no Android emulator/device is attached",
    );
    return;
  }
  reporter.record("android", "emulator attached", "passed");

  log("Launching Android example...", "cyan");
  run("adb", ["reverse", `tcp:${port}`, `tcp:${port}`], { stdio: "ignore" });
  tryRun("adb", ["shell", "am", "force-stop", packageName], { stdio: "ignore" });
  await runAndroidExpo();
  await wait(launchWaitMs);

  const pid = run("adb", ["shell", "pidof", packageName]).trim();
  if (!pid) {
    reporter.record("android", "app stays running", "failed", "app process not found");
    return;
  }
  reporter.record("android", "app stays running", "passed");

  const screenshot = path.join(outputDir, "android.png");
  const png = execFileSync("adb", ["exec-out", "screencap", "-p"], {
    cwd: projectRoot,
  });
  fs.writeFileSync(screenshot, png);
  log(`Android screenshot ${screenshot}`, "cyan");

  const tabs = [
    { label: "Bench", expected: "Latest run" },
    { label: "Default", expected: "Nitro Markdown" },
    { label: "Styles", expected: "Theming" },
    { label: "Custom", expected: "Note" },
    { label: "Stream", expected: "Streaming Performance Lab" },
  ];

  for (const tab of tabs) {
    const dump = androidDumpWindow();
    if (!dump) {
      reporter.record(
        "android",
        `tab ${tab.label} content`,
        "skipped",
        "uiautomator dump produced no output",
      );
      continue;
    }

    if (!androidDumpContains(dump, tab.label)) {
      reporter.record(
        "android",
        `tab ${tab.label} visible`,
        "failed",
        `tab label "${tab.label}" not found in UI dump`,
      );
      continue;
    }
    reporter.record("android", `tab ${tab.label} visible`, "passed");

    const bounds = androidFindTextBounds(dump, tab.label);
    if (!bounds) {
      reporter.record(
        "android",
        `tab ${tab.label} tappable`,
        "skipped",
        "tab label bounds not found in UI dump",
      );
      continue;
    }

    run("adb", ["shell", "input", "tap", String(bounds.x), String(bounds.y)], {
      stdio: "ignore",
    });
    await wait(settleWaitMs);

    const afterTap = androidDumpWindow();
    if (!afterTap) {
      reporter.record(
        "android",
        `tab ${tab.label} content`,
        "skipped",
        "uiautomator dump produced no output after tap",
      );
      continue;
    }
    if (androidDumpContains(afterTap, tab.expected)) {
      reporter.record("android", `tab ${tab.label} content`, "passed");
    } else {
      reporter.record(
        "android",
        `tab ${tab.label} content`,
        "failed",
        `expected marker "${tab.expected}" not found after tapping "${tab.label}"`,
      );
    }
  }
}

async function runIosSmoke(reporter) {
  if (!commandWorks("xcrun", ["simctl", "list", "devices", "booted"])) {
    reporter.record("ios", "simctl available", "skipped", "xcrun simctl is not available");
    return;
  }

  const booted = run("xcrun", ["simctl", "list", "devices", "booted"]);
  const match = booted.match(/\(([0-9A-F-]{36})\) \(Booted\)/);
  if (!match) {
    reporter.record(
      "ios",
      "booted simulator",
      "skipped",
      "no booted iOS simulator found",
    );
    return;
  }
  reporter.record("ios", "booted simulator", "passed");

  const udid = match[1];
  const devClientUrl = createDevClientUrl("127.0.0.1");
  log(`Launching iOS example on ${udid}...`, "cyan");
  tryRun("xcrun", ["simctl", "terminate", udid, bundleId], { stdio: "ignore" });
  run("xcrun", ["simctl", "openurl", udid, devClientUrl], { stdio: "ignore" });
  await wait(launchWaitMs);

  const installed = run("xcrun", ["simctl", "listapps", udid]);
  if (!installed.includes(bundleId)) {
    reporter.record("ios", "app installed", "failed", "bundle not present in simctl listapps");
    return;
  }
  reporter.record("ios", "app installed", "passed");

  const launched = run("xcrun", ["simctl", "launch", udid, bundleId]);
  const launchedOk = launched.includes("succeeded") || launched.includes(bundleId);
  reporter.record(
    "ios",
    "app launches",
    launchedOk ? "passed" : "failed",
    launchedOk ? undefined : `simctl launch returned: ${launched.trim()}`,
  );

  const screenshot = path.join(outputDir, "ios.png");
  run("xcrun", ["simctl", "io", udid, "screenshot", screenshot], {
    stdio: "ignore",
  });
  log(`iOS screenshot ${screenshot}`, "cyan");

  // iOS has no supported content-level UI dump API via simctl alone. Content
  // assertions require idb or a device agent; they are recorded as explicit
  // skips so the run is never a silent no-op.
  for (const tab of ["Bench", "Default", "Styles", "Custom", "Stream"]) {
    reporter.record(
      "ios",
      `tab ${tab} content`,
      "skipped",
      "iOS content assertions need idb/a11y dump; screenshot artifact captured",
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureOutputDir();
  const reporter = createReporter();
  const requiredPlatforms = [];

  await startMetroIfNeeded(options.startMetro);
  await waitForMetro();

  if (options.android) {
    requiredPlatforms.push("android");
    await runAndroidSmoke(reporter);
  }
  if (options.ios) {
    requiredPlatforms.push("ios");
    await runIosSmoke(reporter);
  }

  reporter.finish({ requiredPlatforms, allowSkip: options.allowSkip });
}

main().catch((error) => {
  log(error.message, "red");
  process.exit(1);
});
