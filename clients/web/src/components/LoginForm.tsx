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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm mx-4 bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold text-zinc-100">
          {mode === "login" ? "登录" : "注册"}
        </h2>

        {mode === "register" && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="昵称（选填）"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
          />
        )}

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="邮箱"
          autoComplete="email"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
        />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
        >
          {loading ? "请稍候..." : mode === "login" ? "登录" : "注册"}
        </button>

        <p className="text-center text-sm text-zinc-400">
          {mode === "login" ? "没有账号？" : "已有账号？"}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            className="ml-1 text-blue-400 hover:text-blue-300"
          >
            {mode === "login" ? "注册" : "登录"}
          </button>
        </p>
      </form>
    </div>
  );
}
