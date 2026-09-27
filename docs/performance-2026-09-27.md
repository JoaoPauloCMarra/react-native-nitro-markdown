# Audit performance and build measurements — 2026-09-27

This receipt separates host checks from native runtime performance. No device frame-time or universal parser-speed claim is made.

## Build composition

The root `build` script called `codegen`, then delegated to the package build whose `prebuild` hook called `codegen` again. The root now delegates directly; the package-owned hook still runs for root and standalone package builds. No hook, generated-code check, public declaration check, or packaging check was removed.

With identical dependencies, Bun 1.4.2, and a warm toolchain on the execution Mac, three builds before the change took 2.593, 2.092, and 2.135 seconds. Afterward they took 1.996, 2.023, and 2.002 seconds. Median elapsed time decreased about 6.2%; this is a small host measurement with three samples, not a statistical runtime speedup or a cold-install result. Each build still rebuilds Bob's emitted artifacts. The codegen invocation count changed from two to one in every run, and generated bindings remained unchanged.

`bun test scripts/build-composition.test.ts` executes the real script composition against isolated stub commands. It proves one codegen call, successful build, codegen failure stopping the build, and build failure reaching the caller. The test is included in `test:lifecycle`.

Raw receipts: `/tmp/nitro-implementation.GbjgqhYj/markdown-build-profile-{before,after}.json` and matching per-run logs on the execution host.

## Runtime benchmark boundary

The existing `benchmark` command compares JavaScript parser dependencies in Node; it does not measure this package's Nitro parser or native rendering. The current host C++ suite exercises parser/serialization budgets and the offsets-disabled path, but its small timing samples do not establish a controlled before/after improvement. Native render/stream performance and release-mode device measurements remain pending the selected runtime targets. Preserve the historical `performance-v0.12.2.md` receipt separately.
