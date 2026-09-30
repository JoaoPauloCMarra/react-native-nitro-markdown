# Installation

`react-native-nitro-markdown` ships native code (a C++ Markdown parser and
native bindings via [Nitro Modules](https://nitro.margelo.com/)), so it needs a
custom native build. It cannot run in Expo Go.

## Requirements

| Dependency                                                                             | Minimum                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| React Native                                                                           | `>=0.76` (New Architecture / Fabric); tested on `0.86.3`                  |
| Expo                                                                                   | SDK `>=52` development build; tested on SDK 57                            |
| [react-native-nitro-modules](https://www.npmjs.com/package/react-native-nitro-modules) | `>=0.37.0 <0.38.0` (peer dependency)                                      |
| [ratex-react-native](https://www.npmjs.com/package/ratex-react-native)                 | Optional peer. Only needed for the `react-native-nitro-markdown/math` subpath. |
| iOS                                                                                    | The app's React Native floor (`min_ios_version_supported`, 15.1 on RN 0.76–0.86) |
| Android                                                                                | `minSdkVersion` 24, NDK 27 or later                                       |

`react-native-nitro-modules` is a required peer dependency because parsing runs
in native code.

### Android NDK on React Native 0.76 / Expo SDK 52

Nitro Modules 0.37 needs Android NDK 27 or later. React Native 0.76 and Expo
SDK 52 default to NDK 26.1, so set the NDK version yourself on those versions:

- Bare React Native 0.76: set `ndkVersion = "27.1.12297006"` (or later) in
  `android/build.gradle` under `buildscript.ext`.
- Expo SDK 52: add `expo-build-properties` with
  `{ "android": { "ndkVersion": "27.1.12297006" } }`.

React Native 0.77 and later, and Expo SDK 53 and later, already use NDK 27.

## Expo (development build)

```sh
bunx expo install react-native-nitro-markdown react-native-nitro-modules@0.37.1
bunx expo prebuild
bunx expo run:ios   # or run:android
```

No config plugin is required. Run `bunx expo prebuild` again after adding or
upgrading the package so the native projects pick up the new module.

> Expo Go cannot load Nitro native modules. Use an Expo **development build**.

## Bare React Native

```sh
bun add react-native-nitro-markdown react-native-nitro-modules@0.37.1
cd ios && bundle exec pod install
```

Rebuild the app (`bunx react-native run-ios` / `run-android`) so the native
module is linked.

## Math rendering (optional)

Without extra setup, `math_inline` and `math_block` nodes render as monospace
text. To draw LaTeX with [RaTeX](https://github.com/erweixin/RaTeX), install
`ratex-react-native` and pass the renderers from the `/math` subpath:

```sh
bunx expo install ratex-react-native@0.1.14   # or: bun add ratex-react-native@0.1.14
```

```tsx
import { Markdown } from "react-native-nitro-markdown";
import { mathRenderers } from "react-native-nitro-markdown/math";

<Markdown options={{ math: true }} renderers={mathRenderers}>
  {"Inline $E = mc^2$"}
</Markdown>;
```

`ratex-react-native@0.1.14` requires React Native `>=0.84` and React
`>=19.2`, so RaTeX math rendering needs React Native 0.84 or later (an Expo SDK that
ships React Native 0.84 or later). On React Native 0.76–0.83, do not install it and do not import
the `/math` subpath; math stays readable as monospace text. The main entry and
`/headless` never load `ratex-react-native`, so apps that do not use math do
not need it.

## Verifying the install

```ts
import { parseMarkdown } from "react-native-nitro-markdown/headless";

console.log(parseMarkdown("# Hello").type); // "document"
```

If this throws a "native module not found" error, the native build did not pick
up the module — re-run `prebuild`/`pod install` and rebuild the app.

## Platform support

| Platform | Status                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------- |
| iOS      | Native parser via Nitro + the bundled `nitromd` (md4c) engine.                                 |
| Android  | Native parser via Nitro + the bundled `nitromd` (md4c) engine.                                 |
| Expo     | Development builds only.                                                                       |
| Web      | Not supported. The parser requires Nitro Modules (JSI); imports fail deterministically on web. |

## Next steps

- [Usage](./usage.md) — render Markdown with the `<Markdown>` component.
- [Streaming](./streaming.md) — render token-by-token LLM / chat output.
- [Headless parsing](./headless.md) — parse to an AST without rendering UI.
- [Troubleshooting](./troubleshooting.md) — common install and runtime issues.
