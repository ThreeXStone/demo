"use client";

import { useState } from "react";

const DEFAULT_INPUT = "用户注册时必须绑定手机号，密码至少8位";

export default function Home() {
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [result, setResult] = useState<null | Record<string, any>>(null);
  const [loading, setLoading] = useState(false);

  const handleExtract = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3001/requirement/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      setResult(data);
    } catch (error) {
      setResult({ error: (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-col w-full max-w-3xl items-center justify-center py-32 px-16 bg-white dark:bg-black gap-8">
        <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
          需求抽取
        </h1>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-black text-black dark:text-zinc-50"
        />
        <button
          onClick={handleExtract}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? "处理中..." : "抽取"}
        </button>
        {result && (
          <div className="w-full bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded">
            <pre className="text-sm text-zinc-700 dark:text-zinc-300 overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}