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

export default function ConversationList({
  activeId,
  onSelect,
  onNew,
}: Props) {
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
      <div className="px-3 py-4 border-b border-zinc-800">
        <button
          onClick={handleCreate}
          className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          + 新对话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && !loading && (
          <div className="px-3 py-8 text-center text-zinc-500 text-sm">
            暂无对话，创建一个吧
          </div>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`group flex items-center justify-between px-3 py-3 cursor-pointer border-b border-zinc-800/50 transition-colors ${
              activeId === conv.id
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
            }`}
          >
            <span className="text-sm truncate flex-1">{conv.title}</span>
            <button
              onClick={(e) => handleDelete(conv.id, e)}
              className="opacity-0 group-hover:opacity-100 ml-2 text-zinc-500 hover:text-red-400 transition-all text-xs shrink-0"
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
