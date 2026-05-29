export interface LogEntry {
  id: string;
  type: 'node_start' | 'node_end' | 'progress' | 'error' | 'info';
  agent: string;
  agentDisplayName: string;
  duration?: string;
  step?: number;
  totalSteps?: number;
  timestamp: string;
}

let listeners: Array<() => void> = [];
let entries: LogEntry[] = [];

export function addLog(entry: Omit<LogEntry, 'id'>) {
  entries = [{ ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }, ...entries].slice(0, 200);
  listeners.forEach((fn) => fn());
}

export function getLogs(): LogEntry[] {
  return entries;
}

export function clearLogs() {
  entries = [];
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}
