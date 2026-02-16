const config = require("eslint-config-expo-magic");

module.exports = [
  ...(Array.isArray(config) ? config : [config]),
  {
    ignores: [
      "**/node_modules/**",
      "**/lib/**",
      "**/build/**",
      "**/nitrogen/generated/**",
      "**/.turbo/**",
      "**/android/build/**",
      "**/android/.cxx/**",
      "**/ios/build/**",
    ],
  },
  {
    files: ["packages/react-native-nitro-markdown/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-native/no-unused-styles": "off",
    },
  },
  {
    files: ["scripts/**/*.js", "packages/*/scripts/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        Buffer: "readonly",
        __dirname: "readonly",
        console: "readonly",
        module: "readonly",
        process: "readonly",
        require: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
];
