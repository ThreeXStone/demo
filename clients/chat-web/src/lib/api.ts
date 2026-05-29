import type { AIUIResponse, UIAction } from './types';

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function sendMessage(sessionId: string, input: string): Promise<AIUIResponse> {
  return request('/api/ui-chat/chat', {
    method: 'POST',
    body: JSON.stringify({ sessionId, input }),
  });
}

export async function sendAction(sessionId: string, action: UIAction): Promise<AIUIResponse> {
  return request('/api/ui-chat/action', {
    method: 'POST',
    body: JSON.stringify({ sessionId, action }),
  });
}
