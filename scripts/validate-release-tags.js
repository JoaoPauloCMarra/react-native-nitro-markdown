"use strict";

const MAX_RELEASE_TAG_LENGTH = 128;
const MAX_DIST_TAG_LENGTH = 63;
const CONTROL_OR_WHITESPACE = /[\s\u0000-\u001f\u007f-\u009f]/u;
const RELEASE_TAG_PATTERN = /^v[A-Za-z0-9][A-Za-z0-9.+-]{0,126}$/u;
const DIST_TAG_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,62}$/u;
const SEMVER_OR_RANGE_PREFIX = /^[vV](?:\d|[xX*])/u;

function assertString(value, name) {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string.`);
  }
}

function validateReleaseTag(value, expectedTag) {
  assertString(value, "RELEASE_TAG");
  assertString(expectedTag, "expected release tag");
  if (value.length === 0 || value.length > MAX_RELEASE_TAG_LENGTH) {
    throw new Error("RELEASE_TAG must be between 1 and 128 characters.");
  }
  if (CONTROL_OR_WHITESPACE.test(value) || !RELEASE_TAG_PATTERN.test(value)) {
    throw new Error("RELEASE_TAG contains unsafe characters.");
  }
  if (value !== expectedTag) {
    throw new Error(`RELEASE_TAG ${value} does not match ${expectedTag}.`);
  }
  return value;
}

function validateDistTag(value) {
  assertString(value, "DIST_TAG");
  if (value.length === 0 || value.length > MAX_DIST_TAG_LENGTH) {
    throw new Error("DIST_TAG must be between 1 and 63 characters.");
  }
  if (CONTROL_OR_WHITESPACE.test(value) || !DIST_TAG_PATTERN.test(value)) {
    throw new Error("DIST_TAG contains unsafe characters.");
  }
  if (SEMVER_OR_RANGE_PREFIX.test(value)) {
    throw new Error("DIST_TAG must not be a SemVer or range.");
  }
  return value;
}

function validateInputs(releaseTag, distTag, expectedTag) {
  validateReleaseTag(releaseTag, expectedTag);
  validateDistTag(distTag);
}

function expectRejected(label, callback) {
  try {
    callback();
  } catch {
    return;
  }
  throw new Error(`${label} was accepted unexpectedly.`);
}

function runMatrix() {
  const valid = [
    ["v0.9.0", "latest"],
    ["v0.9.0", "next"],
    ["v0.9.0", "beta"],
    ["v0.9.0", "canary-1"],
    ["v0.9.0", "preview_2"],
  ];
  const invalid = [
    ["release newline", () => validateReleaseTag("v0.9.0\ninjected=true", "v0.9.0")],
    ["release control", () => validateReleaseTag("v0.9.0\u001b", "v0.9.0")],
    ["dist-tag newline", () => validateDistTag("latest\ninjected=true")],
    ["dist-tag carriage return", () => validateDistTag("latest\r\ninjected=true")],
    ["dist-tag control", () => validateDistTag("next\u001b[31m")],
    ["dist-tag whitespace", () => validateDistTag("latest tag")],
    ["dist-tag path", () => validateDistTag("latest/next")],
    ["dist-tag shell metacharacter", () => validateDistTag("latest;echo")],
    ["dist-tag SemVer", () => validateDistTag("v1.2.3")],
    ["dist-tag range", () => validateDistTag("v1.2")],
  ];

  for (const [releaseTag, distTag] of valid) {
    validateInputs(releaseTag, distTag, releaseTag);
  }
  for (const [label, callback] of invalid) {
    expectRejected(label, callback);
  }
  console.log(
    `[tag-validation] matrix passed: ${valid.length} valid cases accepted; ${invalid.length} unsafe cases rejected`,
  );
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--test") {
    runMatrix();
    return;
  }
  if (args.length !== 3) {
    throw new Error(
      "Usage: node scripts/validate-release-tags.js <release-tag> <dist-tag> <expected-release-tag>",
    );
  }
  validateInputs(args[0], args[1], args[2]);
  console.log("[tag-validation] release and dist-tag inputs accepted");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[tag-validation] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { validateDistTag, validateInputs, validateReleaseTag };
