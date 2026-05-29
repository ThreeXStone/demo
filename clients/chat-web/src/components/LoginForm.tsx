"use client";

import { useState } from "react";
import { setToken, login, register } from "@/lib/api";

interface Props {
  onSuccess: () => void;
}

export default function LoginForm({ onSuccess }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("请填写邮箱和密码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result =
        mode === "login"
          ? await login(email, password)
          : await register(email, password, name || undefined);
      setToken(result.token);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090b]">
      <div className="w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">AI Chat</h1>
          <p className="text-sm text-zinc-500 mt-1">智能对话分析平台</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="昵称（选填）"
              className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
            />
          )}

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱"
            autoComplete="email"
            className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
          />

          {error && (
            <div className="bg-red-950/30 border border-red-900/50 text-red-400 rounded-xl px-4 py-2 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-400 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {loading ? "请稍候..." : mode === "login" ? "登录" : "注册"}
          </button>

          <p className="text-center text-sm text-zinc-500">
            {mode === "login" ? "没有账号？" : "已有账号？"}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
              className="ml-1 text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {mode === "login" ? "注册" : "登录"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
