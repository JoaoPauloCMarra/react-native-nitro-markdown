"use strict";

async function runReleasePipeline({ verify, withDocsRestored, pack }) {
  await verify();
  await withDocsRestored(pack);
}

module.exports = { runReleasePipeline };
