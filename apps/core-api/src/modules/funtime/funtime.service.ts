import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { EventsSnapshot, NearestEventView, type ServerEvents } from "@eon/shared-domain";
import { CACHE_KEYS, LOCK_KEYS } from "@eon/shared-infra";
import Redis from "ioredis";
import { FunTimeGateway } from "./funtime.gateway";

@Injectable()
export class FunTimeService {
  private readonly redis?: Redis;

  constructor(private readonly gateway: FunTimeGateway) {
    const url = process.env.REDIS_URL?.trim();
    if (url) {
      const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
      client.on("error", () => {
        // prevent noisy unhandled error events; redis is optional in dev
      });
      this.redis = client;
    }
  }

  async refreshEventsSnapshot(): Promise<EventsSnapshot> {
    const redis = this.redis;
    let lockAcquired = true;
    if (redis) {
      try {
        lockAcquired = Boolean(await redis.set(LOCK_KEYS.FUNTIME_REFRESH, "1", "EX", 15, "NX"));
        if (!lockAcquired) {
          const cached = await redis.get(CACHE_KEYS.EVENTS_ALL);
          if (cached) return JSON.parse(cached) as EventsSnapshot;
          throw new ServiceUnavailableException("Event refresh already in progress");
        }
      } catch {
        // Redis is unavailable; run without lock/cache.
        lockAcquired = true;
      }
    }

    try {
      const servers = await this.gateway.getServersInfo();
      const batches = this.chunk(servers, 30);
      const responses = await Promise.all(
        batches.map((batch) => this.gateway.getEvents(batch, "all"))
      );

      const snapshot: EventsSnapshot = {
        fetchedAt: new Date().toISOString(),
        stale: false,
        items: this.dedupeItems(responses.flat())
      };

      if (redis) {
        try {
          await redis.set(CACHE_KEYS.SERVERS_LIST, JSON.stringify(servers), "EX", 900);
          await redis.set(CACHE_KEYS.EVENTS_ALL, JSON.stringify(snapshot), "EX", 45);
        } catch {
          // ignore cache write errors
        }
      }
      return snapshot;
    } catch {
      if (redis) {
        try {
          const fallback = await redis.get(CACHE_KEYS.EVENTS_ALL);
          if (fallback) {
            const stale = JSON.parse(fallback) as EventsSnapshot;
            return { ...stale, stale: true };
          }
        } catch {
          // ignore cache read errors
        }
      }
      throw new ServiceUnavailableException("No events data available");
    } finally {
      if (redis) {
        try {
          await redis.del(LOCK_KEYS.FUNTIME_REFRESH);
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Uses Redis `EVENTS_ALL` when present to avoid hitting FunTime on every read.
   * On cache miss, performs a full refresh.
   */
  async getSnapshotForRead(): Promise<EventsSnapshot> {
    const redis = this.redis;
    if (redis) {
      try {
        const raw = await redis.get(CACHE_KEYS.EVENTS_ALL);
        if (raw) {
          return JSON.parse(raw) as EventsSnapshot;
        }
      } catch {
        // continue to refresh
      }
    }
    return this.refreshEventsSnapshot();
  }

  async getNearestEvents(limit = 12): Promise<NearestEventView[]> {
    const snapshot = await this.getSnapshotForRead();
    return this.projectNearest(snapshot, limit);
  }

  private projectNearest(snapshot: EventsSnapshot, limit: number): NearestEventView[] {
    return snapshot.items
      .map((item) => {
        if (!item.events.length) {
          return null;
        }
        const times = item.events.map((event) => event.timeLeftSec);
        const nearestTimeLeftSec = Math.min(...times);
        const minutes = Math.max(1, Math.floor(nearestTimeLeftSec / 60));
        return {
          server: item.server,
          nearestTimeLeftSec,
          displayLabel: `${item.server} — Ивент через ${minutes} минут`
        };
      })
      .filter((entry): entry is NearestEventView => entry != null && Number.isFinite(entry.nearestTimeLeftSec))
      .sort((a, b) => a.nearestTimeLeftSec - b.nearestTimeLeftSec)
      .slice(0, limit);
  }

  private dedupeItems(items: ServerEvents[]): ServerEvents[] {
    return items.map((block) => this.dedupeServerBlock(block));
  }

  private dedupeServerBlock(block: ServerEvents): ServerEvents {
    const byName = new Map<string, (typeof block.events)[number]>();
    for (const event of block.events) {
      const prev = byName.get(event.eventName);
      if (!prev || event.timeLeftSec < prev.timeLeftSec) {
        byName.set(event.eventName, event);
      }
    }
    return { server: block.server, events: [...byName.values()] };
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
    return result;
  }
}
