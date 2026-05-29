'use client';

import { useState, useRef, useEffect } from 'react';
import { uiAction, analyzeStream } from '@/lib/api';
import type { ChatMessage, UIComponent, StreamMessage, ProgressPayload } from '@/lib/types';
import ComponentRenderer from './ComponentRenderer';
import ThinkingIndicator from './ThinkingIndicator';

export default function AIChatContainer() {
  const [sessionId] = useState(() => `web-${Date.now()}`);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingContent]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    setProgress(null);
    setStreamingContent('');

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // 全部输入经 LangGraph classifier 分流: analyze → 5节点管道 / query → 快速查询 / chat → 日常对话
      const resp = await fetch('/api/ui-chat/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, input }),
        signal: ctrl.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';
      let streamedText = '';
      let streamedComponents: UIComponent[] | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const msg: StreamMessage = JSON.parse(line.slice(6));
            switch (msg.messageType) {
              case 'progress':
                setProgress(msg.payload as ProgressPayload);
                break;
              case 'markdown': {
                const p = msg.payload as any;
                streamedText += p.content;
                setStreamingContent(streamedText);
                break;
              }
              case 'ui': {
                const p = msg.payload as any;
                streamedComponents = p.components;
                break;
              }
              case 'done':
                break;
              case 'error':
                console.error('Stream error:', msg.payload);
                break;
            }
          } catch {}
        }
      }

      // Add final AI message
      const aiMsg: ChatMessage = {
        role: 'ai',
        content: streamedText || '已收到',
        components: streamedComponents || undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setStreamingContent('');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => [...prev, { role: 'ai', content: '请求失败，请重试。' }]);
      }
    } finally {
      setLoading(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const handleAction = async (component: UIComponent, action: Record<string, unknown>) => {
    setLoading(true);
    try {
      const resp = await uiAction(sessionId, { componentType: component.type, payload: action });
      const aiMsg: ChatMessage = {
        role: 'ai',
        content: resp.message,
        components: resp.components,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', content: '操作失败，请重试。' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center pt-20 text-zinc-600">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <p className="text-sm">你好！有什么可以帮你的吗？</p>
              <p className="text-xs text-zinc-700 mt-1">试试说：我要提一个新需求</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.content && (
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}>
                  <div className="flex items-start gap-2 max-w-[85%]">
                    {msg.role === 'ai' && (
                      <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs text-indigo-400 font-medium">AI</span>
                      </div>
                    )}
                    <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-md'
                        : 'bg-zinc-800/80 text-zinc-200 rounded-tl-md border border-zinc-800'
                    }`}>
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
              {msg.role === 'ai' && msg.components && msg.components.length > 0 && (
                <div className="ml-8 space-y-3 max-w-[85%]">
                  {msg.components.map((comp, j) => (
                    <ComponentRenderer key={j} component={comp} onAction={(action) => handleAction(comp, action)} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Streaming display */}
          {streamingContent && (
            <div className="flex justify-start">
              <div className="flex items-start gap-2 max-w-[85%]">
                <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs text-indigo-400 font-medium">AI</span>
                </div>
                <div className="rounded-2xl rounded-tl-md px-4 py-2.5 text-sm leading-relaxed bg-zinc-800/80 text-zinc-200 border border-zinc-800 whitespace-pre-wrap">
                  {streamingContent}
                  <span className="inline-block w-1.5 h-4 bg-zinc-400 ml-0.5 animate-pulse align-middle" />
                </div>
              </div>
            </div>
          )}

          {/* Progress indicator */}
          {loading && !streamingContent && <ThinkingIndicator progress={progress} />}

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
              onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }}
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
