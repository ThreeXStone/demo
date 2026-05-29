"use client";

import { useState, useEffect, useRef } from "react";
import { listDocuments, uploadDocument, deleteDocument, processDocument, type Document } from "@/lib/api";

const statusMap: Record<string, { color: string }> = {
  pending: { color: "bg-yellow-400" },
  processing: { color: "bg-blue-400" },
  completed: { color: "bg-emerald-400" },
  failed: { color: "bg-red-400" },
};

export default function SidebarDocs() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    try { const list = await listDocuments(); setDocs(list); } catch {}
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const doc = await uploadDocument(file);
      setDocs((prev) => [doc, ...prev]);
      // auto-process
      setProcessing((prev) => new Set(prev).add(doc.id));
      try {
        const r = await processDocument(doc.id);
        setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, status: "completed", chunkCount: r.chunkCount } : d));
      } catch {
        setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, status: "failed" } : d));
      } finally {
        setProcessing((prev) => { const n = new Set(prev); n.delete(doc.id); return n; });
      }
    } catch {} finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try { await deleteDocument(id); setDocs((prev) => prev.filter((d) => d.id !== id)); } catch {}
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">知识库</span>
        <span className="text-xs text-zinc-600">{docs.length}</span>
      </div>

      <div className="px-2 pb-2">
        <input ref={fileRef} type="file" accept=".txt,.md,.pdf" onChange={handleUpload} className="hidden" />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-zinc-400 border border-zinc-800 rounded-lg hover:border-zinc-700 hover:text-zinc-300 transition-colors disabled:opacity-50"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {uploading ? "上传中..." : "上传文件"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {docs.length === 0 && (
          <div className="px-2 py-4 text-center text-zinc-700 text-xs">暂无文档</div>
        )}
        {docs.map((doc) => {
          const st = statusMap[doc.status] || statusMap.pending;
          const isProcessing = processing.has(doc.id);
          return (
            <div key={doc.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-800/40 transition-colors">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.color} ${isProcessing ? "animate-pulse" : ""}`} />
              <span className="text-xs text-zinc-400 truncate flex-1">{doc.originalName}</span>
              <button
                onClick={(e) => handleDelete(doc.id, e)}
                className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all shrink-0"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
