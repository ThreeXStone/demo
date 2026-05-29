"use client";

import { useState, useCallback } from "react";
import { hasToken, clearToken } from "@/lib/api";
import LoginForm from "@/components/LoginForm";
import ConversationList from "@/components/ConversationList";
import SidebarDocs from "@/components/SidebarDocs";
import NotificationPanel from "@/components/NotificationPanel";
import UnifiedChat from "@/components/UnifiedChat";

export default function Home() {
  const [authorized, setAuthorized] = useState(hasToken());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);

  const handleSelect = useCallback((id: string) => {
    if (id) { setActiveId(id); setChatKey((k) => k + 1); }
    else { setActiveId(null); }
  }, []);

  const handleNew = useCallback(() => { setChatKey((k) => k + 1); }, []);
  const handleLogout = () => { clearToken(); setAuthorized(false); setActiveId(null); };

  if (!authorized) return <LoginForm onSuccess={() => setAuthorized(true)} />;

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100">
      {/* Left Sidebar */}
      <div className="w-64 shrink-0 border-r border-zinc-800/60 bg-[#0c0c10] flex flex-col">
        <div className="px-4 py-3.5 border-b border-zinc-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-500 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-zinc-200">AI Chat</span>
          </div>
          <button onClick={handleLogout} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">退出</button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0">
            <ConversationList activeId={activeId} onSelect={handleSelect} onNew={handleNew} />
          </div>
          <div className="border-t border-zinc-800/60 h-52">
            <SidebarDocs />
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 min-w-0">
        <UnifiedChat conversationId={activeId} />
      </div>

      <NotificationPanel />
    </div>
  );
}
