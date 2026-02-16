#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const https = require("https");
const path = require("path");

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};

const projectRoot = path.resolve(__dirname, "..");

function log(message, color = "green") {
  console.log(colors[color](message));
}

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

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          fs.unlinkSync(destPath);
          downloadFile(response.headers.location, destPath)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
  });
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

  const md4cDir = path.join(
    projectRoot,
    "packages/react-native-nitro-markdown/cpp/md4c",
  );
  log("📥 Downloading md4c source files...");

  ensureDir(md4cDir);

  const md4cFiles = [
    {
      name: "md4c.h",
      url: "https://raw.githubusercontent.com/mity/md4c/master/src/md4c.h",
    },
    {
      name: "md4c.c",
      url: "https://raw.githubusercontent.com/mity/md4c/master/src/md4c.c",
    },
  ];

  for (const file of md4cFiles) {
    const destPath = path.join(md4cDir, file.name);
    try {
      await downloadFile(file.url, destPath);
      console.log(`   ✓ Downloaded ${file.name}`);
    } catch (error) {
      log(`   ✗ Failed to download ${file.name}: ${error.message}`, "red");
      process.exit(1);
    }
  }

  log("⚡ Generating Nitro bindings...");
  const packageDir = path.join(
    projectRoot,
    "packages/react-native-nitro-markdown",
  );
  execCommand("bun run codegen", { cwd: packageDir });

  log("🔨 Building library...");
  execCommand("bun run build", { cwd: packageDir });

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
