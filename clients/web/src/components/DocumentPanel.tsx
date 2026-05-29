"use client";

import { useState, useEffect, useRef } from "react";
import {
  listDocuments,
  uploadDocument,
  deleteDocument,
  processDocument,
  type Document,
} from "@/lib/api";

const mimeLabel: Record<string, string> = {
  "text/plain": "TXT",
  "text/markdown": "MD",
  "application/pdf": "PDF",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const statusMap: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "待处理", color: "text-yellow-400", bg: "bg-yellow-400/10" },
  processing: { label: "处理中", color: "text-blue-400", bg: "bg-blue-400/10" },
  completed: { label: "已完成", color: "text-emerald-400", bg: "bg-emerald-400/10" },
  failed: { label: "失败", color: "text-red-400", bg: "bg-red-400/10" },
};

export default function DocumentPanel() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const list = await listDocuments();
      setDocs(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    try {
      const doc = await uploadDocument(file);
      setDocs((prev) => [doc, ...prev]);
      handleProcess(doc.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleProcess = async (id: string) => {
    setProcessing((prev) => new Set(prev).add(id));
    try {
      const result = await processDocument(id);
      setDocs((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, status: "completed", chunkCount: result.chunkCount }
            : d,
        ),
      );
    } catch {
      setDocs((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "failed" } : d)),
      );
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-zinc-800/60">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.pdf"
              onChange={handleUpload}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl hover:bg-indigo-500/20 transition-all text-sm font-medium disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {uploading ? "上传中..." : "上传文件"}
            </button>
            <span className="text-xs text-zinc-600">TXT / MD / PDF，最大 10MB</span>
          </div>

          {error && (
            <div className="mt-3 bg-red-950/30 border border-red-900/50 text-red-400 rounded-xl px-4 py-2 text-xs">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6">
          {docs.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
              <svg className="w-10 h-10 mb-3 text-zinc-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">上传文件构建你的知识库</p>
            </div>
          )}
          <div className="space-y-1">
            {docs.map((doc) => {
              const status = statusMap[doc.status] || { label: doc.status, color: "text-zinc-500", bg: "bg-zinc-800" };
              const isProcessing = processing.has(doc.id);

              return (
                <div
                  key={doc.id}
                  className="group flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-zinc-900/50 transition-colors"
                >
                  {/* Icon */}
                  <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${status.bg}`}>
                    {doc.mimeType === "application/pdf" ? (
                      <svg className={`w-4 h-4 ${status.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <svg className={`w-4 h-4 ${status.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate font-medium">
                      {doc.originalName}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-zinc-600">{mimeLabel[doc.mimeType] || doc.mimeType}</span>
                      <span className="text-xs text-zinc-700">·</span>
                      <span className="text-xs text-zinc-600">{formatSize(doc.size)}</span>
                      <span className="text-xs text-zinc-700">·</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${status.bg} ${status.color}`}>
                        {isProcessing ? "处理中..." : status.label}
                      </span>
                      {doc.status === "completed" && doc.chunkCount > 0 && (
                        <>
                          <span className="text-xs text-zinc-700">·</span>
                          <span className="text-xs text-zinc-500">{doc.chunkCount} 块</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                    {(doc.status === "pending" || doc.status === "failed") && !isProcessing && (
                      <button
                        onClick={() => handleProcess(doc.id)}
                        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-indigo-400 transition-colors"
                        title="处理"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-600 hover:text-red-400 transition-colors"
                      title="删除"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
