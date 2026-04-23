import { Injectable, UnauthorizedException } from "@nestjs/common";
import axios, { AxiosError, AxiosInstance } from "axios";
import { EventType, ServerEvents } from "@eon/shared-domain";
import { RateLimitUpstreamError, RetryableUpstreamError, withExponentialBackoff } from "@eon/shared-infra";

interface ServersInfoResponse {
  success: boolean;
  response: string[];
}

interface EventsResponse {
  response: Array<{ server: string; events: Array<{ event_name: string; time_left: number }> }>;
}

@Injectable()
export class FunTimeGateway {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: process.env.FUNTIME_API_BASE_URL ?? "https://api.funtime.su",
      timeout: 7000,
      headers: {
        "Authorization-Token": process.env.FUNTIME_API_TOKEN ?? ""
      }
    });
  }

  async getServersInfo(): Promise<string[]> {
    return withExponentialBackoff(async () => {
      try {
        const { data } = await this.http.get<ServersInfoResponse>("/method/servers-info");
        return data.response ?? [];
      } catch (error) {
        this.mapAndThrow(error);
      }
    });
  }

  async getEvents(serverBatch: string[], eventType: EventType): Promise<ServerEvents[]> {
    if (serverBatch.length > 30) {
      throw new Error("server batch exceeds max 30");
    }
    return withExponentialBackoff(async () => {
      try {
        const { data } = await this.http.get<EventsResponse>("/method/events-info", {
          params: {
            "event-type": eventType,
            "server-type": serverBatch.join(",")
          }
        });
        return (data.response ?? []).map((item) => ({
          server: item.server,
          events: item.events.map((event) => ({
            eventName: event.event_name,
            timeLeftSec: event.time_left
          }))
        }));
      } catch (error) {
        this.mapAndThrow(error);
      }
    });
  }

  private mapAndThrow(error: unknown): never {
    if (!axios.isAxiosError(error)) {
      throw error;
    }
    const status = (error as AxiosError).response?.status;
    if (status === 401) {
      throw new UnauthorizedException("FunTime token unauthorized");
    }
    if (status === 402) {
      throw new RateLimitUpstreamError("FunTime token rate-limited");
    }
    if (status === 403 || status === 404) {
      throw new RetryableUpstreamError(`FunTime upstream error ${String(status)}`);
    }
    throw new RetryableUpstreamError("FunTime unknown upstream error");
  }
}
