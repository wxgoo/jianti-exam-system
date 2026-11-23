import { readJsonPayload } from "../../../../../lib/request-payload";
import { requestEducationScope, documentScopeSql } from "../../../../../lib/education-scope";
import { requestOwner, now } from "../../../../../lib/server";
import { getSqlite } from "../../../../../db";
import { ensureDatabase } from "../../../../../db/bootstrap";
import { generatePaper, type QuestionQuota } from "../../../../../lib/paper-generator";
import type { QuestionType } from "../../../../../lib/types";

export async function POST(request: Request) {
  await ensureDatabase();
  const parsed = await readJsonPayload<{
    title?: string;
    subtitle?: string;
    quotas?: unknown;
    seed?: string;
    versionCode?: string;
    settings?: Record<string, unknown>;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;

  if (typeof payload.title !== "string" || !payload.title.trim()) {
    return Response.json({ error: "试卷标题不能为空" }, { status: 400 });
  }
  if (!Array.isArray(payload.quotas) || !payload.quotas.length) {
    return Response.json({ error: "请配置至少一个板块的抽题数量" }, { status: 400 });
  }

  const quotas: QuestionQuota[] = [];
  for (const q of payload.quotas) {
    if (typeof q !== "object" || q === null || Array.isArray(q)) {
      return Response.json({ error: "板块配置格式无效" }, { status: 400 });
    }
    const type = q.type;
    const count = Number(q.count);
    const score = Number(q.score);
    if (!["single", "multiple", "fill", "answer"].includes(type)) {
      return Response.json({ error: `未知题型：${type}` }, { status: 400 });
    }
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      return Response.json({ error: `题型 ${type} 的数量必须是 1–100 的整数` }, { status: 400 });
    }
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return Response.json({ error: `题型 ${type} 的分值必须是 0–100` }, { status: 400 });
    }
    quotas.push({
      type: type as QuestionType,
      count,
      score,
      difficultyRatio: q.difficultyRatio
        ? {
            easy: Number(q.difficultyRatio.easy) || 0,
            medium: Number(q.difficultyRatio.medium) || 0,
            hard: Number(q.difficultyRatio.hard) || 0,
          }
        : undefined,
    });
  }

  const ownerId = requestOwner(request);
  const scope = requestEducationScope(request);
  const result = generatePaper(
    {
      title: payload.title.trim(),
      subtitle: payload.subtitle?.trim(),
      quotas,
      seed: payload.seed,
      versionCode: payload.versionCode,
      settings: payload.settings,
    },
    ownerId,
    scope,
  );
  if ("error" in result) return Response.json({ error: result.error }, { status: 400 });

  return Response.json({
    paperId: result.paperId,
    versionCode: result.versionCode,
    seed: result.seed,
    questionCount: result.questions.length,
    questions: result.questions,
  });
}
