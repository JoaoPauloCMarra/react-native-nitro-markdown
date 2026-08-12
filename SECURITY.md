# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.10.x  | ✅ |

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
    10,000,000 characters) are rejected with a typed `input_too_large` error
    before any native call.
  - C++ boundary: the parser rejects inputs above the same hard cap (measured
    in bytes) and rejects serialized AST output above 64 MB.
- The native session (`MarkdownSession`) bounds its buffer at 10 MB and rejects
  invalid ranges with typed errors.

### Links and images

- Link URLs are validated before they reach `onLinkPress` or `Linking`.
  Allowed protocols: `http:`, `https:`, `mailto:`, `tel:`, `sms:`. Other
  schemes (e.g. `javascript:`, `data:`, `file:`) are never opened and are never
  passed to custom link handlers.
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
- Runtime peer dependencies (`react-native-nitro-modules`,
  `ratex-react-native`) are updated on the package's release cadence; see the
  package `README.md` compatibility table for supported ranges.

## Reporting a Vulnerability

Report security issues privately — do not open a public issue:

- Open a GitHub Security Advisory at
  https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/security/advisories/new
- Or email the maintainers via the repository contact.

Include the affected version, the markdown input that triggers the issue, the
platform (iOS/Android), and a minimal reproducer. You will receive a response
within 7 days. Security fixes ship in the next patch release of the supported
line.
