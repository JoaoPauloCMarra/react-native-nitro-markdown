const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { transformSync } = require("@swc/core");

const projectRoot = path.resolve(__dirname, "..");
const sourcePath = "packages/react-native-nitro-markdown/src/utils/incremental-ast.ts";
const baselineRef = process.argv[2];
const outputPath = process.argv[3];

if (!baselineRef || process.argv.length > 4) {
  throw new Error("Usage: bun scripts/benchmark-stream-ast.js <baseline-ref> [runtime-expression.js]");
}

function git(args) {
  return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
}

const baselineCommit = git(["rev-parse", "--verify", "--end-of-options", `${baselineRef}^{commit}`]);
const beforeSource = git(["show", `${baselineCommit}:${sourcePath}`]);
const afterSource = fs.readFileSync(path.join(projectRoot, sourcePath), "utf8");
const candidateSourceSha256 = createHash("sha256").update(afterSource).digest("hex");

function compile(source) {
  const { code } = transformSync(source, {
    jsc: { parser: { syntax: "typescript" }, target: "es2019" },
    module: { type: "commonjs" },
  });
  return `(() => {
    const exports = {};
    const require = (name) => {
      if (name === "../headless" || name === "./freeze-ast") return {};
      throw new Error("Unexpected benchmark dependency: " + name);
    };
    ${code}
    return exports.getNextStreamAst;
  })()`;
}

function experiment(before, after) {
  function ast(text) {
    return {
      type: "document",
      end: text.length,
      children: [{
        type: "paragraph",
        end: text.length,
        children: [{ type: "text", content: text, end: text.length }],
      }],
    };
  }

  const segments = ["plain", "\n", "\r\n", "\r", "```", "~~~~", "   ```", "    ~~~", "\t```", "```js\n", "~", "`", "💡"];
  let seed = 123456789;
  function random(max) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  }

  for (let test = 0; test < 5000; test++) {
    let previousText = "";
    let appended = "";
    for (let i = 0; i < 20; i++) previousText += segments[random(segments.length)];
    for (let i = 0; i < 3; i++) appended += segments[random(segments.length)];
    const nextText = previousText + appended;
    const result = (run) => {
      let parses = 0;
      const output = run({
        previousText,
        nextText,
        previousAst: ast(previousText),
        parseCurrent: () => {
          parses++;
          return ast(nextText);
        },
      });
      return JSON.stringify({ output, parses });
    };
    if (result(before) !== result(after)) {
      throw new Error(`Parity failed for case ${test}`);
    }
  }

  function percentiles(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const at = (fraction) => sorted[Math.floor(sorted.length * fraction)];
    return { p50: at(0.5), p95: at(0.95), p99: at(0.99) };
  }

  const results = [];
  for (const lines of [1000, 10000]) {
    const previousText = "Ordinary text on this line.\n".repeat(lines) + "tail";
    const input = {
      previousText,
      nextText: previousText + " more",
      previousAst: ast(previousText),
    };
    const samples = { before: [], after: [] };
    const variants = { before, after };
    for (let round = 0; round < 31; round++) {
      const order = round % 2 ? ["after", "before"] : ["before", "after"];
      for (const name of order) {
        const start = performance.now();
        for (let update = 0; update < 20; update++) variants[name](input);
        if (round > 0) samples[name].push((performance.now() - start) / 20);
      }
    }
    results.push({
      utf16Length: previousText.length,
      lines,
      samples: 30,
      updatesPerSample: 20,
      beforeMs: percentiles(samples.before),
      afterMs: percentiles(samples.after),
    });
  }
  return {
    parityCases: 5000,
    scope: "Plain-text append helper; no native parse, rendering, or frame measurements",
    metric: "Quantiles of per-update time averaged within each batch, in milliseconds",
    results,
  };
}

const expression = `(${experiment.toString()})(${compile(beforeSource)}, ${compile(afterSource)})`;
if (outputPath) {
  fs.writeFileSync(outputPath, expression);
  console.log(`Runtime benchmark written to ${outputPath}; baseline ${baselineCommit}`);
} else {
  const report = vm.runInNewContext(expression, { performance }, { timeout: 60000 });
  console.log(JSON.stringify({
    baselineCommit,
    candidateSourceSha256,
    runtime: process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.version}`,
    platform: `${process.platform}-${process.arch}`,
    ...report,
  }, null, 2));
}
