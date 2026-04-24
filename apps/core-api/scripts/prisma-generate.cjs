const { spawnSync } = require("node:child_process");

const attempts = 5;
const delayMs = 1200;
const args = ["prisma", "generate", "--schema", "prisma/schema.prisma"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const run = spawnSync("pnpm", args, { stdio: "inherit", shell: process.platform === "win32" });
    if (run.status === 0) {
      return;
    }

    if (attempt === attempts) {
      process.exit(run.status ?? 1);
    }

    console.warn(`prisma generate failed (attempt ${attempt}/${attempts}), retrying...`);
    await sleep(delayMs);
  }
}

void main();
