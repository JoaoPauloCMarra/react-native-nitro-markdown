const http = require("node:http");

const imagePaths = ["/img/ok.png", "/img/denied.png", "/img/deny.png", "/img/empty.png"];
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  "base64",
);

function json(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

function createRequestHandler(counts) {
  return (request, response) => {
    request.resume();
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/requests") {
      json(response, 200, Object.fromEntries(counts));
      return;
    }
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      counts.has(url.pathname)
    ) {
      const pathname = url.pathname;
      response.once("finish", () => {
        counts.set(pathname, (counts.get(pathname) ?? 0) + 1);
      });
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": png.length,
        "Content-Type": "image/png",
      });
      response.end(request.method === "HEAD" ? undefined : png);
      return;
    }
    json(response, 404, { ok: false, fixture: true, status: 404 });
  };
}

function formatHost(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function createExampleReplayHttpFixture({
  bindHost = "127.0.0.1",
  advertiseHost = bindHost,
  port = 0,
} = {}) {
  const counts = new Map(imagePaths.map((imagePath) => [imagePath, 0]));
  const server = http.createServer(createRequestHandler(counts));

  return {
    counts() {
      return Object.fromEntries(counts);
    },
    async listen() {
      if (!server.listening) {
        await new Promise((resolve, reject) => {
          const onError = (error) => {
            server.off("listening", onListening);
            reject(error);
          };
          const onListening = () => {
            server.off("error", onError);
            resolve();
          };
          server.once("error", onError);
          server.once("listening", onListening);
          server.listen(port, bindHost);
        });
      }
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Replay fixture did not bind to a TCP address");
      }
      return {
        bindHost,
        port: address.port,
        baseUrl: `http://${formatHost(advertiseHost)}:${address.port}`,
      };
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

function parseArgs(argv) {
  const options = {
    bindHost: "127.0.0.1",
    advertiseHost: "127.0.0.1",
    port: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help") {
      return { help: true };
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    if (flag === "--bind") options.bindHost = value;
    else if (flag === "--advertise-host") options.advertiseHost = value;
    else if (flag === "--port") {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error("--port must be an integer from 0 to 65535");
      }
      options.port = port;
    } else {
      throw new Error(`Unknown replay fixture option: ${flag}`);
    }
    index += 1;
  }
  return options;
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(
        "Usage: bun scripts/example-replay-http-fixture.js [--bind <address>] [--advertise-host <device-reachable-host>] [--port <port>]\n",
      );
    } else {
      const fixture = createExampleReplayHttpFixture(options);
      fixture
        .listen()
        .then(({ baseUrl, bindHost }) => {
          process.stdout.write(
            `Replay fixture listening at ${baseUrl} (bound to ${bindHost})\n`,
          );
          const stop = () => {
            void fixture.close().finally(() => {
              process.exitCode = 0;
            });
          };
          process.once("SIGINT", stop);
          process.once("SIGTERM", stop);
        })
        .catch((error) => {
          process.stderr.write(
            `${error instanceof Error ? error.message : String(error)}\n`,
          );
          process.exitCode = 1;
        });
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

module.exports = { createExampleReplayHttpFixture, parseArgs };
