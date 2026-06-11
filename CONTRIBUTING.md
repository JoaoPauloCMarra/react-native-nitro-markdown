# Contributing to react-native-nitro-markdown

First off, thank you for considering contributing to Nitro Markdown! It's people like you that make the open-source community such a great place.

## Development Workflow

This is a monorepo using [Bun](https://bun.sh/) workspaces.

### Prerequisites

- [Bun](https://bun.sh/)
- iOS: Xcode and CocoaPods
- Android: Android Studio and NDK

### Setup

1. Clone the repository
2. Run the setup script:
   ```bash
   bun run setup
   ```

This will install dependencies, download the `md4c` source code, generate Nitro bindings, and build the library.

### Running the Example App

```bash
cd apps/example
bun run ios     # for iOS
bun run android # for Android
```

### Making Changes

- **Core Logic (C++):** Modified in `packages/react-native-nitro-markdown/cpp`.
- **JS/React Logic:** Modified in `packages/react-native-nitro-markdown/src`.
- **Native Bindings:** Defined in `*.nitro.ts` files. Run `bun run codegen` in the package directory to update the generated code.

### Testing

Before submitting a PR, please make sure all tests pass:

```bash
bun test        # Runs Jest tests
bun run test:cpp # Runs C++ unit tests
```

## Pull Request Process

1. Create a new branch for your feature or bugfix.
2. Ensure the code passes linting and type checking: `bun run lint && bun run typecheck`.
3. Add tests for any new functionality.
4. Update the documentation if necessary.
5. Submit your PR!

## License

By contributing, you agree that your contributions will be licensed under its MIT License.
