import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultBotConfigV1, validateBotConfigV1, type BotConfigV1 } from "@eon/shared-domain";

function resolveInApp(filename: string): string {
  const appDir = path.resolve(__dirname, "../../..");
  return path.resolve(appDir, filename);
}

const storePath = process.env.BOT_CONFIG_STORE_PATH?.trim() || resolveInApp("bot-config.store.json");
const historyDir = process.env.BOT_CONFIG_HISTORY_DIR?.trim() || resolveInApp("bot-config.history");

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(dir, `${base}.tmp`);
  await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await rename(tmp, filePath);
}

export type BotConfigHistoryEntry = { id: string; createdAt: string };

export class BotConfigStore {
  async readCurrent(): Promise<BotConfigV1> {
    try {
      const raw = await readFile(storePath, "utf8");
      return validateBotConfigV1(JSON.parse(raw));
    } catch {
      return defaultBotConfigV1;
    }
  }

  async listHistory(): Promise<BotConfigHistoryEntry[]> {
    try {
      const files = await readdir(historyDir);
      return files
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({ id: f.replace(/\\.json$/, ""), createdAt: f.replace(/\\.json$/, "") }))
        .sort((a, b) => (a.id < b.id ? 1 : -1));
    } catch {
      return [];
    }
  }

  async writeNew(next: BotConfigV1): Promise<{ ok: true; id: string }> {
    const validated = validateBotConfigV1(next);
    await mkdir(historyDir, { recursive: true });

    const id = new Date().toISOString().replace(/[:.]/g, "-");
    const historyPath = path.join(historyDir, `${id}.json`);

    // Save history snapshot before replacing current (best-effort).
    const current = await this.readCurrent();
    await writeJsonAtomic(historyPath, current);
    await writeJsonAtomic(storePath, validated);
    return { ok: true, id };
  }

  async rollbackTo(id: string): Promise<{ ok: true }> {
    const safeId = id.replace(/[^0-9A-Za-z-]/g, "");
    const historyPath = path.join(historyDir, `${safeId}.json`);
    const raw = await readFile(historyPath, "utf8");
    const cfg = validateBotConfigV1(JSON.parse(raw));
    await writeJsonAtomic(storePath, cfg);
    return { ok: true };
  }
}

export const botConfigPaths = { storePath, historyDir };

