import { headers } from "next/headers";
import { MathText } from "@/components/MathText";

export const metadata = { title: "练习结果" };

export default async function PracticeResultPage({ searchParams }: { searchParams: Promise<{ sessionId: string }> }) {
  const { sessionId } = await searchParams;
  const requestHeaders = await headers();
  const ownerId = requestHeaders.get("oai-authenticated-user-id") ?? "local-demo";

  const res = await fetch(`http://127.0.0.1:3051/api/practice/${sessionId}`, {
    headers: { "oai-authenticated-user-id": ownerId },
    cache: "no-store",
  });
  if (!res.ok) {
    return (
      <div className="py-10 text-center">
        <h1 className="text-xl font-bold">结果加载失败</h1>
        <p className="text-muted-foreground">请稍后重试</p>
      </div>
    );
  }

  const data = await res.json();
  const { session, questions } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">练习结果</h1>
        <button
          onClick={() => {}}
          className="text-xs border rounded px-2 py-1 text-muted-foreground"
        >
          返回
        </button>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-bold mb-4">{session.title}</h2>
        <div className="grid grid-cols-3 gap-4 text-center mb-6">
          <div>
            <div className="text-2xl font-bold">{session.total_score ?? 0}</div>
            <div className="text-xs text-muted-foreground">总分</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{questions.length}</div>
              <div className="text-xs text-muted-foreground">题目数</div>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {session.total_score !== null && questions.length > 0
                ? Math.round(((session.total_score / (questions as any[]).reduce((sum: number, q) => sum + 5, 0)) * 100))
                : 0}%
            </div>
            <div className="text-xs text-muted-foreground">得分率</div>
          </div>
        </div>

        <h3 className="text-sm font-semibold mb-3">题目详情</h3>
        <div className="divide-y">
          {questions.map((q: any) => (
            <div key={q.id} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs rounded-full border px-2 py-0.5">{q.type === "single" ? "单选" : q.type === "multiple" ? "多选" : q.type === "fill" ? "填空" : "解答"}</span>
                <span className="text-xs text-muted-foreground">{q.number}.</span>
              </div>
              <div className="text-sm mb-2">
                <MathText text={q.stem} />
              </div>
              <div className="text-xs text-muted-foreground">
                正确答案：{q.answer ?? "未录入"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
