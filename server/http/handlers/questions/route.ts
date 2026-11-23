import { requestEducationScope } from "../../../../lib/education-scope";
import { searchApprovedQuestions } from "../../../../lib/question-repository";
import { sqliteTransaction } from "../../../../db";
import { ensureDatabase } from "../../../../db/bootstrap";
import { deleteFile } from "../../../../lib/file-storage";
import { deleteQuestions, normalizeQuestionIds, QuestionBulkActionError } from "../../../../lib/question-bulk-actions";
import { now, requestOwner, requestTeacherSession } from "../../../../lib/server";


export async function GET(request: Request) {
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year")) || undefined;
  const session = requestTeacherSession(request);
  const isAdmin = session?.role === "admin";

  // 管理员不受 subject/stage/grade/year 等 scope 限制 —— 看到全库
  // （前端会强制带 subject/stage，admin 需显式忽略）
  const opts = {
    sourceKind: url.searchParams.get("sourceKind") ?? undefined,
    query: url.searchParams.get("q") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    tag: url.searchParams.get("tag") ?? undefined,
    documentId: url.searchParams.get("documentId") ?? undefined,
    subject: isAdmin ? undefined : requestEducationScope(request).subject,
    grade: url.searchParams.get("grade") ?? undefined,
    stage: isAdmin ? undefined : requestEducationScope(request).stage,
    year: isAdmin ? undefined : (Number(url.searchParams.get("year")) || undefined),
    examType: isAdmin ? undefined : (url.searchParams.get("examType") ?? undefined),
    region: isAdmin ? undefined : (url.searchParams.get("region") ?? undefined),
    textbook: isAdmin ? undefined : (url.searchParams.get("textbook") ?? undefined),
    school: isAdmin ? undefined : (url.searchParams.get("school") ?? undefined),
    folderId: url.searchParams.get("folderId") ?? undefined,
    page: Number(url.searchParams.get("page")) || 1,
    pageSize: Number(url.searchParams.get("pageSize")) || 30,
  };
  const result = await searchApprovedQuestions(requestOwner(request), opts);
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  await ensureDatabase();
  try {
    const payload = await request.json().catch(() => ({})) as { ids?: unknown };
    const questionIds = normalizeQuestionIds(payload.ids);
    const outcome = sqliteTransaction((transaction) => deleteQuestions(transaction, {
      ownerId: requestOwner(request),
      questionIds,
      timestamp: now(),
    }));
    const cleanup = await Promise.allSettled(outcome.fileKeys.map((key) => deleteFile(key)));
    return Response.json({
      deleted: outcome.deleted,
      fileCleanupFailures: cleanup.filter((result) => result.status === "rejected").length,
    });
  } catch (error) {
    const status = error instanceof QuestionBulkActionError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "题目删除失败" }, { status });
  }
}
