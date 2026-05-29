import { Injectable } from '@nestjs/common';

export interface NotificationEvent {
  id: string;
  userId: string;
  type: 'upload' | 'process' | 'embed' | 'complete' | 'error';
  message: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

@Injectable()
export class NotificationService {
  private events: NotificationEvent[] = [];
  private readonly maxEvents = 500;

  emit(event: Omit<NotificationEvent, 'id' | 'createdAt'>) {
    const e: NotificationEvent = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };
    this.events.push(e);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  getForUser(userId: string, since?: string): NotificationEvent[] {
    let filtered = this.events.filter((e) => e.userId === userId);
    if (since) {
      filtered = filtered.filter((e) => e.createdAt > since);
    }
    return filtered.slice(-50);
  }
}
