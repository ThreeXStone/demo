'use client';

import { useState, useEffect, useRef } from 'react';

interface LogEntry {
  id: number;
  level: 'log' | 'error' | 'warn';
  message: string;
  timestamp: string;
}

const levelConfig: Record<string, { color: string; bg: string; label: string }> = {
  log: { color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'INFO' },
  warn: { color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'WARN' },
  error: { color: 'text-red-400', bg: 'bg-red-500/10', label: 'ERROR' },
};

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'log', label: 'INFO' },
  { key: 'warn', label: 'WARN' },
  { key: 'error', label: 'ERROR' },
];

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

interface Props {
  open: boolean;
  onToggle: () => void;
}

export default function LogPanel({ open, onToggle }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(0);

  useEffect(() => {
    if (!open) return;

    const es = new EventSource('http://localhost:3002/chat/logs/stream');

    es.onmessage = (event) => {
      try {
        const entry: LogEntry = JSON.parse(event.data);
        countRef.current += 1;
        setLogs((prev) => [...prev.slice(-499), entry]);
      } catch { /* 忽略解析失败 */ }
    };

    return () => {
      es.close();
      setLogs([]);
      countRef.current = 0;
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.level === filter);

  return (
    <>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/10" onClick={onToggle} />
          <div className="fixed right-0 top-0 z-50 h-screen w-[420px] bg-gray-950 border-l border-gray-800 shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-200">日志</h3>
                <span className="text-xs text-gray-500">({countRef.current})</span>
              </div>
              <button
                onClick={onToggle}
                className="p-1 rounded-md hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 px-4 py-2 border-b border-gray-800/50">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                    filter === f.key
                      ? 'bg-gray-700 text-gray-200'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Log List */}
            <div className="flex-1 overflow-y-auto font-mono text-xs leading-relaxed">
              {filtered.length === 0 && (
                <div className="px-4 py-12 text-center text-gray-600">
                  暂无日志
                </div>
              )}
              {filtered.map((entry) => {
                const config = levelConfig[entry.level];
                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 px-4 py-1 hover:bg-gray-900/50 border-b border-gray-900/30"
                  >
                    <span className="text-gray-600 shrink-0 mt-px w-[70px]">{fmtTime(entry.timestamp)}</span>
                    <span className={`shrink-0 mt-px px-1 rounded text-[10px] font-medium ${config.bg} ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="text-gray-300 break-all whitespace-pre-wrap">{entry.message}</span>
                  </div>
                );
              })}
              <div ref={scrollRef} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
