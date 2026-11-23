"use client";

import { useEffect, useState } from "react";
import { MathText } from "@/components/MathText";
import { Trash2 } from "lucide-react";

type Explanation = {
  id: string;
  question_id: string;
  type: string;
  content: string;
  source: string;
  created_at: string;
  updated_at: string;
};

export function ExplanationEditor({ questionId, ownerId }: { questionId: string; ownerId: string }) {
  const [explanations, setExplanations] = useState<Explanation[]>([]);
  const [newType, setNewType] = useState<"text" | "video" | "audio">("text");
  const [newSource, setNewSource] = useState<"ai" | "teacher" | "imported">("teacher");
  const [newContent, setNewContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadExplanations();
  }, [questionId]);

  async function loadExplanations() {
    const res = await fetch(`/api/questions/${questionId}/explanations`, {
      headers: { "oai-authenticated-user-id": ownerId },
    });
    if (res.ok) {
      const data = await res.json();
      setExplanations(data.explanations ?? []);
    }
  }

  async function addExplanation() {
    if (!newContent.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/questions/${questionId}/explanations`, {
        method: "POST",
        headers: { "content-type": "application/json", "oai-authenticated-user-id": ownerId },
        body: JSON.stringify({ type: newType, content: newContent, source: newSource }),
      });
      if (res.ok) {
        setNewContent("");
        await loadExplanations();
      } else {
        alert("添加讲解失败");
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteExplanation(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/questions/${questionId}/explanations/${id}`, {
        method: "DELETE",
        headers: { "oai-authenticated-user-id": ownerId },
      });
      if (res.ok) await loadExplanations();
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-bold mb-4">添加题目讲解</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">讲解类型</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as any)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="text">📝 文本</option>
              <option value="video">🎥 视频</option>
              <option value="audio">🎵 音频</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">来源</label>
            <select
              value={newSource}
              onChange={(e) => setNewSource(e.target.value as any)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="teacher">👨‍🏫 教师讲解</option>
              <option value="ai">🤖 AI 讲解</option>
              <option value="imported">📥 导入讲解</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-muted-foreground mb-1">内容</label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={4}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
              placeholder="输入讲解内容，支持 $...$ 公式"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={addExplanation}
              disabled={busy || !newContent.trim()}
              className="bg-primary px-4 py-2.5 rounded text-white font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? "添加中…" : "添加讲解"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-bold mb-4">现有讲解</h2>
        {explanations.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">暂无讲解</div>
        ) : (
          <div className="space-y-3">
            {explanations.map((exp) => (
              <div key={exp.id} className="p-3 rounded border border-gray-100 flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 text-xs">
                    <span>{exp.type === "text" ? "📝" : exp.type === "video" ? "🎥" : "🎵"}</span>
                    <span className="text-muted-foreground">
                      {exp.source === "teacher" ? "教师" : exp.source === "ai" ? "AI" : "导入"} ·
                      {new Date(exp.created_at).toLocaleDateString("zh-CN")}
                    </span>
                    {deleting === exp.id ? <span className="text-xs text-muted-foreground">删除中…</span> : null}
                  </div>
                  <div className="text-sm text-muted-foreground break-words">
                    <MathText text={exp.content} />
                  </div>
                </div>
                <button
                  onClick={() => deleteExplanation(exp.id)}
                  disabled={deleting === exp.id}
                  className="text-xs border rounded px-2 py-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
