#!/usr/bin/env node

const { runComparison } = require("./benchmark-comparison.js");

if (require.main === module) {
  runComparison();
}

module.exports = { runComparison };
