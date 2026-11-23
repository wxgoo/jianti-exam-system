"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { MathText } from "@/components/MathText";
import { typeLabels } from "@/lib/question-labels";

export default function PracticeSessionPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId ?? "";
  const [session, setSession] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  async function fetchSession() {
    try {
      const res = await fetch(`/api/practice/${sessionId}`);
      if (!res.ok) throw new Error("会话不存在");
      const data = await res.json();
      setSession(data.session);
      setQuestions(data.questions);

      // 考试模式：启动倒计时
      if (data.session.type === "exam" && data.session.end_at) {
        const endTime = new Date(data.session.end_at).getTime();
        const timer = setInterval(() => {
          const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
          setTimeLeft(remaining);
          if (remaining <= 0) {
            clearInterval(timer);
            // 时间到自动提交
            autoSubmit();
          }
        }, 1000);
        return () => clearInterval(timer);
      }
    } catch {
      setError("加载会话失败");
    }
  }

  async function autoSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const answerList = Object.entries(answers).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));
      const res = await fetch(`/api/practice/${sessionId}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: answerList }),
      });
      if (!res.ok) throw new Error("自动交卷失败");
      const data = await res.json();
      setResult(data);
    } catch {
      setError("自动交卷失败，请手动提交");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">考试完成</h1>
          <button
            onClick={() => router.push("/practice")}
            className="text-xs border rounded px-2 py-1 text-muted-foreground"
          >
            返回
          </button>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <h2 className="text-lg font-bold">{session?.title || "考试结果"}</h2>
          <div className="mt-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{result.totalScore}</div>
              <div className="text-xs text-muted-foreground">总分</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{result.correctCount}/{result.totalCount}</div>
              <div className="text-xs text-muted-foreground">答对</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{result.accuracy}%</div>
              <div className="text-xs text-muted-foreground">正确率</div>
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={() => router.push(`/practice/${sessionId}/result`)}
              className="border rounded px-4 py-2"
            >
              查看详解
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{session?.title || "做题中"}</h1>
          {timeLeft !== null && session?.type === "exam" && (
            <div className="text-sm text-muted-foreground">
              剩余时间：<span className="font-mono font-bold text-destructive">{formatTime(timeLeft)}</span>
            </div>
          )}
        </div>
        <button
          onClick={() => router.push("/practice")}
          className="text-xs border rounded px-2 py-1 text-muted-foreground"
        >
          返回
        </button>
      </div>

      {error && <div className="text-destructive mb-4">{error}</div>}

      {!session || questions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">加载题目中…</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {questions.map((q) => (
            <QuestionItem key={q.id} question={q} answer={answers[q.id]} onChange={(v) => setAnswers({ ...answers, [q.id]: v })} />
          ))}
          <button
            type="submit"
            disabled={submitting}
            className="bg-primary px-6 py-2 rounded text-white font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "提交中…" : timeLeft === 0 ? "已交卷" : "提交答案"}
          </button>
        </form>
      )}
    </div>
  );

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const answerList = Object.entries(answers).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));
      const res = await fetch(`/api/practice/${sessionId}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: answerList }),
      });
      if (!res.ok) throw new Error("提交失败");
      const data = await res.json();
      setResult(data);
    } catch {
      setError("提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }
}

function QuestionItem({ question, answer, onChange }: { question: { id: string; number: string; type: string; stem: string; options_json: string | null; difficulty: string }; answer: string; onChange: (v: string) => void }) {
  const isSingle = question.type === "single";
  const isMultiple = question.type === "multiple";
  const isFill = question.type === "fill";
  const options = question.options_json ? JSON.parse(question.options_json) : [];

  return (
    <div className="mb-4 p-4 rounded-lg border bg-white">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs rounded-full border px-2 py-0.5">{typeLabels[question.type as keyof typeof typeLabels]}</span>
        <span className="text-xs text-muted-foreground">{question.number}.</span>
      </div>
      <div className="text-base mb-3">
        <MathText text={question.stem} />
      </div>
      {isSingle || isMultiple ? (
        <div className="space-y-1">
          {options.map((opt: any) => {
            const isChecked = answer === opt.key || (isMultiple && answer?.includes(opt.key));
            return (
              <label key={opt.key} className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-gray-50">
                <input
                  type={isSingle ? "radio" : "checkbox"}
                  name={`q-${question.id}`}
                  checked={isChecked}
                  onChange={(e) => {
                    if (isSingle) {
                      onChange(opt.key);
                    } else {
                      const current = answer || "";
                      const next = e.target.checked
                        ? current.includes(opt.key)
                          ? current
                          : current + opt.key
                        : current.replace(opt.key, "");
                      onChange(next);
                    }
                  }}
                  className="mt-1"
                />
                <span>
                  {opt.key}. <MathText text={opt.content} />
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <input
          type="text"
          value={answer}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border rounded px-3 py-2 text-base focus:outline-none focus:border-primary"
          placeholder="填写答案"
        />
      )}
    </div>
  );
}
