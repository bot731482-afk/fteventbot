import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { EventsSnapshot, NearestEventView } from "@eon/shared-domain";
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
        items: responses.flat()
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

  async getNearestEvents(limit = 12): Promise<NearestEventView[]> {
    const snapshot = await this.refreshEventsSnapshot();
    return snapshot.items
      .map((item) => ({
        server: item.server,
        nearestTimeLeftSec: Math.min(...item.events.map((event) => event.timeLeftSec)),
        displayLabel: `${item.server} — Ивент через ${Math.max(1, Math.floor(Math.min(...item.events.map((event) => event.timeLeftSec)) / 60))} минут`
      }))
      .filter((entry) => Number.isFinite(entry.nearestTimeLeftSec))
      .sort((a, b) => a.nearestTimeLeftSec - b.nearestTimeLeftSec)
      .slice(0, limit);
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
    return result;
  }
}
