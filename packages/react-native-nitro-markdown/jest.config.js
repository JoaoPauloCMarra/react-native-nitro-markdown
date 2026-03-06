module.exports = {
  testEnvironment: "node",
  globals: {
    __DEV__: true,
  },
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  testTimeout: 10000,
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.nitro.ts",
    "!src/**/__tests__/**",
    "!src/**/*.tsx",
    "!src/MarkdownContext.ts",
    "!src/use-markdown-stream.ts",
    "!src/markdown.tsx",
    "!src/markdown-stream.tsx",
    "!src/renderers/**/*.tsx",
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  transform: {
    "^.+\\.tsx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", tsx: true },
          transform: { react: { runtime: "automatic" } },
          target: "es2022",
        },
      },
    ],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|react-native-nitro-modules)/)",
  ],
};
