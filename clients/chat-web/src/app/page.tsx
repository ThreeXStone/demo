"use client";

import { useState, useCallback } from "react";
import { hasToken, clearToken } from "@/lib/api";
import LoginForm from "@/components/LoginForm";
import ConversationList from "@/components/ConversationList";
import ChatWindow from "@/components/ChatWindow";
import DocumentPanel from "@/components/DocumentPanel";
import NotificationPanel from "@/components/NotificationPanel";
import AIChatContainer from "@/components/ai-ui/AIChatContainer";

type Tab = "chat" | "ui" | "docs";

export default function Home() {
  const [authorized, setAuthorized] = useState(hasToken());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [tab, setTab] = useState<Tab>("chat");

  const handleSelect = useCallback((id: string) => {
    if (id) { setActiveId(id); setChatKey((k) => k + 1); setTab("chat"); }
    else { setActiveId(null); }
  }, []);

  const handleNew = useCallback(() => { setChatKey((k) => k + 1); }, []);

  const handleLogout = () => { clearToken(); setAuthorized(false); setActiveId(null); };

  if (!authorized) return <LoginForm onSuccess={() => setAuthorized(true)} />;

  const tabs: { key: Tab; label: string }[] = [
    { key: "chat", label: "对话" },
    { key: "ui", label: "UI 助手" },
    { key: "docs", label: "知识库" },
  ];

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
        <div className="flex-1 min-h-0">
          <ConversationList activeId={activeId} onSelect={handleSelect} onNew={handleNew} />
        </div>
      </div>

      {/* Main Area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Tabs */}
        <div className="flex items-center border-b border-zinc-800/60 bg-[#09090b] px-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                tab === t.key ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
              {tab === t.key && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-indigo-500 rounded-full" />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0">
          {tab === "chat" && (
            activeId ? <ChatWindow key={chatKey} conversationId={activeId} /> : (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600">
                <svg className="w-12 h-12 mb-4 text-zinc-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-sm">选择或创建一个会话开始对话</p>
              </div>
            )
          )}
          {tab === "ui" && <AIChatContainer />}
          {tab === "docs" && <DocumentPanel />}
        </div>
      </div>

      <NotificationPanel />
    </div>
  );
}
