'use client';

import { useState, useRef, useEffect } from 'react';
import {
  sendMessage, createConversation, uiAction,
  getMessages,
  type Message,
} from '@/lib/api';
import type { UIComponent, StreamMessage, ProgressPayload } from '@/lib/types';
import ComponentRenderer from './ai-ui/ComponentRenderer';
import ThinkingIndicator from './ai-ui/ThinkingIndicator';

interface ChatMsg { role: 'user' | 'ai'; content: string; components?: UIComponent[]; }

function routeIntent(input: string): 'rag' | 'langgraph' {
  if (/退货|退款|换货|订单|物流|售后|收货|拆封|商品|保修|发票|投诉/.test(input)) return 'rag';
  return 'langgraph';
}

const MODELS = [
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { value: 'gpt-5.4', label: 'GPT-5' },
];

interface Props { conversationId: string | null; }

export default function UnifiedChat({ conversationId: convId }: Props) {
  const [sessionId] = useState(() => `u-${Date.now()}`);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('preferred_model') || 'deepseek-v4-pro' : 'deepseek-v4-pro'
  );
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingContent]);
  useEffect(() => () => { loadingRef.current = false; }, []);

  // Load conversation history when convId changes
  useEffect(() => {
    if (!convId) { setMessages([]); return; }
    getMessages(convId).then((rows) => {
      setMessages(rows.map((r) => ({ role: r.role as 'user' | 'ai', content: r.content })));
    }).catch(() => {});
  }, [convId]);

  // ====== RAG Chat ======
  const handleRagChat = async (text: string) => {
    let cid = convId;
    if (!cid) {
      const conv = await createConversation(text.slice(0, 20));
      cid = conv.id;
      // reload page sidebar by refreshing
      window.location.reload();
    }
    const result = await sendMessage(cid, text);
    const content = result.report || result.clarificationQuestions?.join('\n') || '分析完成';
    return { content, components: [] as UIComponent[] };
  };

  // ====== LangGraph SSE ======
  const handleLangGraph = async (text: string, ctrl: AbortController): Promise<ChatMsg> => {
    const resp = await fetch('/api/ui-chat/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, input: text, model }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    if (!resp.body) throw new Error('No stream body');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let content = '';
    let components: UIComponent[] | null = null;
    let buffer = '';

    // timeout safety: max 5 minutes
    const startTime = Date.now();
    const MAX_TIME = 300_000;

    try {
      while (loadingRef.current) {
        if (Date.now() - startTime > MAX_TIME) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const msg: StreamMessage = JSON.parse(payload);
            if (msg.messageType === 'progress') setProgress(msg.payload as ProgressPayload);
            else if (msg.messageType === 'markdown') {
              content += (msg.payload as any).content || '';
              setStreamingContent(content);
            } else if (msg.messageType === 'ui') components = (msg.payload as any).components;
            else if (msg.messageType === 'done') { /* handled by stream close */ }
            else if (msg.messageType === 'error') throw new Error((msg.payload as any).message || 'Stream error');
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    return { content: content || '(空响应)', components: components || undefined };
  };

  // ====== Send ======
  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    loadingRef.current = true;
    setProgress(null);
    setStreamingContent('');

    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    const route = routeIntent(text);
    const ctrl = new AbortController();

    try {
      const aiMsg = route === 'rag'
        ? await handleRagChat(text)
        : await handleLangGraph(text, ctrl);

      if (loadingRef.current) {
        setMessages((prev) => [...prev, { role: 'ai', ...aiMsg }]);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && loadingRef.current) {
        setMessages((prev) => [...prev, { role: 'ai', content: `请求失败: ${err.message}` }]);
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
      setProgress(null);
      setStreamingContent('');
    }
  };

  const handleAction = async (comp: UIComponent, action: Record<string, unknown>) => {
    setLoading(true);
    try {
      const resp = await uiAction(sessionId, { componentType: comp.type, payload: action });
      setMessages((prev) => [...prev, { role: 'ai', content: resp.message, components: resp.components }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', content: '操作失败' }]);
    } finally { setLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleModelChange = (val: string) => {
    setModel(val);
    localStorage.setItem('preferred_model', val);
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      {/* Model selector header */}
      <div className="px-6 py-2 border-b border-zinc-800/60 flex items-center justify-end gap-2">
        <span className="text-xs text-zinc-600">模型:</span>
        <select
          value={model}
          onChange={(e) => handleModelChange(e.target.value)}
          className="text-xs bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-400 focus:outline-none focus:border-zinc-700"
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center pt-20 text-zinc-600">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <p className="text-sm text-zinc-400">你好！有什么可以帮你的吗？</p>
              <div className="flex gap-2 mt-4">
                <span className="text-xs text-zinc-600 px-2 py-1 rounded bg-zinc-800/50">退货咨询</span>
                <span className="text-xs text-zinc-600 px-2 py-1 rounded bg-zinc-800/50">需求分析</span>
                <span className="text-xs text-zinc-600 px-2 py-1 rounded bg-zinc-800/50">日常对话</span>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              {msg.content && (
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}>
                  <div className="flex items-start gap-2 max-w-[85%]">
                    {msg.role === 'ai' && (
                      <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs text-indigo-400">AI</span>
                      </div>
                    )}
                    <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-md'
                        : 'bg-zinc-800/80 text-zinc-200 rounded-tl-md border border-zinc-800'
                    }`}>
                      {msg.content}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-6 h-6 rounded-md bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs text-zinc-300">U</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {msg.role === 'ai' && msg.components && msg.components.length > 0 && (
                <div className="ml-8 space-y-3 max-w-[85%]">
                  {msg.components.map((comp, j) => (
                    <ComponentRenderer key={j} component={comp} onAction={(a) => handleAction(comp, a)} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {streamingContent && (
            <div className="flex justify-start">
              <div className="flex items-start gap-2 max-w-[85%]">
                <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs text-indigo-400">AI</span>
                </div>
                <div className="rounded-2xl rounded-tl-md px-4 py-2.5 text-sm bg-zinc-800/80 text-zinc-200 border border-zinc-800 whitespace-pre-wrap">
                  {streamingContent}<span className="inline-block w-1.5 h-4 bg-zinc-400 ml-0.5 animate-pulse align-middle" />
                </div>
              </div>
            </div>
          )}

          {loading && !streamingContent && <ThinkingIndicator progress={progress} />}
          <div ref={scrollRef} />
        </div>
      </div>

      <div className="border-t border-zinc-800/60 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 focus-within:border-zinc-700 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送)"
              rows={1} disabled={loading}
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
