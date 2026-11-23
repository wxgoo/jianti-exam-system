"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useTeacherMode } from "@/components/AppShell";
import { MathText } from "@/components/MathText";
import { typeLabels } from "@/lib/question-labels";

export function WrongRecordRow({ record, ownerId }: { record: any; ownerId: string }) {
  const { mode } = useTeacherMode();
  const [mastery, setMastery] = useState(record.mastery_level);
  const [busy, setBusy] = useState(false);

  async function updateMastery(level: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/wrong-book/${record.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "oai-authenticated-user-id": ownerId },
        body: JSON.stringify({ masteryLevel: level }),
      });
      if (res.ok) setMastery(level);
    } finally {
      setBusy(false);
    }
  }

  async function closeRecord() {
    setBusy(true);
    try {
      const res = await fetch(`/api/wrong-book/${record.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "oai-authenticated-user-id": ownerId },
        body: JSON.stringify({ status: "closed" }),
      });
      if (res.ok) window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs rounded-full border px-2 py-0.5">
            {typeLabels[record.type as keyof typeof typeLabels] ?? record.type}
          </span>
          <span className="text-xs text-muted-foreground">{record.difficulty}</span>
          <span className="ml-auto text-xs text-muted-foreground">{record.documentName}</span>
        </div>
        <div className="text-sm font-medium truncate">
          <MathText text={record.stem} />
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          用户答案：{record.user_answer} &nbsp;|&nbsp; 正确答案：{record.correct_answer}
        </div>
        {record.wrong_reason && (
          <div className="text-xs text-muted-foreground mt-0.5">{record.wrong_reason}</div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">掌握度：</span>
          <select
            value={mastery}
            onChange={(e) => updateMastery(e.target.value)}
            disabled={busy}
            className="text-xs border rounded px-2 py-1"
          >
            <option value="unfamiliar">未掌握</option>
            <option value="learning">学习中</option>
            <option value="mastered">已掌握</option>
          </select>
          {busy && <span className="text-xs">...</span>}
        </div>
        <button
          onClick={closeRecord}
          disabled={busy}
          className="text-xs border rounded px-2 py-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title="标记已复习"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
