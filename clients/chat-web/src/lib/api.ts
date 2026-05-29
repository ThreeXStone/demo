import type { AIUIResponse, UIAction } from './types';

// --- Auth helpers ---

const TOKEN_KEY = "jwt_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) { localStorage.setItem(TOKEN_KEY, token); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }
export function hasToken(): boolean { return !!getToken(); }

// --- Base request ---

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Auth ---

export interface AuthResult { token: string; user: { id: string; email: string; name: string | null }; }

export async function login(email: string, password: string): Promise<AuthResult> {
  return request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}
export async function register(email: string, password: string, name?: string): Promise<AuthResult> {
  return request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) });
}

// --- Conversations ---

export interface Conversation { id: string; title: string; userId: string; createdAt: string; updatedAt: string; }
export interface Message { id: string; conversationId: string; role: string; content: string; metadata?: Record<string, unknown>; createdAt: string; }

export async function listConversations(): Promise<Conversation[]> { return request("/api/conversations"); }
export async function createConversation(title?: string): Promise<Conversation> {
  return request("/api/conversations", { method: "POST", body: JSON.stringify({ title }) });
}
export async function getMessages(conversationId: string): Promise<Message[]> {
  return request(`/api/conversations/${conversationId}/messages`);
}
export async function sendMessage(conversationId: string, input: string): Promise<{
  report?: string; usedAgents: string[]; retrievedDocuments: { content: string; score: number }[];
  status?: string; clarificationQuestions?: string[];
}> {
  return request(`/api/conversations/${conversationId}/chat`, { method: "POST", body: JSON.stringify({ input }) });
}
export async function deleteConversation(conversationId: string): Promise<void> {
  return request(`/api/conversations/${conversationId}`, { method: "DELETE" });
}

// --- Documents ---

export interface Document { id: string; userId: string; filename: string; originalName: string; mimeType: string; size: number; status: string; chunkCount: number; createdAt: string; updatedAt: string; }

async function uploadRequest(path: string, body: FormData) {
  const token = getToken();
  const res = await fetch(path, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || `HTTP ${res.status}`); }
  return res.json();
}
export async function uploadDocument(file: File): Promise<Document> {
  const fd = new FormData(); fd.append("file", file); return uploadRequest("/api/documents/upload", fd);
}
export async function listDocuments(): Promise<Document[]> { return request("/api/documents"); }
export async function deleteDocument(id: string): Promise<void> { return request(`/api/documents/${id}`, { method: "DELETE" }); }
export async function processDocument(id: string): Promise<{ chunkCount: number }> {
  return request(`/api/documents/${id}/process`, { method: "POST" });
}

// --- Notifications ---

export interface NotificationEvent { id: string; userId: string; type: "upload"|"process"|"embed"|"complete"|"error"; message: string; details?: Record<string, unknown>; createdAt: string; }
export async function getNotifications(since?: string): Promise<NotificationEvent[]> {
  return request(`/api/notifications${since ? `?since=${encodeURIComponent(since)}` : ""}`);
}

// --- UI Chat (chat service 3002) ---

/** Trigger LangGraph analysis via SSE. Returns a ReadableStream reader. */
export function analyzeStream(sessionId: string, input: string): Promise<Response> {
  return fetch("/api/ui-chat/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, input }),
  });
}

export async function uiChat(sessionId: string, input: string): Promise<AIUIResponse> {
  const res = await fetch("/api/ui-chat/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, input }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || `HTTP ${res.status}`); }
  return res.json();
}
export async function uiAction(sessionId: string, action: UIAction): Promise<AIUIResponse> {
  const res = await fetch("/api/ui-chat/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, action }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || `HTTP ${res.status}`); }
  return res.json();
}
