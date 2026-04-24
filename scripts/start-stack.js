const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { spawn } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const logsDir = path.join(rootDir, "logs");
const runtimeLogsDir = path.join(logsDir, "runtime");

const coreApiUrl = process.env.CORE_API_URL || "http://127.0.0.1:3000/v1";
const adminUrl = process.env.ADMIN_WEB_URL || "http://127.0.0.1:3100";
const coreApiHealthUrl = process.env.CORE_API_HEALTH_URL || `${coreApiUrl.replace(/\/$/, "")}/bot/config`;
const adminHealthUrl = process.env.ADMIN_WEB_HEALTH_URL || adminUrl;
const startupTimeoutMs = Number(process.env.STACK_STARTUP_TIMEOUT_MS || "120000");

/** @type {Array<{name: string, child: import("node:child_process").ChildProcess}>} */
const children = [];

function ensureLogsDir() {
  fs.mkdirSync(runtimeLogsDir, { recursive: true });
}

function createLogger(name) {
  const filePath = path.join(runtimeLogsDir, `${name}.log`);
  const stream = fs.createWriteStream(filePath, { flags: "a" });
  return {
    write(chunk) {
      const text = chunk.toString();
      process.stdout.write(`[${name}] ${text}`);
      stream.write(text);
    },
    close() {
      stream.end();
    }
  };
}

function startService(name, command, args) {
  const logger = createLogger(name);
  const child = spawn(command, args, {
    cwd: rootDir,
    env: process.env,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout?.on("data", (data) => logger.write(data));
  child.stderr?.on("data", (data) => logger.write(data));
  child.on("exit", (code, signal) => {
    logger.write(Buffer.from(`\nprocess exited code=${String(code)} signal=${String(signal)}\n`));
    logger.close();
    if (!isShuttingDown) {
      console.error(`[stack] ${name} exited unexpectedly, shutting down stack`);
      shutdown(1);
    }
  });

  children.push({ name, child });
  console.log(`[stack] started ${name}`);
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === "https:" ? https : http;
    const req = lib.get(
      target,
      { timeout: 3000 },
      (res) => {
        const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 400;
        res.resume();
        if (!ok) {
          reject(new Error(`status ${res.statusCode}`));
          return;
        }
        resolve();
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function waitForHttp(name, url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await httpGet(url);
      console.log(`[stack] ${name} is ready: ${url}`);
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error(`${name} did not become ready in ${timeoutMs}ms (${url})`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let isShuttingDown = false;
function shutdown(exitCode) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("[stack] shutting down...");
  for (const { child } of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  setTimeout(() => {
    process.exit(exitCode);
  }, 1500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("uncaughtException", (error) => {
  console.error("[stack] uncaught exception", error);
  shutdown(1);
});
process.on("unhandledRejection", (error) => {
  console.error("[stack] unhandled rejection", error);
  shutdown(1);
});

async function main() {
  ensureLogsDir();
  console.log("[stack] starting core-api -> admin-web -> bot-service");
  startService("core-api", "pnpm", ["--filter", "@eon/core-api", "start"]);
  await waitForHttp("core-api", coreApiHealthUrl, startupTimeoutMs);

  startService("admin-web", "pnpm", ["--filter", "@eon/admin-web", "start"]);
  await waitForHttp("admin-web", adminHealthUrl, startupTimeoutMs);

  startService("bot-service", "pnpm", ["--filter", "@eon/bot-service", "start"]);
  console.log("[stack] all services started");
}

void main().catch((error) => {
  console.error("[stack] failed to start", error);
  shutdown(1);
});
