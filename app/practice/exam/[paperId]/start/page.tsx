"use client";

import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export default function ExamSetDurationPage() {
  const router = useRouter();
  const params = useParams<{ paperId: string }>();
  const paperId = params?.paperId ?? "";
  const [duration, setDuration] = useState(60);
  const [busy, setBusy] = useState(false);

  async function startExam() {
    setBusy(true);
    try {
      const res = await fetch("/api/practice/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paperId,
          title: "考试",
          type: "exam",
          durationMinutes: duration,
        }),
      });
      if (!res.ok) throw new Error("创建考试会话失败");
      const data = await res.json();
      router.push(`/practice/${data.sessionId}`);
    } catch {
      alert("创建考试会话失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-bold mb-4">设置考试时长</h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <span>考试时长（分钟）</span>
            <input
              type="number"
              min="1"
              max="180"
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
              className="w-20 border rounded px-3 py-2 text-center"
            />
            <span className="text-muted-foreground">分钟</span>
          </label>
          <p className="text-xs text-muted-foreground">
            时间到后系统会自动交卷，答错的题目会自动记入错题本。
          </p>
        </div>
        <button
          onClick={startExam}
          disabled={busy}
          className="bg-primary w-full px-6 py-3 rounded text-white font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "创建中…" : "开始考试"}
        </button>
      </div>
      <Link href="/practice/exam" className="text-xs text-muted-foreground block text-center">
        ← 返回选择试卷
      </Link>
    </div>
  );
}
