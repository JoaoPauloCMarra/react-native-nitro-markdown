#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { log } = require("./console-log.js");

const projectRoot = path.resolve(__dirname, "..");

function execCommand(command, options = {}) {
  try {
    execSync(command, {
      stdio: "inherit",
      cwd: projectRoot,
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

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createPlaceholderPng(filePath) {
  const minimalPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  fs.writeFileSync(filePath, minimalPng);
}

async function main() {
  console.log("");
  log("🚀 Setting up react-native-nitro-markdown...");
  console.log("");

  if (!commandExists("bun")) {
    log("Bun not found. Please install bun first:", "yellow");
    log("  • macOS/Linux: curl -fsSL https://bun.sh/install | bash", "cyan");
    log('  • Windows: powershell -c "irm bun.sh/install.ps1 | iex"', "cyan");
    log("  • Or visit: https://bun.sh/docs/installation", "cyan");
    process.exit(1);
  }

  log("📦 Installing dependencies...");
  if (!execCommand("bun install")) {
    log("Failed to install dependencies", "red");
    process.exit(1);
  }

  log("⚡ Generating Nitro bindings...");
  const packageDir = path.join(
    projectRoot,
    "packages/react-native-nitro-markdown",
  );
  if (!execCommand("bun run codegen", { cwd: packageDir })) {
    log("Failed to generate Nitro bindings", "red");
    process.exit(1);
  }

  log("🔨 Building library...");
  if (!execCommand("bun run build", { cwd: packageDir })) {
    log("Failed to build library", "red");
    process.exit(1);
  }

  const assetsDir = path.join(projectRoot, "apps/example/assets");
  const iconPath = path.join(assetsDir, "icon.png");

  if (!fs.existsSync(iconPath)) {
    log("🖼️  Creating placeholder assets...");
    ensureDir(assetsDir);

    const assetFiles = ["icon.png", "splash.png", "adaptive-icon.png"];
    for (const assetFile of assetFiles) {
      const assetPath = path.join(assetsDir, assetFile);
      if (!fs.existsSync(assetPath)) {
        createPlaceholderPng(assetPath);
      }
    }
  }

  console.log("");
  log("✅ Setup complete!");
  console.log("");
  console.log("Next steps:");
  console.log("  1. cd apps/example");
  console.log("  2. bun run prebuild");
  console.log("  3. bun run ios  # or bun run android");
  console.log("");
}

main().catch((error) => {
  log(`Setup failed: ${error.message}`, "red");
  process.exit(1);
});
