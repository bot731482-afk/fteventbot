import { Injectable } from "@nestjs/common";
import { BotConfigStore, type BotConfigHistoryEntry } from "./bot-config.store";
import type { BotConfigV1 } from "@eon/shared-domain";

@Injectable()
export class BotConfigService {
  private readonly store = new BotConfigStore();

  getPublicConfig(): Promise<BotConfigV1> {
    return this.store.readCurrent();
  }

  async getAdminView(): Promise<{ config: BotConfigV1; history: BotConfigHistoryEntry[] }> {
    const [config, history] = await Promise.all([this.store.readCurrent(), this.store.listHistory()]);
    return { config, history };
  }

  updateConfig(next: BotConfigV1): Promise<{ ok: true; id: string }> {
    return this.store.writeNew(next);
  }

  rollback(id: string): Promise<{ ok: true }> {
    return this.store.rollbackTo(id);
  }
}

