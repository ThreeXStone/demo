"use client";

interface Props {
  role: string;
  content: string;
}

const roleLabel: Record<string, string> = {
  human: "你",
  ai: "AI",
  system: "系统",
  tool: "工具",
};

export default function MessageBubble({ role, content }: Props) {
  const isUser = role === "human";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className={`flex items-start gap-3 max-w-[80%] ${isUser ? "flex-row-reverse" : ""}`}>
        {/* Avatar */}
        <div
          className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-medium ${
            isUser
              ? "bg-zinc-700 text-zinc-300"
              : "bg-indigo-500/20 text-indigo-400"
          }`}
        >
          {isUser ? "U" : "AI"}
        </div>

        {/* Bubble */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-zinc-500">{roleLabel[role] || role}</span>
          </div>
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              isUser
                ? "bg-indigo-600 text-white rounded-tr-md"
                : "bg-zinc-800/80 text-zinc-200 rounded-tl-md border border-zinc-800"
            }`}
          >
            <div className="whitespace-pre-wrap">{content}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
