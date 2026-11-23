import { headers } from "next/headers";
import Link from "next/link";
import { MathText } from "@/components/MathText";

export const metadata = { title: "题目详情" };

export default async function QuestionDetailPage({ searchParams }: { searchParams: Promise<{ questionId: string }> }) {
  const { questionId } = await searchParams;
  const requestHeaders = await headers();
  const ownerId = requestHeaders.get("oai-authenticated-user-id") ?? "local-demo";

  // 获取题目详情
  const qRes = await fetch(`http://127.0.0.1:3051/api/questions/${encodeURIComponent(questionId)}`, {
    headers: { "oai-authenticated-user-id": ownerId },
    cache: "no-store",
  });
  let question: any = null;
  if (qRes.ok) {
    const data = await qRes.json();
    question = data.question;
  }

  // 获取讲解列表
  const eRes = await fetch(`http://127.0.0.1:3051/api/questions/${encodeURIComponent(questionId)}/explanations`, {
    headers: { "oai-authenticated-user-id": ownerId },
    cache: "no-store",
  });
  let explanations: any[] = [];
  if (eRes.ok) {
    const data = await eRes.json();
    explanations = data.explanations ?? [];
  }

  if (!question) {
    return (
      <div className="py-10 text-center">
        <h1 className="text-xl font-bold">题目不存在</h1>
        <Link href="/bank" className="text-primary">返回题库</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">题目详情</h1>
        <Link href="/bank" className="text-xs border rounded px-2 py-1 text-muted-foreground">
          返回题库
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs rounded-full border px-2 py-0.5">{question.type === "single" ? "单选" : question.type === "multiple" ? "多选" : question.type === "fill" ? "填空" : "解答"}</span>
          <span className="text-xs text-muted-foreground">{question.difficulty}</span>
        </div>
        <div className="text-lg mb-4">
          <MathText text={question.stem} />
        </div>
        {question.options_json && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold mb-2">选项</h3>
            <div className="space-y-1">
              {JSON.parse(question.options_json).map((opt: any, i: number) => (
                <div key={i} className="text-sm">
                  {opt.key}. <MathText text={opt.content} />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mb-4">
          <h3 className="text-sm font-semibold mb-2">答案</h3>
          <div className="text-sm">{question.answer}</div>
        </div>
        <div className="mb-4">
          <h3 className="text-sm font-semibold mb-2">解析</h3>
          <div className="text-sm text-muted-foreground">
            <MathText text={question.analysis} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-bold mb-4">题目讲解</h2>
        <div className="space-y-3">
          {explanations.length === 0 ? (
            <div className="text-sm text-muted-foreground">暂无讲解，可添加 AI 讲解或教师讲解。</div>
          ) : (
            explanations.map((exp) => (
              <div key={exp.id} className="p-3 rounded border bg-white">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs">{exp.type === "text" ? "📝" : exp.type === "video" ? "🎥" : "🎵"}</span>
                  <span className="text-xs text-muted-foreground">{exp.source === "ai" ? "AI讲解" : exp.source === "teacher" ? "教师讲解" : "导入讲解"}</span>
                </div>
                <div className="text-sm">
                  <MathText text={exp.content} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
