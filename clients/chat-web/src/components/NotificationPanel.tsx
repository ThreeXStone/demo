"use client";

import { useState, useEffect, useRef } from "react";
import { getNotifications, type NotificationEvent } from "@/lib/api";

const typeConfig: Record<string, { color: string; bg: string; label: string }> = {
  upload: { color: "text-blue-600", bg: "bg-blue-50", label: "上传" },
  process: { color: "text-amber-600", bg: "bg-amber-50", label: "处理" },
  embed: { color: "text-purple-600", bg: "bg-purple-50", label: "向量化" },
  complete: { color: "text-emerald-600", bg: "bg-emerald-50", label: "完成" },
  error: { color: "text-red-600", bg: "bg-red-50", label: "错误" },
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

interface Props {
  open: boolean;
  onToggle: () => void;
}

export default function NotificationPanel({ open, onToggle }: Props) {
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const lastSeenRef = useRef<string>("");
  const openRef = useRef(false);

  useEffect(() => { openRef.current = open; }, [open]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    const poll = async () => {
      try {
        const since = lastSeenRef.current || undefined;
        const newEvents = await getNotifications(since);
        if (newEvents.length > 0) {
          lastSeenRef.current = newEvents[0].createdAt;
          setEvents((prev) => {
            const existingIds = new Set(prev.map((e) => e.id));
            const unique = newEvents.filter((e) => !existingIds.has(e.id));
            return [...unique, ...prev].slice(0, 100);
          });
        }
      } catch { /* ignore */ }
    };

    poll();
    timer = setInterval(poll, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/10" onClick={onToggle} />
          <div className="fixed right-0 top-0 z-50 h-screen w-80 bg-white border-l border-gray-200 shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">消息中心</h3>
              <button
                onClick={onToggle}
                className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {events.length === 0 && (
                <div className="px-4 py-12 text-center text-gray-400 text-sm">
                  暂无消息
                </div>
              )}
              {events.map((event) => {
                const config = typeConfig[event.type] || typeConfig.process;
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                  >
                    <span className={`text-xs font-medium mt-0.5 px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
                      {config.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-600 leading-relaxed">{event.message}</p>
                      <span className="text-xs text-gray-400 mt-1 block">{timeAgo(event.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
