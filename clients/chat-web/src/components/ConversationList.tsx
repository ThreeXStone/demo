"use client";

import { useState, useEffect } from "react";
import {
  listConversations,
  createConversation,
  deleteConversation,
  type Conversation,
} from "@/lib/api";

interface Props {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export default function ConversationList({ activeId, onSelect, onNew }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchList = async () => {
    setLoading(true);
    try {
      const list = await listConversations();
      setConversations(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleCreate = async () => {
    try {
      const conv = await createConversation("新会话");
      setConversations((prev) => [conv, ...prev]);
      onSelect(conv.id);
      onNew();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        onSelect("");
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3">
        <button
          onClick={handleCreate}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl hover:bg-indigo-500/20 hover:border-indigo-500/30 transition-all text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新对话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {conversations.length === 0 && !loading && (
          <div className="px-3 py-8 text-center text-zinc-600 text-sm">
            暂无对话
          </div>
        )}
        <div className="space-y-0.5">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                activeId === conv.id
                  ? "bg-zinc-800/80 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <svg className="w-4 h-4 shrink-0 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <span className="text-sm truncate">{conv.title}</span>
              </div>
              <button
                onClick={(e) => handleDelete(conv.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-zinc-700/50 text-zinc-600 hover:text-red-400 transition-all shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
