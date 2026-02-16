#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { rimrafSync } = require("rimraf");

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};

function log(message, color = "green") {
  console.log(colors[color](message));
}

function execCommand(command, options = {}) {
  try {
    execSync(command, {
      stdio: "inherit",
      shell: true,
      ...options,
    });
    return true;
  } catch {
    return false;
  }
}

function commandExists(command) {
  try {
    const checkCommand =
      process.platform === "win32"
        ? `where ${command}`
        : `command -v ${command}`;
    execSync(checkCommand, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function removeDir(dirPath) {
  rimrafSync(dirPath);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function main() {
  const packageRoot = path.resolve(__dirname, "..");
  const buildDir = path.join(packageRoot, "build", "cpp-test");
  const cppDir = path.join(packageRoot, "cpp");
  const isWindows = process.platform === "win32";

  log("Building and running C++ tests for MD4C Parser...");

  if (!commandExists("cmake")) {
    log("CMake not found. Please install CMake:", "red");
    log("  • macOS: brew install cmake", "cyan");
    log("  • Linux: sudo apt install cmake (or equivalent)", "cyan");
    log("  • Windows: https://cmake.org/download/", "cyan");
    process.exit(1);
  }

  log("Preparing build directory...");
  removeDir(buildDir);
  ensureDir(buildDir);

  log("Configuring with CMake...");

  let cmakeGenerator = "";
  if (isWindows && commandExists("ninja")) {
    cmakeGenerator = "-G Ninja";
  }

  const cmakeConfigCommand = `cmake ${cmakeGenerator} "${cppDir}"`.trim();

  if (!execCommand(cmakeConfigCommand, { cwd: buildDir })) {
    log("CMake configuration failed", "red");
    process.exit(1);
  }

  log("Building test executable...");
  const cmakeBuildCommand = "cmake --build . --target MD4CParserTest";

  if (!execCommand(cmakeBuildCommand, { cwd: buildDir })) {
    log("Build failed", "red");
    process.exit(1);
  }

  log("Running tests...");

  let testExecutable;
  if (isWindows) {
    const possiblePaths = [
      path.join(buildDir, "MD4CParserTest.exe"),
      path.join(buildDir, "Debug", "MD4CParserTest.exe"),
      path.join(buildDir, "Release", "MD4CParserTest.exe"),
    ];
    testExecutable = possiblePaths.find((p) => fs.existsSync(p));
    if (!testExecutable) {
      log("Could not find test executable", "red");
      process.exit(1);
    }
  } else {
    testExecutable = path.join(buildDir, "MD4CParserTest");
  }

  if (!fs.existsSync(testExecutable)) {
    log(`Test executable not found at: ${testExecutable}`, "red");
    process.exit(1);
  }

  if (!execCommand(`"${testExecutable}"`, { cwd: buildDir })) {
    log("Tests failed", "red");
    process.exit(1);
  }

  log("C++ tests completed!");
}

main();
