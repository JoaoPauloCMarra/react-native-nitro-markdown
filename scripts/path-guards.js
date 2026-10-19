"use strict";

const path = require("node:path");

function isOutsideRelative(relative) {
  return (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

module.exports = { isOutsideRelative };
