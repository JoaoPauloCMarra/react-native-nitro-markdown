# Troubleshooting

### "Native module not found" / parser throws on first call

The native build did not link the module. Re-run `bunx expo prebuild` (Expo) or
`pod install` (bare), then rebuild the app. Nitro modules cannot load in
**Expo Go** — use a development build.

### Math does not render

Ensure `ratex-react-native` is installed (it is a peer dependency) and the
native app has been rebuilt after install.

### Streaming updates too often / janky

Use `updateStrategy="raf"`, or `updateStrategy="interval"` with
`updateIntervalMs` around 50–100 ms. See [streaming](./streaming.md).

### Plugin changes don't appear incremental

A `beforeParse` plugin forces a full parse by design, which disables incremental
AST reuse. `sourceAstStatus` becomes `"disabled"` in that state.

### Long document feels heavy

Enable [virtualization](./usage.md#long-documents-virtualization):
`virtualize="auto"` when `<Markdown>` is the primary scroll container.

### Web build fails on import

Web is not supported — the parser needs Nitro Modules (JSI). Guard imports
behind `Platform.OS !== "web"` or a `.native.tsx` entry.

### Links don't open / open the wrong way

Provide `onLinkPress(href)` and call `Linking.openURL` yourself; return `false`
to suppress the default behavior.

Still stuck? Open an issue:
<https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/issues>.
