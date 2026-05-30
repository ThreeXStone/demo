'use client';

import { useState, useEffect, useRef } from 'react';
import { getLogs, clearLogs, subscribe, type LogEntry } from '@/lib/log-store';

const agentColors: Record<string, string> = {
  classifier: 'text-purple-600',
  extract: 'text-blue-600',
  clarify: 'text-amber-600',
  analysis: 'text-cyan-600',
  risk: 'text-orange-600',
  summary: 'text-emerald-600',
  queryHandler: 'text-green-600',
  chatHandler: 'text-pink-600',
};

const statusColors: Record<string, string> = {
  node_start: 'bg-blue-400',
  node_end: 'bg-emerald-400',
  error: 'bg-red-400',
  info: 'bg-gray-400',
};

interface Props {
  open: boolean;
  onToggle: () => void;
}

export default function LogPanel({ open, onToggle }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [unread, setUnread] = useState(false);
  const prevCountRef = useRef(0);

  useEffect(() => {
    setLogs(getLogs());
    return subscribe(() => {
      const updated = getLogs();
      setLogs([...updated]);
      if (!open && updated.length > prevCountRef.current) setUnread(true);
      prevCountRef.current = updated.length;
    });
  }, [open]);

  const nodeLogs = logs.filter((l) => l.type !== 'progress');

  const handleOpen = () => {
    setUnread(false);
    onToggle();
  };

  return (
    <>
      {/* Panel */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/10" onClick={onToggle} />
          <div className="fixed right-0 top-0 z-50 h-screen w-80 bg-white border-l border-gray-200 shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">执行日志</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearLogs}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  清空
                </button>
                <button
                  onClick={onToggle}
                  className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {nodeLogs.length === 0 && (
                <div className="px-4 py-12 text-center text-gray-400 text-sm">
                  暂无日志，发送消息后查看执行详情
                </div>
              )}
              {nodeLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${statusColors[log.type] || 'bg-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${agentColors[log.agent] || 'text-gray-500'}`}>
                        {log.agentDisplayName}
                      </span>
                      {log.duration && (
                        <span className="text-xs text-gray-400">{log.duration}</span>
                      )}
                      {log.step && log.totalSteps && (
                        <span className="text-xs text-gray-300">{log.step}/{log.totalSteps}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {log.type === 'node_start' ? '开始' : log.type === 'node_end' ? '完成' : log.type}
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
