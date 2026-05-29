"use client";

import { useState, useEffect, useRef } from "react";
import { getNotifications, type NotificationEvent } from "@/lib/api";

const typeConfig: Record<string, { icon: string; color: string }> = {
  upload: { icon: "↑", color: "text-blue-400" },
  process: { icon: "⚙", color: "text-yellow-400" },
  embed: { icon: "⋮", color: "text-purple-400" },
  complete: { icon: "✓", color: "text-emerald-400" },
  error: { icon: "✕", color: "text-red-400" },
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

export default function NotificationPanel() {
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const lastSeenRef = useRef<string>("");
  const openRef = useRef(false);

  // keep openRef in sync
  useEffect(() => {
    openRef.current = open;
  }, [open]);

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
          if (!openRef.current) {
            setUnreadCount((c) => c + newEvents.length);
          }
        }
      } catch {
        // ignore
      }
    };

    // 首次加载
    poll();
    timer = setInterval(poll, 3000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpen = () => {
    setOpen(true);
    setUnreadCount(0);
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={handleOpen}
        className="fixed right-4 top-4 z-40 flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors text-sm text-zinc-300"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span>通知</span>
        {unreadCount > 0 && (
          <span className="flex items-center justify-center w-5 h-5 text-xs font-medium bg-indigo-500 text-white rounded-full">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed right-0 top-0 z-50 h-screen w-80 bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-200">消息中心</h3>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {events.length === 0 && (
              <div className="px-4 py-12 text-center text-zinc-500 text-sm">
                暂无消息
              </div>
            )}
            {events.map((event) => {
              const config = typeConfig[event.type] || typeConfig.process;
              return (
                <div
                  key={event.id}
                  className="flex items-start gap-3 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors"
                >
                  <span className={`text-sm mt-0.5 ${config.color}`}>
                    {config.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 leading-relaxed">
                      {event.message}
                    </p>
                    <span className="text-xs text-zinc-600 mt-1 block">
                      {timeAgo(event.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
