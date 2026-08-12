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

const packageRoot = path.resolve(__dirname, "..");

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

function shellQuote(value) {
  return JSON.stringify(String(value));
}

function jsonEscape(value) {
  return value
    .replace(/["\\\n\r\t]/g, (ch) => {
      switch (ch) {
        case '"':
          return '\\"';
        case "\\":
          return "\\\\";
        case "\n":
          return "\\n";
        case "\r":
          return "\\r";
        default:
          return "\\t";
      }
    })
    .replace(/[\u0000-\u001f\u007f]/g, (ch) => {
      return `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
    });
}

function cLiteral(value) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function canonicalizeNode(node) {
  if (!node) return "null";
  const fields = [];
  if (node.content !== undefined) fields.push(`content=${jsonEscape(node.content)}`);
  if (node.level !== undefined) fields.push(`level=${node.level}`);
  if (node.href !== undefined) fields.push(`href=${jsonEscape(node.href)}`);
  if (node.title !== undefined) fields.push(`title=${jsonEscape(node.title)}`);
  if (node.alt !== undefined) fields.push(`alt=${jsonEscape(node.alt)}`);
  if (node.language !== undefined) fields.push(`language=${jsonEscape(node.language)}`);
  if (node.ordered !== undefined) fields.push(`ordered=${node.ordered}`);
  if (node.start !== undefined) fields.push(`start=${node.start}`);
  if (node.checked !== undefined) fields.push(`checked=${node.checked}`);
  if (node.isHeader !== undefined) fields.push(`isHeader=${node.isHeader}`);
  if (node.align !== undefined) fields.push(`align=${node.align}`);
  if (node.children !== undefined && node.children.length > 0) {
    fields.push(`children=[${node.children.map(canonicalizeNode).join(",")}]`);
  }
  return fields.length === 0 ? node.type : `${node.type}{${fields.join(",")}}`;
}

function generateCorpusHeader(corpusPath, entries) {
  const lines = entries.map((entry) => {
    return `  {"${entry.name}", "${cLiteral(entry.markdown)}", "${cLiteral(
      entry.expected,
    )}"},`;
  });
  return `// Generated from ${corpusPath} by scripts/test-cpp.js. Do not edit.
#pragma once
#include <string>
#include <vector>
namespace NitroMarkdown {
struct FlattenCorpusEntry { const char* name; const char* markdown; const char* expected; };
inline const std::vector<FlattenCorpusEntry> kFlattenCorpus = {
${lines.join("\n")}
};
}
`;
}

function generateConformanceHeader(corpusPath, entries) {
  const lines = entries.map((entry) => {
    return `  {"${entry.name}", "${cLiteral(entry.markdown)}", "${cLiteral(
      canonicalizeNode(entry.expected),
    )}", "${cLiteral(JSON.stringify(entry.options ?? {}))}"},`;
  });
  return `// Generated from ${corpusPath} by scripts/test-cpp.js. Do not edit.
#pragma once
#include <string>
#include <vector>
namespace NitroMarkdown {
struct ConformanceCorpusEntry { const char* name; const char* markdown; const char* expectedCanonical; const char* optionsJson; };
inline const std::vector<ConformanceCorpusEntry> kConformanceCorpus = {
${lines.join("\n")}
};
}
`;
}

function writeCorpusHeaders(generatedDir) {
  const flattenPath = path.join(packageRoot, "src", "__fixtures__", "flatten-corpus.json");
  const conformancePath = path.join(
    packageRoot,
    "src",
    "__fixtures__",
    "conformance-corpus.json",
  );

  const flattenCorpus = JSON.parse(fs.readFileSync(flattenPath, "utf8"));
  const conformanceCorpus = JSON.parse(fs.readFileSync(conformancePath, "utf8"));

  fs.writeFileSync(
    path.join(generatedDir, "FlattenCorpus.hpp"),
    generateCorpusHeader(flattenPath, flattenCorpus),
  );
  fs.writeFileSync(
    path.join(generatedDir, "ConformanceCorpus.hpp"),
    generateConformanceHeader(conformancePath, conformanceCorpus),
  );
}

function commandPath(command) {
  try {
    return execSync(`command -v ${shellQuote(command)}`, {
      encoding: "utf8",
    }).trim();
  } catch {
    try {
      return execSync(`xcrun --find ${shellQuote(command)}`, {
        encoding: "utf8",
      }).trim();
    } catch {
      return null;
    }
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
  const args = new Set(process.argv.slice(2));
  const collectCoverage = args.has("--coverage");
  const minLinesArg = process.argv
    .slice(2)
    .find((arg) => arg.startsWith("--min-lines="));
  const minLineCoverage = minLinesArg
    ? Number(minLinesArg.replace("--min-lines=", ""))
    : 90;
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

  const llvmCov = collectCoverage ? commandPath("llvm-cov") : null;
  const llvmProfdata = collectCoverage ? commandPath("llvm-profdata") : null;
  const cCompiler = collectCoverage
    ? commandPath(process.env.CC || "clang")
    : null;
  const cxxCompiler = collectCoverage
    ? commandPath(process.env.CXX || "clang++")
    : null;
  if (
    collectCoverage &&
    (!llvmCov || !llvmProfdata || !cCompiler || !cxxCompiler || isWindows)
  ) {
    log("C++ coverage requires llvm-cov and llvm-profdata on macOS/Linux", "red");
    process.exit(1);
  }

  log("Preparing build directory...");
  removeDir(buildDir);
  ensureDir(buildDir);

  const generatedDir = path.join(buildDir, "generated");
  ensureDir(generatedDir);
  writeCorpusHeaders(generatedDir);

  log("Configuring with CMake...");

  let cmakeGenerator = "";
  if (isWindows && commandExists("ninja")) {
    cmakeGenerator = "-G Ninja";
  }

  const coverageFlags = collectCoverage
    ? [
        "-DCMAKE_BUILD_TYPE=Debug",
        `-DCMAKE_C_COMPILER=${shellQuote(cCompiler)}`,
        `-DCMAKE_CXX_COMPILER=${shellQuote(cxxCompiler)}`,
        '-DCMAKE_C_FLAGS="-fprofile-instr-generate -fcoverage-mapping -O0 -g"',
        '-DCMAKE_CXX_FLAGS="-fprofile-instr-generate -fcoverage-mapping -O0 -g"',
        '-DCMAKE_EXE_LINKER_FLAGS="-fprofile-instr-generate -fcoverage-mapping"',
      ].join(" ")
    : "";
  const cmakeConfigCommand = `cmake ${cmakeGenerator} ${coverageFlags} "${cppDir}"`.trim();

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

  const testEnv = collectCoverage
    ? { ...process.env, LLVM_PROFILE_FILE: path.join(buildDir, "coverage-%p.profraw") }
    : process.env;

  if (!execCommand(`"${testExecutable}"`, { cwd: buildDir, env: testEnv })) {
    log("Tests failed", "red");
    process.exit(1);
  }

  if (collectCoverage) {
    log("Collecting C++ line coverage...");
    const rawProfiles = fs
      .readdirSync(buildDir)
      .filter((file) => file.endsWith(".profraw"))
      .map((file) => `"${path.join(buildDir, file)}"`)
      .join(" ");
    const profilePath = path.join(buildDir, "coverage.profdata");
    const parserSource = path.join(cppDir, "core", "NitroMD4CParser.cpp");

    if (!rawProfiles) {
      log("No coverage profiles were produced", "red");
      process.exit(1);
    }

    if (
      !execCommand(`"${llvmProfdata}" merge -sparse ${rawProfiles} -o "${profilePath}"`, {
        cwd: buildDir,
      })
    ) {
      log("Failed to merge C++ coverage profiles", "red");
      process.exit(1);
    }

    const report = execSync(
      `"${llvmCov}" report "${testExecutable}" -instr-profile="${profilePath}" "${parserSource}"`,
      { cwd: buildDir, encoding: "utf8" },
    );
    process.stdout.write(report);

    const totalLine = report
      .split("\n")
      .find((line) => line.trim().startsWith("TOTAL"));
    const percentages = totalLine?.match(/(\d+(?:\.\d+)?)%/g) ?? [];
    const lineCoverage = percentages[2]
      ? Number(percentages[2].replace("%", ""))
      : NaN;

    if (!Number.isFinite(lineCoverage)) {
      log("Could not read C++ line coverage from llvm-cov output", "red");
      process.exit(1);
    }

    if (lineCoverage < minLineCoverage) {
      log(
        `C++ line coverage ${lineCoverage.toFixed(2)}% is below ${minLineCoverage}%`,
        "red",
      );
      process.exit(1);
    }

    log(`C++ line coverage ${lineCoverage.toFixed(2)}% >= ${minLineCoverage}%`);
  }

  log("C++ tests completed!");
}

main();
