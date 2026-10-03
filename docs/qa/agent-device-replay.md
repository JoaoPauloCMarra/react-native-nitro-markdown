# Markdown agent-device replay

Use an installed release example built from the source under test. Select one
platform and exact target; the runner does not build, install, start Metro, or
guess a device:

```sh
bun run example:replay --platform ios --udid <exact-udid>
bun run example:replay --platform android --serial <exact-serial>
bun run example:replay --platform ios --udid <exact-udid> --flow contracts
```

Without `--flow`, all four manifest suites run in order. Repeat `--flow` for
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

The contracts flow renders the same valid inline PNG under two public image
policies. With an explicitly allowed `data` protocol and `allowedHosts: []`,
Markdown must render its error fallback. With the host list omitted, the PNG
must load and reveal a caption that differs from its error alt. No HTTP service
is used. This verifies host-policy behavior for the inline fixture, not HTTP
request absence or remote image loading.

The same screen observes committed public stream-hook text and AST while
switching from session A to B, with transition updates both off and on. Any
committed A content after selecting B latches a failure. A second update writes
to old A and active B; the flow requires B's new rendered marker and a clean
commit report. This is a commit-state check, not a frame-time benchmark.

HTTP transport evidence, complete visual/accessibility acceptance, and sustained
performance remain separate pending rows in the coverage manifest. A ready
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
