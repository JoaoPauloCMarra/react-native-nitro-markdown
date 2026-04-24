# 0.5.5 PR Description

## Summary
Prepare `react-native-nitro-markdown` 0.5.5 with safer parse caching, clearer `sourceAst` plugin semantics, refreshed Expo/RN dependencies, broader smoke coverage, and stricter release verification.

## Changes
- Added `Markdown` `parseCache` control and collision-safe cached AST reuse.
- Clarified `sourceAst` pipeline behavior: skip `beforeParse`, keep `afterParse` and `astTransform`.
- Expanded JS/TS and C++ coverage, including 90% global Jest thresholds and native MD4C parser coverage.
- Synced the Expo example app with current SDK 55 recommendations and expanded its smoke dashboard.
- Refactored publish tooling with release-doc validation, parallel independent checks, package build, and npm dry-run support.

## Test
- `bun run harness`
- `bun run publish-package -- --dry-run --yes`
- `cd apps/example && bunx expo-doctor`
- `bun run example:prebuild`
- Android emulator run through `bun run --cwd apps/example android`
- iOS simulator run through `bun run example:ios`

# 0.5.5 Release Notes

## Summary
0.5.5 improves repeated-render performance, documents parser pipeline behavior, and raises release confidence through broader test and publish validation.

## Highlights
- `Markdown` now exposes `parseCache`, enabled by default for repeated markdown inputs and opt-out when fresh parsing is required.
- Cached parse results now verify the source text and clone ASTs before plugin or transform execution.
- `sourceAst` behavior is explicit: `beforeParse` plugins are skipped, while `afterParse` plugins and `astTransform` still run.
- Example app smoke checks now cover parser APIs, renderer exports, themes, plugins, sessions, highlighting, and platform support states.
- Release gates now include 90%+ JS/TS coverage, C++ parser coverage, harness validation, package build, and npm dry run.

## Validation
- JS/TS coverage: 96.63% statements, 91.14% branches, 100% functions, 98.4% lines.
- C++ parser coverage: 90.04% line coverage for `MD4CParser.cpp`, 100% functions.
- Android example app prebuilt, installed, and launched on emulator.
- iOS example app built, installed, and launched on simulator.
