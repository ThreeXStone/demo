const TOKEN_KEY = "jwt_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function hasToken(): boolean {
  return !!getToken();
}

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

export interface AuthResult {
  token: string;
  user: { id: string; email: string; name: string | null };
}

export async function login(
  email: string,
  password: string
): Promise<AuthResult> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(
  email: string,
  password: string,
  name?: string
): Promise<AuthResult> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
}

export interface Conversation {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export async function listConversations(): Promise<Conversation[]> {
  return request("/api/conversations");
}

export async function createConversation(title?: string): Promise<Conversation> {
  return request("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function getMessages(
  conversationId: string
): Promise<Message[]> {
  return request(`/api/conversations/${conversationId}/messages`);
}

export async function sendMessage(
  conversationId: string,
  input: string
): Promise<{ output: string }> {
  return request(`/api/conversations/${conversationId}/chat`, {
    method: "POST",
    body: JSON.stringify({ input }),
  });
}

export async function deleteConversation(conversationId: string): Promise<void> {
  return request(`/api/conversations/${conversationId}`, {
    method: "DELETE",
  });
}
