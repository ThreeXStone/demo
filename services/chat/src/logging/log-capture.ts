import { EventEmitter } from 'events';

export interface LogEntry {
  id: number;
  level: 'log' | 'error' | 'warn';
  message: string;
  timestamp: string;
}

class LogBuffer {
  private buffer: LogEntry[] = [];
  private maxSize = 500;
  private nextId = 1;
  emitter = new EventEmitter();

  push(level: LogEntry['level'], message: string) {
    const entry: LogEntry = {
      id: this.nextId++,
      level,
      message,
      timestamp: new Date().toISOString(),
    };
    this.buffer.push(entry);
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(-this.maxSize);
    }
    this.emitter.emit('log', entry);
  }

  getRecent(): LogEntry[] {
    return [...this.buffer];
  }
}

const logBuffer = new LogBuffer();

export function getRecentLogs(): LogEntry[] {
  return logBuffer.getRecent();
}

export function onLog(listener: (entry: LogEntry) => void): () => void {
  logBuffer.emitter.on('log', listener);
  return () => { logBuffer.emitter.off('log', listener); };
}

// 劫持 console
function stringify(args: any[]): string {
  return args.map((a) => {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
}

const _log = console.log.bind(console);
const _error = console.error.bind(console);
const _warn = console.warn.bind(console);

console.log = (...args: any[]) => {
  logBuffer.push('log', stringify(args));
  _log(...args);
};

console.error = (...args: any[]) => {
  logBuffer.push('error', stringify(args));
  _error(...args);
};

console.warn = (...args: any[]) => {
  logBuffer.push('warn', stringify(args));
  _warn(...args);
};
