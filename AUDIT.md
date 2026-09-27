# Code Audit

Tick an item when it lands, and note the commit next to it.

- P0: broken today, the behaviour is wrong.
- P1: misleading today, users or contributors will get it wrong.
- P2: inconsistent with siblings or other layers, or costly to change.
- P3: polish, duplication, dead code.

Audited 2026-09-26 at `83e987d`. Read all in-scope first-party library, native, example, test, tooling, and guidance/configuration files in full; excluded dependencies, vendored md4c, generated bindings/fixtures, lockfiles, assets, and build output. Verification used isolated Bun probes and a host C++ parser probe against current source. Device and release gates were not run for this tracker-only audit.

## P0: Broken

- [ ] 1. **IPv6 image host allowlists compare only the first address segment.** `parseAbsoluteHref` at `packages/react-native-nitro-markdown/src/utils/link-security.ts:41` removes brackets and then splits the address on `:`, turning `2001:db8::1` into `2001`. Consequently `getAllowedImageHref("https://[2001:db8::1]/image.png", {allowedHosts: ["2001:db8::1"]})` returns null, while the incorrect entry `2001` accepts multiple different addresses sharing that segment. The test at `packages/react-native-nitro-markdown/src/__tests__/link-security.test.ts:86` preserves the truncated form. **Substitute Algorithm** with authority parsing that preserves complete bracketed IPv6 addresses and handles ports separately, compatible with the supported native runtimes; test exact-address acceptance and rejection of a different address.
- [ ] 2. **Native break nodes expose zero source offsets.** The `MD_TEXT_BR` and `MD_TEXT_SOFTBR` branches at `packages/react-native-nitro-markdown/cpp/core/NitroMD4CParser.cpp:621` and line 629 create nodes without assigning source ranges. Both serializers emit these default values at `packages/react-native-nitro-markdown/cpp/bindings/HybridMarkdownParser.cpp:506` and line 598. With default source offsets enabled, a host probe parses `line1\nline2` into text 0–5, soft break 0–0, and text 6–11; hard breaks also remain 0–0. Source-mapping consumers therefore receive a range at the start of the document instead of the break span. **Extract Function** for creating a break node with its actual UTF-16 source range; cover soft/hard breaks, CRLF, trailing spaces, and preceding emoji without assigning offsets from synthesized callback text blindly.

## P1: Misleading

- [ ] 3. **The example smoke runner reports plugin success without exercising the plugin pipeline.** At `apps/example/app/(tabs)/index.tsx:634`, `runSmokeTests` manually invokes locally defined before/after callbacks; line 668 tests error isolation with a standalone throw/catch. Executing the exact block with a parser stub and no plugin implementation still reports all three checks as PASS, so this screen cannot establish plugin integration or error isolation. **Substitute Algorithm** with a rendered `Markdown` fixture that receives actual plugins and verifies their effects/error callbacks, or remove those unsupported PASS claims from the smoke results.
- [ ] 4. **Setup reports success after codegen or build failure.** `scripts/setup.js:149` and line 152 ignore the boolean results from `execCommand`; its catch at line 30 returns false and the script still prints “Setup complete!” at line 171. Executing the actual main flow with network/filesystem boundaries stubbed and codegen/build commands forced to fail reproduces that success message. **Extract Function** for required setup steps and stop with a step-specific failure before claiming success.
- [ ] 5. **The security support table names an obsolete release line.** `SECURITY.md:7` marks only `0.10.x` supported while its next paragraph promises security fixes only for the latest minor; `packages/react-native-nitro-markdown/package.json:3` and `CHANGELOG.md:12` identify the current package as `0.12.5`. This misleads consumers about which line receives fixes. Correct the row to the line supported by that policy and **Introduce Assertion** in the existing documentation validation that the supported minor matches the current package minor.

## Local implementation receipt — 2026-09-27

All five findings are implemented locally for proposed patch 0.12.6. The image-host policy validates complete DNS/IPv4/IPv6 authorities and rejects backslash parser differentials. Soft/hard LF/CRLF break ranges preserve exact UTF-16 source slices. The real rendered plugin fixture now lives in a shared example component and its exact PASS status is asserted by the full-features device flow. Setup required-step failures propagate; SECURITY follows the current rolling minor.

- Final `release:preflight`: PASS, with 343 JS tests and unchanged coverage thresholds, native C++ coverage/budgets, public types, example checks and publish dry run.
- Explicit `test:cpp:sanitizers`: PASS, 3,580 C++ checks. Explicit `audit:package`: PASS.
- Independent review exposed stray IPv6 colons and a backslash/userinfo allowlist differential; both received focused RED/GREEN regressions before final preflight.
- Android/iOS prebuild/build: PASS. Native rendered fixture, stream lab and device smoke remain pending target selection. Markdown intentionally has no web runtime.
- Root build now avoids duplicate codegen while retaining the package prebuild hook. Stub-composition tests prove failure propagation and one codegen invocation; generated bindings are unchanged. Limited warm build timings are in docs/performance-2026-09-27.md.
- Logs: `/tmp/nitro-implementation.GbjgqhYj/markdown-{release-preflight-final,sanitizers-final,package-audit-final,android-build,ios-build}.log`.

Original checkboxes remain open until landing and runtime acceptance. No native speedup, commit or publication is claimed.
