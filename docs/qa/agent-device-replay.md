# Markdown agent-device replay

Use an installed release example built from the source under test. Select one
platform and exact target; the runner does not build, install, start Metro, or
guess a device:

```sh
bun run example:replay --platform ios --udid <exact-udid>
bun run example:replay --platform android --serial <exact-serial>
bun run example:replay --platform ios --udid <exact-udid> --flow contracts
```

Without `--flow`, the eight device-only manifest suites run in order:
`full-features`, `render-stress`, `deeplink`, `contracts`, `smoke`, `api`,
`render-contracts` and `text-scale`. The `contracts-http` suite needs the local
HTTP fixture and runs only when `--http-fixture-url` is given, before
`text-scale`; selecting it with `--flow` and no URL fails before any device
work. Repeat `--flow` for
distinct selected suites. Each invocation uses official `agent-device test`, a
unique session, and an artifact directory under the OS temporary directory.
`agent-device test` closes each attempt session itself. Device execution must
be authorized separately from static verification.

The full-feature flow checks native parse structure, plain-text extraction,
session append/replace/reset, bounded input errors, repeated parse values, and
plugin priority/error recovery. The render flow requires all eight specimen
parse callbacks, exact readback of 24 appended tokens, visible first/last tokens,
and a new remount generation before checking completion again. Printed elapsed
times are diagnostic values, not performance gates.

The smoke flow opens the tabs root, presses `run-smoke-tests`, and waits for the
always-visible `smoke-probe` label `smoke:pass=<n>:fail=<f>:skip=<k>;` to show
`:fail=0:`. It counts log rows only; SKIP rows are allowed.

The api flow opens `nitromarkdown://e2e-api`, which runs on load and writes
`;`-delimited tokens to the fixed `api-probe` label: headless subpath parse,
source offsets on/off, frozen ASTs, `stripSourceOffsets`, extraction options,
`getTextContent`, the native depth limit code (`complex=invalid_ast;`), session
`invalid_range`, `destroyed` and `buffer_limit` codes, session
length/highlight/clear/reset, listener ranges and unsubscribe, and
`useStream(...).sync`.

The render-contracts flow opens `nitromarkdown://e2e-render-contracts`. Its
fixed `render-contracts-probe` stays on screen while the content scrolls. The
flow checks custom `errorText` plus the `onError` parse phase, raw HTML inline
and block output, `theme.showCodeLanguage`, a custom `highlightCode` call, a
custom heading renderer, the table accessibility label, the math block label,
`tableOptions.minColumnWidth` against a default-option control table, stream
`initialParseMode: "async"`, the `beforeParse-plugin` reason, and a stream
parse error. The last step scrolls to the bottom and presses the rendered link;
`onLinkPress` records the href and returns `false`. The math label check can
also match the RaTeX text fallback, and accessibility roles are not read.

The text-scale flow changes the device text size. It sets
`settings text-size accessibility-large`, relaunches
`nitromarkdown://e2e-text-scale`, and reads the fixed `text-scale-probe` label
`text-scale:font-scale=<n>;scaled=<yes|no>;h1=<h>:base=<b>;body=<h>:base=<b>;body-scaled=<yes|no>;`.
`body` is the `onLayout` height of a single-line Markdown paragraph at the
theme body size (`fontSizes.m`) with its margins removed; its `base` is a plain
`Text` with `allowFontScaling={false}` and the same font size and line height.
`body-scaled=yes;` means `body >= base * 1.15` (Android 14+ nonlinear scaling gives about 1.27x for 16 sp body text at fontScale 1.75; iOS about 2x). The flow then restores
`settings text-size medium`, relaunches, and requires `;scaled=no;` and
`body-scaled=no;`. Each run compares only its own measurements. The `h1`
heights (margin-stripped `# Scale` heading against a non-scaling theme h1
`Text`) are printed as evidence only and are not asserted: Android 14+ uses
nonlinear font scaling, so large sizes grow much less than `fontScale` (a 32sp
h1 grows about 1.07x at fontScale 1.75), while body text scales near-linearly.
This proves layout height scaling, not glyph rendering. The suite must stay
last in the manifest. With `--fail-fast`, a failure before the restore step
leaves the target at accessibility-large; restore it with
`agent-device settings text-size medium` on the same target before other QA.

The contracts flow renders the same valid inline PNG under two public image
policies. With an explicitly allowed `data` protocol and `allowedHosts: []`,
Markdown must render its error fallback. With the host list omitted, the PNG
must load and reveal a caption that differs from its error alt. No HTTP service
is used by this flow. This verifies host-policy behavior for the inline fixture.

The `contracts-http` flow adds remote image evidence. Start the fixture, which
serves one PNG at `/img/ok.png`, `/img/denied.png`, `/img/deny.png` and
`/img/empty.png` and
returns per-path served counts at `GET /requests` (no request bodies are kept):

```sh
bun scripts/example-replay-http-fixture.js --port 8123
bun run example:replay --platform ios --udid <exact-udid> --http-fixture-url http://127.0.0.1:8123 --flow contracts-http
bun scripts/example-replay-http-fixture.js --port 8123 --advertise-host 10.0.2.2
bun run example:replay --platform android --serial <exact-serial> --http-fixture-url http://10.0.2.2:8123 --flow contracts-http
```

The runner accepts only a local `http://` origin with an explicit port and
passes it as `--env FIXTURE_URL=<encoded origin>`. The screen loads `ok.png`
with `allowedHosts: [<fixture host>]`, `denied.png` with
`allowedHosts: ["other.test"]`, `deny.png` with `remoteImages: "deny"`, and
`empty.png` with `allowedHosts: []`.
The flow requires the loaded-only caption `HTTP_IMAGE_LOADED` and
`http:ok=served:denied=0:deny=0:empty=0;`. Android release builds need cleartext HTTP
to the fixture: build the example with `EXPO_PUBLIC_MARKDOWN_HTTP_FIXTURE=1` so
`expo-build-properties` sets `usesCleartextTraffic`. iOS uses the generated
`NSAllowsLocalNetworking` setting. Redirects are not covered.

The same screen observes committed public stream-hook text and AST while
switching from session A to B, with transition updates both off and on. Any
committed A content after selecting B latches a failure. A second update writes
to old A and active B; the flow requires B's new rendered marker and a clean
commit report. This is a commit-state check, not a frame-time benchmark.

Complete visual/accessibility acceptance (roles, speech, glyph layout, math
drawing) and sustained performance remain separate pending rows in the coverage manifest. A ready
marker, parse callback, source lock, or skipped prerequisite cannot close them.

The freshness gate covers package runtime sources and native wiring, generated
bindings, dependency manifests, and all example code/assets. Generated example
Android/iOS projects, caches, tests, and secret files are excluded. It also pins
the manifest and replay files. Flow symlinks cannot escape the repository.

After a package or example change, review affected assertions and selectors,
update the coverage manifest and flows, then run:

```sh
bun run example:replay:refresh
bun run example:replay:check
bun run example:replay:test
```

Both `check` and `check:ci` include the static replay gates. Refreshing the lock
does not replace running the authored flows on an authorized target.
