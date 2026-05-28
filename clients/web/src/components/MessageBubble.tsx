"use client";

interface Props {
  role: string;
  content: string;
}

const roleLabel: Record<string, string> = {
  human: "用户",
  ai: "助手",
  system: "系统",
  tool: "工具",
};

export default function MessageBubble({ role, content }: Props) {
  const isUser = role === "human";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-zinc-800 text-zinc-200"
        }`}
      >
        {!isUser && (
          <div className="text-xs text-zinc-400 mb-1">
            {roleLabel[role] || role}
          </div>
        )}
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
    </div>
  );
}
