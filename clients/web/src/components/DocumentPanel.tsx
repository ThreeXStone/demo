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

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "待处理", color: "bg-yellow-500/20 text-yellow-400" },
  processing: { label: "处理中", color: "bg-blue-500/20 text-blue-400" },
  completed: { label: "已完成", color: "bg-green-500/20 text-green-400" },
  failed: { label: "失败", color: "bg-red-500/20 text-red-400" },
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
      // 自动触发分块处理
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

  const needsProcess = (doc: Document) =>
    doc.status === "pending" || doc.status === "failed";

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-4 border-b border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">知识库</h3>
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
          className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
        >
          {uploading ? "上传中..." : "+ 上传文件"}
        </button>
        <p className="text-xs text-zinc-500 mt-2">支持 TXT / MD / PDF，最大 10MB</p>
      </div>

      {error && (
        <div className="mx-3 mt-2 bg-red-900/30 border border-red-800 text-red-300 rounded px-3 py-2 text-xs">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {docs.length === 0 && !loading && (
          <div className="px-3 py-8 text-center text-zinc-500 text-sm">
            暂无文档
          </div>
        )}
        {docs.map((doc) => {
          const status = statusMap[doc.status] || { label: doc.status, color: "text-zinc-500" };
          const isProcessing = processing.has(doc.id);

          return (
            <div
              key={doc.id}
              className="group flex items-start gap-2 px-3 py-3 border-b border-zinc-800/50"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200 truncate">
                  {doc.originalName}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-zinc-500">
                    {mimeLabel[doc.mimeType] || doc.mimeType}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {formatSize(doc.size)}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${status.color}`}>
                    {isProcessing ? "处理中..." : status.label}
                  </span>
                  {doc.status === "completed" && doc.chunkCount > 0 && (
                    <span className="text-xs text-zinc-600">
                      {doc.chunkCount} 块
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-600 mt-0.5">
                  {new Date(doc.createdAt).toLocaleDateString("zh-CN")}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {needsProcess(doc) && !isProcessing && (
                  <button
                    onClick={() => handleProcess(doc.id)}
                    className="opacity-0 group-hover:opacity-100 text-xs text-blue-400 hover:text-blue-300 transition-all"
                  >
                    处理
                  </button>
                )}
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="opacity-0 group-hover:opacity-100 text-xs text-zinc-500 hover:text-red-400 transition-all"
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
