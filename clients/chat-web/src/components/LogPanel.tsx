'use client';

import { useState, useEffect } from 'react';
import { getLogs, clearLogs, subscribe, type LogEntry } from '@/lib/log-store';

const agentColors: Record<string, string> = {
  classifier: 'text-purple-400',
  extract: 'text-blue-400',
  clarify: 'text-yellow-400',
  analysis: 'text-cyan-400',
  risk: 'text-orange-400',
  summary: 'text-emerald-400',
  queryHandler: 'text-green-400',
  chatHandler: 'text-pink-400',
};

const typeIcons: Record<string, string> = {
  node_start: '▶',
  node_end: '✓',
  progress: '●',
  error: '✕',
  info: 'ℹ',
};

export default function LogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setLogs(getLogs());
    return subscribe(() => setLogs([...getLogs()]));
  }, []);

  const nodeLogs = logs.filter((l) => l.type !== 'progress');

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors text-sm text-zinc-300"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        执行日志
        <span className="text-xs text-zinc-600">{nodeLogs.length}</span>
      </button>

      {/* Panel */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setOpen(false)} />
          <div className="fixed right-0 top-0 z-50 h-screen w-80 bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-200">执行日志</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearLogs}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  清空
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {nodeLogs.length === 0 && (
                <div className="px-4 py-12 text-center text-zinc-500 text-sm">
                  暂无日志，发送消息后查看执行详情
                </div>
              )}
              {nodeLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-zinc-800/40 hover:bg-zinc-900/50 transition-colors">
                  <span className="text-xs mt-0.5 shrink-0 w-4 text-center">
                    {typeIcons[log.type] || '●'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${agentColors[log.agent] || 'text-zinc-400'}`}>
                        {log.agentDisplayName}
                      </span>
                      {log.duration && (
                        <span className="text-xs text-zinc-600">{log.duration}</span>
                      )}
                      {log.step && log.totalSteps && (
                        <span className="text-xs text-zinc-700">{log.step}/{log.totalSteps}</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-600 mt-0.5">
                      {log.type === 'node_start' ? '开始执行' : log.type === 'node_end' ? '执行完成' : log.type}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
