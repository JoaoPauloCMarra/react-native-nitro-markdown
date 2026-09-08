const fs = require("node:fs");

const [suite, outputPath] = process.argv.slice(2);
const suites = ["session", "parse", "ast", "correctness", "lifecycle", "render"];
if (!suites.includes(suite) || !outputPath || process.argv.length !== 4) {
  throw new Error(`Usage: bun scripts/stress-package.js <${suites.join("|")}> <runtime-expression.js>`);
}

function experiment(suiteName, requireModule) {
  if (!globalThis.HermesInternal) throw new Error("Run this workload in the example app's Hermes runtime");
  const modules = Array.from(requireModule.getModules().entries());
  function load(suffix) {
    const match = modules.find(([, module]) => module.verboseName?.endsWith(suffix));
    if (!match) throw new Error(`Module not loaded: ${suffix}`);
    return requireModule(match[0]);
  }
  const headless = load("/src/headless.ts");
  const sessions = load("/src/MarkdownSession.ts");
  const incremental = load("/utils/incremental-ast.ts");
  const errors = load("/src/errors.ts");
  const results = [];
  let checks = 0;
  const failures = [];

  function check(name, actual, expected) {
    checks += 1;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push({ name, actual, expected });
    }
  }

  function measure(name, run, samples = 20) {
    for (let warmup = 0; warmup < 3; warmup += 1) run();
    const times = [];
    let observed;
    for (let sample = 0; sample < samples; sample += 1) {
      const start = performance.now();
      observed = run();
      times.push(performance.now() - start);
    }
    times.sort((left, right) => left - right);
    results.push({
      name,
      samples,
      p50Ms: times[Math.floor(samples * 0.5)],
      p95Ms: times[Math.floor(samples * 0.95)],
      observed,
    });
  }

  const emoji = String.fromCodePoint(128512);
  const unit = `## Heading\n\nPlain **bold** text with ${emoji} cafe.\n\n`;
  function fixture(size) {
    return unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
  }

  if (suiteName === "render") {
    if (globalThis.__nitroMarkdownRenderStress?.running) throw new Error("A render stress run is already active");
    const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    let controller;
    for (const id of hook.renderers.keys()) {
      for (const root of hook.getFiberRoots(id)) {
        const pending = [root.current];
        while (pending.length) {
          const fiber = pending.pop();
          const name = fiber.type?.name || fiber.type?.type?.name;
          if (name === "MarkdownRendererPanel" && fiber.memoizedProps?.hasContent) {
            controller = fiber.memoizedProps.session;
          }
          if (fiber.child) pending.push(fiber.child);
          if (fiber.sibling) pending.push(fiber.sibling);
        }
      }
    }
    if (!controller) throw new Error("Open Token stream, start it, then pause before this workload");
    const session = controller.getSession();
    const originalText = session.getAllText();
    const initialText = fixture(16000) + " tail";
    const chunk = " plain token";
    const report = { running: true, updates: 0, initialLength: initialText.length };
    globalThis.__nitroMarkdownRenderStress = report;
    const frames = [];
    let lastFrame;
    let frameId;
    let timer;
    let deadline;
    const started = performance.now();
    function finish(error) {
      if (!report.running) return;
      clearTimeout(timer);
      clearTimeout(deadline);
      globalThis.cancelAnimationFrame(frameId);
      report.running = false;
      report.elapsedMs = performance.now() - started;
      report.textMatches = session.getAllText() === initialText + chunk.repeat(report.updates);
      frames.sort((left, right) => left - right);
      report.jsFrameCallbacks = frames.length;
      report.jsFrameGapP50Ms = frames[Math.floor(frames.length * 0.5)];
      report.jsFrameGapP95Ms = frames[Math.floor(frames.length * 0.95)];
      if (error) report.error = String(error);
      try { session.reset(originalText); } catch (restoreError) { report.restoreError = String(restoreError); }
    }
    function frame(time) {
      if (lastFrame !== undefined) frames.push(time - lastFrame);
      lastFrame = time;
      frameId = globalThis.requestAnimationFrame(frame);
    }
    function append() {
      try {
        session.append(chunk);
        report.updates += 1;
        timer = setTimeout(report.updates < 60 ? append : finish, report.updates < 60 ? 16 : 500);
      } catch (error) {
        finish(error);
      }
    }
    session.reset(initialText);
    deadline = setTimeout(() => finish(new Error("Render stress exceeded 20 seconds")), 20000);
    timer = setTimeout(() => {
      frameId = globalThis.requestAnimationFrame(frame);
      append();
    }, 500);
    return { started: true, report: "globalThis.__nitroMarkdownRenderStress" };
  }

  if (suiteName === "session") {
    for (const size of [10000, 100000, 500000]) {
      const text = fixture(size);
      const session = sessions.createMarkdownSession(text);
      try {
        const start = text.length - 12;
        check(`tail-${size}`, session.getTextRange(start, text.length), text.slice(start));
        measure(`tail-${size}`, () => session.getTextRange(start, text.length).length);
        measure(`all-${size}`, () => session.getAllText().length);
        measure(`append-read-${size}`, () => {
          const from = session.getLength();
          const to = session.append(` ${emoji} token`);
          return session.getTextRange(from, to);
        });
      } finally {
        session.dispose();
      }
    }
  }

  if (suiteName === "parse") {
    for (const size of [10000, 100000, 500000]) {
      const ascii = "Plain ASCII text. ".repeat(Math.ceil(size / 18)).slice(0, size);
      const text = fixture(size);
      measure(`bytes-ascii-${size}`, () => errors.utf8ByteLength(ascii));
      measure(`bytes-unicode-${size}`, () => errors.utf8ByteLength(text));
      measure(`parse-${size}`, () => headless.parseMarkdown(text).children.length, 10);
      measure(`parse-no-offsets-${size}`, () => headless.parseMarkdown(text, { sourceOffsets: false }).children.length, 10);
      measure(`extract-${size}`, () => headless.extractPlainText(text).length, 10);
    }
  }

  if (suiteName === "ast") {
    const freeze = load("/utils/freeze-ast.ts");
    const text = fixture(16000) + " tail";
    const ast = headless.parseMarkdown(text);
    measure("clone-16000", () => freeze.cloneMarkdownNode(ast).children.length, 5);
    measure("reuse-identical-16000", () => incremental.reuseStableAstNodes(ast, ast) === ast);
    measure("flatten-16000", () => headless.getFlattenedText(ast).length, 5);
    measure("append-plain-16000", () => incremental.getNextStreamAst({
      previousText: text, nextText: text + " more", previousAst: ast,
    }).end);
    const longToken = "a".repeat(500000);
    const tokenAst = headless.parseMarkdown(longToken);
    measure("append-long-token-500000", () => incremental.getNextStreamAst({
      previousText: longToken, nextText: longToken + "b", previousAst: tokenAst,
    }).end);
  }

  if (suiteName === "lifecycle") {
    const text = fixture(500000);
    for (let cycle = 0; cycle < 100; cycle += 1) {
      const session = sessions.createMarkdownSession(text);
      try {
        const from = session.getLength();
        session.append(` ${emoji} tail`);
        check("large-append-range", session.getTextRange(from, session.getLength()), ` ${emoji} tail`);
        session.replace(0, 2, "prefix");
        check("large-replace-prefix", session.getTextRange(0, 6), "prefix");
        session.clear();
        check("large-clear", session.getAllText(), "");
      } finally {
        session.dispose();
      }
    }
  }

  if (suiteName === "correctness") {
    const documents = [
      "Visit www.example.com/path then continue.",
      "Visit https://example.com/guide?x=1&y=2 then continue.",
      "Email person@example.com then continue.",
      "A &amp; entity and &#65; numeric reference.",
      "**bold** and _italic_ with `code`.",
      "```ts\nconst value = 1;\n```\n\nnext paragraph",
      "| A | B |\n|---|---|\n| 1 | 2 |\n",
      `Accent caf${String.fromCharCode(233)} and ${emoji} text.`,
      "Inline $x^2$ and block\n\n$$\nx = y\n$$\n",
    ];
    function canonical(node) {
      if (Array.isArray(node)) return node.map(canonical);
      if (node && typeof node === "object") {
        return Object.fromEntries(Object.keys(node).sort().map((key) => [key, canonical(node[key])]));
      }
      return node;
    }
    for (const document of documents) {
      for (let split = 1; split < document.length; split += 1) {
        if (document.charCodeAt(split) >= 0xdc00 && document.charCodeAt(split) <= 0xdfff) continue;
        const previousText = document.slice(0, split);
        const previousAst = headless.parseMarkdown(previousText);
        const actual = incremental.getNextStreamAst({ previousText, previousAst, nextText: document });
        check(`split:${document}:${split}`, canonical(actual), canonical(headless.parseMarkdown(document)));
      }
    }
    for (let cycle = 0; cycle < 100; cycle += 1) {
      const session = sessions.createMarkdownSession(`A${emoji}B`);
      check("unicode-range", session.getTextRange(1, 3), emoji);
      session.append(" tail");
      check("appended-range", session.getTextRange(4, 9), " tail");
      session.replace(0, 1, "prefix");
      check("replace-range", session.getTextRange(6, 8), emoji);
      session.reset("short");
      check("reset-range", session.getTextRange(1, 5), "hort");
      session.clear();
      check("clear", session.getLength(), 0);
      session.dispose();
      let code;
      try { session.getAllText(); } catch (error) { code = error.code; }
      check("disposed", code, "destroyed");
    }
  }

  return { suite: suiteName, engine: "Hermes", checks, failureCount: failures.length, failures: failures.slice(0, 8), results };
}

fs.writeFileSync(outputPath, `(${experiment.toString()})(${JSON.stringify(suite)}, globalThis.__r)`);
