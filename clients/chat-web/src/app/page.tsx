"use client";

import { useState, useCallback, useEffect } from "react";
import { hasToken, clearToken } from "@/lib/api";
import LoginForm from "@/components/LoginForm";
import ConversationList from "@/components/ConversationList";
import SidebarDocs from "@/components/SidebarDocs";
import NotificationPanel from "@/components/NotificationPanel";
import UnifiedChat from "@/components/UnifiedChat";

export default function Home() {
  const [authorized, setAuthorized] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    setAuthorized(hasToken());
    setAuthChecked(true);
  }, []);

  const handleSelect = useCallback((id: string) => {
    if (id) { setActiveId(id); setChatKey((k) => k + 1); }
    else { setActiveId(null); }
  }, []);

  const handleNew = useCallback(() => { setChatKey((k) => k + 1); }, []);
  const handleLogout = () => { clearToken(); setAuthorized(false); setActiveId(null); };

  if (!authChecked) return null;

  if (!authorized) return <LoginForm onSuccess={() => setAuthorized(true)} />;

  return (
    <div className="flex h-screen bg-white">
      {/* Left Sidebar */}
      <div className="w-60 shrink-0 border-r border-gray-100 bg-gray-50/50 flex flex-col">
        <div className="px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-sm">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-700">AI Chat</span>
          </div>
          <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">退出</button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0">
            <ConversationList activeId={activeId} onSelect={handleSelect} onNew={handleNew} />
          </div>
          <div className="border-t border-gray-100 h-52">
            <SidebarDocs />
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 min-w-0">
        <UnifiedChat
          conversationId={activeId}
          onToggleNotif={() => setNotifOpen(!notifOpen)}
        />
      </div>

      <NotificationPanel open={notifOpen} onToggle={() => setNotifOpen(!notifOpen)} />
    </div>
  );
}
