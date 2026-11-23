"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PracticeCard({ paper }: { paper: { id: string; title: string; created_at: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function startPractice() {
    setBusy(true);
    try {
      const res = await fetch("/api/practice/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paperId: paper.id, title: paper.title, type: "practice" }),
      });
      if (!res.ok) throw new Error("创建练习会话失败");
      const data = await res.json();
      router.push(`/practice/${data.sessionId}`);
    } catch {
      alert("创建练习会话失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={startPractice}
      className="rounded-xl border p-4 cursor-pointer hover:border-primary/50 transition-colors"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && startPractice()}
    >
      <div className="text-sm font-medium">{paper.title}</div>
      <div className="text-xs text-muted-foreground mt-1">
        {new Date(paper.created_at).toLocaleDateString("zh-CN")}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-primary">
        <span>▶</span> {busy ? "创建中…" : "开始练习"}
      </div>
    </div>
  );
}
