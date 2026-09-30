# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.13.x  | ✅ |

The package follows a rolling support window: only the latest minor release
line receives security fixes. Older lines are unsupported.

## Security Model

`react-native-nitro-markdown` renders Markdown that is frequently untrusted
(LLM output, chat messages, user posts). The package's security boundary is
documented here so app owners can reason about what is and is not guaranteed.

### Parser

- Parsing runs in the native C++ `md4c` engine over JSI. The parser is
  reentrant (no shared mutable parse state) and covered by a deterministic
  seeded fuzz corpus plus a CommonMark/GFM conformance corpus in the canonical
  test gate.
- Parse input is bounded at two layers:
  - JavaScript boundary: inputs above `options.maxInputLength` (default
    10,485,760 UTF-8 bytes) are rejected with a typed `input_too_large` error
    before any native call.
  - C++ boundary: the parser rejects inputs above the same hard cap (measured
    in bytes), and rejects documents that exceed its AST budgets (100,000
    nodes, 500,000 units of AST work, 64 MiB of serialized AST JSON) with a
    typed `input_too_complex` error.
- The native session (`MarkdownSession`) bounds its buffer at 10,485,760 UTF-8
  bytes, the same unit as the parser cap, and rejects invalid ranges with
  typed errors. Session ranges are JavaScript UTF-16 units.

### Links and images

- The built-in link fallback validates URLs before it calls `Linking`.
  Allowed protocols: `http:`, `https:`, `mailto:`, `tel:`, `sms:`. Other
  schemes (e.g. `javascript:`, `data:`, `file:`, `intent:`) are never opened by
  the package.
- A custom `onLinkPress` handler receives the **original, unvalidated** href,
  including unsafe schemes, so apps can route in-app links. The handler is
  responsible for what it opens: handle only links you recognize and return
  `false` for them, or return `true`/nothing to let the validated fallback
  open the link. Never pass an untrusted href to `Linking.openURL` without
  checking its scheme.
- Remote images load by default for compatibility (`http:`/`https:` only).
  When rendering untrusted markdown in privacy- or SSRF-sensitive apps, set
  `imageOptions={{ remoteImages: "deny" }}` to disable remote image loading
  entirely, or restrict hosts with `imageOptions={{ allowedHosts: [...] }}`.
  This policy applies to the built-in `Image` renderer; custom renderers are
  the app's responsibility.
- Raw HTML is parsed into AST nodes only when `options.html` is enabled
  (default `false`). The package never executes HTML, scripts, or webviews.

### Native dependencies

- Vendored native code: `cpp/nitromd/` (md4c, MIT license). The pinned
  upstream revision and synchronization policy are recorded in
  `cpp/nitromd/UPSTREAM.md`. Upstream security updates require a synchronized
  update of the vendored copy.
- Runtime peer dependencies (`react-native-nitro-modules`, and the optional
  `ratex-react-native` used only by the `/math` subpath) are updated on the
  package's release cadence; see the package `README.md` compatibility table
  for supported ranges.

## Reporting a Vulnerability

Report security issues privately through GitHub private vulnerability
reporting. Do not open a public issue, pull request or discussion:

- https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/security/advisories/new

Include the affected version, the markdown input that triggers the issue, the
platform (iOS/Android), and a minimal reproducer. You will receive a response
within 7 days. Security fixes ship in the next patch release of the supported
line.
