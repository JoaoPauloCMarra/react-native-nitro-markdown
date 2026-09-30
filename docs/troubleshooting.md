# Troubleshooting

### "Native module not found" / parser throws on first call

The native build did not link the module. Re-run `bunx expo prebuild` (Expo) or
`pod install` (bare), then rebuild the app. Nitro modules cannot load in
**Expo Go** — use a development build.

### Math renders as monospace text

That is the default. To draw LaTeX, install the optional peer
`ratex-react-native` (React Native `>=0.84`), rebuild the native app, and pass
`mathRenderers` from `react-native-nitro-markdown/math` through `renderers`.
See [installation](./installation.md#math-rendering-optional).

### Metro cannot resolve `ratex-react-native`

Only `react-native-nitro-markdown/math` imports `ratex-react-native`. Either
install `ratex-react-native` or remove the `/math` import. The main entry and
`/headless` never load it.

### Parse fails with `input_too_complex`

The document is within the byte cap but exceeds a native AST budget (100,000
nodes or 500,000 units of AST work). Split very long documents, or render them
in parts. See the [error codes](./api-reference.md#headless-exports).

### Streaming updates too often / janky

Use `updateStrategy="raf"`, or `updateStrategy="interval"` with
`updateIntervalMs` around 50–100 ms. See [streaming](./streaming.md).

### Plugin changes don't appear incremental

A `beforeParse` plugin forces a full parse by design, which disables incremental
AST reuse. `sourceAstStatus` becomes `"disabled"` in that state.

### Streaming parse failed

`MarkdownStream` reports parser failures through `onError(error, "parse")`.
Failed updates preserve the last valid stream state. An initial failure exposes
`sourceAstStatus: "disabled"` with `sourceAstDisabledReason: "parse-error"`.

### Long document feels heavy

Enable [virtualization](./usage.md#long-documents-virtualization):
`virtualize="auto"` when `<Markdown>` is the primary scroll container.

### Web build fails on import

Web is not supported — the parser needs Nitro Modules (JSI). Guard imports
behind `Platform.OS !== "web"` or a `.native.tsx` entry.

### Links don't open / open the wrong way

Provide `onLinkPress(href)`. It receives the raw, unvalidated `href`. Return
`false` only for links you handle yourself (for example in-app routes); return
`true` or nothing to let the built-in fallback open validated `http:`,
`https:`, `mailto:`, `tel:` and `sms:` URLs. If you call `Linking.openURL`
yourself, check the scheme first; never open an arbitrary `href` from untrusted
Markdown.

Still stuck? Open an issue:
<https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/issues>.
