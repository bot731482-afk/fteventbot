import { Injectable } from "@nestjs/common";

interface QueueItem {
  dedupKey: string;
  userId: string;
  serverCode: string;
  notifyBeforeMinutes: 1 | 3 | 5;
}

@Injectable()
export class NotificationService {
  private readonly queue = new Map<string, QueueItem>();

  schedule(item: QueueItem): void {
    if (!this.queue.has(item.dedupKey)) {
      this.queue.set(item.dedupKey, item);
    }
  }

  drain(): QueueItem[] {
    const entries = [...this.queue.values()];
    this.queue.clear();
    return entries;
  }
}
