#!/usr/bin/env node

const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const exampleDir = path.join(projectRoot, "apps/example");
const outputDir = path.join(projectRoot, "artifacts/example-smoke");
const scheme = "nitromarkdown";
const bundleId = "com.nitromarkdown.example";
const packageName = "com.nitromarkdown.example";
const port = Number(process.env.EXAMPLE_SMOKE_PORT ?? 8081);
const launchWaitMs = Number(process.env.EXAMPLE_SMOKE_LAUNCH_WAIT_MS ?? 12000);
const smokeWaitMs = Number(process.env.EXAMPLE_SMOKE_TAP_WAIT_MS ?? 5000);

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
    smokeTap: true,
  };

  for (const arg of argv) {
    if (arg === "--android") options.android = true;
    else if (arg === "--ios") options.ios = true;
    else if (arg === "--no-start") options.startMetro = false;
    else if (arg === "--no-smoke-tap") options.smokeTap = false;
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
    }, 180000);

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

async function launchAndroid(smokeTap) {
  if (!commandWorks("adb", ["devices"])) {
    throw new Error("adb is not available");
  }

  const devices = run("adb", ["devices"]);
  if (!devices.includes("\tdevice")) {
    throw new Error("No Android emulator/device is attached");
  }

  log("Launching Android example...", "cyan");
  run("adb", ["reverse", `tcp:${port}`, `tcp:${port}`], { stdio: "ignore" });
  tryRun("adb", ["shell", "am", "force-stop", packageName], { stdio: "ignore" });
  await runAndroidExpo();
  run(
    "adb",
    [
      "shell",
      "am",
      "start",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      createDevClientUrl("127.0.0.1"),
      packageName,
    ],
    { stdio: "ignore" },
  );
  await wait(launchWaitMs);

  if (smokeTap) {
    run("adb", ["shell", "input", "tap", "300", "620"], { stdio: "ignore" });
    await wait(smokeWaitMs);
  }

  const pid = run("adb", ["shell", "pidof", packageName]).trim();
  if (!pid) throw new Error("Android app did not stay running");

  const screenshot = path.join(outputDir, "android.png");
  const png = execFileSync("adb", ["exec-out", "screencap", "-p"], { cwd: projectRoot });
  fs.writeFileSync(screenshot, png);
  log(`Android running, pid ${pid}; screenshot ${screenshot}`);
}

async function launchIos(devClientUrl, smokeTap) {
  if (!commandWorks("xcrun", ["simctl", "list", "devices", "booted"])) {
    throw new Error("xcrun simctl is not available");
  }

  const booted = run("xcrun", ["simctl", "list", "devices", "booted"]);
  const match = booted.match(/\(([0-9A-F-]{36})\) \(Booted\)/);
  if (!match) throw new Error("No booted iOS simulator found");

  const udid = match[1];
  log(`Launching iOS example on ${udid}...`, "cyan");
  tryRun("xcrun", ["simctl", "terminate", udid, bundleId], { stdio: "ignore" });
  run("xcrun", ["simctl", "openurl", udid, devClientUrl], { stdio: "ignore" });
  await wait(launchWaitMs);

  if (smokeTap && commandWorks("osascript", ["-e", "return 1"])) {
    run(
      "osascript",
      [
        "-e",
        'tell application "Simulator" to activate',
        "-e",
        'tell application "System Events" to click at {160, 315}',
      ],
      { stdio: "ignore" },
    );
    await wait(smokeWaitMs);
  }

  const screenshot = path.join(outputDir, "ios.png");
  run("xcrun", ["simctl", "io", udid, "screenshot", screenshot], { stdio: "ignore" });
  log(`iOS running on ${udid}; screenshot ${screenshot}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureOutputDir();

  await startMetroIfNeeded(options.startMetro);
  await waitForMetro();

  const iosUrl = createDevClientUrl("127.0.0.1");

  if (options.android) await launchAndroid(options.smokeTap);
  if (options.ios) await launchIos(iosUrl, options.smokeTap);

  console.log("");
  log("Example smoke launch complete.");
}

main().catch((error) => {
  log(error.message, "red");
  process.exit(1);
});
