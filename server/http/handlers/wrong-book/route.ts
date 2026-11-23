import { readJsonPayload } from "../../../../lib/request-payload";
import { requestOwner } from "../../../../lib/server";
import { ensureDatabase } from "../../../../db/bootstrap";
import {
  addWrongRecord,
  listWrongRecords,
  getWrongRecord,
  markWrongRecordMastery,
  closeWrongRecord,
  getWrongBookStats,
  type WrongRecord,
} from "../../../../lib/wrong-book";

export async function GET(request: Request) {
  await ensureDatabase();
  const ownerId = requestOwner(request);
  const url = new URL(request.url);
  const studentId = url.searchParams.get("studentId") || undefined;
  const status = url.searchParams.get("status") as "open" | "closed" | undefined;
  const masteryLevel = url.searchParams.get("masteryLevel") || undefined;
  const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;

  const stats = getWrongBookStats(ownerId, studentId);
  const records = listWrongRecords(ownerId, { studentId, status, masteryLevel, limit });

  return Response.json({ stats, records });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const parsed = await readJsonPayload<{
    studentId?: string;
    questionId?: string;
    sourceType?: "practice" | "exam" | "assignment" | "manual";
    sourceId?: string;
    userAnswer?: string;
    correctAnswer?: string;
    wrongReason?: string;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;

  if (typeof payload.questionId !== "string" || !payload.questionId.trim()) {
    return Response.json({ error: "题目 ID 不能为空" }, { status: 400 });
  }
  if (typeof payload.userAnswer !== "string" || typeof payload.correctAnswer !== "string") {
    return Response.json({ error: "用户答案和正确答案不能为空" }, { status: 400 });
  }

  const ownerId = requestOwner(request);
  const result = addWrongRecord(ownerId, {
    studentId: payload.studentId,
    questionId: payload.questionId.trim(),
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
    userAnswer: payload.userAnswer,
    correctAnswer: payload.correctAnswer,
    wrongReason: payload.wrongReason,
  });
  return Response.json(result, { status: 201 });
}
