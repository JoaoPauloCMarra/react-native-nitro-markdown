#!/usr/bin/env node

const path = require("path");

const { runComparison } = require(
  path.resolve(__dirname, "../../../scripts/benchmark-comparison.js"),
);

if (require.main === module) {
  runComparison();
}

module.exports = { runComparison };
