'use client';

import { useState, useRef, useEffect } from 'react';
import { uiChat, uiAction } from '@/lib/api';
import type { ChatMessage, UIComponent } from '@/lib/types';
import ComponentRenderer from './ComponentRenderer';

export default function AIChatContainer() {
  const [sessionId] = useState(() => `web-${Date.now()}`);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const resp = await uiChat(sessionId, text);
      const aiMsg: ChatMessage = {
        role: 'ai',
        content: resp.message,
        components: resp.components,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'ai', content: '请求失败，请重试。' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (component: UIComponent, action: Record<string, unknown>) => {
    setLoading(true);
    try {
      const resp = await uiAction(sessionId, {
        componentType: component.type,
        payload: action,
      });
      const aiMsg: ChatMessage = {
        role: 'ai',
        content: resp.message,
        components: resp.components,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'ai', content: '操作失败，请重试。' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800/60 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <h1 className="text-sm font-semibold text-zinc-200">需求分析助手</h1>
          <p className="text-xs text-zinc-500">AI UI Protocol Demo</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-20 text-zinc-600">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <p className="text-sm">试试说：我要提一个新需求</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i}>
              {/* Message text */}
              {msg.content && (
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}>
                  <div className="flex items-start gap-2 max-w-[85%]">
                    {msg.role === 'ai' && (
                      <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs text-indigo-400 font-medium">AI</span>
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-tr-md'
                          : 'bg-zinc-800/80 text-zinc-200 rounded-tl-md border border-zinc-800'
                      }`}
                    >
                      {msg.content}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-6 h-6 rounded-md bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs text-zinc-300 font-medium">U</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Components (AI only) - rendered AFTER the message */}
              {msg.role === 'ai' && msg.components && msg.components.length > 0 && (
                <div className="ml-8 space-y-3 max-w-[85%]">
                  {msg.components.map((comp, j) => (
                    <ComponentRenderer
                      key={j}
                      component={comp}
                      onAction={(action) => handleAction(comp, action)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center">
                <span className="text-xs text-indigo-400">AI</span>
              </div>
              <div className="flex gap-1.5 px-4 py-3 rounded-2xl rounded-tl-md bg-zinc-800/80">
                <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800/60 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 focus-within:border-zinc-700 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送)"
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none resize-none"
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-500 text-white hover:bg-indigo-400 transition-colors disabled:opacity-30"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
