'use client';

import { useState, useRef, useEffect } from 'react';
import {
  createConversation, saveMessage, uiAction,
  getMessages,
  type Message,
} from '@/lib/api';
import type { UIComponent, StreamMessage } from '@/lib/types';
import ComponentRenderer from './ai-ui/ComponentRenderer';
import ThinkingIndicator from './ai-ui/ThinkingIndicator';

interface ChatMsg { role: 'user' | 'ai'; content: string; components?: UIComponent[]; }

function routeIntent(input: string): 'query' | 'chat' | 'analyze' {
  if (/退货|退款|换货|订单|物流|售后|收货|拆封|商品|保修|发票|投诉/.test(input)) return 'query';
  if (/需求|功能|优化|新增|改进|做一个|开发|登录|注册|模块/.test(input)) return 'analyze';
  return 'chat';
}

const MODELS = [
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { value: 'gpt-5.4', label: 'GPT-5' },
];

interface Props {
  conversationId: string | null;
  onToggleNotif?: () => void;
}

export default function UnifiedChat({ conversationId: convId, onToggleNotif }: Props) {
  const [sessionId] = useState(() => `u-${Date.now()}`);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('preferred_model') || 'deepseek-v4-pro' : 'deepseek-v4-pro'
  );
  const [streamingContent, setStreamingContent] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingContent]);
  useEffect(() => () => { loadingRef.current = false; }, []);

  useEffect(() => {
    if (!convId) { setMessages([]); return; }
    getMessages(convId).then((rows) => {
      setMessages(rows.map((r) => ({ role: (r.role === 'human' || r.role === 'user') ? 'user' : 'ai', content: r.content })));
    }).catch(() => {});
  }, [convId]);

  const autoResize = () => {
    const t = textareaRef.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 200) + 'px';
  };

  const handleSSE = async (endpoint: string, text: string, ctrl: AbortController): Promise<ChatMsg> => {
    const resp = await fetch(`http://localhost:3002${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, input: text, model, conversationId: convId }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    if (!resp.body) throw new Error('No stream body');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let content = '';
    let components: UIComponent[] | null = null;
    let buffer = '';
    const startTime = Date.now();
    const MAX_TIME = 300_000;

    try {
      while (loadingRef.current) {
        if (Date.now() - startTime > MAX_TIME) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const msg: StreamMessage = JSON.parse(payload);
            if (msg.messageType === 'markdown') {
              content += (msg.payload as any).content || '';
              setStreamingContent(content);
            } else if (msg.messageType === 'ui') components = (msg.payload as any).components;
            else if (msg.messageType === 'done') {}
            else if (msg.messageType === 'error') {
              throw new Error((msg.payload as any).message || 'Stream error');
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    return { role: 'ai', content: content || '(空响应)', components: components || undefined };
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    loadingRef.current = true;
    setStreamingContent('');
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }

    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    const route = routeIntent(text);
    const ctrl = new AbortController();

    let cid = convId;
    if (!cid && route !== 'query') {
      try { const conv = await createConversation(text.slice(0, 20)); cid = conv.id; } catch {}
    }

    try {
      const endpoint = route === 'analyze'
        ? '/api/ui-chat/requirement/collect'
        : route === 'query'
          ? '/api/ui-chat/query'
          : '/api/ui-chat/chat';
      const aiMsg = await handleSSE(endpoint, text, ctrl);

      if (loadingRef.current) setMessages((prev) => [...prev, aiMsg]);

      if (cid) {
        saveMessage(cid, 'human', text).catch(() => {});
        saveMessage(cid, 'ai', aiMsg.content).catch(() => {});
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && loadingRef.current) {
        setMessages((prev) => [...prev, { role: 'ai', content: `请求失败: ${err.message}` }]);
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
      setStreamingContent('');
    }
  };

  const handleAction = async (comp: UIComponent, action: Record<string, unknown>) => {
    setLoading(true);
    loadingRef.current = true;
    try {
      const resp = await uiAction(sessionId, { componentType: comp.type, payload: action });
      setMessages((prev) => [...prev, { role: 'ai', content: resp.message, components: resp.components }]);

      // 确认提交后触发 LangGraph 深度分析
      const isConfirm = action.type === 'confirm' && action.confirmed === true;
      if (isConfirm) {
        const card = (resp.components || []).find((c: any) => c.type === 'card') as any;
        const fields = card?.sections?.map((s: any) => `${s.label}: ${s.value}`).join('\n') || '';
        const collectedText = `请对以下需求进行深度分析，输出功能分解、用户故事、验收标准和技术复杂度评估：\n\n${fields}`;
        const ctrl = new AbortController();
        try {
          const aiMsg = await handleSSE('/api/ui-chat/analyze', collectedText, ctrl);
          if (loadingRef.current) setMessages((prev) => [...prev, aiMsg]);
          if (convId) saveMessage(convId, 'ai', aiMsg.content).catch(() => {});
        } catch {
          if (loadingRef.current) setMessages((prev) => [...prev, { role: 'ai', content: '深度分析请求失败' }]);
        } finally {
          loadingRef.current = false;
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', content: '操作失败' }]);
    } finally {
      setLoading(false);
      setStreamingContent('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const isUser = (role: string) => role === 'user' || role === 'human';
  const isAI = (role: string) => role === 'ai' || role === 'assistant';

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100">
        <span className="text-sm font-medium text-gray-700">对话</span>
        <div className="flex items-center gap-1.5">
          {onToggleNotif && (
            <button
              onClick={onToggleNotif}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="通知"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
          )}
          <span className="text-xs text-gray-400 ml-2">模型</span>
          <select
            value={model}
            onChange={(e) => { setModel(e.target.value); localStorage.setItem('preferred_model', e.target.value); }}
            className="text-xs bg-gray-50 border border-gray-200 rounded-md px-2 py-1 text-gray-600 focus:outline-none focus:border-gray-300 cursor-pointer"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-5 py-6 space-y-6">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-5">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-800 mb-1">有什么可以帮你的？</h3>
              <p className="text-sm text-gray-400">AI 助手可以帮你分析需求、回答问题和日常对话</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              {msg.content && (
                <div className={`flex ${isUser(msg.role) ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex items-start gap-3 max-w-[85%] ${isAI(msg.role) ? 'flex-row' : 'flex-row-reverse'}`}>
                    {isAI(msg.role) && (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                    )}
                    <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      isUser(msg.role)
                        ? 'bg-gray-100 text-gray-800 rounded-br-md'
                        : 'text-gray-800'
                    }`}>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                    {isUser(msg.role) && (
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-medium text-gray-500">U</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {isAI(msg.role) && msg.components && msg.components.length > 0 && (
                <div className="ml-10 space-y-3 max-w-[85%] mt-3">
                  {msg.components.map((comp, j) => (
                    <ComponentRenderer key={j} component={comp} onAction={(a) => handleAction(comp, a)} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && streamingContent && (
            <div className="flex justify-start">
              <div className="flex items-start gap-3 max-w-[85%]">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap py-1">
                  {streamingContent}<span className="inline-block w-1.5 h-4 bg-gray-300 ml-0.5 animate-pulse align-middle rounded-sm" />
                </div>
              </div>
            </div>
          )}

          {loading && !streamingContent && <ThinkingIndicator />}
          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input */}
      <div className="px-5 pb-5 pt-2">
        <div className="max-w-[720px] mx-auto">
          <div className="flex items-end gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm focus-within:border-gray-300 focus-within:shadow-md transition-all duration-200">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(); }}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none resize-none leading-relaxed"
              style={{ maxHeight: '200px' }}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
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
