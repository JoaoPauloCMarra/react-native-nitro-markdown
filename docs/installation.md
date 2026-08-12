# Installation

`react-native-nitro-markdown` ships native code (a C++ Markdown parser and
native bindings via [Nitro Modules](https://nitro.margelo.com/)), so it needs a
custom native build. It cannot run in Expo Go.

## Requirements

| Dependency | Minimum |
| ---------- | ------- |
| React Native | `>=0.75` (New Architecture / Fabric) |
| [react-native-nitro-modules](https://www.npmjs.com/package/react-native-nitro-modules) | `>=0.36.5 <0.37.0` (peer dependency) |
| [ratex-react-native](https://www.npmjs.com/package/ratex-react-native) | `>=0.1.4` (peer dependency, example validated with `0.1.14`) |
| iOS | 16.4+ |
| Expo | SDK 57 development build |

`react-native-nitro-modules` and `ratex-react-native` are peer dependencies
because parsing and math rendering run in native code.

## Expo (development build)

```sh
bunx expo install react-native-nitro-markdown react-native-nitro-modules@0.36.5 ratex-react-native@0.1.14
bunx expo prebuild
bunx expo run:ios   # or run:android
```

No config plugin is required. Run `bunx expo prebuild` again after adding or
upgrading the package so the native projects pick up the new module.

> Expo Go cannot load Nitro native modules. Use an Expo **development build**.

## Bare React Native

```sh
bun add react-native-nitro-markdown react-native-nitro-modules@0.36.5 ratex-react-native@0.1.14
cd ios && bundle exec pod install
```

Rebuild the app (`bunx react-native run-ios` / `run-android`) so the native
module is linked.

## Verifying the install

```ts
import { parseMarkdown } from "react-native-nitro-markdown/headless";

console.log(parseMarkdown("# Hello").type); // "document"
```

If this throws a "native module not found" error, the native build did not pick
up the module — re-run `prebuild`/`pod install` and rebuild the app.

## Platform support

| Platform | Status |
| -------- | ------ |
| iOS | Native parser via Nitro + the bundled `nitromd` (md4c) engine. |
| Android | Native parser via Nitro + the bundled `nitromd` (md4c) engine. |
| Expo | Development builds only. |
| Web | Not supported. The parser requires Nitro Modules (JSI); imports fail deterministically on web. |

## Next steps

- [Usage](./usage.md) — render Markdown with the `<Markdown>` component.
- [Streaming](./streaming.md) — render token-by-token LLM / chat output.
- [Headless parsing](./headless.md) — parse to an AST without rendering UI.
- [Troubleshooting](./troubleshooting.md) — common install and runtime issues.
