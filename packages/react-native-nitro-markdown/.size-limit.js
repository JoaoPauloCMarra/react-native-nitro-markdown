module.exports = [
  {
    name: 'main (CJS)',
    path: 'lib/commonjs/index.js',
    limit: '40 kB',
  },
  {
    name: 'headless (CJS)',
    path: 'lib/commonjs/headless.js',
    limit: '8 kB',
  },
  {
    name: 'main (ESM)',
    path: 'lib/module/index.js',
    limit: '38 kB',
  },
  {
    name: 'headless (ESM)',
    path: 'lib/module/headless.js',
    limit: '7 kB',
  },
];
