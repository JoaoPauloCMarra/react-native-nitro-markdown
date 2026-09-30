module.exports = [
  {
    name: "main (CJS)",
    path: "lib/commonjs/index.js",
    limit: "26 kB",
  },
  {
    name: "headless (CJS)",
    path: "lib/commonjs/headless.js",
    limit: "5.5 kB",
  },
  {
    name: "math (CJS)",
    path: "lib/commonjs/math.js",
    limit: "3.2 kB",
    ignore: ["ratex-react-native"],
  },
  {
    name: "main (ESM)",
    path: "lib/module/index.js",
    limit: "23 kB",
  },
  {
    name: "headless (ESM)",
    path: "lib/module/headless.js",
    limit: "4.8 kB",
  },
  {
    name: "math (ESM)",
    path: "lib/module/math.js",
    limit: "2.6 kB",
    ignore: ["ratex-react-native"],
  },
];
