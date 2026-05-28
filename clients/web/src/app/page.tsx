"use client";

import { useState, useCallback } from "react";
import { hasToken, clearToken } from "@/lib/api";
import LoginForm from "@/components/LoginForm";
import ConversationList from "@/components/ConversationList";
import ChatWindow from "@/components/ChatWindow";
import DocumentPanel from "@/components/DocumentPanel";

type Tab = "chat" | "docs";

export default function Home() {
  const [authorized, setAuthorized] = useState(hasToken());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [tab, setTab] = useState<Tab>("chat");

  const handleSelect = useCallback((id: string) => {
    if (id) {
      setActiveId(id);
      setChatKey((k) => k + 1);
      setTab("chat");
    } else {
      setActiveId(null);
    }
  }, []);

  const handleNew = useCallback(() => {
    setChatKey((k) => k + 1);
  }, []);

  const handleLogout = () => {
    clearToken();
    setAuthorized(false);
    setActiveId(null);
  };

  if (!authorized) {
    return <LoginForm onSuccess={() => setAuthorized(true)} />;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "chat", label: "对话" },
    { key: "docs", label: "知识库" },
  ];

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <div className="w-64 shrink-0 border-r border-zinc-800 flex flex-col">
        <div className="px-3 py-3 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-200">
            会话列表
          </span>
          <button
            onClick={handleLogout}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            退出
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <ConversationList
            activeId={activeId}
            onSelect={handleSelect}
            onNew={handleNew}
          />
        </div>
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex border-b border-zinc-800">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "text-zinc-100 border-b-2 border-blue-500"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "chat" ? (
          activeId ? (
            <ChatWindow key={chatKey} conversationId={activeId} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
              选择或创建一个会话开始对话
            </div>
          )
        ) : (
          <div className="flex-1 min-h-0">
            <DocumentPanel />
          </div>
        )}
      </div>
    </div>
  );
}
