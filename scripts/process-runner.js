"use strict";

const fs = require("node:fs");
const { execFile, spawn } = require("node:child_process");

const PROCESS_GROUP_POLL_MS = 10;
const DEFAULT_PROCESS_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_PROCESS_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_PROCESS_KILL_GRACE_MS = 500;
const DARWIN_PROC_BSDINFO = 3;
const DARWIN_PROC_BSDINFO_SIZE = 136;
const DARWIN_MAX_GROUP_MEMBERS = 100_000;
const PROCESS_IDENTITY_COMMAND_TIMEOUT_MS = 250;
const PROCESS_GROUP_QUIESCENCE_POLLS = 2;
const SIGNAL_EXIT_CODES = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGQUIT: 131,
  SIGTERM: 143,
};

class ProcessTreeTerminationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ProcessTreeTerminationError";
  }
}

class ProcessInterrupted extends Error {
  constructor(signal) {
    super(`Process interrupted by ${signal}`);
    this.name = "ProcessInterrupted";
    this.signal = signal;
    this.exitCode = SIGNAL_EXIT_CODES[signal] ?? 1;
  }
}

function isProcessGroupSupported(detached, identityMode) {
  return (
    detached &&
    process.platform !== "win32" &&
    (identityMode === "ps" || fs.existsSync("/proc") || process.platform === "darwin")
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function resolveBoundedTimeout(value, environmentName, fallback, maximum) {
  const configured = value ?? process.env[environmentName];
  const resolved = configured === undefined ? fallback : Number(configured);
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > maximum) {
    throw new Error(
      `${environmentName} must be a positive integer no greater than ${maximum}`,
    );
  }
  return resolved;
}

function parseProcessStat(pid, contents) {
  const closeParen = contents.lastIndexOf(")");
  if (closeParen < 0) return null;
  const fields = contents.slice(closeParen + 2).trim().split(/\s+/);
  if (fields.length < 20) return null;

  const processGroup = Number(fields[2]);
  const startTime = fields[19];
  if (!Number.isSafeInteger(processGroup) || !/^\d+$/.test(startTime)) {
    return null;
  }
  return { pid, processGroup, startTime };
}

let darwinProcApiPromise;

async function getDarwinProcApi() {
  if (!darwinProcApiPromise) {
    darwinProcApiPromise = import("bun:ffi")
      .then(({ dlopen, FFIType, ptr }) => {
        const library = dlopen("/usr/lib/libproc.dylib", {
          proc_pidinfo: {
            args: [
              FFIType.i32,
              FFIType.i32,
              FFIType.u64,
              FFIType.pointer,
              FFIType.i32,
            ],
            returns: FFIType.i32,
          },
          proc_listpgrppids: {
            args: [FFIType.i32, FFIType.pointer, FFIType.i32],
            returns: FFIType.i32,
          },
        });
        return { library, ptr };
      })
      .catch(() => null);
  }
  return darwinProcApiPromise;
}

function parsePsProcessIdentityLine(pid, line) {
  const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
  if (!match || Number(match[1]) !== pid) return null;
  const processGroup = Number(match[2]);
  if (!Number.isSafeInteger(processGroup) || processGroup <= 0) return null;
  const startTime = match[3];
  if (startTime.length === 0) return null;
  return { pid, processGroup, startTime };
}

function runBoundedPs(args) {
  if (globalThis.Bun?.spawn) {
    return runBoundedPsWithBun(args);
  }
  return new Promise((resolve) => {
    execFile(
      "/bin/ps",
      args,
      {
        timeout: PROCESS_IDENTITY_COMMAND_TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(String(stdout));
      },
    );
  });
}

async function runBoundedPsWithBun(args) {
  let child;
  try {
    child = Bun.spawn(["/bin/ps", ...args], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch {
    return null;
  }

  let timer;
  let timedOut = false;
  const result = await Promise.race([
    (async () => {
      const output = await new Response(child.stdout).text();
      const exitCode = await child.exited;
      return exitCode === 0 ? output : null;
    })(),
    new Promise((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill(9);
        } catch {
          // The process may have already exited.
        }
        resolve(null);
      }, PROCESS_IDENTITY_COMMAND_TIMEOUT_MS);
    }),
  ]);
  clearTimeout(timer);
  if (timedOut) {
    try {
      await child.exited;
    } catch {
      // The bounded command has already been terminated.
    }
    return null;
  }
  return result;
}

async function readPsProcessIdentity(pid) {
  const output = await runBoundedPs(["-o", "pid=,pgid=,lstart=", "-p", String(pid)]);
  if (!output) return null;
  for (const line of output.split(/\r?\n/)) {
    const identity = parsePsProcessIdentityLine(pid, line);
    if (identity) return identity;
  }
  return null;
}

async function listPsProcessGroupMembers(processGroup) {
  const output = await runBoundedPs(["-axo", "pid=,pgid=,lstart="]);
  if (!output) return null;
  const members = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (!match || Number(match[2]) !== processGroup) continue;
    const pid = Number(match[1]);
    const identity = parsePsProcessIdentityLine(pid, line);
    if (identity) {
      members.push(identity);
      if (members.length >= DARWIN_MAX_GROUP_MEMBERS) break;
    }
  }
  return members;
}

async function readDarwinProcessIdentity(pid, identityMode) {
  if (identityMode === "ps") return readPsProcessIdentity(pid);
  const api = await getDarwinProcApi();
  if (!api) return readPsProcessIdentity(pid);

  const bytes = new Uint8Array(DARWIN_PROC_BSDINFO_SIZE);
  const result = api.library.symbols.proc_pidinfo(
    pid,
    DARWIN_PROC_BSDINFO,
    0,
    api.ptr(bytes),
    bytes.byteLength,
  );
  if (result < DARWIN_PROC_BSDINFO_SIZE) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const processId = view.getUint32(12, true);
  const processGroup = view.getUint32(100, true);
  const startSeconds = view.getBigUint64(120, true);
  const startMicroseconds = view.getBigUint64(128, true);
  if (processId !== pid || processGroup <= 0) return null;

  return {
    pid,
    processGroup,
    startTime: `${startSeconds}:${startMicroseconds}`,
  };
}

async function listDarwinProcessGroupMembers(processGroup, identityMode) {
  if (identityMode === "ps") return listPsProcessGroupMembers(processGroup);
  const api = await getDarwinProcApi();
  if (!api) return listPsProcessGroupMembers(processGroup);

  const pidBytes = new Uint8Array(DARWIN_MAX_GROUP_MEMBERS * 4);
  const result = api.library.symbols.proc_listpgrppids(
    processGroup,
    api.ptr(pidBytes),
    pidBytes.byteLength,
  );
  if (result <= 0) return [];

  const view = new DataView(pidBytes.buffer, pidBytes.byteOffset, pidBytes.byteLength);
  const count = Math.min(result, DARWIN_MAX_GROUP_MEMBERS);
  const members = [];
  for (let index = 0; index < count; index += 1) {
    const pid = view.getInt32(index * 4, true);
    const identity = await readDarwinProcessIdentity(pid, identityMode);
    if (identity?.processGroup === processGroup) members.push(identity);
  }
  return members;
}

async function readProcessIdentity(pid, identityMode) {
  if (
    !Number.isSafeInteger(pid) ||
    pid <= 0 ||
    !isProcessGroupSupported(true, identityMode)
  ) {
    return null;
  }
  if (process.platform === "darwin" || identityMode === "ps") {
    return process.platform === "darwin"
      ? readDarwinProcessIdentity(pid, identityMode)
      : readPsProcessIdentity(pid);
  }
  try {
    const contents = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return parseProcessStat(pid, contents);
  } catch {
    return null;
  }
}

async function listProcessGroupMembers(processGroup, identityMode) {
  if (
    !Number.isSafeInteger(processGroup) ||
    !isProcessGroupSupported(true, identityMode)
  ) {
    return [];
  }

  if (process.platform === "darwin" || identityMode === "ps") {
    return process.platform === "darwin"
      ? listDarwinProcessGroupMembers(processGroup, identityMode)
      : listPsProcessGroupMembers(processGroup);
  }

  let entries;
  try {
    entries = fs.readdirSync("/proc");
  } catch {
    return null;
  }

  const members = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const identity = await readProcessIdentity(Number(entry), identityMode);
    if (identity?.processGroup === processGroup) members.push(identity);
  }
  return members;
}

function identityKey(identity) {
  return `${identity.pid}:${identity.startTime}`;
}

function sameIdentity(expected, actual) {
  return Boolean(
    expected &&
      actual &&
      expected.pid === actual.pid &&
      expected.startTime === actual.startTime &&
      expected.processGroup === actual.processGroup,
  );
}

async function captureProcessGroup(child, detached, identityMode) {
  if (
    !isProcessGroupSupported(detached, identityMode) ||
    !Number.isSafeInteger(child.pid)
  ) {
    return null;
  }
  let leader = await readProcessIdentity(child.pid, identityMode);
  for (let attempt = 0; !leader && attempt < 4; attempt += 1) {
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
    } catch {
      break;
    }
    leader = await readProcessIdentity(child.pid, identityMode);
  }
  if (!leader || leader.processGroup !== child.pid) {
    return null;
  }

  const members = new Map();
  const membersInGroup = await listProcessGroupMembers(
    leader.processGroup,
    identityMode,
  );
  if (!membersInGroup) return null;
  for (const member of membersInGroup) {
    members.set(identityKey(member), member);
  }
  members.set(identityKey(leader), leader);
  return {
    groupId: leader.processGroup,
    leader,
    members,
    identityMode,
    leaderAlive: true,
    identityCompromised: false,
    discoveryProven: true,
    lastLeaderProofAt: Date.now(),
    lastDiscoveryAt: Date.now(),
  };
}

async function refreshProcessGroup(group) {
  if (!group || group.identityCompromised) return false;
  const leader = await readProcessIdentity(group.leader.pid, group.identityMode);
  if (leader && !sameIdentity(group.leader, leader)) {
    group.identityCompromised = true;
    group.discoveryProven = false;
    return false;
  }
  group.leaderAlive = Boolean(leader);
  if (group.leaderAlive) group.lastLeaderProofAt = Date.now();

  const membersInGroup = await listProcessGroupMembers(
    group.groupId,
    group.identityMode,
  );
  if (!membersInGroup) {
    group.discoveryProven = false;
    return false;
  }
  for (const member of membersInGroup) {
    group.members.set(identityKey(member), member);
  }
  group.discoveryProven = true;
  group.lastDiscoveryAt = Date.now();
  return true;
}

async function verifiedSurvivors(group) {
  if (!group) return [];
  const survivors = [];
  for (const member of group.members.values()) {
    const current = await readProcessIdentity(member.pid, group.identityMode);
    if (sameIdentity(member, current)) survivors.push(member);
  }
  return survivors;
}

async function processGroupHasOwnedSurvivors(group) {
  if (!group) return false;
  const discovered = await refreshProcessGroup(group);
  if (!discovered || group.identityCompromised) return true;
  return (await verifiedSurvivors(group)).length > 0;
}

async function sendVerifiedMembers(group, signal) {
  let sent = false;
  for (const member of await verifiedSurvivors(group)) {
    try {
      process.kill(member.pid, signal);
      sent = true;
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  return sent;
}

async function sendLeaderGroupSignal(group, signal, completionState) {
  if (
    !group ||
    completionState.settled ||
    !(await refreshProcessGroup(group)) ||
    !group.leaderAlive ||
    group.identityCompromised
  ) {
    return false;
  }
  try {
    process.kill(-group.groupId, signal);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

async function sendOwnedSignal({ child, group, signal, detached, completionState }) {
  if (isProcessGroupSupported(detached, group?.identityMode)) {
    if (!group) {
      throw new ProcessTreeTerminationError(
        `Could not prove process identity for ${child.pid ?? "unknown"}`,
      );
    }
    if (group.identityCompromised) {
      throw new ProcessTreeTerminationError(
        `Could not prove process identity for process group ${group.groupId}`,
      );
    }
    if (
      signal === "SIGTERM" &&
      (await sendLeaderGroupSignal(group, signal, completionState))
    ) {
      return true;
    }
    return await sendVerifiedMembers(group, signal);
  }

  if (
    completionState.settled ||
    child.exitCode !== null ||
    child.signalCode !== null
  ) {
    return false;
  }
  try {
    return child.kill(signal);
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

function waitForClose(child) {
  let settled = false;
  let result;
  let resolveCompletion;
  let spawnError;
  const promise = new Promise((resolve) => {
    resolveCompletion = resolve;
  });
  const state = {
    get settled() {
      return settled;
    },
    get result() {
      return result;
    },
  };
  child.once("error", (error) => {
    spawnError = error;
  });
  child.once("close", (code, signal) => {
    result = { code, signal, error: spawnError };
    settled = true;
    resolveCompletion(result);
  });
  return { promise, state };
}

async function waitForTreeGone(completion, completionState, group, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let emptyPolls = 0;
  while (true) {
    const discoveryProven = group ? await refreshProcessGroup(group) : true;
    const survivors =
      group && discoveryProven && !group.identityCompromised
        ? await verifiedSurvivors(group)
        : group
          ? [group.leader]
          : [];
    const treeGone =
      completionState.settled &&
      discoveryProven &&
      !group?.identityCompromised &&
      survivors.length === 0;
    if (treeGone) {
      emptyPolls += 1;
      if (emptyPolls >= PROCESS_GROUP_QUIESCENCE_POLLS) {
        return { result: completionState.result, treeGone: true };
      }
    } else {
      emptyPolls = 0;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return { result: completionState.result, treeGone: false };
    }
    await delay(Math.min(PROCESS_GROUP_POLL_MS, remaining));
  }
}

async function terminateProcessTree({
  child,
  completion,
  completionState,
  detached,
  group,
  graceMs,
}) {
  let forceKilled = false;

  try {
    await sendOwnedSignal({
      child,
      group,
      signal: "SIGTERM",
      detached,
      completionState,
    });
  } catch (error) {
    if (error instanceof ProcessTreeTerminationError) throw error;
    throw new ProcessTreeTerminationError(
      `Could not terminate process tree ${child.pid ?? "unknown"}`,
      { cause: error },
    );
  }

  let stopped = await waitForTreeGone(
    completion,
    completionState,
    group,
    graceMs,
  );
  if (!stopped.treeGone) {
    forceKilled = true;
    try {
      if (isProcessGroupSupported(detached, group?.identityMode) && !group) {
        throw new ProcessTreeTerminationError(
          `Could not prove process identity for ${child.pid ?? "unknown"}`,
        );
      }
      await sendOwnedSignal({
        child,
        group,
        signal: "SIGKILL",
        detached,
        completionState,
      });
    } catch (error) {
      if (error instanceof ProcessTreeTerminationError) throw error;
      throw new ProcessTreeTerminationError(
        `Could not force-terminate process tree ${child.pid ?? "unknown"}`,
        { cause: error },
      );
    }
    stopped = await waitForTreeGone(
      completion,
      completionState,
      group,
      graceMs,
    );
  }

  if (!stopped.treeGone) {
    throw new ProcessTreeTerminationError(
      `Could not prove that process tree ${child.pid ?? "unknown"} exited`,
    );
  }

  return { forceKilled, result: stopped.result };
}

function waitForCompletionOrTimeout(completion, completionState, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      if (completionState.settled) {
        finish({ kind: "exit", result: completionState.result });
      } else {
        finish({ kind: "timeout" });
      }
    }, timeoutMs);

    completion.then((result) => finish({ kind: "exit", result }));
  });
}

function captureStream(stream) {
  if (!stream) return null;

  const chunks = [];
  stream.on("data", (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  });
  return chunks;
}

function toCapturedText(chunks) {
  return chunks ? Buffer.concat(chunks).toString("utf8") : "";
}

function signalExitCode(signal) {
  return SIGNAL_EXIT_CODES[signal] ?? 1;
}

async function runProcess({
  command,
  args = [],
  cwd = process.cwd(),
  env,
  stdio = "inherit",
  timeoutMs,
  killGraceMs,
  identityMode,
}) {
  if (!command) throw new Error("A process command is required");
  const effectiveTimeoutMs = resolveBoundedTimeout(
    timeoutMs,
    "NITRO_MARKDOWN_PROCESS_TIMEOUT_MS",
    DEFAULT_PROCESS_TIMEOUT_MS,
    MAX_PROCESS_TIMEOUT_MS,
  );
  const effectiveKillGraceMs = resolveBoundedTimeout(
    killGraceMs,
    "NITRO_MARKDOWN_PROCESS_KILL_GRACE_MS",
    DEFAULT_PROCESS_KILL_GRACE_MS,
    MAX_PROCESS_TIMEOUT_MS,
  );

  const detached = process.platform !== "win32";
  let child;
  try {
    child = spawn(command, args, {
      cwd,
      env,
      stdio,
      shell: false,
      detached,
      windowsHide: true,
    });
  } catch (error) {
    return {
      ok: false,
      code: null,
      signal: null,
      exitCode: 1,
      error,
      stdout: "",
      stderr: "",
      timedOut: false,
      forceKilled: false,
      treeGone: true,
    };
  }

  const stdoutChunks = captureStream(child.stdout);
  const stderrChunks = captureStream(child.stderr);
  const completion = waitForClose(child);
  let group = await captureProcessGroup(child, detached, identityMode);
  let receivedSignal;
  let terminationPromise;
  let resolveSignal;
  const signalReceived = new Promise((resolve) => {
    resolveSignal = resolve;
  });

  const requestTermination = () => {
    if (!terminationPromise) {
      terminationPromise = (async () => {
        if (isProcessGroupSupported(detached, identityMode) && !group) {
          group = await captureProcessGroup(child, detached, identityMode);
        }
        return terminateProcessTree({
          child,
          completion: completion.promise,
          completionState: completion.state,
          detached,
          group,
          graceMs: effectiveKillGraceMs,
        });
      })();
    }
    return terminationPromise;
  };
  const handleSignal = (signal) => {
    if (receivedSignal) return;
    receivedSignal = signal;
    resolveSignal();
    void requestTermination().catch(() => {});
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
  try {
    const firstResult = await Promise.race([
      waitForCompletionOrTimeout(
        completion.promise,
        completion.state,
        effectiveTimeoutMs,
      ),
      signalReceived.then(() => ({ kind: "signal" })),
    ]);

    let terminated;
    let timedOut = false;
    if (receivedSignal) {
      terminated = await requestTermination();
    } else if (firstResult.kind === "timeout") {
      timedOut = true;
      terminated = await requestTermination();
    } else if (group) {
      const treeStatus = await waitForTreeGone(
        completion.promise,
        completion.state,
        group,
        effectiveKillGraceMs,
      );
      if (!treeStatus.treeGone) terminated = await requestTermination();
    } else if (isProcessGroupSupported(detached, identityMode)) {
      throw new ProcessTreeTerminationError(
        `Could not prove process identity for ${child.pid ?? "unknown"}`,
      );
    }

    const result = await completion.promise;
    const childSignal = result.signal ?? null;
    const signal = receivedSignal ?? childSignal;
    const exitCode = receivedSignal
      ? signalExitCode(receivedSignal)
      : timedOut
        ? 124
        : result.code ?? (childSignal ? signalExitCode(childSignal) : 1);

    return {
      ok: !timedOut && !receivedSignal && result.code === 0 && !result.error,
      code: result.code,
      signal,
      exitCode,
      error: result.error,
      stdout: toCapturedText(stdoutChunks),
      stderr: toCapturedText(stderrChunks),
      timedOut,
      forceKilled: terminated?.forceKilled ?? false,
      treeGone: true,
    };
  } finally {
    process.removeListener("SIGINT", handleSignal);
    process.removeListener("SIGTERM", handleSignal);
  }
}

module.exports = {
  ProcessInterrupted,
  ProcessTreeTerminationError,
  DEFAULT_PROCESS_TIMEOUT_MS,
  MAX_PROCESS_TIMEOUT_MS,
  SIGNAL_EXIT_CODES,
  runProcess,
};
